use rustfft::{FftPlanner, num_complex::Complex};
use std::sync::Arc;

pub struct FFTContext {
    forward_fft: Arc<dyn rustfft::Fft<f32>>,
    inverse_fft: Arc<dyn rustfft::Fft<f32>>,
    size: usize,
}

impl FFTContext {
    pub fn new(size: usize) -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let forward_fft = planner.plan_fft_forward(size);
        let inverse_fft = planner.plan_fft_inverse(size);
        
        Self {
            forward_fft,
            inverse_fft,
            size,
        }
    }
    
    /// Real FFT: converts real time signal to complex spectrum
    /// Input: real signal (length = size)
    /// Output: complex spectrum (re, im) (length = size)
    pub fn real_fft(&self, input: &[f32]) -> (Vec<f32>, Vec<f32>) {
        assert_eq!(input.len(), self.size, "Input length must match FFT size");
        
        // Convert real input to complex
        let mut buffer: Vec<Complex<f32>> = input
            .iter()
            .map(|&x| Complex::new(x, 0.0))
            .collect();
        
        // Perform FFT
        self.forward_fft.process(&mut buffer);
        
        // Split into real and imaginary parts
        let re: Vec<f32> = buffer.iter().map(|c| c.re).collect();
        let im: Vec<f32> = buffer.iter().map(|c| c.im).collect();
        
        (re, im)
    }
    
    /// Inverse real FFT: converts complex spectrum back to real time signal
    /// Input: complex spectrum (re, im) (length = size)
    /// Output: real signal (length = size)
    pub fn real_ifft(&self, re: &[f32], im: &[f32]) -> Vec<f32> {
        assert_eq!(re.len(), self.size, "RE length must match FFT size");
        assert_eq!(im.len(), self.size, "IM length must match FFT size");
        
        // Combine re and im into complex buffer
        let mut buffer: Vec<Complex<f32>> = re
            .iter()
            .zip(im.iter())
            .map(|(&r, &i)| Complex::new(r, i))
            .collect();
        
        // Perform inverse FFT
        self.inverse_fft.process(&mut buffer);
        
        // Extract real part and normalize
        let scale = 1.0 / (self.size as f32);
        buffer.iter().map(|c| c.re * scale).collect()
    }
    
    pub fn size(&self) -> usize {
        self.size
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_fft_ifft_roundtrip() {
        let size = 128;
        let fft_ctx = FFTContext::new(size);
        
        // Create test signal (sine wave)
        let input: Vec<f32> = (0..size)
            .map(|i| (2.0 * std::f32::consts::PI * i as f32 * 5.0 / size as f32).sin())
            .collect();
        
        // Forward FFT
        let (re, im) = fft_ctx.real_fft(&input);
        
        // Inverse FFT
        let output = fft_ctx.real_ifft(&re, &im);
        
        // Check roundtrip accuracy
        for (i, (&inp, &out)) in input.iter().zip(output.iter()).enumerate() {
            assert!(
                (inp - out).abs() < 1e-5,
                "Roundtrip failed at index {}: {} != {}",
                i,
                inp,
                out
            );
        }
    }
}
