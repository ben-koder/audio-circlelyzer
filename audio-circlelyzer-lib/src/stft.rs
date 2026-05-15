use crate::fft::FFTContext;

/// Result of STFT computation
pub struct STFTResult {
    /// Magnitude spectra in dB, stored as [time_frame][frequency_bin]
    pub magnitudes_db: Vec<Vec<f32>>,
    /// Time axis values in seconds for each frame
    pub time_axis: Vec<f32>,
    /// Frequency axis values in Hz for each bin
    pub frequency_axis: Vec<f32>,
    /// Number of time frames
    pub num_frames: usize,
    /// Number of frequency bins (fft_size / 2 for positive frequencies)
    pub num_bins: usize,
}

/// Compute Short-Time Fourier Transform (STFT) of a time signal
/// 
/// # Arguments
/// * `signal` - Input time signal
/// * `sample_rate` - Sample rate in Hz
/// * `fft_size` - Size of each FFT window (must be power of 2 and <= signal length)
/// * `overlap` - If true, windows overlap by 50%
/// 
/// # Returns
/// STFTResult containing magnitude spectra in dB
pub fn compute_stft(
    signal: &[f32],
    sample_rate: f32,
    fft_size: usize,
    overlap: bool,
) -> STFTResult {
    assert!(fft_size > 1, "FFT size must be > 1");
    assert!(fft_size <= signal.len(), "FFT size must be <= signal length");
    assert!(signal.len() % fft_size == 0 || overlap, "Signal length must be divisible by FFT size when overlap is false");
    
    let hop_size = if overlap { fft_size / 2 } else { fft_size };
    let num_frames = if overlap {
        // With 50% overlap, we can fit more frames
        (signal.len() - fft_size) / hop_size + 1
    } else {
        signal.len() / fft_size
    };
    
    let num_bins = fft_size / 2; // Positive frequencies only
    let fft_ctx = FFTContext::new(fft_size);
    
    // Pre-compute Hann window
    let window: Vec<f32> = (0..fft_size)
        .map(|i| {
            let t = i as f32 / fft_size as f32;
            0.5 * (1.0 - (2.0 * std::f32::consts::PI * t).cos())
        })
        .collect();
    
    let mut magnitudes_db = Vec::with_capacity(num_frames);
    let mut time_axis = Vec::with_capacity(num_frames);
    
    // Frequency axis
    let frequency_axis: Vec<f32> = (0..num_bins)
        .map(|i| i as f32 * sample_rate / fft_size as f32)
        .collect();
    
    // Process each frame
    for frame_idx in 0..num_frames {
        let start = frame_idx * hop_size;
        
        // Apply window and extract frame
        let windowed: Vec<f32> = (0..fft_size)
            .map(|i| {
                if start + i < signal.len() {
                    signal[start + i] * window[i]
                } else {
                    0.0
                }
            })
            .collect();
        
        // Compute FFT
        let (re, im) = fft_ctx.real_fft(&windowed);
        
        // Compute magnitude in dB for positive frequencies
        let frame_magnitudes: Vec<f32> = (0..num_bins)
            .map(|i| {
                let mag = (re[i] * re[i] + im[i] * im[i]).sqrt();
                // Convert to dB with floor to avoid -inf
                20.0 * (mag.max(1e-10)).log10()
            })
            .collect();
        
        magnitudes_db.push(frame_magnitudes);
        
        // Time at center of window
        let time = (start as f32 + fft_size as f32 / 2.0) / sample_rate;
        time_axis.push(time);
    }
    
    STFTResult {
        magnitudes_db,
        time_axis,
        frequency_axis,
        num_frames,
        num_bins,
    }
}

/// Flatten STFT magnitudes to a single vector (row-major: time frames as rows, freq bins as columns)
/// Format: [frame0_bin0, frame0_bin1, ..., frame0_binN, frame1_bin0, ...]
pub fn flatten_stft_magnitudes(result: &STFTResult) -> Vec<f32> {
    let mut flat = Vec::with_capacity(result.num_frames * result.num_bins);
    for frame in &result.magnitudes_db {
        flat.extend_from_slice(frame);
    }
    flat
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_stft_basic() {
        // Create a simple test signal (sine wave)
        let sample_rate = 1000.0;
        let fft_size = 64;
        let signal_len = 256;
        
        let signal: Vec<f32> = (0..signal_len)
            .map(|i| (2.0 * std::f32::consts::PI * 100.0 * i as f32 / sample_rate).sin())
            .collect();
        
        let result = compute_stft(&signal, sample_rate, fft_size, false);
        
        assert_eq!(result.num_frames, 4); // 256 / 64 = 4 frames
        assert_eq!(result.num_bins, 32); // 64 / 2 = 32 bins
        assert_eq!(result.time_axis.len(), result.num_frames);
        assert_eq!(result.frequency_axis.len(), result.num_bins);
    }
    
    #[test]
    fn test_stft_with_overlap() {
        let sample_rate = 1000.0;
        let fft_size = 64;
        let signal_len = 256;
        
        let signal: Vec<f32> = (0..signal_len)
            .map(|i| (2.0 * std::f32::consts::PI * 100.0 * i as f32 / sample_rate).sin())
            .collect();
        
        let result = compute_stft(&signal, sample_rate, fft_size, true);
        
        // With 50% overlap: (256 - 64) / 32 + 1 = 7 frames
        assert_eq!(result.num_frames, 7);
        assert_eq!(result.num_bins, 32);
    }
    
    #[test]
    fn test_flatten_stft() {
        let sample_rate = 1000.0;
        let fft_size = 32;
        let signal_len = 64;
        
        let signal: Vec<f32> = (0..signal_len)
            .map(|i| (i as f32).sin())
            .collect();
        
        let result = compute_stft(&signal, sample_rate, fft_size, false);
        let flat = flatten_stft_magnitudes(&result);
        
        assert_eq!(flat.len(), result.num_frames * result.num_bins);
    }
}
