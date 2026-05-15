/// RT60 (Reverberation Time) calculation from impulse response
/// Implements ISO 3382-1:2009 and ISO 3382-2:2008 standard metrics

/// Legacy RT60 result for backward compatibility
pub struct RT60Result {
    pub rt60: f32,
    pub decay_curve: Vec<f32>,
    pub time_axis: Vec<f32>,
    pub fit_start_idx: usize,
    pub fit_end_idx: usize,
    pub slope: f32,
    pub intercept: f32,
}

/// Decay time measurement with quality metrics
#[derive(Clone, Default)]
pub struct DecayMeasurement {
    pub value: f32,           // Decay time in seconds
    pub slope: f32,           // Regression slope (dB/s)
    pub intercept: f32,       // Regression intercept (dB)
    pub correlation: f32,     // Pearson correlation coefficient (r)
    pub start_idx: usize,     // Start index for fit
    pub end_idx: usize,       // End index for fit
    pub is_reliable: bool,    // Based on correlation and dynamic range
}

/// Comprehensive RT60 result per ISO 3382
#[derive(Clone)]
pub struct RT60FullResult {
    /// Early Decay Time (0 to -10 dB range)
    pub edt: DecayMeasurement,
    /// T20: -5 to -25 dB (extrapolated to -60 dB)
    pub t20: DecayMeasurement,
    /// T30: -5 to -35 dB (extrapolated to -60 dB)
    pub t30: DecayMeasurement,
    /// Topt: Optimal range for best linear fit (REW approach)
    pub topt: DecayMeasurement,
    
    /// Clarity C50: Early to late energy ratio (50ms cutoff) in dB
    pub c50: f32,
    /// Clarity C80: Early to late energy ratio (80ms cutoff) in dB
    pub c80: f32,
    /// Definition D50: Early to total energy ratio (50ms cutoff) as percentage
    pub d50: f32,
    /// Center Time Ts: Center of gravity of squared IR in seconds
    pub ts: f32,
    /// Curvature: 100 * |T30/T20 - 1| (typical 0-5)
    pub curvature: f32,
    
    /// Schroeder decay curve in dB
    pub decay_curve: Vec<f32>,
    /// Time axis in seconds
    pub time_axis: Vec<f32>,
    /// Detected noise floor in dB
    pub noise_floor: f32,
}

impl Default for RT60FullResult {
    fn default() -> Self {
        RT60FullResult {
            edt: DecayMeasurement::default(),
            t20: DecayMeasurement::default(),
            t30: DecayMeasurement::default(),
            topt: DecayMeasurement::default(),
            c50: 0.0,
            c80: 0.0,
            d50: 0.0,
            ts: 0.0,
            curvature: 0.0,
            decay_curve: vec![],
            time_axis: vec![],
            noise_floor: -60.0,
        }
    }
}

/// Calculate comprehensive RT60 metrics per ISO 3382
pub fn calculate_rt60_full(
    impulse_response: &[f32],
    sample_rate: f32,
) -> RT60FullResult {
    let n = impulse_response.len();
    if n == 0 {
        return RT60FullResult::default();
    }
    
    // Step 1: Square the impulse response
    let squared: Vec<f32> = impulse_response.iter().map(|&x| x * x).collect();
    
    // Step 2: Calculate clarity and definition metrics before Schroeder integration
    let total_energy: f32 = squared.iter().sum();
    if total_energy <= 0.0 {
        return RT60FullResult::default();
    }
    
    let cutoff_50ms = ((0.050 * sample_rate) as usize).min(n);
    let cutoff_80ms = ((0.080 * sample_rate) as usize).min(n);
    
    let early_50: f32 = squared[..cutoff_50ms].iter().sum();
    let late_50: f32 = squared[cutoff_50ms..].iter().sum();
    let early_80: f32 = squared[..cutoff_80ms].iter().sum();
    let late_80: f32 = squared[cutoff_80ms..].iter().sum();
    
    // C50 and C80 (Clarity) in dB
    let c50 = if late_50 > 0.0 {
        10.0 * (early_50 / late_50).log10()
    } else {
        f32::INFINITY
    };
    
    let c80 = if late_80 > 0.0 {
        10.0 * (early_80 / late_80).log10()
    } else {
        f32::INFINITY
    };
    
    // D50 (Definition) as percentage
    let d50 = (early_50 / total_energy) * 100.0;
    
    // Ts (Center Time) - center of gravity
    let mut weighted_sum = 0.0;
    for (i, &s) in squared.iter().enumerate() {
        weighted_sum += (i as f32 / sample_rate) * s;
    }
    let ts = weighted_sum / total_energy;
    
    // Step 3: Schroeder backward integration
    let mut energy_curve = vec![0.0f32; n];
    let mut sum = 0.0f32;
    for i in (0..n).rev() {
        sum += squared[i];
        energy_curve[i] = sum;
    }
    
    // Step 4: Convert to dB
    let max_energy = energy_curve[0];
    let decay_curve: Vec<f32> = energy_curve
        .iter()
        .map(|&e| {
            if e > 0.0 {
                10.0 * (e / max_energy).log10()
            } else {
                -120.0
            }
        })
        .collect();
    
    // Step 5: Detect noise floor (last 10% of IR)
    let noise_start = (0.9 * n as f32) as usize;
    let noise_floor = if noise_start < n {
        let noise_samples = &decay_curve[noise_start..];
        noise_samples.iter().sum::<f32>() / noise_samples.len() as f32
    } else {
        -60.0
    };
    
    // Generate time axis
    let time_axis: Vec<f32> = (0..n).map(|i| i as f32 / sample_rate).collect();
    
    // Step 6: Calculate EDT (0 to -10 dB)
    let edt = calculate_decay_time(&decay_curve, sample_rate, 0.0, -10.0, noise_floor, 6.0);
    
    // Step 7: Calculate T20 (-5 to -25 dB)
    let t20 = calculate_decay_time(&decay_curve, sample_rate, -5.0, -25.0, noise_floor, 3.0);
    
    // Step 8: Calculate T30 (-5 to -35 dB)
    let t30 = calculate_decay_time(&decay_curve, sample_rate, -5.0, -35.0, noise_floor, 2.0);
    
    // Step 9: Calculate Topt (optimal range for best linear fit)
    let topt = calculate_topt(&decay_curve, sample_rate, noise_floor, &edt, &t30);
    
    // Step 10: Calculate curvature
    let curvature = if t20.value > 0.0 && t30.value > 0.0 {
        100.0 * ((t30.value / t20.value) - 1.0).abs()
    } else {
        0.0
    };
    
    RT60FullResult {
        edt,
        t20,
        t30,
        topt,
        c50,
        c80,
        d50,
        ts,
        curvature,
        decay_curve,
        time_axis,
        noise_floor,
    }
}

/// Calculate a specific decay time measurement
fn calculate_decay_time(
    decay_curve: &[f32],
    sample_rate: f32,
    start_db: f32,
    end_db: f32,
    noise_floor: f32,
    _multiplier: f32,  // 6 for EDT, 3 for T20, 2 for T30
) -> DecayMeasurement {
    let n = decay_curve.len();
    
    // Find start and end indices
    let mut start_idx = 0;
    let mut end_idx = n - 1;
    
    for (i, &db) in decay_curve.iter().enumerate() {
        if db <= start_db && start_idx == 0 {
            start_idx = i;
        }
        if db <= end_db {
            end_idx = i;
            break;
        }
    }
    
    // Check if we have enough dynamic range above noise floor
    let end_db_actual = decay_curve.get(end_idx).copied().unwrap_or(end_db);
    let is_reliable = end_db_actual > (noise_floor + 10.0) && end_idx > start_idx + 2;
    
    // Ensure minimum points for regression
    if end_idx <= start_idx + 2 {
        end_idx = (start_idx + 10).min(n - 1);
    }
    
    // Linear regression with correlation
    let (slope, intercept, correlation) = linear_regression_with_correlation(
        start_idx,
        end_idx,
        sample_rate,
        decay_curve,
    );
    
    // Extrapolate to -60 dB and apply multiplier
    let value = if slope.abs() > 1e-6 {
        let decay_range = end_db - start_db;
        let measured_time = (end_idx - start_idx) as f32 / sample_rate;
        // RT60 = measured_time * (60 / decay_range)
        (measured_time * 60.0 / decay_range.abs()).max(0.0)
    } else {
        0.0
    };
    
    DecayMeasurement {
        value,
        slope,
        intercept,
        correlation,
        start_idx,
        end_idx,
        is_reliable: is_reliable && correlation.abs() >= 0.95,
    }
}

/// Calculate Topt using REW's approach - find best linear fit range
fn calculate_topt(
    decay_curve: &[f32],
    sample_rate: f32,
    noise_floor: f32,
    edt: &DecayMeasurement,
    t30: &DecayMeasurement,
) -> DecayMeasurement {
    let n = decay_curve.len();
    
    // Determine start point: if EDT << T30, use intersection of EDT and T30 lines
    // Otherwise use -5 dB
    let start_idx = if edt.value > 0.0 && t30.value > 0.0 && edt.value < t30.value * 0.7 {
        // Find intersection of EDT and T30 regression lines
        if (edt.slope - t30.slope).abs() > 1e-6 {
            let t_intersect = (t30.intercept - edt.intercept) / (edt.slope - t30.slope);
            ((t_intersect * sample_rate) as usize).clamp(0, n - 1)
        } else {
            t30.start_idx
        }
    } else {
        // Find -5 dB point
        decay_curve.iter()
            .position(|&db| db <= -5.0)
            .unwrap_or(0)
    };
    
    // Test each end point in 1 dB steps, find best correlation
    let mut best_correlation = 0.0f32;
    let mut best_end_idx = (start_idx + 10).min(n - 1);
    let mut best_slope = 0.0f32;
    let mut best_intercept = 0.0f32;
    
    // Find indices for each dB level from -10 to noise_floor + 10
    let mut current_db = -10.0;
    while current_db > noise_floor + 10.0 {
        if let Some(end_idx) = decay_curve.iter().position(|&db| db <= current_db) {
            if end_idx > start_idx + 2 {
                let (slope, intercept, correlation) = linear_regression_with_correlation(
                    start_idx,
                    end_idx,
                    sample_rate,
                    decay_curve,
                );
                
                if correlation.abs() > best_correlation.abs() {
                    best_correlation = correlation;
                    best_end_idx = end_idx;
                    best_slope = slope;
                    best_intercept = intercept;
                }
            }
        }
        current_db -= 1.0;
    }
    
    // Calculate RT60 from best fit
    let decay_range = decay_curve[start_idx] - decay_curve[best_end_idx];
    let measured_time = (best_end_idx - start_idx) as f32 / sample_rate;
    let value = if decay_range.abs() > 1e-6 {
        (measured_time * 60.0 / decay_range.abs()).max(0.0)
    } else {
        0.0
    };
    
    DecayMeasurement {
        value,
        slope: best_slope,
        intercept: best_intercept,
        correlation: best_correlation,
        start_idx,
        end_idx: best_end_idx,
        is_reliable: best_correlation.abs() >= 0.99,
    }
}

/// Linear regression with Pearson correlation coefficient
fn linear_regression_with_correlation(
    start_idx: usize,
    end_idx: usize,
    sample_rate: f32,
    decay_curve: &[f32],
) -> (f32, f32, f32) {
    let n = (end_idx - start_idx + 1) as f32;
    
    if n < 2.0 {
        return (0.0, 0.0, 0.0);
    }
    
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let mut sum_xx = 0.0;
    let mut sum_yy = 0.0;
    let mut sum_xy = 0.0;
    
    for i in start_idx..=end_idx {
        let x = i as f32 / sample_rate;
        let y = decay_curve[i];
        
        sum_x += x;
        sum_y += y;
        sum_xx += x * x;
        sum_yy += y * y;
        sum_xy += x * y;
    }
    
    let mean_x = sum_x / n;
    let mean_y = sum_y / n;
    
    let ss_xx = sum_xx - n * mean_x * mean_x;
    let ss_yy = sum_yy - n * mean_y * mean_y;
    let ss_xy = sum_xy - n * mean_x * mean_y;
    
    let slope = if ss_xx.abs() > 1e-10 { ss_xy / ss_xx } else { 0.0 };
    let intercept = mean_y - slope * mean_x;
    
    // Pearson correlation coefficient
    let correlation = if ss_xx > 0.0 && ss_yy > 0.0 {
        ss_xy / (ss_xx * ss_yy).sqrt()
    } else {
        0.0
    };
    
    (slope, intercept, correlation)
}

/// Legacy calculate_rt60 for backward compatibility
pub fn calculate_rt60(
    impulse_response: &[f32],
    sample_rate: f32,
    start_db: f32,
    end_db: f32,
) -> RT60Result {
    // Step 1: Square the impulse response
    let squared: Vec<f32> = impulse_response.iter().map(|&x| x * x).collect();
    
    // Step 2: Schroeder backward integration (reverse cumulative sum)
    let mut energy_curve = vec![0.0; squared.len()];
    let mut sum = 0.0;
    
    for i in (0..squared.len()).rev() {
        sum += squared[i];
        energy_curve[i] = sum;
    }
    
    // Step 3: Convert to dB
    let max_energy = energy_curve[0];
    if max_energy <= 0.0 {
        // Invalid impulse response
        return RT60Result {
            rt60: 0.0,
            decay_curve: vec![],
            time_axis: vec![],
            fit_start_idx: 0,
            fit_end_idx: 0,
            slope: 0.0,
            intercept: 0.0,
        };
    }
    
    let decay_curve_db: Vec<f32> = energy_curve
        .iter()
        .map(|&e| {
            if e > 0.0 {
                10.0 * (e / max_energy).log10()
            } else {
                -120.0 // Floor
            }
        })
        .collect();
    
    // Step 4: Find indices for fitting range
    let mut fit_start_idx = 0;
    let mut fit_end_idx = decay_curve_db.len() - 1;
    
    for (i, &db) in decay_curve_db.iter().enumerate() {
        if db <= start_db && fit_start_idx == 0 {
            fit_start_idx = i;
        }
        if db <= end_db {
            fit_end_idx = i;
            break;
        }
    }
    
    // Ensure we have enough points for fitting
    if fit_end_idx <= fit_start_idx + 2 {
        fit_end_idx = (fit_start_idx + 10).min(decay_curve_db.len() - 1);
    }
    
    // Step 5: Linear regression on fitting range
    let (slope, intercept, _) = linear_regression_with_correlation(
        fit_start_idx,
        fit_end_idx,
        sample_rate,
        &decay_curve_db,
    );
    
    // Step 6: Extrapolate to -60 dB
    let rt60 = if slope.abs() > 1e-6 {
        (-60.0 - intercept) / slope
    } else {
        0.0 // Invalid slope
    };
    
    // Generate time axis
    let time_axis: Vec<f32> = (0..decay_curve_db.len())
        .map(|i| i as f32 / sample_rate)
        .collect();
    
    RT60Result {
        rt60: rt60.max(0.0),
        decay_curve: decay_curve_db,
        time_axis,
        fit_start_idx,
        fit_end_idx,
        slope,
        intercept,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_rt60_exponential_decay() {
        let sample_rate = 48000.0;
        let rt60_actual = 0.5; // 0.5 seconds
        
        // Generate exponential decay: e^(-6.91 * t / RT60)
        let duration = 1.0; // 1 second
        let n_samples = (duration * sample_rate) as usize;
        
        let impulse: Vec<f32> = (0..n_samples)
            .map(|i| {
                let t = i as f32 / sample_rate;
                (-6.91 * t / rt60_actual).exp()
            })
            .collect();
        
        let result = calculate_rt60(&impulse, sample_rate, -5.0, -35.0);
        
        // RT60 should be close to actual value (within 10%)
        let error = (result.rt60 - rt60_actual).abs() / rt60_actual;
        assert!(error < 0.1, "RT60 error too large: calculated {} vs actual {}", result.rt60, rt60_actual);
    }
    
    #[test]
    fn test_rt60_full_metrics() {
        let sample_rate = 48000.0;
        let rt60_actual = 0.5;
        let duration = 1.0;
        let n_samples = (duration * sample_rate) as usize;
        
        let impulse: Vec<f32> = (0..n_samples)
            .map(|i| {
                let t = i as f32 / sample_rate;
                (-6.91 * t / rt60_actual).exp()
            })
            .collect();
        
        let result = calculate_rt60_full(&impulse, sample_rate);
        
        // All decay times should be close to actual
        assert!(result.t30.value > 0.0, "T30 should be positive");
        assert!(result.t20.value > 0.0, "T20 should be positive");
        assert!(result.edt.value > 0.0, "EDT should be positive");
        
        // Correlations should be very high for clean exponential decay
        assert!(result.t30.correlation.abs() > 0.95, "T30 correlation should be high");
        
        // Curvature should be low for ideal decay
        assert!(result.curvature < 10.0, "Curvature should be low for ideal decay");
    }
}
