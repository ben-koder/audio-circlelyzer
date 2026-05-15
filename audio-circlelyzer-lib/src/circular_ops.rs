/// Complex operations for circular signal analysis

/// Complex division: Y / X
/// Returns (re, im) of Y / X
pub fn complex_divide(y_re: &[f32], y_im: &[f32], x_re: &[f32], x_im: &[f32]) -> (Vec<f32>, Vec<f32>) {
    assert_eq!(y_re.len(), x_re.len());
    assert_eq!(y_im.len(), x_im.len());
    assert_eq!(y_re.len(), y_im.len());
    
    let len = y_re.len();
    let mut result_re = Vec::with_capacity(len);
    let mut result_im = Vec::with_capacity(len);
    
    for i in 0..len {
        let y_r = y_re[i];
        let y_i = y_im[i];
        let x_r = x_re[i];
        let x_i = x_im[i];
        
        // Complex division: (y_r + i*y_i) / (x_r + i*x_i)
        // = (y_r + i*y_i) * (x_r - i*x_i) / (x_r^2 + x_i^2)
        let denominator = x_r * x_r + x_i * x_i;
        
        if denominator < 1e-10 {
            // Handle division by zero
            result_re.push(0.0);
            result_im.push(0.0);
        } else {
            let r = (y_r * x_r + y_i * x_i) / denominator;
            let i = (y_i * x_r - y_r * x_i) / denominator;
            result_re.push(r);
            result_im.push(i);
        }
    }
    
    (result_re, result_im)
}

/// Complex absolute value (magnitude)
/// Returns sqrt(re^2 + im^2)
pub fn complex_abs(re: &[f32], im: &[f32]) -> Vec<f32> {
    assert_eq!(re.len(), im.len());
    
    re.iter()
        .zip(im.iter())
        .map(|(&r, &i)| (r * r + i * i).sqrt())
        .collect()
}

/// Complex argument (phase angle)
/// Returns atan2(im, re)
pub fn complex_arg(re: &[f32], im: &[f32]) -> Vec<f32> {
    assert_eq!(re.len(), im.len());
    
    re.iter()
        .zip(im.iter())
        .map(|(&r, &i)| i.atan2(r))
        .collect()
}

/// Phase unwrapping
/// Removes 2π discontinuities from phase angles
pub fn phase_unwrap(phase: &[f32]) -> Vec<f32> {
    if phase.is_empty() {
        return Vec::new();
    }
    
    let mut unwrapped = Vec::with_capacity(phase.len());
    unwrapped.push(phase[0]);
    
    let mut cumulative_offset = 0.0;
    let pi = std::f32::consts::PI;
    
    for i in 1..phase.len() {
        let mut diff = phase[i] - phase[i - 1];
        
        // Wrap diff to [-π, π]
        while diff > pi {
            diff -= 2.0 * pi;
            cumulative_offset -= 2.0 * pi;
        }
        while diff < -pi {
            diff += 2.0 * pi;
            cumulative_offset += 2.0 * pi;
        }
        
        unwrapped.push(phase[i] + cumulative_offset);
    }
    
    unwrapped
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_complex_divide() {
        let y_re = vec![1.0, 2.0, 3.0];
        let y_im = vec![1.0, 2.0, 3.0];
        let x_re = vec![1.0, 1.0, 1.0];
        let x_im = vec![0.0, 0.0, 0.0];
        
        let (result_re, result_im) = complex_divide(&y_re, &y_im, &x_re, &x_im);
        
        // Y / (1+0i) = Y
        assert!((result_re[0] - 1.0).abs() < 1e-6);
        assert!((result_im[0] - 1.0).abs() < 1e-6);
    }
    
    #[test]
    fn test_complex_abs() {
        let re = vec![3.0, 0.0, 1.0];
        let im = vec![4.0, 5.0, 0.0];
        
        let abs = complex_abs(&re, &im);
        
        assert!((abs[0] - 5.0).abs() < 1e-6); // sqrt(3^2 + 4^2) = 5
        assert!((abs[1] - 5.0).abs() < 1e-6); // sqrt(0^2 + 5^2) = 5
        assert!((abs[2] - 1.0).abs() < 1e-6); // sqrt(1^2 + 0^2) = 1
    }
    
    #[test]
    fn test_phase_unwrap() {
        let pi = std::f32::consts::PI;
        // Create phase with 2π jumps
        let phase = vec![0.0, pi * 0.9, -pi * 0.9, -pi * 0.8];
        
        let unwrapped = phase_unwrap(&phase);
        
        // Check that jumps are removed
        for i in 1..unwrapped.len() {
            let diff = (unwrapped[i] - unwrapped[i-1]).abs();
            assert!(diff < pi, "Large jump detected: {} at index {}", diff, i);
        }
    }
}
