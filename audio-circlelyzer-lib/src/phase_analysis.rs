/// Phase analysis for circular signal processing.
///
/// Implements:
///   - Group delay (direct ramp-DFT method, no phase unwrapping)
///   - Phase reconstruction by integrating group delay
///   - Phase delay from unwrapped phase
///   - Minimum-phase transfer function (cepstral method)
///   - Fractional circular shift (alignment by removing excess delay)
///   - Delay estimation via minimum-phase / all-pass decomposition (Approach 4)
///
/// Reference: theory/CIRCULAR_SIGNAL_PHASE_ANALYSIS.md
///           theory/Python/phase_analysis.py

use rustfft::{FftPlanner, num_complex::Complex};

/// Compute group delay from a complex spectrum (ramp-DFT method).
///
/// Given H[k] = DFT{h[n]}, computes:
///   τ_g[k] = Re{ H_r[k] / H[k] }
/// where H_r[k] = DFT{n · h[n]}.
///
/// The impulse response h[n] is recovered by IDFT(H[k]).
/// No phase  unwrapping is required.
///
/// Returns group delay in samples (length = N).
pub fn group_delay_from_spectrum(re: &[f32], im: &[f32]) -> Vec<f32> {
    let n = re.len();
    assert_eq!(im.len(), n);

    // Recover h[n] = IDFT{H[k]}
    let mut h = idft_real(re, im);

    // Compute H_r = DFT{n · h[n]}
    let nr: Vec<f32> = h.iter().enumerate().map(|(i, &v)| i as f32 * v).collect();
    let (h_r_re, h_r_im) = dft_real(&nr);

    // τ_g[k] = Re{ H_r[k] / H[k] }  — guard against |H[k]| ≈ 0
    let (h_re, h_im) = dft_real(&h);
    let mut tau_g = vec![0.0f32; n];
    for k in 0..n {
        let mag_sq = h_re[k] * h_re[k] + h_im[k] * h_im[k];
        if mag_sq > 1e-30 {
            // Re{ H_r / H } = (Re(H_r)*Re(H) + Im(H_r)*Im(H)) / |H|^2
            tau_g[k] = (h_r_re[k] * h_re[k] + h_r_im[k] * h_im[k]) / mag_sq;
        }
        // bins where |H| ≈ 0 remain 0 (no reliable information)
    }

    // Suppress h binding warning — used implicitly above but not needed further
    let _ = &mut h;

    tau_g
}

/// Reconstruct unwrapped phase by integrating group delay (trapezoidal rule).
///
///   Θ[0] = angle(H[0])
///   Θ[k] = Θ[k-1] - (2π/N)/2 · (τ_g[k-1] + τ_g[k])
///
/// Returns unwrapped phase in radians (length = N).
pub fn unwrapped_phase_from_group_delay(
    tau_g: &[f32],
    h_re: &[f32],
    h_im: &[f32],
) -> Vec<f32> {
    let n = tau_g.len();
    assert_eq!(h_re.len(), n);
    assert_eq!(h_im.len(), n);

    let delta_omega = 2.0 * std::f32::consts::PI / n as f32;
    let mut theta = vec![0.0f32; n];

    // Initial condition: phase at DC
    theta[0] = h_im[0].atan2(h_re[0]);

    // Trapezoidal cumulative integration
    for k in 1..n {
        theta[k] = theta[k - 1] - (delta_omega / 2.0) * (tau_g[k - 1] + tau_g[k]);
    }

    theta
}

/// Compute phase delay from unwrapped phase.
///
///   τ_φ[k] = -Θ[k] / (2π·k/N)  for k > 0
///   τ_φ[0] = 0  (by convention)
///
/// Returns phase delay in samples (length = N).
pub fn phase_delay_from_unwrapped_phase(theta: &[f32]) -> Vec<f32> {
    let n = theta.len();
    let mut tau_phi = vec![0.0f32; n];

    for k in 1..n {
        let omega_k = 2.0 * std::f32::consts::PI * k as f32 / n as f32;
        tau_phi[k] = -theta[k] / omega_k;
    }

    tau_phi
}

/// Compute the minimum-phase transfer function from a complex spectrum
/// using the cepstral method.
///
/// Algorithm:
///   1. log_mag[k] = log(max(|H[k]|, floor))
///   2. c[n] = IDFT{log_mag[k]}  (real cepstrum)
///   3. c_min[n] = causal windowing of c[n] (double causal half, keep DC and Nyquist)
///   4. H_min[k] = exp(DFT{c_min[n]})
///
/// Returns (re, im) of H_min (length = N each).
pub fn minimum_phase_spectrum(
    re: &[f32],
    im: &[f32],
    floor_db: f32,
) -> (Vec<f32>, Vec<f32>) {
    let n = re.len();
    assert_eq!(im.len(), n);

    // 1. log-magnitude with noise floor
    let max_mag = re
        .iter()
        .zip(im.iter())
        .map(|(&r, &i)| (r * r + i * i).sqrt())
        .fold(0.0f32, f32::max);

    let floor_linear = max_mag * 10.0f32.powf(floor_db / 20.0);
    let log_mag: Vec<f32> = re
        .iter()
        .zip(im.iter())
        .map(|(&r, &i)| {
            let mag = (r * r + i * i).sqrt().max(floor_linear);
            mag.ln()
        })
        .collect();

    // 2. Real cepstrum: IDFT of log_mag (log_mag is real, so input im = 0)
    let log_im = vec![0.0f32; n];
    let c = idft_real(&log_mag, &log_im);

    // 3. Minimum-phase cepstrum (causal windowing)
    let mut c_min = vec![0.0f32; n];
    c_min[0] = c[0]; // DC: keep as-is
    if n % 2 == 0 {
        // Double indices 1..N/2-1, keep N/2 (Nyquist) unchanged, zero anti-causal
        for i in 1..(n / 2) {
            c_min[i] = 2.0 * c[i];
        }
        c_min[n / 2] = c[n / 2];
        // c_min[n/2+1 ..] = 0 (already zero)
    } else {
        // Odd N: double indices 1..(N-1)/2
        for i in 1..((n + 1) / 2) {
            c_min[i] = 2.0 * c[i];
        }
    }

    // 4. H_min = exp(DFT{ c_min })
    // DFT of c_min gives complex cepstrum
    let (dft_re, dft_im) = dft_real(&c_min);

    // Exponentiate complex values: exp(a + ib) = e^a · (cos b + i sin b)
    let mut result_re = Vec::with_capacity(n);
    let mut result_im = Vec::with_capacity(n);
    for k in 0..n {
        let exp_a = dft_re[k].exp();
        let (sin_b, cos_b) = dft_im[k].sin_cos();
        result_re.push(exp_a * cos_b);
        result_im.push(exp_a * sin_b);
    }

    (result_re, result_im)
}

/// Estimate the onset delay using minimum-phase / all-pass decomposition.
///
/// Algorithm:
///   1. Compute H_min via cepstral method
///   2. A = H / H_min  (all-pass component)
///   3. Recover a[n] = IDFT{A[k]}
///   4. Compute group delay τ_ap of a[n]
///   5. Return energy-weighted mean: d = Σ |H[k]|² · τ_ap[k] / Σ |H[k]|²
///
/// Returns onset delay in samples (can be fractional).
pub fn estimate_delay_minimum_phase_excess(
    re: &[f32],
    im: &[f32],
    floor_db: f32,
) -> f32 {
    let n = re.len();

    // 1. Compute minimum-phase spectrum
    let (min_re, min_im) = minimum_phase_spectrum(re, im, floor_db);

    // 2. All-pass component: A = H / H_min  (complex division)
    let mut a_re = vec![0.0f32; n];
    let mut a_im = vec![0.0f32; n];
    for k in 0..n {
        let denom = min_re[k] * min_re[k] + min_im[k] * min_im[k];
        if denom > 1e-30 {
            // (h_r + i*h_i) / (m_r + i*m_i)
            a_re[k] = (re[k] * min_re[k] + im[k] * min_im[k]) / denom;
            a_im[k] = (im[k] * min_re[k] - re[k] * min_im[k]) / denom;
        }
    }

    // 3. Group delay of the all-pass component
    let tau_ap = group_delay_from_spectrum(&a_re, &a_im);

    // 4. Energy-weighted mean of all-pass group delay (using original |H|² as weights)
    let mut weighted_sum = 0.0f64;
    let mut weight_total = 0.0f64;
    for k in 0..n {
        let power = (re[k] * re[k] + im[k] * im[k]) as f64;
        weighted_sum += power * tau_ap[k] as f64;
        weight_total += power;
    }

    if weight_total < 1e-30 {
        return 0.0;
    }

    (weighted_sum / weight_total) as f32
}

/// Apply a fractional circular shift to a complex spectrum by removing delay d.
///
///   H_aligned[k] = H[k] · exp(+j · 2π · k · d / N)
///
/// Returns (re, im) of the aligned spectrum (length = N each).
pub fn align_spectrum_fractional_shift(
    re: &[f32],
    im: &[f32],
    delay_samples: f32,
) -> (Vec<f32>, Vec<f32>) {
    let n = re.len();
    assert_eq!(im.len(), n);

    let two_pi_over_n = 2.0 * std::f32::consts::PI / n as f32;
    let mut out_re = Vec::with_capacity(n);
    let mut out_im = Vec::with_capacity(n);

    for k in 0..n {
        let angle = two_pi_over_n * k as f32 * delay_samples;
        let (sin_a, cos_a) = angle.sin_cos();
        // (re + i*im) * (cos + i*sin)
        out_re.push(re[k] * cos_a - im[k] * sin_a);
        out_im.push(re[k] * sin_a + im[k] * cos_a);
    }

    (out_re, out_im)
}

// ---------------------------------------------------------------------------
// Internal DFT helpers (use rustfft for efficiency)
// ---------------------------------------------------------------------------

/// Full DFT of a real signal. Returns (re, im) of length N.
pub(crate) fn dft_real(signal: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let n = signal.len();
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(n);

    let mut buf: Vec<Complex<f32>> = signal
        .iter()
        .map(|&x| Complex::new(x, 0.0))
        .collect();

    fft.process(&mut buf);

    let re = buf.iter().map(|c| c.re).collect();
    let im = buf.iter().map(|c| c.im).collect();
    (re, im)
}

/// Full IDFT of a complex spectrum. Returns the real part scaled by 1/N.
pub(crate) fn idft_real(re: &[f32], im: &[f32]) -> Vec<f32> {
    let n = re.len();
    assert_eq!(im.len(), n);

    let mut planner = FftPlanner::<f32>::new();
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Round-trip: pure delay of d samples → group delay should equal d everywhere.
    #[test]
    fn test_group_delay_pure_delay() {
        let n = 256;
        let d = 10usize;

        // Build a pure-delay impulse response: h[d] = 1, h[else] = 0
        let mut h = vec![0.0f32; n];
        h[d] = 1.0;

        let (h_re, h_im) = dft_real(&h);
        let tau_g = group_delay_from_spectrum(&h_re, &h_im);

        // All bins should report delay ≈ d
        for k in 0..n {
            assert!(
                (tau_g[k] - d as f32).abs() < 0.5,
                "bin {}: expected {}, got {}",
                k,
                d,
                tau_g[k]
            );
        }
    }

    /// Unwrapped phase for a pure delay should be linear: Θ[k] ≈ -d · 2πk/N.
    #[test]
    fn test_unwrapped_phase_pure_delay() {
        let n = 256;
        let d = 10usize;

        let mut h = vec![0.0f32; n];
        h[d] = 1.0;

        let (h_re, h_im) = dft_real(&h);
        let tau_g = group_delay_from_spectrum(&h_re, &h_im);
        let theta = unwrapped_phase_from_group_delay(&tau_g, &h_re, &h_im);

        for k in 1..(n / 2) {
            let expected = -(d as f32) * 2.0 * std::f32::consts::PI * k as f32 / n as f32;
            let diff = (theta[k] - expected).abs();
            assert!(diff < 0.5, "bin {}: expected {:.3}, got {:.3}", k, expected, theta[k]);
        }
    }

    /// Minimum-phase of a pure delay should be a delta at 0 (unit impulse).
    #[test]
    fn test_minimum_phase_pure_delay() {
        let n = 256;
        let d = 20usize;

        let mut h = vec![0.0f32; n];
        h[d] = 1.0;

        let (h_re, h_im) = dft_real(&h);
        let (min_re, min_im) = minimum_phase_spectrum(&h_re, &h_im, -120.0);

        // Recover minimum-phase impulse response
        let h_min = idft_real(&min_re, &min_im);

        // Peak should be at index 0 (minimum phase = no excess delay)
        let peak_idx = h_min
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.abs().partial_cmp(&b.abs()).unwrap())
            .map(|(i, _)| i)
            .unwrap();

        assert_eq!(peak_idx, 0, "minimum-phase peak should be at index 0");
    }

    /// Alignment: applying fractional shift removes delay accurately.
    #[test]
    fn test_alignment_removes_delay() {
        let n = 512;
        let d = 37.0f32; // fractional delay

        // Create a delayed impulse (integer part for simplicity)
        let mut h = vec![0.0f32; n];
        h[d as usize] = 1.0;

        let (h_re, h_im) = dft_real(&h);

        // Estimate delay
        let d_est = estimate_delay_minimum_phase_excess(&h_re, &h_im, -120.0);
        assert!((d_est - d).abs() < 2.0, "estimated delay {:.2} should be near {:.2}", d_est, d);

        // Apply alignment
        let (aligned_re, aligned_im) = align_spectrum_fractional_shift(&h_re, &h_im, d_est);
        let h_aligned = idft_real(&aligned_re, &aligned_im);

        // Peak of aligned IR should be near index 0
        let peak_idx = h_aligned
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.abs().partial_cmp(&b.abs()).unwrap())
            .map(|(i, _)| i)
            .unwrap();

        assert!(peak_idx < 4, "aligned peak should be near index 0, got {}", peak_idx);
    }
}
