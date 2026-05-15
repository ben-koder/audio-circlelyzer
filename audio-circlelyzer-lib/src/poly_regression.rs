//! Polynomial gray-box regression on circular signals.
//!
//! Implements the equation-error method of *theory/CIRCULAR_NONLINEAR_REGRESSION.md*,
//! §3.4 (joint form) and §3.10 (matched-filter / per-order form).
//!
//! Given a measured response `y[n]` and a known forcing `u[n]`, both
//! `N`-periodic, identify the polynomial coefficients of an ODE
//!
//!     sum_α θ_α · ∏_d (y^(d))^{α_d}  =  u(t)
//!
//! where α = (α_0, …, α_D) is a multi-index over derivative orders 0..=D
//! with total degree |α|_1 = Σ α_d in 1..=Π. The regression is linear in
//! the unknown θ and solved by Householder QR on a real (2K)×J system,
//! K = N/2 − 1 useful bins after stacking real/imaginary parts.

use rustfft::{FftPlanner, num_complex::Complex};

/// Specification of the polynomial ODE model class.
#[derive(Debug, Clone)]
pub struct PolyModelSpec {
    /// Highest derivative order D appearing in any monomial (0 = state only,
    /// 1 = state + first derivative, 2 = + second derivative, …).
    pub derivatives: u32,
    /// Highest total polynomial degree Π = Σ α_d allowed in any monomial.
    pub degree: u32,
    /// Number of samples per cycle.
    pub n: usize,
    /// Sample rate in Hz (used to build the spectral derivative ω_k).
    pub sample_rate: f32,
    /// If true, drop the all-linear (|α|=1) constant `1·y` mass-like term
    /// (i.e. anchor the leading derivative coefficient to 1). Disabled by
    /// default — easier physical interpretation if every coefficient is free.
    pub fix_leading: bool,
}

/// One monomial: which derivatives appear and to what powers.
///
/// `powers[d]` is the exponent of `y^(d)` in the monomial; total degree is
/// the sum of `powers`. Length of `powers` is `derivatives + 1`.
#[derive(Debug, Clone)]
pub struct Monomial {
    pub powers: Vec<u32>,
}

impl Monomial {
    pub fn total_degree(&self) -> u32 {
        self.powers.iter().sum()
    }
    pub fn label(&self) -> String {
        // e.g. powers=[2,0,1] -> "y^2*yddot"
        let names = ["y", "ydot", "yddot", "ydddot", "y4dot"];
        let parts: Vec<String> = self
            .powers
            .iter()
            .enumerate()
            .filter(|(_, &p)| p > 0)
            .map(|(d, &p)| {
                let name = names.get(d).copied().unwrap_or("y?");
                if p == 1 {
                    name.to_string()
                } else {
                    format!("{name}^{p}")
                }
            })
            .collect();
        if parts.is_empty() {
            "1".to_string()
        } else {
            parts.join("*")
        }
    }
}

/// Enumerate all monomials with total degree in 1..=Π using derivatives 0..=D.
pub fn enumerate_monomials(spec: &PolyModelSpec) -> Vec<Monomial> {
    let n_dim = (spec.derivatives + 1) as usize;
    let mut out: Vec<Monomial> = Vec::new();
    let mut buf = vec![0u32; n_dim];
    enumerate_recursive(&mut buf, 0, spec.degree, &mut out);
    out.into_iter()
        .filter(|m| {
            let td = m.total_degree();
            td >= 1 && td <= spec.degree
        })
        .collect()
}

fn enumerate_recursive(buf: &mut [u32], pos: usize, remaining: u32, out: &mut Vec<Monomial>) {
    if pos == buf.len() - 1 {
        for k in 0..=remaining {
            buf[pos] = k;
            out.push(Monomial {
                powers: buf.to_vec(),
            });
        }
        buf[pos] = 0;
        return;
    }
    for k in 0..=remaining {
        buf[pos] = k;
        enumerate_recursive(buf, pos + 1, remaining - k, out);
    }
    buf[pos] = 0;
}

/// Result of a polynomial regression fit.
#[derive(Debug, Clone)]
pub struct PolyFitResult {
    /// Estimated coefficient θ_α, in the same order as `monomials`.
    pub coeffs: Vec<f32>,
    /// 1-σ standard errors, same order.
    pub std_errors: Vec<f32>,
    /// Names of the monomials (for UI labeling).
    pub monomial_labels: Vec<String>,
    /// Powers per monomial, mirrors `monomials`.
    pub monomial_powers: Vec<Vec<u32>>,
    /// Condition number κ(Φ) of the regression matrix (rough; from QR diag ratio).
    pub condition_number: f32,
    /// Sum of squared residuals after the fit.
    pub residual_norm: f32,
    /// L2 norm of the right-hand side, for relative residual computation.
    pub rhs_norm: f32,
    /// Per-bin complex residual U[k] − Σ_α θ_α Φ_α[k], length N/2.
    pub residual_re: Vec<f32>,
    pub residual_im: Vec<f32>,
    /// Time-domain response derivatives y, ẏ, ÿ, …; outer index is derivative
    /// order, inner is sample index. Used by the visualization to plot fitted
    /// polynomial curves *and* the scatter overlay of raw data points.
    pub state_time: Vec<Vec<f32>>,
    /// Time-domain forcing u[n] (same as input, returned for plotting).
    pub forcing_time: Vec<f32>,
}

/// Joint form of the regression: one big least-squares problem over all bins.
/// See *CIRCULAR_NONLINEAR_REGRESSION.md* §3.4.
///
/// `y_re`/`y_im` are the DFT of the measured response y[n] (length N).
/// `u_re`/`u_im` are the DFT of the known forcing u[n] (length N).
/// `weights` are per-bin real weights, length N/2; pass uniform 1.0 if unknown.
pub fn fit_joint(
    y_re: &[f32],
    y_im: &[f32],
    u_re: &[f32],
    u_im: &[f32],
    weights: Option<&[f32]>,
    spec: &PolyModelSpec,
) -> Result<PolyFitResult, String> {
    let n = spec.n;
    if y_re.len() != n || y_im.len() != n || u_re.len() != n || u_im.len() != n {
        return Err(format!(
            "Spectrum length mismatch: expected {n}, got y={} u={}",
            y_re.len(),
            u_re.len()
        ));
    }
    let monomials = enumerate_monomials(spec);
    if monomials.is_empty() {
        return Err("No monomials in model spec".into());
    }

    // Build time-domain derivative signals y^(d)[n] for d = 0..=D via spectral
    // differentiation followed by IFFT.
    let derivatives_time = build_derivatives(y_re, y_im, spec)?;

    // Forcing in time domain (for the residual scatter plot).
    let forcing_time = ifft(u_re, u_im, n);

    // Build regressor spectra Φ_α[k] for each monomial α.
    let mut phi_re: Vec<Vec<f32>> = Vec::with_capacity(monomials.len());
    let mut phi_im: Vec<Vec<f32>> = Vec::with_capacity(monomials.len());
    for m in &monomials {
        let phi_t = build_monomial_time(&derivatives_time, &m.powers);
        let (re, im) = fft(&phi_t);
        phi_re.push(re);
        phi_im.push(im);
    }

    // Stack real/imag of bins k = 1 .. N/2-1 into a (2K)×J real matrix.
    let k_max = (n / 2).saturating_sub(1).max(1); // useable bins 1..=N/2-1
    let n_rows = 2 * k_max;
    let n_cols = monomials.len();
    let mut a = vec![0.0f64; n_rows * n_cols];
    let mut b = vec![0.0f64; n_rows];
    let unit = vec![1.0f32; k_max];
    let w: &[f32] = match weights {
        Some(w) => {
            if w.len() < k_max {
                return Err(format!(
                    "Weights too short: need {} got {}",
                    k_max,
                    w.len()
                ));
            }
            &w[..k_max]
        }
        None => &unit[..],
    };
    for k in 1..=k_max {
        let row_re = k - 1;
        let row_im = k - 1 + k_max;
        let sw = w[k - 1].max(0.0).sqrt() as f64;
        b[row_re] = sw * u_re[k] as f64;
        b[row_im] = sw * u_im[k] as f64;
        for (j, _m) in monomials.iter().enumerate() {
            a[row_re * n_cols + j] = sw * phi_re[j][k] as f64;
            a[row_im * n_cols + j] = sw * phi_im[j][k] as f64;
        }
    }

    // Solve via Householder QR. If the deterministic validation data makes the
    // full polynomial basis rank-deficient, fall back to a tiny ridge system so
    // UI calculations degrade to a regularized fit instead of throwing.
    let solve = qr_solve_with_ridge_fallback(&a, &b, n_rows, n_cols)?;
    let theta = solve.theta;

    // Recompute residual using phi_re/phi_im.
    let mut resid_sq = 0.0f64;
    let mut rhs_sq = 0.0f64;
    for k in 1..=k_max {
        let sw = w[k - 1].max(0.0).sqrt() as f64;
        let mut sum_re = 0.0f64;
        let mut sum_im = 0.0f64;
        for j in 0..n_cols {
            sum_re += theta[j] * phi_re[j][k] as f64;
            sum_im += theta[j] * phi_im[j][k] as f64;
        }
        let dr = sw * (u_re[k] as f64 - sum_re);
        let di = sw * (u_im[k] as f64 - sum_im);
        resid_sq += dr * dr + di * di;
    }
    for i in 0..n_rows {
        rhs_sq += b[i] * b[i];
    }

    // Per-bin (unweighted) complex residual on the full positive half-spectrum
    // — useful for the visualization layer.
    let half = n / 2 + 1;
    let mut residual_re = vec![0.0f32; half];
    let mut residual_im = vec![0.0f32; half];
    for k in 0..half {
        let mut sum_re = 0.0f64;
        let mut sum_im = 0.0f64;
        for j in 0..n_cols {
            sum_re += theta[j] * phi_re[j][k] as f64;
            sum_im += theta[j] * phi_im[j][k] as f64;
        }
        residual_re[k] = (u_re[k] as f64 - sum_re) as f32;
        residual_im[k] = (u_im[k] as f64 - sum_im) as f32;
    }

    // Standard errors from σ²(AᵀA)⁻¹ = σ²(RᵀR)⁻¹, where R is the upper
    // triangular factor stored in the upper part of `a` after QR.
    let dof = (n_rows as f64 - n_cols as f64).max(1.0);
    let sigma2 = resid_sq / dof;
    let std_errors = qr_std_errors(&solve.r_factor, solve.rows, n_cols, sigma2);

    // Crude condition number from ratio of largest to smallest |R[ii]|.
    let mut max_diag = 0.0f64;
    let mut min_diag = f64::INFINITY;
    for j in 0..n_cols {
        let d = solve.r_factor[j * n_cols + j].abs();
        if d > max_diag {
            max_diag = d;
        }
        if d < min_diag {
            min_diag = d;
        }
    }
    let condition_number = if min_diag > 0.0 {
        (max_diag / min_diag) as f32
    } else {
        f32::INFINITY
    };

    let labels: Vec<String> = monomials.iter().map(|m| m.label()).collect();
    let powers: Vec<Vec<u32>> = monomials.iter().map(|m| m.powers.clone()).collect();

    Ok(PolyFitResult {
        coeffs: theta.iter().map(|&v| v as f32).collect(),
        std_errors,
        monomial_labels: labels,
        monomial_powers: powers,
        condition_number,
        residual_norm: resid_sq.sqrt() as f32,
        rhs_norm: rhs_sq.sqrt() as f32,
        residual_re,
        residual_im,
        state_time: derivatives_time,
        forcing_time,
    })
}

/// Matched-filter / per-order form (theory §3.10), block-triangular.
///
/// `harmonics_re`/`harmonics_im` is a P-element list of length-N spectra
/// `H_p[k]` (one per harmonic order, p = 1, 2, …, P); typically obtained
/// from `ZC_HARMONIC_MATCH` on a Zadoff-Chu stimulus.
///
/// `u_p_re`/`u_p_im` is the matched-filter spectrum `U_p[k]` for each order
/// (the DFT of u[n]^p, computed from the known stimulus). Length P.
///
/// Returns one `PolyFitResult` per order, with monomials restricted to total
/// degree p. `residual_re/im` of order p is `H_p[k] − Σ θ_{α∈A_p} Φ_α[k]`.
///
/// We use the response y_re/y_im (the broadband measurement) only to build
/// the time-domain derivatives needed for the regressor convolutions.
pub fn fit_matched_filter(
    y_re: &[f32],
    y_im: &[f32],
    harmonics_re: &[&[f32]],
    harmonics_im: &[&[f32]],
    u_p_re: &[&[f32]],
    u_p_im: &[&[f32]],
    weights_per_order: Option<&[&[f32]]>,
    spec: &PolyModelSpec,
) -> Result<Vec<PolyFitResult>, String> {
    let n = spec.n;
    let p_max = harmonics_re.len();
    if p_max == 0 {
        return Err("No harmonic spectra provided".into());
    }
    if harmonics_im.len() != p_max || u_p_re.len() != p_max || u_p_im.len() != p_max {
        return Err("Mismatched per-order array lengths".into());
    }
    let derivatives_time = build_derivatives(y_re, y_im, spec)?;

    let all_monomials = enumerate_monomials(spec);

    let mut out = Vec::with_capacity(p_max);
    for p in 1..=p_max {
        let order_monomials: Vec<Monomial> = all_monomials
            .iter()
            .filter(|m| m.total_degree() as usize == p)
            .cloned()
            .collect();
        if order_monomials.is_empty() {
            // No monomials of this degree in the model: emit an empty result.
            out.push(empty_result_for_order(n, &derivatives_time));
            continue;
        }

        let mut phi_re: Vec<Vec<f32>> = Vec::with_capacity(order_monomials.len());
        let mut phi_im: Vec<Vec<f32>> = Vec::with_capacity(order_monomials.len());
        for m in &order_monomials {
            let phi_t = build_monomial_time(&derivatives_time, &m.powers);
            let (re, im) = fft(&phi_t);
            phi_re.push(re);
            phi_im.push(im);
        }

        let k_max = (n / 2).saturating_sub(1).max(1);
        let n_rows = 2 * k_max;
        let n_cols = order_monomials.len();
        let mut a = vec![0.0f64; n_rows * n_cols];
        let mut b = vec![0.0f64; n_rows];

        // Right-hand side: H_p[k] · U_p[k] (the matched-filter form puts the
        // stimulus power on the right after multiplying both sides by U_p[k]
        // — see §3.10.3 (3.23) re-arranged so the regressors stay on the
        // response side, avoiding division by a possibly-zero U_p[k]).
        let h_re = harmonics_re[p - 1];
        let h_im = harmonics_im[p - 1];
        let up_re = u_p_re[p - 1];
        let up_im = u_p_im[p - 1];
        if h_re.len() < n / 2 + 1 || up_re.len() < n / 2 + 1 {
            return Err(format!(
                "Order {p}: spectrum too short (h={} u_p={})",
                h_re.len(),
                up_re.len()
            ));
        }

        let unit = vec![1.0f32; k_max];
        let w: &[f32] = match weights_per_order {
            Some(ws) => {
                let row = ws.get(p - 1).ok_or_else(|| {
                    format!("weights_per_order missing entry for order {p}")
                })?;
                if row.len() < k_max {
                    return Err(format!(
                        "weights[{p}] too short: need {} got {}",
                        k_max,
                        row.len()
                    ));
                }
                &row[..k_max]
            }
            None => &unit[..],
        };

        for k in 1..=k_max {
            let row_re = k - 1;
            let row_im = k - 1 + k_max;
            let sw = w[k - 1].max(0.0).sqrt() as f64;
            // RHS: H_p[k] * U_p[k]
            let rhs_re =
                (h_re[k] as f64) * (up_re[k] as f64) - (h_im[k] as f64) * (up_im[k] as f64);
            let rhs_im =
                (h_re[k] as f64) * (up_im[k] as f64) + (h_im[k] as f64) * (up_re[k] as f64);
            b[row_re] = sw * rhs_re;
            b[row_im] = sw * rhs_im;
            for j in 0..n_cols {
                a[row_re * n_cols + j] = sw * phi_re[j][k] as f64;
                a[row_im * n_cols + j] = sw * phi_im[j][k] as f64;
            }
        }

        let solve = qr_solve_with_ridge_fallback(&a, &b, n_rows, n_cols)?;
        let theta = solve.theta;

        let mut resid_sq = 0.0f64;
        let mut rhs_sq = 0.0f64;
        for k in 1..=k_max {
            let sw = w[k - 1].max(0.0).sqrt() as f64;
            let mut sum_re = 0.0f64;
            let mut sum_im = 0.0f64;
            for j in 0..n_cols {
                sum_re += theta[j] * phi_re[j][k] as f64;
                sum_im += theta[j] * phi_im[j][k] as f64;
            }
            let rhs_re =
                (h_re[k] as f64) * (up_re[k] as f64) - (h_im[k] as f64) * (up_im[k] as f64);
            let rhs_im =
                (h_re[k] as f64) * (up_im[k] as f64) + (h_im[k] as f64) * (up_re[k] as f64);
            let dr = sw * (rhs_re - sum_re);
            let di = sw * (rhs_im - sum_im);
            resid_sq += dr * dr + di * di;
            rhs_sq += sw * sw * (rhs_re * rhs_re + rhs_im * rhs_im);
        }

        let half = n / 2 + 1;
        let mut residual_re = vec![0.0f32; half];
        let mut residual_im = vec![0.0f32; half];
        for k in 0..half {
            let mut sum_re = 0.0f64;
            let mut sum_im = 0.0f64;
            for j in 0..n_cols {
                sum_re += theta[j] * phi_re[j][k] as f64;
                sum_im += theta[j] * phi_im[j][k] as f64;
            }
            let rhs_re =
                (h_re[k] as f64) * (up_re[k] as f64) - (h_im[k] as f64) * (up_im[k] as f64);
            let rhs_im =
                (h_re[k] as f64) * (up_im[k] as f64) + (h_im[k] as f64) * (up_re[k] as f64);
            residual_re[k] = (rhs_re - sum_re) as f32;
            residual_im[k] = (rhs_im - sum_im) as f32;
        }

        let dof = (n_rows as f64 - n_cols as f64).max(1.0);
        let sigma2 = resid_sq / dof;
        let std_errors = qr_std_errors(&solve.r_factor, solve.rows, n_cols, sigma2);

        let mut max_diag = 0.0f64;
        let mut min_diag = f64::INFINITY;
        for j in 0..n_cols {
            let d = solve.r_factor[j * n_cols + j].abs();
            if d > max_diag {
                max_diag = d;
            }
            if d < min_diag {
                min_diag = d;
            }
        }
        let condition_number = if min_diag > 0.0 {
            (max_diag / min_diag) as f32
        } else {
            f32::INFINITY
        };

        let labels: Vec<String> = order_monomials.iter().map(|m| m.label()).collect();
        let powers: Vec<Vec<u32>> = order_monomials.iter().map(|m| m.powers.clone()).collect();

        // Forcing time-domain not directly meaningful per-order; pass the
        // first stimulus matched filter for downstream display.
        let forcing_time = ifft(up_re, up_im, n);

        out.push(PolyFitResult {
            coeffs: theta.iter().map(|&v| v as f32).collect(),
            std_errors,
            monomial_labels: labels,
            monomial_powers: powers,
            condition_number,
            residual_norm: resid_sq.sqrt() as f32,
            rhs_norm: rhs_sq.sqrt() as f32,
            residual_re,
            residual_im,
            state_time: derivatives_time.clone(),
            forcing_time,
        });
    }

    Ok(out)
}

fn empty_result_for_order(n: usize, state_time: &[Vec<f32>]) -> PolyFitResult {
    let half = n / 2 + 1;
    PolyFitResult {
        coeffs: vec![],
        std_errors: vec![],
        monomial_labels: vec![],
        monomial_powers: vec![],
        condition_number: 1.0,
        residual_norm: 0.0,
        rhs_norm: 0.0,
        residual_re: vec![0.0; half],
        residual_im: vec![0.0; half],
        state_time: state_time.to_vec(),
        forcing_time: vec![0.0; n],
    }
}

/// Compute u[n]^p for p = 1..=P from the time-domain stimulus, then FFT each
/// to produce the matched-filter spectra U_p[k] (theory eq. (3.19)).
pub fn build_matched_filter_spectra(u_time: &[f32], p_max: usize) -> Vec<(Vec<f32>, Vec<f32>)> {
    let n = u_time.len();
    let mut out = Vec::with_capacity(p_max);
    for p in 1..=p_max {
        let mut up = vec![0.0f32; n];
        for i in 0..n {
            up[i] = u_time[i].powi(p as i32);
        }
        let (re, im) = fft(&up);
        out.push((re, im));
    }
    out
}

/// Evaluate a recovered polynomial coefficient function on a dense grid of
/// values of one chosen state derivative, holding the others at zero.
///
/// Useful for plotting curves like `K_ms(x)` from the recovered θ:
/// pass `derivative_index = 0` and `extract_powers = [(2, &[2,0,...])]` to
/// extract the squared-y coefficient.
///
/// More generally, this collects all monomials whose power vector matches
/// `extract_powers` exactly along the *non-target* axes (any power along the
/// target axis is OK), and sums `θ · x^p` along the target axis.
pub fn evaluate_curve_on_axis(
    coeffs: &[f32],
    monomial_powers: &[Vec<u32>],
    target_axis: usize,
    fixed: &[u32],
    x_values: &[f32],
) -> Vec<f32> {
    let n = x_values.len();
    let mut out = vec![0.0f32; n];
    for (idx, powers) in monomial_powers.iter().enumerate() {
        let mut matches = true;
        for (d, &p) in powers.iter().enumerate() {
            if d == target_axis {
                continue;
            }
            let f = fixed.get(d).copied().unwrap_or(0);
            if p != f {
                matches = false;
                break;
            }
        }
        if !matches {
            continue;
        }
        let p_target = powers.get(target_axis).copied().unwrap_or(0);
        let c = coeffs[idx];
        for (i, &x) in x_values.iter().enumerate() {
            out[i] += c * x.powi(p_target as i32);
        }
    }
    out
}

// =============================================================================
// Internal helpers
// =============================================================================

fn build_derivatives(
    y_re: &[f32],
    y_im: &[f32],
    spec: &PolyModelSpec,
) -> Result<Vec<Vec<f32>>, String> {
    let n = spec.n;
    let d_max = spec.derivatives as usize;
    let mut out = Vec::with_capacity(d_max + 1);
    // Order 0: just IFFT of the spectrum.
    out.push(ifft(y_re, y_im, n));
    // Higher orders: multiply by (jω_k)^d before IFFT.
    let mut tmp_re = vec![0.0f32; n];
    let mut tmp_im = vec![0.0f32; n];
    let two_pi_fs_over_n = 2.0 * std::f32::consts::PI * spec.sample_rate / n as f32;
    for d in 1..=d_max {
        for k in 0..n {
            // Signed bin index: positive 0..N/2, negative N/2+1..N (alias).
            let kf = if k <= n / 2 {
                k as i32
            } else {
                k as i32 - n as i32
            };
            let omega = (kf as f32) * two_pi_fs_over_n;
            // (jω)^d: rotate by π/2 per derivative.
            // Real part of (jω)^d: ω^d * cos(d π/2)
            // Imag part:           ω^d * sin(d π/2)
            let mag = omega.powi(d as i32);
            let (cos_d, sin_d) = match d % 4 {
                0 => (1.0f32, 0.0f32),
                1 => (0.0f32, 1.0f32),
                2 => (-1.0f32, 0.0f32),
                3 => (0.0f32, -1.0f32),
                _ => unreachable!(),
            };
            let mr = mag * cos_d;
            let mi = mag * sin_d;
            // (mr + j mi)(y_re + j y_im) = mr*y_re - mi*y_im + j(mr*y_im + mi*y_re)
            tmp_re[k] = mr * y_re[k] - mi * y_im[k];
            tmp_im[k] = mr * y_im[k] + mi * y_re[k];
        }
        // Zero the Nyquist bin for odd-order derivatives (sign ambiguity).
        if n % 2 == 0 && d % 2 == 1 {
            tmp_re[n / 2] = 0.0;
            tmp_im[n / 2] = 0.0;
        }
        out.push(ifft(&tmp_re, &tmp_im, n));
    }
    Ok(out)
}

fn build_monomial_time(derivatives_time: &[Vec<f32>], powers: &[u32]) -> Vec<f32> {
    let n = derivatives_time[0].len();
    let mut out = vec![1.0f32; n];
    for (d, &p) in powers.iter().enumerate() {
        if p == 0 {
            continue;
        }
        let src = &derivatives_time[d];
        for i in 0..n {
            out[i] *= src[i].powi(p as i32);
        }
    }
    out
}

fn fft(input: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let n = input.len();
    let mut planner: FftPlanner<f32> = FftPlanner::new();
    let fft = planner.plan_fft_forward(n);
    let mut buf: Vec<Complex<f32>> = input.iter().map(|&x| Complex::new(x, 0.0)).collect();
    fft.process(&mut buf);
    let re = buf.iter().map(|c| c.re).collect();
    let im = buf.iter().map(|c| c.im).collect();
    (re, im)
}

fn ifft(re: &[f32], im: &[f32], n: usize) -> Vec<f32> {
    let mut planner: FftPlanner<f32> = FftPlanner::new();
    let ifft = planner.plan_fft_inverse(n);
    let mut buf: Vec<Complex<f32>> = re
        .iter()
        .zip(im.iter())
        .map(|(&r, &i)| Complex::new(r, i))
        .collect();
    ifft.process(&mut buf);
    let scale = 1.0 / n as f32;
    buf.iter().map(|c| c.re * scale).collect()
}

// -----------------------------------------------------------------------------
// Householder QR (in-place).
//
// On entry: `a` is row-major m×n with m ≥ n. On exit: the upper triangular R
// is stored in the upper part of `a`; the Householder reflectors are stored
// in the strictly lower part (with implicit unit diagonal); β values returned
// in the auxiliary vector `betas`.
//
// `qr_solve` then applies Q^T to a vector b and back-substitutes against R.
// -----------------------------------------------------------------------------

fn householder_qr(a: &mut [f64], m: usize, n: usize) -> Result<Vec<f64>, String> {
    if m < n {
        return Err(format!("QR requires m >= n; got m={m} n={n}"));
    }
    let mut betas = vec![0.0f64; n];
    let mut v = vec![0.0f64; m];
    for k in 0..n {
        // Build the Householder vector for column k below the diagonal.
        let mut sigma_sq = 0.0f64;
        for i in (k + 1)..m {
            let x = a[i * n + k];
            sigma_sq += x * x;
        }
        let alpha = a[k * n + k];
        let mu = (alpha * alpha + sigma_sq).sqrt();
        if mu == 0.0 {
            betas[k] = 0.0;
            continue;
        }
        // Pick the sign of v[0] = α + sign(α)·μ that avoids catastrophic
        // cancellation; this reflects x to -sign(α)·μ·e_1.
        let sign_alpha = if alpha >= 0.0 { 1.0 } else { -1.0 };
        let v0 = alpha + sign_alpha * mu;
        let v0_sq = v0 * v0;
        let beta = 2.0 * v0_sq / (sigma_sq + v0_sq);
        v[k] = 1.0;
        let inv_v0 = 1.0 / v0;
        for i in (k + 1)..m {
            v[i] = a[i * n + k] * inv_v0;
        }
        // Apply H_k = I - β v vᵀ to A[k:, k:].
        for j in k..n {
            let mut dot = 0.0f64;
            for i in k..m {
                dot += v[i] * a[i * n + j];
            }
            let s = beta * dot;
            for i in k..m {
                a[i * n + j] -= s * v[i];
            }
        }
        // Store v[k+1..] in the strictly lower part of column k.
        for i in (k + 1)..m {
            a[i * n + k] = v[i];
        }
        // R diagonal = reflected first element = -sign(α)·μ.
        a[k * n + k] = -sign_alpha * mu;
        betas[k] = beta;
    }
    Ok(betas)
}

fn qr_solve(
    a: &[f64],
    m: usize,
    n: usize,
    betas: &[f64],
    b_in: &[f64],
) -> Result<Vec<f64>, String> {
    if b_in.len() != m {
        return Err(format!(
            "qr_solve: b length mismatch (expected {m} got {})",
            b_in.len()
        ));
    }
    // Apply Q^T to b: for each k, b ← H_k b.
    let mut b = b_in.to_vec();
    let mut v = vec![0.0f64; m];
    for k in 0..n {
        if betas[k] == 0.0 {
            continue;
        }
        v[k] = 1.0;
        for i in (k + 1)..m {
            v[i] = a[i * n + k];
        }
        let mut dot = 0.0f64;
        for i in k..m {
            dot += v[i] * b[i];
        }
        let s = betas[k] * dot;
        for i in k..m {
            b[i] -= s * v[i];
        }
    }
    // Back-substitute against R = upper triangle of a[0..n, 0..n].
    let mut x = vec![0.0f64; n];
    for i in (0..n).rev() {
        let mut sum = b[i];
        for j in (i + 1)..n {
            sum -= a[i * n + j] * x[j];
        }
        let diag = a[i * n + i];
        if diag.abs() < f64::MIN_POSITIVE {
            return Err(format!("Singular R at i={i}"));
        }
        x[i] = sum / diag;
    }
    Ok(x)
}

struct QrSolution {
    theta: Vec<f64>,
    r_factor: Vec<f64>,
    rows: usize,
}

fn qr_solve_with_ridge_fallback(
    a: &[f64],
    b: &[f64],
    m: usize,
    n: usize,
) -> Result<QrSolution, String> {
    let mut factor = a.to_vec();
    let betas = householder_qr(&mut factor, m, n)?;
    match qr_solve(&factor, m, n, &betas, b) {
        Ok(theta) => Ok(QrSolution {
            theta,
            r_factor: factor,
            rows: m,
        }),
        Err(first_err) => {
            let ridge = ridge_scale(a, m, n);
            let aug_m = m + n;
            let mut aug = vec![0.0f64; aug_m * n];
            for row in 0..m {
                let src = row * n;
                aug[src..src + n].copy_from_slice(&a[src..src + n]);
            }

            let mut b_aug = vec![0.0f64; aug_m];
            b_aug[..m].copy_from_slice(b);
            for col in 0..n {
                aug[(m + col) * n + col] = ridge;
            }

            let betas = householder_qr(&mut aug, aug_m, n)
                .map_err(|err| format!("{first_err}; ridge QR failed: {err}"))?;
            let theta = qr_solve(&aug, aug_m, n, &betas, &b_aug)
                .map_err(|err| format!("{first_err}; ridge solve failed: {err}"))?;
            Ok(QrSolution {
                theta,
                r_factor: aug,
                rows: aug_m,
            })
        }
    }
}

fn ridge_scale(a: &[f64], m: usize, n: usize) -> f64 {
    let mut max_norm_sq = 0.0f64;
    for col in 0..n {
        let mut norm_sq = 0.0f64;
        for row in 0..m {
            let v = a[row * n + col];
            norm_sq += v * v;
        }
        if norm_sq > max_norm_sq {
            max_norm_sq = norm_sq;
        }
    }
    let max_norm = max_norm_sq.sqrt();
    if max_norm.is_finite() && max_norm > 0.0 {
        max_norm * 1.0e-8
    } else {
        1.0e-12
    }
}

/// Standard errors for the regression parameters: σ · sqrt(diag((RᵀR)⁻¹)).
fn qr_std_errors(a: &[f64], _m: usize, n: usize, sigma2: f64) -> Vec<f32> {
    // Compute (R⁻¹) explicitly by back-substitution against I, columns of
    // (RᵀR)⁻¹ are then row sums of (R⁻¹)(R⁻¹)ᵀ along the diagonal. We avoid
    // forming the full inverse and instead solve R y = e_j for each j and
    // accumulate y · y.
    let mut out = vec![0.0f32; n];
    for j in 0..n {
        // Solve R y = e_j, where e_j is the j-th unit vector. Because R is
        // upper triangular n×n, y[i] = (e_j[i] - Σ_{k>i} R[i,k] y[k]) / R[i,i].
        let mut y = vec![0.0f64; n];
        for i in (0..n).rev() {
            let mut sum = if i == j { 1.0 } else { 0.0 };
            for k in (i + 1)..n {
                sum -= a[i * n + k] * y[k];
            }
            let diag = a[i * n + i];
            if diag.abs() < f64::MIN_POSITIVE {
                y[i] = 0.0;
            } else {
                y[i] = sum / diag;
            }
        }
        // (R⁻¹ R⁻ᵀ)[j,j] = sum_i y[i]^2 (because (R⁻¹)[i,j] is what we just
        // computed for column j).
        let v: f64 = y.iter().map(|&v| v * v).sum();
        out[j] = (sigma2 * v).max(0.0).sqrt() as f32;
    }
    out
}

// =============================================================================
// Tests — synthetic Duffing oscillator, a textbook gray-box validation.
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a clean N-periodic response of the linear system
    ///     ÿ + 2ζω₀ ẏ + ω₀² y = u(t)
    /// driven by the multisine `u_time`, by frequency-domain transfer.
    fn lti_response(u_time: &[f32], omega0: f32, zeta: f32, fs: f32) -> Vec<f32> {
        let n = u_time.len();
        let (u_re, u_im) = fft(u_time);
        let two_pi_fs_over_n = 2.0 * std::f32::consts::PI * fs / n as f32;
        let mut y_re = vec![0.0f32; n];
        let mut y_im = vec![0.0f32; n];
        for k in 0..n {
            let kf = if k <= n / 2 {
                k as i32
            } else {
                k as i32 - n as i32
            };
            let omega = (kf as f32) * two_pi_fs_over_n;
            // H(jω) = 1 / (-ω² + 2jζω₀ω + ω₀²)
            let denom_re = omega0 * omega0 - omega * omega;
            let denom_im = 2.0 * zeta * omega0 * omega;
            let dnorm = denom_re * denom_re + denom_im * denom_im;
            if dnorm == 0.0 {
                y_re[k] = 0.0;
                y_im[k] = 0.0;
            } else {
                let h_re = denom_re / dnorm;
                let h_im = -denom_im / dnorm;
                y_re[k] = h_re * u_re[k] - h_im * u_im[k];
                y_im[k] = h_re * u_im[k] + h_im * u_re[k];
            }
        }
        ifft(&y_re, &y_im, n)
    }

    #[test]
    fn test_enumerate_monomials_d1_p2() {
        let spec = PolyModelSpec {
            derivatives: 1,
            degree: 2,
            n: 16,
            sample_rate: 1.0,
            fix_leading: false,
        };
        let monomials = enumerate_monomials(&spec);
        // Powers in (y, ydot): degrees 1..=2.
        // (1,0)=y, (0,1)=ydot, (2,0)=y^2, (1,1)=y*ydot, (0,2)=ydot^2  -> 5
        assert_eq!(monomials.len(), 5);
    }

    #[test]
    fn test_qr_simple() {
        // 3x2 system: [[1,2],[3,4],[5,6]] x = [1,2,3] expected x ~ (0,0.5).
        let mut a = vec![1.0f64, 2.0, 3.0, 4.0, 5.0, 6.0];
        let b = vec![1.0f64, 2.0, 3.0];
        let betas = householder_qr(&mut a, 3, 2).unwrap();
        let x = qr_solve(&a, 3, 2, &betas, &b).unwrap();
        // Closed form LS: A^T A x = A^T b
        // A^T A = [[35,44],[44,56]], A^T b = [22,28]
        // det = 35*56-44^2 = 1960-1936 = 24
        // x = inv * b = [56,-44; -44,35] * [22,28] / 24
        //   = [(56*22 - 44*28); (-44*22 + 35*28)] / 24
        //   = [(1232 - 1232); (-968 + 980)] / 24 = [0; 12/24] = [0, 0.5]
        assert!(x[0].abs() < 1e-9, "x[0] = {}", x[0]);
        assert!((x[1] - 0.5).abs() < 1e-9, "x[1] = {}", x[1]);
    }

    #[test]
    fn test_linear_oscillator_recovery() {
        // ÿ + 2·0.05·100·ẏ + 100²·y = u
        let n: usize = 4096;
        let fs: f32 = 8192.0;
        let omega0: f32 = 100.0;
        let zeta: f32 = 0.05;
        // Build a multisine forcing.
        let mut u = vec![0.0f32; n];
        let two_pi = 2.0 * std::f32::consts::PI;
        let bins = [3, 7, 11, 17, 23, 31, 41, 53, 67, 83];
        for (idx, &k) in bins.iter().enumerate() {
            let phase = idx as f32 * 0.7;
            for i in 0..n {
                u[i] += (two_pi * k as f32 * i as f32 / n as f32 + phase).sin();
            }
        }
        let y = lti_response(&u, omega0, zeta, fs);
        let (u_re, u_im) = fft(&u);
        let (y_re, y_im) = fft(&y);

        let spec = PolyModelSpec {
            derivatives: 2,
            degree: 1,
            n,
            sample_rate: fs,
            fix_leading: false,
        };
        let res = fit_joint(&y_re, &y_im, &u_re, &u_im, None, &spec).unwrap();
        // Monomials are (y, ydot, yddot) = three columns.
        assert_eq!(res.coeffs.len(), 3);
        // Find each by label.
        let by_label: std::collections::HashMap<&str, f32> = res
            .monomial_labels
            .iter()
            .zip(res.coeffs.iter())
            .map(|(l, &c)| (l.as_str(), c))
            .collect();
        let coef_y = by_label["y"];
        let coef_ydot = by_label["ydot"];
        let coef_yddot = by_label["yddot"];
        let expected_y = omega0 * omega0;
        let expected_ydot = 2.0 * zeta * omega0;
        let expected_yddot: f32 = 1.0;
        let rel = |a: f32, b: f32| (a - b).abs() / b.abs().max(1.0);
        assert!(
            rel(coef_y, expected_y) < 0.01,
            "coef_y = {} expected {}",
            coef_y,
            expected_y
        );
        assert!(
            rel(coef_ydot, expected_ydot) < 0.01,
            "coef_ydot = {} expected {}",
            coef_ydot,
            expected_ydot
        );
        assert!(
            rel(coef_yddot, expected_yddot) < 0.01,
            "coef_yddot = {} expected {}",
            coef_yddot,
            expected_yddot
        );
        assert!(res.condition_number.is_finite());
    }

    /// Synthetic forward-model recovery test for a cubic-stiffness model.
    ///
    /// We *choose* a band-limited periodic y(t), compute (y, ẏ, ÿ) via the
    /// same spectral derivative we use in regression, fabricate the forcing
    ///     u(t) = ÿ + c·ẏ + ω₀²·y + α·y³
    /// in the time domain, then run the regression and require recovery of
    /// the chosen coefficients to high precision. This removes ODE
    /// integration error from the test budget and isolates the regression
    /// numerics.
    #[test]
    fn test_duffing_recovery() {
        let n: usize = 4096;
        let fs: f32 = 8192.0;
        let omega0: f32 = 800.0;
        let zeta: f32 = 0.05;
        let alpha: f32 = 1.0e6;

        // Build a band-limited periodic y(t) directly.
        let mut y_time = vec![0.0f32; n];
        let two_pi = 2.0 * std::f32::consts::PI;
        let bins = [10, 17, 23, 31, 41, 53];
        for (idx, &k) in bins.iter().enumerate() {
            let phase = idx as f32 * 0.7;
            for i in 0..n {
                y_time[i] += 0.05 * (two_pi * k as f32 * i as f32 / n as f32 + phase).sin();
            }
        }
        let (y_re, y_im) = fft(&y_time);
        // Derive ẏ and ÿ via the same spectral differentiation the regression uses.
        let spec = PolyModelSpec {
            derivatives: 2,
            degree: 3,
            n,
            sample_rate: fs,
            fix_leading: false,
        };
        let derivs = build_derivatives(&y_re, &y_im, &spec).unwrap();
        let y0 = &derivs[0];
        let v = &derivs[1];
        let a = &derivs[2];

        // Fabricate u(t) = ÿ + c·ẏ + ω₀²·y + α·y³
        let c = 2.0 * zeta * omega0;
        let omega0_sq = omega0 * omega0;
        let mut u_time = vec![0.0f32; n];
        for i in 0..n {
            u_time[i] = a[i] + c * v[i] + omega0_sq * y0[i] + alpha * y0[i].powi(3);
        }
        let (u_re, u_im) = fft(&u_time);

        let res = fit_joint(&y_re, &y_im, &u_re, &u_im, None, &spec).unwrap();
        let by_label: std::collections::HashMap<&str, f32> = res
            .monomial_labels
            .iter()
            .zip(res.coeffs.iter())
            .map(|(l, &c)| (l.as_str(), c))
            .collect();
        let coef_y = by_label["y"];
        let coef_ydot = by_label["ydot"];
        let coef_yddot = by_label["yddot"];
        let coef_y3 = by_label["y^3"];
        let rel = |a: f32, b: f32| (a - b).abs() / b.abs().max(1.0);
        assert!(rel(coef_y, omega0_sq) < 1e-3, "y: {coef_y} vs {omega0_sq}");
        assert!(rel(coef_ydot, c) < 1e-3, "ydot: {coef_ydot} vs {c}");
        assert!(rel(coef_yddot, 1.0) < 1e-3, "yddot: {coef_yddot} vs 1");
        assert!(rel(coef_y3, alpha) < 1e-3, "y^3: {coef_y3} vs {alpha}");

        // All other monomials should be ≈ 0.
        let max_spurious: f32 = res
            .monomial_labels
            .iter()
            .zip(res.coeffs.iter())
            .filter(|(l, _)| !["y", "ydot", "yddot", "y^3"].contains(&l.as_str()))
            .map(|(_, &c)| c.abs())
            .fold(0.0, f32::max);
        let scale = alpha.max(omega0_sq);
        assert!(
            max_spurious / scale < 1e-3,
            "spurious coefficient max {max_spurious} relative to scale {scale}"
        );

        // Sanity: residual is essentially zero (forward model is in the span).
        assert!(
            res.residual_norm / res.rhs_norm < 1e-4,
            "residual {} / rhs {}",
            res.residual_norm,
            res.rhs_norm
        );
    }

    #[test]
    fn test_evaluate_curve_on_axis() {
        // y^2 with coefficient 2.0, plus y*ydot with coefficient 5.0.
        // Extract K(y) on axis 0 → should pick the y^2 term (and y by extension).
        let powers = vec![vec![2u32, 0], vec![1u32, 1]];
        let coeffs = vec![2.0f32, 5.0];
        let xs = vec![-2.0f32, -1.0, 0.0, 1.0, 2.0];
        // fixed = [_, 0] means we want all monomials with power 0 along axis 1.
        let curve = evaluate_curve_on_axis(&coeffs, &powers, 0, &[0, 0], &xs);
        // y^2 term contributes 2.0 * x^2 only.
        let expected: Vec<f32> = xs.iter().map(|x| 2.0 * x * x).collect();
        for (a, b) in curve.iter().zip(expected.iter()) {
            assert!((a - b).abs() < 1e-6, "{a} vs {b}");
        }
    }
}
