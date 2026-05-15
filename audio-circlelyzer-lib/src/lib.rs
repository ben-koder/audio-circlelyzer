pub mod fft;
pub mod signal_generation;
pub mod circular_ops;
pub mod octave_filtering;
pub mod rt60;
pub mod bandpass;
pub mod stft;
pub mod phase_analysis;
pub mod poly_regression;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
