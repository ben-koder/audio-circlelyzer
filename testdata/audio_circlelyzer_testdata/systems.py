from __future__ import annotations

import numpy as np


def circular_convolve(signal: np.ndarray, impulse: np.ndarray) -> np.ndarray:
  return np.fft.ifft(np.fft.fft(signal) * np.fft.fft(impulse)).real.astype(np.float32)


def impulse_kernel(length: int, taps: list[tuple[int, float]]) -> np.ndarray:
  kernel = np.zeros(length, dtype=np.float32)
  for delay, amplitude in taps:
    kernel[delay % length] += np.float32(amplitude)
  return kernel


def delayed_minimum_phase_ir(length: int, delay_samples: int, taps: list[float]) -> np.ndarray:
  impulse = np.zeros(length, dtype=np.float32)
  for index, tap in enumerate(taps):
    impulse[(delay_samples + index) % length] += np.float32(tap)
  return impulse


def exponential_room_ir(
  length: int,
  sample_rate: float,
  rt60_seconds: float,
  delay_samples: int,
  reflection_taps: list[tuple[int, float]],
) -> np.ndarray:
  impulse = np.zeros(length, dtype=np.float32)
  impulse[delay_samples % length] = 1.0
  for offset, amplitude in reflection_taps:
    impulse[(delay_samples + offset) % length] += np.float32(amplitude)

  tail_length = max(0, length - delay_samples)
  if tail_length > 0:
    decay = 3.0 * np.log(10.0) / max(1.0, rt60_seconds * sample_rate)
    tail_index = np.arange(tail_length, dtype=np.float64)
    tail = 0.18 * np.exp(-decay * tail_index)
    modulation = 0.5 + 0.5 * np.cos(2.0 * np.pi * tail_index / 61.0)
    impulse[delay_samples:] += (tail * modulation).astype(np.float32)

  peak = float(np.max(np.abs(impulse)))
  if peak > 1e-12:
    impulse /= peak
  return impulse.astype(np.float32)


def polynomial_harmonic_response(
  excitation: np.ndarray,
  kernels: dict[int, np.ndarray],
) -> np.ndarray:
  response = np.zeros_like(excitation, dtype=np.float32)
  for order, kernel in kernels.items():
    response += circular_convolve(np.power(excitation, order, dtype=np.float32), kernel)
  return response.astype(np.float32)


def repeat_cycles(signal_cycle: np.ndarray, cycles: int) -> np.ndarray:
  return np.tile(signal_cycle.astype(np.float32), cycles).astype(np.float32)