use rand::Rng;
use rustfft::num_complex::Complex;
use crate::fft::FFTContext;

/// Generate perfect white noise signal with flat frequency response
pub fn generate_perfect_white(len: usize, _sample_rate: f32) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let fft_ctx = FFTContext::new(len);
    
    // Create flat amplitude spectrum
    let mut spectrum: Vec<Complex<f32>> = Vec::with_capacity(len);
    
    for i in 0..len {
        // Flat amplitude
        let amplitude = 1.0;
        
        // Random phase, but ensure Hermitian symmetry for real signal
        let phase = if i == 0 || (len % 2 == 0 && i == len / 2) {
            0.0 // DC and Nyquist must be real
        } else if i < len / 2 {
            rng.gen::<f32>() * 2.0 * std::f32::consts::PI
        } else {
            // Mirror phase for Hermitian symmetry
            let mirror_idx = len - i;
            -spectrum[mirror_idx].arg()
        };
        
        let re = amplitude * phase.cos();
        let im = amplitude * phase.sin();
        spectrum.push(Complex::new(re, im));
    }
    
    // Convert to time domain
    let re: Vec<f32> = spectrum.iter().map(|c| c.re).collect();
    let im: Vec<f32> = spectrum.iter().map(|c| c.im).collect();
    
    let mut signal = fft_ctx.real_ifft(&re, &im);
    
    // Normalize to prevent clipping
    normalize_signal(&mut signal);
    
    signal
}

/// Generate perfect pink noise signal with 1/f amplitude response
pub fn generate_perfect_pink(len: usize, sample_rate: f32) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let fft_ctx = FFTContext::new(len);
    
    // Create pink amplitude spectrum (1/f)
    let mut spectrum: Vec<Complex<f32>> = Vec::with_capacity(len);
    
    for i in 0..len {
        // Calculate frequency
        let freq = if i <= len / 2 {
            i as f32 * sample_rate / len as f32
        } else {
            (len - i) as f32 * sample_rate / len as f32
        };
        
        // Pink noise: amplitude proportional to 1/sqrt(f)
        let amplitude = if freq < 1.0 {
            1.0 // Avoid division by zero at DC
        } else {
            1.0 / freq.sqrt()
        };
        
        // Random phase with Hermitian symmetry
        let phase = if i == 0 || (len % 2 == 0 && i == len / 2) {
            0.0
        } else if i < len / 2 {
            rng.gen::<f32>() * 2.0 * std::f32::consts::PI
        } else {
            let mirror_idx = len - i;
            -spectrum[mirror_idx].arg()
        };
        
        let re = amplitude * phase.cos();
        let im = amplitude * phase.sin();
        spectrum.push(Complex::new(re, im));
    }
    
    // Convert to time domain
    let re: Vec<f32> = spectrum.iter().map(|c| c.re).collect();
    let im: Vec<f32> = spectrum.iter().map(|c| c.im).collect();
    
    let mut signal = fft_ctx.real_ifft(&re, &im);
    
    // Normalize
    normalize_signal(&mut signal);
    
    signal
}

/// Generate standard white noise
pub fn generate_white(len: usize) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let mut signal: Vec<f32> = (0..len)
        .map(|_| rng.gen::<f32>() * 2.0 - 1.0)
        .collect();
    
    normalize_signal(&mut signal);
    signal
}

/// Generate standard pink noise using Paul Kellet's algorithm
pub fn generate_pink(len: usize, _sample_rate: f32) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let mut b0 = 0.0;
    let mut b1 = 0.0;
    let mut b2 = 0.0;
    let mut b3 = 0.0;
    let mut b4 = 0.0;
    let mut b5 = 0.0;
    let mut b6 = 0.0;
    
    let mut signal = Vec::with_capacity(len);
    
    for _ in 0..len {
        let white = rng.gen::<f32>() * 2.0 - 1.0;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        let pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        signal.push(pink);
    }
    
    normalize_signal(&mut signal);
    signal
}

/// Generate a frequency-division white excitation where each source occupies every nth bin.
pub fn generate_frequency_division_perfect_white(
    len: usize,
    _sample_rate: f32,
    source_index: usize,
    source_count: usize,
) -> Vec<f32> {
    if len == 0 || source_count == 0 {
        return Vec::new();
    }

    let mut rng = rand::thread_rng();
    let fft_ctx = FFTContext::new(len);
    let mut spectrum = vec![Complex::new(0.0, 0.0); len];
    let normalized_source_index = source_index % source_count;

    if normalized_source_index == 0 {
        spectrum[0] = Complex::new(1.0, 0.0);
    }

    let positive_bin_limit = len / 2;
    for bin in 1..positive_bin_limit {
        if bin % source_count != normalized_source_index {
            continue;
        }

        let phase = rng.gen::<f32>() * 2.0 * std::f32::consts::PI;
        let value = Complex::new(phase.cos(), phase.sin());
        spectrum[bin] = value;
        spectrum[len - bin] = value.conj();
    }

    if len % 2 == 0 && (len / 2) % source_count == normalized_source_index {
        spectrum[len / 2] = Complex::new(1.0, 0.0);
    }

    let re: Vec<f32> = spectrum.iter().map(|value| value.re).collect();
    let im: Vec<f32> = spectrum.iter().map(|value| value.im).collect();
    let mut signal = fft_ctx.real_ifft(&re, &im);
    normalize_signal(&mut signal);
    signal
}

/// Generate a real-valued phase-coded Zadoff-Chu excitation.
pub fn generate_zadoff_chu(len: usize, root: usize) -> Vec<f32> {
    if len == 0 {
        return Vec::new();
    }

    let fft_ctx = FFTContext::new(len);
    let half_len = len / 2;
    let first_bin = 1usize;
    let last_bin = half_len.saturating_sub(1);
    let span = last_bin.saturating_sub(first_bin).max(1) as f32;
    let mut spectrum = vec![Complex::new(0.0, 0.0); len];
    let root_value = root as f32;

    for bin in first_bin..=last_bin {
        let offset = (bin - first_bin) as f32;
        let phase = -std::f32::consts::PI * root_value * offset * offset / span;
        let value = Complex::new(phase.cos(), phase.sin());
        spectrum[bin] = value;
        spectrum[len - bin] = value.conj();
    }

    let re: Vec<f32> = spectrum.iter().map(|value| value.re).collect();
    let im: Vec<f32> = spectrum.iter().map(|value| value.im).collect();
    let mut signal = fft_ctx.real_ifft(&re, &im);
    normalize_signal(&mut signal);
    signal
}

/// Normalize signal to [-0.95, 0.95] to prevent clipping
fn normalize_signal(signal: &mut [f32]) {
    if signal.is_empty() {
        return;
    }
    
    let max_abs = signal.iter()
        .map(|&x| x.abs())
        .fold(0.0f32, f32::max);
    
    if max_abs > 0.0 {
        let scale = 0.95 / max_abs;
        for x in signal.iter_mut() {
            *x *= scale;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_generate_white() {
        let signal = generate_white(1024);
        assert_eq!(signal.len(), 1024);
        
        // Check that signal is normalized
        let max_abs = signal.iter().map(|&x| x.abs()).fold(0.0f32, f32::max);
        assert!(max_abs <= 1.0);
    }
    
    #[test]
    fn test_generate_perfect_white() {
        let signal = generate_perfect_white(1024, 48000.0);
        assert_eq!(signal.len(), 1024);
        
        // Check normalization
        let max_abs = signal.iter().map(|&x| x.abs()).fold(0.0f32, f32::max);
        assert!(max_abs <= 1.0);
    }

    #[test]
    fn test_generate_frequency_division_perfect_white_separates_bins() {
        let len = 256;
        let source_count = 2;
        let fft_ctx = FFTContext::new(len);

        let signal_a = generate_frequency_division_perfect_white(len, 48000.0, 0, source_count);
        let signal_b = generate_frequency_division_perfect_white(len, 48000.0, 1, source_count);
        let (a_re, a_im) = fft_ctx.real_fft(&signal_a);
        let (b_re, b_im) = fft_ctx.real_fft(&signal_b);

        for bin in 1..(len / 2) {
            let magnitude_a = (a_re[bin] * a_re[bin] + a_im[bin] * a_im[bin]).sqrt();
            let magnitude_b = (b_re[bin] * b_re[bin] + b_im[bin] * b_im[bin]).sqrt();

            if bin % source_count == 0 {
                assert!(magnitude_a > magnitude_b * 10.0);
            } else {
                assert!(magnitude_b > magnitude_a * 10.0);
            }
        }
    }

    #[test]
    fn test_generate_zadoff_chu() {
        let signal = generate_zadoff_chu(127, 7);
        assert_eq!(signal.len(), 127);

        let max_abs = signal.iter().map(|&x| x.abs()).fold(0.0f32, f32::max);
        assert!(max_abs <= 1.0);
        assert!(signal.iter().any(|sample| sample.abs() > 0.2));
    }

    #[test]
    fn test_generate_zadoff_chu_even_length_roots_stay_distinct() {
        let signal_two = generate_zadoff_chu(16384, 2);
        let signal_three = generate_zadoff_chu(16384, 3);

        let max_difference = signal_two.iter()
            .zip(signal_three.iter())
            .map(|(&left, &right)| (left - right).abs())
            .fold(0.0f32, f32::max);

        assert!(max_difference > 1e-3);
    }
}
