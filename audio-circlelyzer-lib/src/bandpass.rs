/// Bandpass filtering in frequency domain
/// Applies a bandpass filter to a complex spectrum

/// Apply bandpass filter to complex spectrum
/// 
/// # Arguments
/// * `re` - Real part of complex spectrum
/// * `im` - Imaginary part of complex spectrum
/// * `sample_rate` - Sample rate in Hz
/// * `nc` - Number of samples (FFT size)
/// * `low_freq` - Optional lower cutoff frequency (None = no low cut)
/// * `high_freq` - Optional upper cutoff frequency (None = no high cut)
/// 
/// # Returns
/// Tuple of (filtered_re, filtered_im)
pub fn bandpass_filter(
    re: &[f32],
    im: &[f32],
    sample_rate: f32,
    nc: usize,
    low_freq: Option<f32>,
    high_freq: Option<f32>,
) -> (Vec<f32>, Vec<f32>) {
    let n = re.len();
    let mut out_re = vec![0.0f32; n];
    let mut out_im = vec![0.0f32; n];
    
    // Frequency resolution
    let freq_resolution = sample_rate / nc as f32;
    
    for i in 0..n {
        // Calculate frequency for this bin
        // For real FFT, bins 0 to n/2 represent 0 to Nyquist
        let freq = i as f32 * freq_resolution;
        
        let mut pass = true;
        
        // Apply low cutoff
        if let Some(low) = low_freq {
            if freq < low {
                pass = false;
            }
        }
        
        // Apply high cutoff
        if let Some(high) = high_freq {
            if freq > high {
                pass = false;
            }
        }
        
        if pass {
            out_re[i] = re[i];
            out_im[i] = im[i];
        }
        // Otherwise values remain 0.0
    }
    
    (out_re, out_im)
}

/// Apply bandpass filter with smooth rolloff (Butterworth-like)
/// 
/// Uses a smoother transition at cutoff frequencies to reduce ringing
pub fn bandpass_filter_smooth(
    re: &[f32],
    im: &[f32],
    sample_rate: f32,
    nc: usize,
    low_freq: Option<f32>,
    high_freq: Option<f32>,
    order: u32,  // Filter order (steepness), typically 2-8
) -> (Vec<f32>, Vec<f32>) {
    let n = re.len();
    let mut out_re = vec![0.0f32; n];
    let mut out_im = vec![0.0f32; n];
    
    let freq_resolution = sample_rate / nc as f32;
    let order_f = order as f32;
    
    for i in 0..n {
        let freq = i as f32 * freq_resolution;
        
        let mut gain = 1.0f32;
        
        // High-pass response (low cutoff)
        if let Some(low) = low_freq {
            if low > 0.0 && freq > 0.0 {
                // Butterworth high-pass: H = 1 / sqrt(1 + (fc/f)^(2n))
                let ratio = low / freq;
                gain *= 1.0 / (1.0 + ratio.powf(2.0 * order_f)).sqrt();
            } else if freq == 0.0 && low > 0.0 {
                gain = 0.0;  // DC blocked
            }
        }
        
        // Low-pass response (high cutoff)
        if let Some(high) = high_freq {
            if high > 0.0 {
                // Butterworth low-pass: H = 1 / sqrt(1 + (f/fc)^(2n))
                let ratio = freq / high;
                gain *= 1.0 / (1.0 + ratio.powf(2.0 * order_f)).sqrt();
            }
        }
        
        out_re[i] = re[i] * gain;
        out_im[i] = im[i] * gain;
    }
    
    (out_re, out_im)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_bandpass_filter_basic() {
        let n = 1024;
        let sample_rate = 48000.0;
        
        // Create flat spectrum
        let re: Vec<f32> = vec![1.0; n];
        let im: Vec<f32> = vec![0.0; n];
        
        // Apply bandpass 100-1000 Hz
        let (out_re, out_im) = bandpass_filter(
            &re, &im, sample_rate, n * 2, Some(100.0), Some(1000.0)
        );
        
        // Check that DC is blocked
        assert_eq!(out_re[0], 0.0);
        
        // Check that frequencies in passband are passed
        let bin_500hz = (500.0 / (sample_rate / (n * 2) as f32)) as usize;
        assert_eq!(out_re[bin_500hz], 1.0);
    }
    
    #[test]
    fn test_bandpass_smooth() {
        let n = 1024;
        let sample_rate = 48000.0;
        
        let re: Vec<f32> = vec![1.0; n];
        let im: Vec<f32> = vec![0.0; n];
        
        let (out_re, _) = bandpass_filter_smooth(
            &re, &im, sample_rate, n * 2, Some(100.0), Some(1000.0), 4
        );
        
        // DC should be attenuated
        assert!(out_re[0] < 0.1);
        
        // Center of passband should be close to 1
        let bin_500hz = (500.0 / (sample_rate / (n * 2) as f32)) as usize;
        assert!(out_re[bin_500hz] > 0.9);
    }
}
