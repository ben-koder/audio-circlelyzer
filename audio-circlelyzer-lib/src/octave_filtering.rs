/// Octave band filtering and RMS calculation

#[derive(Debug, Clone, Copy)]
pub enum OctaveMode {
    Full,
    Third,
}

/// Standard octave center frequencies (Hz)
const FULL_OCTAVE_CENTERS: &[f32] = &[
    31.5, 63.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

/// Standard third-octave center frequencies (Hz)
const THIRD_OCTAVE_CENTERS: &[f32] = &[
    25.0, 31.5, 40.0, 50.0, 63.0, 80.0, 100.0, 125.0, 160.0, 200.0,
    250.0, 315.0, 400.0, 500.0, 630.0, 800.0, 1000.0, 1250.0, 1600.0, 2000.0,
    2500.0, 3150.0, 4000.0, 5000.0, 6300.0, 8000.0, 10000.0, 12500.0, 16000.0, 20000.0,
];

/// Calculate RMS power in octave bands from FFT magnitude spectrum
pub fn octave_filter_rms(
    magnitude_spectrum: &[f32],
    sample_rate: f32,
    nc: usize,
    mode: OctaveMode,
) -> Vec<f32> {
    let centers = match mode {
        OctaveMode::Full => FULL_OCTAVE_CENTERS,
        OctaveMode::Third => THIRD_OCTAVE_CENTERS,
    };
    
    let mut band_rms = Vec::with_capacity(centers.len());
    
    // Frequency resolution
    let freq_resolution = sample_rate / nc as f32;
    
    for &center_freq in centers {
        // Calculate band edges
        let (lower, upper) = octave_band_edges(center_freq, mode);
        
        // Sum power in this band
        let mut power_sum = 0.0;
        let mut count = 0;
        
        // Iterate through FFT bins
        for bin in 0..nc / 2 {
            let bin_freq = bin as f32 * freq_resolution;
            
            if bin_freq >= lower && bin_freq < upper {
                // Bin is fully within band
                power_sum += magnitude_spectrum[bin].powi(2);
                count += 1;
            } else if bin_freq - freq_resolution < upper && bin_freq + freq_resolution > lower {
                // Bin overlaps band - distribute power proportionally
                let overlap_lower = bin_freq.max(lower);
                let overlap_upper = (bin_freq + freq_resolution).min(upper);
                let overlap_fraction = (overlap_upper - overlap_lower) / freq_resolution;
                
                power_sum += magnitude_spectrum[bin].powi(2) * overlap_fraction;
                count += 1;
            }
        }
        
        // Calculate RMS
        let rms = if count > 0 {
            (power_sum / count as f32).sqrt()
        } else {
            0.0
        };
        
        band_rms.push(rms);
    }
    
    band_rms
}

/// Calculate octave band edges (lower and upper frequency)
fn octave_band_edges(center_freq: f32, mode: OctaveMode) -> (f32, f32) {
    let factor = match mode {
        OctaveMode::Full => 2.0f32.sqrt(), // 2^(1/2)
        OctaveMode::Third => 2.0f32.powf(1.0 / 6.0), // 2^(1/6)
    };
    
    let lower = center_freq / factor;
    let upper = center_freq * factor;
    
    (lower, upper)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_octave_band_edges() {
        let (lower, upper) = octave_band_edges(1000.0, OctaveMode::Full);
        
        // For 1kHz center, full octave should be roughly 707-1414 Hz
        assert!((lower - 707.1).abs() < 1.0);
        assert!((upper - 1414.2).abs() < 1.0);
    }
    
    #[test]
    fn test_octave_filter_rms() {
        // Create a flat spectrum
        let nc = 2048;
        let sample_rate = 48000.0;
        let spectrum = vec![1.0; nc];
        
        let rms = octave_filter_rms(&spectrum, sample_rate, nc, OctaveMode::Full);
        
        // Should have values for all bands
        assert_eq!(rms.len(), FULL_OCTAVE_CENTERS.len());
        
        // All bands should have similar RMS for flat spectrum
        for &r in &rms {
            assert!(r > 0.0);
        }
    }
}
