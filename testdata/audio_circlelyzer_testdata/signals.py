from __future__ import annotations

import math

import numpy as np


def normalize_peak(signal: np.ndarray, peak: float = 0.9) -> np.ndarray:
  signal = np.asarray(signal, dtype=np.float32)
  current_peak = float(np.max(np.abs(signal))) if signal.size else 0.0
  if current_peak <= 1e-12:
    return signal.copy()
  return (signal * (peak / current_peak)).astype(np.float32)


def perfect_white(length: int, seed: int) -> np.ndarray:
  rng = np.random.default_rng(seed)
  half = length // 2
  phase = np.zeros(half + 1, dtype=np.float64)
  if half > 1:
    phase[1:half] = rng.uniform(0.0, 2.0 * np.pi, half - 1)
  spectrum = np.exp(1j * phase)
  signal = np.fft.irfft(spectrum, n=length)
  return normalize_peak(signal)


def perfect_pink(length: int, seed: int) -> np.ndarray:
  rng = np.random.default_rng(seed)
  half = length // 2
  phase = np.zeros(half + 1, dtype=np.float64)
  if half > 1:
    phase[1:half] = rng.uniform(0.0, 2.0 * np.pi, half - 1)
  freqs = np.arange(half + 1, dtype=np.float64)
  freqs[0] = 1.0
  amplitude = 1.0 / np.sqrt(freqs)
  amplitude[0] = 1.0
  spectrum = amplitude * np.exp(1j * phase)
  signal = np.fft.irfft(spectrum, n=length)
  return normalize_peak(signal)


def zadoff_chu_real(length: int, root: int = 1) -> np.ndarray:
  half = length // 2
  spectrum = np.zeros(half + 1, dtype=np.complex128)
  first_bin = 1
  last_bin = max(first_bin, half - 1)
  span = max(1, last_bin - first_bin)
  bins = np.arange(first_bin, last_bin + 1, dtype=np.float64)
  phase = -np.pi * root * (bins - first_bin) ** 2 / span
  spectrum[bins.astype(np.int64)] = np.exp(1j * phase)
  signal = np.fft.irfft(spectrum, n=length)
  return normalize_peak(signal, peak=0.95)


def frequency_division_perfect_white(
  length: int,
  source_index: int,
  source_count: int,
  seed: int,
) -> np.ndarray:
  rng = np.random.default_rng(seed + source_index)
  half = length // 2
  spectrum = np.zeros(half + 1, dtype=np.complex128)
  bins = np.arange(1, half, dtype=np.int32)
  selected = bins[bins % source_count == source_index]
  if selected.size > 0:
    phases = rng.uniform(0.0, 2.0 * np.pi, selected.size)
    spectrum[selected] = np.exp(1j * phases)
  signal = np.fft.irfft(spectrum, n=length)
  return normalize_peak(signal, peak=0.88)