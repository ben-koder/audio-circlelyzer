import { CalculationType, CalculationContext, ComplexSpectrum, RT60Result, RT60FullResult, DecayMeasurement, OctaveFilterResult, CONTEXT_KEY, COMPUTATION_TYPE_ID, ChannelSumSettings, BandpassSettings, ExpandSettings, CompactSettings, InputNSettings, NoisefloorSettings, WienerDivideSettings, RT60Settings as RT60SettingsType, TraceSettings, ResultDimensionInfo } from './types';
import { WasmService } from '../services/wasm.service';
import type { PolyFitData } from '../services/wasm.service';
import { Type } from '@angular/core';
import { OctaveFilterSettingsComponent } from '../components/settings-dialog/calculation-settings/octave-filter-settings';
import { ExpandSettingsComponent } from '../components/settings-dialog/calculation-settings/expand-settings';
import { CompactSettingsComponent } from '../components/settings-dialog/calculation-settings/compact-settings';
import { InputNSettingsComponent } from '../components/settings-dialog/calculation-settings/inputn-settings';
import { TraceSettingsComponent } from '../components/settings-dialog/calculation-settings/trace-settings';

// Helper function to repeat channels to match target count
function repeatChannelsToMatch(input: any[], targetCount: number): any[] {
  if (input.length === 0) return [];
  if (input.length >= targetCount) return input.slice(0, targetCount);
  
  const result: any[] = [];
  for (let i = 0; i < targetCount; i++) {
    result.push(input[i % input.length]);
  }
  return result;
}

// Helper function to get the maximum channel count from multiple inputs
function getMaxChannelCount(...inputs: any[][]): number {
  return Math.max(...inputs.map(inp => inp.length), 1);
}

type LabeledChannelArray<T> = T[] & { channelLabels?: string[] };

function readChannelLabels(value: unknown): string[] | undefined {
  const labels = (value as { channelLabels?: unknown })?.channelLabels;
  if (!Array.isArray(labels)) {
    return undefined;
  }

  const normalized = labels.filter((label): label is string => typeof label === 'string' && label.trim().length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function writeChannelLabels<T>(target: T[], labels: string[] | undefined): T[] {
  const labeledTarget = target as LabeledChannelArray<T>;
  if (labels && labels.length > 0) {
    labeledTarget.channelLabels = [...labels];
  } else {
    delete labeledTarget.channelLabels;
  }
  return target;
}

function copyChannelLabels<T>(source: unknown, target: T[]): T[] {
  return writeChannelLabels(target, readChannelLabels(source));
}

// FFT Calculation Type - now returns multichannel results
export class FFTCalculation implements CalculationType<void, ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'FFT';
  name = 'Fast Fourier Transform';
  description = 'Transforms time-domain signal to frequency-domain';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): void {
    // No settings needed
  }

  initResult(key: string, ctx: CalculationContext): ComplexSpectrum[] {
    // Determine channel count and data length from input
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey);
    const channelCount = inputData.length;
    // Use actual input length (may differ from nc if input is from INPUTN)
    const dataLength = inputData[0]?.length || ctx.settings.nc;
    
    return Array.from({ length: channelCount }, () => ({
      re: new Float32Array(dataLength),
      im: new Float32Array(dataLength)
    }));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Real', unit: '' },
      { name: 'Imaginary', unit: '' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0]; // e.g., "x_c" or "y_c"
    
    // Get multichannel input data
    const inputData = ctx.getVariable(inputKey);
    const result = ctx.calculationResults.get(key) as ComplexSpectrum[];
    
    // Process each channel
    for (let ch = 0; ch < inputData.length; ch++) {
      const channelData = inputData[ch] as Float32Array;
      const fftContext = this.wasm.createFFTContext(channelData.length);
      const spectrum = this.wasm.fft(fftContext, channelData);
      
      // Handle case where result array may need to be resized
      if (result[ch].re.length !== spectrum.re.length) {
        result[ch] = {
          re: new Float32Array(spectrum.re.length),
          im: new Float32Array(spectrum.im.length)
        };
        const resultArray = ctx.calculationResults.get(key) as ComplexSpectrum[];
        resultArray[ch] = result[ch];
      }
      
      result[ch].re.set(spectrum.re);
      result[ch].im.set(spectrum.im);
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// IFFT Calculation Type - now returns multichannel results
export class IFFTCalculation implements CalculationType<void, Float32Array[]> {
  id: COMPUTATION_TYPE_ID = 'IFFT';
  name = 'Inverse Fast Fourier Transform';
  description = 'Transforms frequency-domain to time-domain';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): void {}

  initResult(key: string, ctx: CalculationContext): Float32Array[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    // Use actual input length (may differ from nc if input is from EXPAND)
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    
    return Array.from({ length: channelCount }, () => new Float32Array(dataLength));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    const duration = dataLength / ctx.settings.sampleRate;
    return [
      { name: 'Time', unit: 's', ranage: [0, duration] },
      { name: 'Amplitude', unit: '' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const result = ctx.calculationResults.get(key) as Float32Array[];
    
    // Process each channel
    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const spectrum = spectrumChannels[ch];
      const fftContext = this.wasm.createFFTContext(spectrum.re.length);
      const timeDomain = this.wasm.ifft(fftContext, spectrum);
      // Handle case where result array may need to be resized
      if (result[ch].length !== timeDomain.length) {
        result[ch] = new Float32Array(timeDomain.length);
        const resultArray = ctx.calculationResults.get(key) as Float32Array[];
        resultArray[ch] = result[ch];
      }
      result[ch].set(timeDomain);
    }

    copyChannelLabels(spectrumChannels, result);
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// Complex Division (DIVIDE) - now returns multichannel results
// Supports optional Wiener noise-robust mode when called with 3 inputs (numerator, denominator, noiseFloor)
export class DivideCalculation implements CalculationType<WienerDivideSettings | void, ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'DIVIDE';
  name = 'Complex Division';
  description = 'Divides two complex spectra (Y/X), optionally with Wiener noise-robust regularization';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): WienerDivideSettings | void {
    const deps = this.getDependencies(key, ctx);
    if (deps.length >= 3) {
      // Wiener mode — return default or existing settings
      const existing = ctx.calculationSettings.get(key);
      if (existing) return existing as WienerDivideSettings;
      return { alpha: 1.0, spectralFloor: -80, gamma: 0.01 };
    }
    // Plain mode — no settings
  }

  initResult(key: string, ctx: CalculationContext): ComplexSpectrum[] {
    const deps = this.getDependencies(key, ctx);
    const numeratorKey = deps[0];
    const denominatorKey = deps[1];
    
    const numerator = ctx.getVariable(numeratorKey) as ComplexSpectrum[];
    const denominator = ctx.getVariable(denominatorKey) as ComplexSpectrum[];
    const channelCount = getMaxChannelCount(numerator, denominator);
    // Use actual input length (may differ from nc if input is from EXPAND/INPUTN)
    const dataLength = numerator[0]?.re?.length || denominator[0]?.re?.length || ctx.settings.nc;
    
    return Array.from({ length: channelCount }, () => ({
      re: new Float32Array(dataLength),
      im: new Float32Array(dataLength)
    }));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Real', unit: '' },
      { name: 'Imaginary', unit: '' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const numeratorKey = deps[0]; // Y_c
    const denominatorKey = deps[1]; // X_c
    
    const numeratorChannels = ctx.getVariable(numeratorKey) as ComplexSpectrum[];
    const denominatorChannels = ctx.getVariable(denominatorKey) as ComplexSpectrum[];
    const result = ctx.calculationResults.get(key) as ComplexSpectrum[];
    
    const channelCount = result.length;
    const numRepeated = repeatChannelsToMatch(numeratorChannels, channelCount);
    const denRepeated = repeatChannelsToMatch(denominatorChannels, channelCount);

    // Check for Wiener mode (3 inputs: numerator, denominator, noiseFloor)
    const hasNoiseFloor = deps.length >= 3;
    let nfRepeated: ComplexSpectrum[] | null = null;
    let settings: WienerDivideSettings | null = null;

    if (hasNoiseFloor) {
      const noiseFloorKey = deps[2];
      const noiseFloorChannels = ctx.getVariable(noiseFloorKey) as ComplexSpectrum[];
      nfRepeated = repeatChannelsToMatch(noiseFloorChannels, channelCount) as ComplexSpectrum[];
      settings = (ctx.calculationSettings.get(key) as WienerDivideSettings) || { alpha: 1.0, spectralFloor: -80, gamma: 0.01 };
    }
    
    // Process each channel
    for (let ch = 0; ch < channelCount; ch++) {
      const numerator = numRepeated[ch] as ComplexSpectrum;
      const denominator = denRepeated[ch] as ComplexSpectrum;
      const N = numerator.re.length;

      // Ensure result is correctly sized
      if (result[ch].re.length !== N) {
        result[ch] = { re: new Float32Array(N), im: new Float32Array(N) };
        (ctx.calculationResults.get(key) as ComplexSpectrum[])[ch] = result[ch];
      }

      if (hasNoiseFloor && nfRepeated && settings) {
        // Wiener noise-robust division
        this.wienerDivide(numerator, denominator, nfRepeated[ch], settings, result[ch], ctx.settings.sampleRate);
      } else {
        // Plain division (backward compatible)
        const divided = this.wasm.complexDivide(numerator, denominator);
        result[ch].re.set(divided.re);
        result[ch].im.set(divided.im);
      }

      // Enforce Hermitian symmetry on the result.
      // Project convention: every complex spectrum represents a real-valued
      // time-domain signal, so H[N-k] must equal conj(H[k]), and DC and Nyquist
      // bins must be purely real. This guards against any upstream pollution
      // (e.g. a one-sided bandpass on a full N-bin spectrum) and against tiny
      // floating-point asymmetries — without it, IFFT(H) leaks energy into the
      // imaginary part and the real part shown to the user becomes an
      // analytic-signal artifact whose shape depends on the source phase
      // (e.g. wildly different for white noise vs Zadoff-Chu).
      const re = result[ch].re;
      const im = result[ch].im;
      const half = N >>> 1;
      im[0] = 0;
      if ((N & 1) === 0) im[half] = 0;
      for (let k = 1; k < half; k++) {
        re[N - k] = re[k];
        im[N - k] = -im[k];
      }
    }
  }

  /**
   * Wiener noise-robust spectral division.
   * H[k] = W[k] * Y[k] * conj(X[k]) / (|X[k]|^2 + gamma * Nf[k]^2)
   * where W[k] is the band-averaged Wiener post-filter gain.
   */
  private wienerDivide(
    Y: ComplexSpectrum,
    X: ComplexSpectrum,
    Nf: ComplexSpectrum,
    settings: WienerDivideSettings,
    output: ComplexSpectrum,
    sampleRate: number
  ): void {
    const N = Y.re.length;
    const alpha = settings.alpha;
    const gamma = settings.gamma;
    const Wmin = Math.pow(10, settings.spectralFloor / 20);

    // Step 1: Compute per-bin signal power and noise power
    const signalPower = new Float32Array(N);
    const noisePower = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      signalPower[k] = Y.re[k] * Y.re[k] + Y.im[k] * Y.im[k];
      // Nf stores noise amplitude in re, 0 in im
      noisePower[k] = Nf.re[k] * Nf.re[k];
    }

    // Step 2: Compute Wiener gain per 1/3-octave band
    const bands = assignBinsToThirdOctaveBands(N, sampleRate, N);
    const bandCenters: number[] = [];
    const bandLogW: number[] = [];

    for (const band of bands) {
      let sumSignalPower = 0;
      let sumNoisePower = 0;
      let count = 0;
      for (const k of band.binIndices) {
        sumSignalPower += signalPower[k];
        sumNoisePower += noisePower[k];
        count++;
      }
      if (count === 0) continue;

      const meanSignalPower = sumSignalPower / count;
      const meanNoisePower = sumNoisePower / count;

      let Wb: number;
      if (meanSignalPower <= 0) {
        Wb = Wmin;
      } else {
        Wb = Math.max(Wmin, (meanSignalPower - alpha * meanNoisePower) / meanSignalPower);
      }

      bandCenters.push(band.centerFreq);
      bandLogW.push(Math.log(Math.max(Wb, 1e-30)));
    }

    // Step 3: Interpolate Wiener gain to per-bin and apply
    for (let k = 0; k < N; k++) {
      const freq = k * sampleRate / N;

      // Interpolated Wiener gain
      let W: number;
      if (k === 0 || freq <= 0 || bandCenters.length === 0) {
        W = Wmin;
      } else {
        W = Math.exp(logFreqInterpolate(freq, bandCenters, bandLogW));
      }

      // Regularized division: Y * conj(X) / (|X|^2 + gamma * Nf^2)
      const Xr = X.re[k], Xi = X.im[k];
      const Yr = Y.re[k], Yi = Y.im[k];
      const denomMag2 = Xr * Xr + Xi * Xi;
      const reg = denomMag2 + gamma * noisePower[k];

      // Y * conj(X) = (Yr*Xr + Yi*Xi) + j(Yi*Xr - Yr*Xi)
      const crossRe = Yr * Xr + Yi * Xi;
      const crossIm = Yi * Xr - Yr * Xi;

      if (reg < 1e-30) {
        output.re[k] = 0;
        output.im[k] = 0;
      } else {
        output.re[k] = W * crossRe / reg;
        output.im[k] = W * crossIm / reg;
      }
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// Absolute Value (ABS) - now returns multichannel results
export class ABSCalculation implements CalculationType<void, Float32Array[]> {
  id: COMPUTATION_TYPE_ID = 'ABS';
  name = 'Complex Magnitude';
  description = 'Calculates magnitude of complex spectrum';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): void {}

  initResult(key: string, ctx: CalculationContext): Float32Array[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    // Use actual input length (may differ from nc if input is from EXPAND)
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    
    return Array.from({ length: channelCount }, () => new Float32Array(dataLength));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Magnitude', unit: '' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const result = ctx.calculationResults.get(key) as Float32Array[];
    
    // Process each channel
    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const spectrum = spectrumChannels[ch];
      const magnitude = this.wasm.complexAbs(spectrum);
      // Handle case where result array may need to be resized
      if (result[ch].length !== magnitude.length) {
        result[ch] = new Float32Array(magnitude.length);
        const resultArray = ctx.calculationResults.get(key) as Float32Array[];
        resultArray[ch] = result[ch];
      }
      result[ch].set(magnitude);
    }

    copyChannelLabels(spectrumChannels, result);
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// Phase Angle (ARG) - now returns multichannel results
export class ARGCalculation implements CalculationType<void, Float32Array[]> {
  id: COMPUTATION_TYPE_ID = 'ARG';
  name = 'Complex Argument';
  description = 'Calculates phase angle of complex spectrum';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): void {}

  initResult(key: string, ctx: CalculationContext): Float32Array[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    // Use actual input length (may differ from nc if input is from EXPAND)
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    
    return Array.from({ length: channelCount }, () => new Float32Array(dataLength));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Phase', unit: 'rad', ranage: [-Math.PI, Math.PI] }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const result = ctx.calculationResults.get(key) as Float32Array[];
    
    // Process each channel
    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const spectrum = spectrumChannels[ch];
      const phase = this.wasm.complexArg(spectrum);
      // Handle case where result array may need to be resized
      if (result[ch].length !== phase.length) {
        result[ch] = new Float32Array(phase.length);
        const resultArray = ctx.calculationResults.get(key) as Float32Array[];
        resultArray[ch] = result[ch];
      }
      result[ch].set(phase);
    }

    copyChannelLabels(spectrumChannels, result);
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// Phase Unwrap (UNWRAP_PHASE) - conventional atan2-based unwrapping
// Use GROUP_DELAY → PHASE_FROM_GROUP_DELAY for the more robust direct method.
export class UNWRAP_PHASECalculation implements CalculationType<void, Float32Array[]> {
  id: COMPUTATION_TYPE_ID = 'UNWRAP_PHASE';
  name = 'Phase Unwrap';
  description = 'Unwraps phase discontinuities (conventional atan2-based method)';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): void {}

  initResult(key: string, ctx: CalculationContext): Float32Array[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as Float32Array[];
    const channelCount = inputData.length;
    const dataLength = inputData[0]?.length || ctx.settings.nc;
    
    return Array.from({ length: channelCount }, () => new Float32Array(dataLength));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Phase', unit: 'rad' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const wrappedPhaseChannels = ctx.getVariable(inputKey) as Float32Array[];
    const result = ctx.calculationResults.get(key) as Float32Array[];
    
    for (let ch = 0; ch < wrappedPhaseChannels.length; ch++) {
      const wrappedPhase = wrappedPhaseChannels[ch];
      const unwrapped = this.wasm.phaseUnwrap(wrappedPhase);
      if (result[ch].length !== unwrapped.length) {
        result[ch] = new Float32Array(unwrapped.length);
        (ctx.calculationResults.get(key) as Float32Array[])[ch] = result[ch];
      }
      result[ch].set(unwrapped);
    }

    copyChannelLabels(wrappedPhaseChannels, result);
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// ---------------------------------------------------------------------------
// Phase analysis calculations (direct ramp-DFT methods, no atan2 unwrapping)
// ---------------------------------------------------------------------------

// GROUP_DELAY — group delay from complex spectrum (ramp-DFT method)
// Input: ComplexSpectrum[]  (e.g. result of DIVIDE)
// Output: Float32Array[]    (group delay in samples per DFT bin)
export class GROUP_DELAYCalculation implements CalculationType<void, Float32Array[]> {
  id: COMPUTATION_TYPE_ID = 'GROUP_DELAY';
  name = 'Group Delay';
  description = 'Computes group delay directly from complex spectrum (ramp-DFT, no phase unwrapping)';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): void {}

  initResult(key: string, ctx: CalculationContext): Float32Array[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    return Array.from({ length: channelCount }, () => new Float32Array(dataLength));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Group Delay', unit: 'samples' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const result = ctx.calculationResults.get(key) as Float32Array[];

    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const spectrum = spectrumChannels[ch];
      const tau_g = this.wasm.computeGroupDelay(spectrum);
      if (result[ch].length !== tau_g.length) {
        result[ch] = new Float32Array(tau_g.length);
        (ctx.calculationResults.get(key) as Float32Array[])[ch] = result[ch];
      }
      result[ch].set(tau_g);
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// PHASE_FROM_GROUP_DELAY — unwrapped phase reconstructed by integrating group delay
// Input: ComplexSpectrum[]  (same complex spectrum passed to GROUP_DELAY)
// Note: the GROUP_DELAY result is recomputed internally to avoid managing two
//       dependencies — the extra DFT is cheap and keeps the script clean.
// Output: Float32Array[]    (unwrapped phase in radians per DFT bin)
export class PHASE_FROM_GROUP_DELAYCalculation implements CalculationType<void, Float32Array[]> {
  id: COMPUTATION_TYPE_ID = 'PHASE_FROM_GROUP_DELAY';
  name = 'Phase from Group Delay';
  description = 'Reconstructs unwrapped phase by integrating group delay (robust, no atan2)';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): void {}

  initResult(key: string, ctx: CalculationContext): Float32Array[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    return Array.from({ length: channelCount }, () => new Float32Array(dataLength));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Unwrapped Phase', unit: 'rad' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const result = ctx.calculationResults.get(key) as Float32Array[];

    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const spectrum = spectrumChannels[ch];
      const tau_g = this.wasm.computeGroupDelay(spectrum);
      const theta = this.wasm.unwrappedPhaseFromGroupDelay(tau_g, spectrum);
      if (result[ch].length !== theta.length) {
        result[ch] = new Float32Array(theta.length);
        (ctx.calculationResults.get(key) as Float32Array[])[ch] = result[ch];
      }
      result[ch].set(theta);
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// PHASE_DELAY — phase delay from unwrapped phase
// Input: Float32Array[]     (unwrapped phase, e.g. from PHASE_FROM_GROUP_DELAY)
// Output: Float32Array[]    (phase delay in samples per DFT bin)
export class PHASE_DELAYCalculation implements CalculationType<void, Float32Array[]> {
  id: COMPUTATION_TYPE_ID = 'PHASE_DELAY';
  name = 'Phase Delay';
  description = 'Computes phase delay τ_φ[k] = -Θ[k] / ω_k from unwrapped phase';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): void {}

  initResult(key: string, ctx: CalculationContext): Float32Array[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as Float32Array[];
    const channelCount = inputData.length;
    const dataLength = inputData[0]?.length || ctx.settings.nc;
    return Array.from({ length: channelCount }, () => new Float32Array(dataLength));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Phase Delay', unit: 'samples' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const thetaChannels = ctx.getVariable(inputKey) as Float32Array[];
    const result = ctx.calculationResults.get(key) as Float32Array[];

    for (let ch = 0; ch < thetaChannels.length; ch++) {
      const tau_phi = this.wasm.phaseDelayFromUnwrappedPhase(thetaChannels[ch]);
      if (result[ch].length !== tau_phi.length) {
        result[ch] = new Float32Array(tau_phi.length);
        (ctx.calculationResults.get(key) as Float32Array[])[ch] = result[ch];
      }
      result[ch].set(tau_phi);
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// MinimumPhaseSettings — configures the cepstral noise floor
export interface MinimumPhaseSettings {
  floorDb: number;
}

// MINIMUM_PHASE — minimum-phase transfer function via cepstral method
// Input: ComplexSpectrum[]
// Output: ComplexSpectrum[]
// The all-pass component can then be obtained with: ALL_PASS = DIVIDE(H, H_min)
export class MINIMUM_PHASECalculation implements CalculationType<MinimumPhaseSettings, ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'MINIMUM_PHASE';
  name = 'Minimum Phase';
  description = 'Computes minimum-phase transfer function via cepstral method';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): MinimumPhaseSettings {
    const existing = ctx.calculationSettings.get(key) as MinimumPhaseSettings | undefined;
    if (existing) return existing;
    return { floorDb: -120 };
  }

  initResult(key: string, ctx: CalculationContext): ComplexSpectrum[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    return Array.from({ length: channelCount }, () => ({
      re: new Float32Array(dataLength),
      im: new Float32Array(dataLength)
    }));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Real', unit: '' },
      { name: 'Imaginary', unit: '' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const settings = ctx.calculationSettings.get(key) as MinimumPhaseSettings;
    const result = ctx.calculationResults.get(key) as ComplexSpectrum[];

    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const minPhase = this.wasm.computeMinimumPhaseSpectrum(
        spectrumChannels[ch],
        settings?.floorDb ?? -120
      );
      if (result[ch].re.length !== minPhase.re.length) {
        result[ch] = { re: new Float32Array(minPhase.re.length), im: new Float32Array(minPhase.im.length) };
        (ctx.calculationResults.get(key) as ComplexSpectrum[])[ch] = result[ch];
      }
      result[ch].re.set(minPhase.re);
      result[ch].im.set(minPhase.im);
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// AlignMinimumPhaseExcessSettings
export interface AlignMinimumPhaseExcessSettings {
  floorDb: number;
}

// ALIGN_MINIMUM_PHASE_EXCESS — impulse response alignment via minimum-phase/all-pass decomposition
// Approach 4 from CIRCULAR_SIGNAL_PHASE_ANALYSIS.md §2.6
// Input: ComplexSpectrum[]  (transfer function H)
// Output: ComplexSpectrum[] (H with propagation delay removed; IFFT gives aligned IR)
export class ALIGN_MINIMUM_PHASE_EXCESSCalculation
  implements CalculationType<AlignMinimumPhaseExcessSettings, ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'ALIGN_MINIMUM_PHASE_EXCESS';
  name = 'Align: Minimum Phase Excess';
  description = 'Removes onset delay estimated via minimum-phase/all-pass decomposition (Approach 4)';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): AlignMinimumPhaseExcessSettings {
    const existing = ctx.calculationSettings.get(key) as AlignMinimumPhaseExcessSettings | undefined;
    if (existing) return existing;
    return { floorDb: -120 };
  }

  initResult(key: string, ctx: CalculationContext): ComplexSpectrum[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    return Array.from({ length: channelCount }, () => ({
      re: new Float32Array(dataLength),
      im: new Float32Array(dataLength)
    }));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Real', unit: '' },
      { name: 'Imaginary', unit: '' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const settings = ctx.calculationSettings.get(key) as AlignMinimumPhaseExcessSettings;
    const result = ctx.calculationResults.get(key) as ComplexSpectrum[];
    const floorDb = settings?.floorDb ?? -120;

    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const spectrum = spectrumChannels[ch];
      const delay = this.wasm.estimateDelayMinimumPhaseExcess(spectrum, floorDb);
      const aligned = this.wasm.alignSpectrumFractionalShift(spectrum, delay);
      if (result[ch].re.length !== aligned.re.length) {
        result[ch] = { re: new Float32Array(aligned.re.length), im: new Float32Array(aligned.im.length) };
        (ctx.calculationResults.get(key) as ComplexSpectrum[])[ch] = result[ch];
      }
      result[ch].re.set(aligned.re);
      result[ch].im.set(aligned.im);
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// Octave Filter RMS
export interface OctaveFilterSettings {
  mode: 'full' | 'third';
}

export class OCTFILTERRMSCalculation implements CalculationType<OctaveFilterSettings, OctaveFilterResult[]> {
  id: COMPUTATION_TYPE_ID = 'OCTFILTERRMS';
  name = 'Octave Band Filter RMS';
  description = 'Calculates RMS values for octave bands - multichannel';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): OctaveFilterSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as OctaveFilterSettings;
    }
    return { mode: 'full' };
  }

  initResult(key: string, ctx: CalculationContext): OctaveFilterResult[] {
    const settings = ctx.calculationSettings.get(key) as OctaveFilterSettings;
    const numBands = settings.mode === 'full' ? 10 : 30;
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey);
    const channelCount = inputData.length;
    
    return Array.from({ length: channelCount }, () => ({
      frequencies: [],
      rmsValues: new Float32Array(numBands),
      mode: settings.mode
    }));
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as Float32Array[];
    const settings = ctx.calculationSettings.get(key) as OctaveFilterSettings;
    const result = ctx.calculationResults.get(key) as OctaveFilterResult[];
    
    // Process each channel
    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const spectrum = spectrumChannels[ch];
      const filtered = this.wasm.octaveFilterRMS(
        spectrum,
        ctx.settings.sampleRate,
        spectrum.length,
        settings.mode
      );
      
      result[ch].frequencies = filtered.frequencies;
      result[ch].rmsValues.set(filtered.rmsValues);
      result[ch].mode = settings.mode;
    }

    copyChannelLabels(spectrumChannels, result as unknown as OctaveFilterResult[]);
  }

  getSettingsUI(): Type<any> {
    return OctaveFilterSettingsComponent;
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    const settings = ctx.calculationSettings.get(key) as OctaveFilterSettings;
    return [
      { name: 'Frequency Band', unit: 'Hz' },
      { name: 'RMS Level', unit: 'dB', ranage: [-80, 0] }
    ];
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// RT60 Calculation - supports both legacy and full ISO 3382 modes
export interface RT60Settings {
  mode: 'legacy' | 'full';
  startDb: number;
  endDb: number;
}

export class RT60Calculation implements CalculationType<RT60Settings, (RT60Result | RT60FullResult)[]> {
  id: COMPUTATION_TYPE_ID = 'RT60';
  name = 'RT60 Reverberation Time';
  description = 'Calculates RT60 from impulse response per ISO 3382 - multichannel';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): RT60Settings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as RT60Settings;
    }
    return { mode: 'full', startDb: -5, endDb: -35 };
  }

  initResult(key: string, ctx: CalculationContext): (RT60Result | RT60FullResult)[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as Float32Array[];
    const channelCount = inputData.length;
    const settings = ctx.calculationSettings.get(key) as RT60Settings;
    // Use actual input length (may differ from nc if input is from INPUTN)
    const dataLength = inputData[0]?.length || ctx.settings.nc;
    
    if (settings.mode === 'full') {
      return Array.from({ length: channelCount }, () => this.createEmptyFullResult(dataLength));
    } else {
      return Array.from({ length: channelCount }, () => ({
        rt60: 0,
        decayCurve: new Float32Array(dataLength),
        timeAxis: new Float32Array(dataLength),
        coefficients: new Float32Array(2)
      }));
    }
  }

  private createEmptyFullResult(dataLength: number): RT60FullResult {
    const emptyMeasurement: DecayMeasurement = {
      value: 0,
      slope: 0,
      intercept: 0,
      correlation: 0,
      startIdx: 0,
      endIdx: 0,
      isReliable: false
    };
    return {
      edt: { ...emptyMeasurement },
      t20: { ...emptyMeasurement },
      t30: { ...emptyMeasurement },
      topt: { ...emptyMeasurement },
      c50: 0,
      c80: 0,
      d50: 0,
      ts: 0,
      curvature: 0,
      decayCurve: new Float32Array(dataLength),
      timeAxis: new Float32Array(dataLength),
      noiseFloor: -60
    };
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const impulseResponseChannels = ctx.getVariable(inputKey) as Float32Array[];
    const settings = ctx.calculationSettings.get(key) as RT60Settings;
    const result = ctx.calculationResults.get(key) as (RT60Result | RT60FullResult)[];
    
    // Process each channel
    for (let ch = 0; ch < impulseResponseChannels.length; ch++) {
      const impulseResponse = impulseResponseChannels[ch];
      
      if (settings.mode === 'full') {
        const fullResult = this.wasm.calculateRT60Full(
          impulseResponse,
          ctx.settings.sampleRate
        );
        const target = result[ch] as RT60FullResult;
        target.edt = fullResult.edt;
        target.t20 = fullResult.t20;
        target.t30 = fullResult.t30;
        target.topt = fullResult.topt;
        target.c50 = fullResult.c50;
        target.c80 = fullResult.c80;
        target.d50 = fullResult.d50;
        target.ts = fullResult.ts;
        target.curvature = fullResult.curvature;
        target.decayCurve.set(fullResult.decayCurve);
        target.timeAxis.set(fullResult.timeAxis);
        target.noiseFloor = fullResult.noiseFloor;
      } else {
        const legacyResult = this.wasm.calculateRT60(
          impulseResponse,
          ctx.settings.sampleRate,
          settings.startDb,
          settings.endDb
        );
        const target = result[ch] as RT60Result;
        target.rt60 = legacyResult.rt60;
        target.decayCurve.set(legacyResult.decayCurve);
        target.timeAxis.set(legacyResult.timeAxis);
        target.coefficients.set(legacyResult.coefficients);
      }
    }
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Time', unit: 's' },
      { name: 'Level', unit: 'dB', ranage: [-80, 0] }
    ];
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// BANDPASS Calculation - frequency domain bandpass filter
export class BANDPASSCalculation implements CalculationType<BandpassSettings, ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'BANDPASS';
  name = 'Bandpass Filter';
  description = 'Applies bandpass filter to complex spectrum - multichannel';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): BandpassSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as BandpassSettings;
    }
    return { 
      lowFreq: null,    // No low cut by default
      highFreq: null,   // No high cut by default
      smooth: false,     // Use smooth rolloff
      order: 4          // 4th order Butterworth-like
    };
  }

  initResult(key: string, ctx: CalculationContext): ComplexSpectrum[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    // Use actual input length (may differ from nc if input is from EXPAND/INPUTN)
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    
    return Array.from({ length: channelCount }, () => ({
      re: new Float32Array(dataLength),
      im: new Float32Array(dataLength)
    }));
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const settings = ctx.calculationSettings.get(key) as BandpassSettings;
    const result = ctx.calculationResults.get(key) as ComplexSpectrum[];
    
    // Process each channel
    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const spectrum = spectrumChannels[ch];
      const inputLength = spectrum.re.length;
      
      const filtered = settings.smooth
        ? this.wasm.bandpassFilterSmooth(
            spectrum.re,
            spectrum.im,
            ctx.settings.sampleRate,
            inputLength,
            settings.lowFreq,
            settings.highFreq,
            settings.order
          )
        : this.wasm.bandpassFilter(
            spectrum.re,
            spectrum.im,
            ctx.settings.sampleRate,
            inputLength,
            settings.lowFreq,
            settings.highFreq
          );
      
      // Handle case where result array may need to be resized
      if (result[ch].re.length !== filtered.re.length) {
        result[ch] = {
          re: new Float32Array(filtered.re.length),
          im: new Float32Array(filtered.im.length)
        };
        const resultArray = ctx.calculationResults.get(key) as ComplexSpectrum[];
        resultArray[ch] = result[ch];
      }
      
      result[ch].re.set(filtered.re);
      result[ch].im.set(filtered.im);
    }
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    const settings = ctx.calculationSettings.get(key) as BandpassSettings;
    const lowFreq = settings?.lowFreq ?? 20;
    const highFreq = settings?.highFreq ?? (ctx.settings.sampleRate / 2);
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [lowFreq, highFreq] },
      { name: 'Real', unit: '' },
      { name: 'Imaginary', unit: '' }
    ];
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// Channel Sum Calculation Type
// Supports both real (Float32Array[]) and complex (ComplexSpectrum[]) data
// Negative channel indices indicate subtraction: -1 means subtract channel 1
// Indices work modulus number of channels: if channels = 4, index -4 = -(4 mod 4) = -channel 0
export class ChannelSumCalculation implements CalculationType<ChannelSumSettings, Float32Array[] | ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'CHANNELSUM';
  name = 'Channel Sum';
  description = 'Sums or subtracts specified channels (supports negative indices for subtraction)';

  constructor() {}

  initSettings(key: string, ctx: CalculationContext): ChannelSumSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as ChannelSumSettings;
    }
    return {
      channelSums: [[0]]
    };
  }

  initResult(key: string, ctx: CalculationContext): Float32Array[] | ComplexSpectrum[] {
    const settings = ctx.calculationSettings.get(key) as ChannelSumSettings;
    const channelCount = settings?.channelSums?.length || 1;
    
    // Check input data type to determine output type and length
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey);
    const isComplex = this.isComplexData(inputData);
    // Use actual input length (may differ from nc if input is from EXPAND/INPUTN)
    const dataLength = isComplex 
      ? (inputData[0] as ComplexSpectrum)?.re?.length || ctx.settings.nc
      : (inputData[0] as Float32Array)?.length || ctx.settings.nc;
    
    if (isComplex) {
      return Array.from({ length: channelCount }, () => ({
        re: new Float32Array(dataLength),
        im: new Float32Array(dataLength)
      }));
    } else {
      return Array.from({ length: channelCount }, () => new Float32Array(dataLength));
    }
  }

  private isComplexData(data: any[]): boolean {
    if (!data || data.length === 0) return false;
    const first = data[0];
    return first && typeof first === 'object' && 're' in first && 'im' in first;
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey);
    let result = ctx.calculationResults.get(key);
    const settings = ctx.calculationSettings.get(key) as ChannelSumSettings;
    
    if (!settings || !settings.channelSums) return;

    const isComplex = this.isComplexData(inputData);
    const numInputChannels = inputData.length;
    
    // Check if result needs resizing (input size changed)
    const inputLength = isComplex 
      ? (inputData[0] as ComplexSpectrum)?.re?.length || 0
      : (inputData[0] as Float32Array)?.length || 0;
    const resultLength = isComplex
      ? (result as ComplexSpectrum[])[0]?.re?.length || 0
      : (result as Float32Array[])[0]?.length || 0;
    
    if (inputLength !== resultLength && inputLength > 0) {
      // Resize result arrays
      const channelCount = settings.channelSums.length;
      if (isComplex) {
        result = Array.from({ length: channelCount }, () => ({
          re: new Float32Array(inputLength),
          im: new Float32Array(inputLength)
        }));
      } else {
        result = Array.from({ length: channelCount }, () => new Float32Array(inputLength));
      }
      ctx.calculationResults.set(key, result);
    }

    if (isComplex) {
      this.updateComplexResult(inputData as ComplexSpectrum[], result as ComplexSpectrum[], settings, numInputChannels);
    } else {
      this.updateRealResult(inputData as Float32Array[], result as Float32Array[], settings, numInputChannels);
    }
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    // Channel sum inherits dimensions from input
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey);
    const isComplex = this.isComplexData(inputData);
    
    if (isComplex) {
      return [
        { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
        { name: 'Real', unit: '' },
        { name: 'Imaginary', unit: '' }
      ];
    } else {
      return [
        { name: 'Index', unit: '' },
        { name: 'Amplitude', unit: '' }
      ];
    }
  }

  private updateRealResult(
    inputData: Float32Array[],
    result: Float32Array[],
    settings: ChannelSumSettings,
    numInputChannels: number
  ): void {
    // Clear result
    for (const chData of result) {
      chData.fill(0);
    }

    // Sum/subtract channels
    for (let i = 0; i < settings.channelSums.length; i++) {
      const sourceIndices = settings.channelSums[i];
      const targetChannel = result[i];
      
      for (const signedIndex of sourceIndices) {
        const isNegative = signedIndex < 0;
        // Get absolute index modulus number of channels
        const absIndex = Math.abs(signedIndex) % numInputChannels;
        const sourceChannel = inputData[absIndex];
        
        if (sourceChannel) {
          for (let j = 0; j < targetChannel.length; j++) {
            if (isNegative) {
              targetChannel[j] -= sourceChannel[j];
            } else {
              targetChannel[j] += sourceChannel[j];
            }
          }
        }
      }
    }
  }

  private updateComplexResult(
    inputData: ComplexSpectrum[],
    result: ComplexSpectrum[],
    settings: ChannelSumSettings,
    numInputChannels: number
  ): void {
    // Clear result
    for (const chData of result) {
      chData.re.fill(0);
      chData.im.fill(0);
    }

    // Sum/subtract channels
    for (let i = 0; i < settings.channelSums.length; i++) {
      const sourceIndices = settings.channelSums[i];
      const targetChannel = result[i];
      
      for (const signedIndex of sourceIndices) {
        const isNegative = signedIndex < 0;
        // Get absolute index modulus number of channels
        const absIndex = Math.abs(signedIndex) % numInputChannels;
        const sourceChannel = inputData[absIndex];
        
        if (sourceChannel) {
          for (let j = 0; j < targetChannel.re.length; j++) {
            if (isNegative) {
              targetChannel.re[j] -= sourceChannel.re[j];
              targetChannel.im[j] -= sourceChannel.im[j];
            } else {
              targetChannel.re[j] += sourceChannel.re[j];
              targetChannel.im[j] += sourceChannel.im[j];
            }
          }
        }
      }
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// EXPAND Calculation Type
// Expands complex spectrum data by interpolating zeros between samples
// This is used to unroll impulse responses for finer time resolution
export class EXPANDCalculation implements CalculationType<ExpandSettings, ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'EXPAND';
  name = 'Spectrum Expand';
  description = 'Expands complex spectrum by inserting interpolated values between samples';

  constructor() {}

  initSettings(key: string, ctx: CalculationContext): ExpandSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as ExpandSettings;
    }
    return {
      expandFactor: 4
    };
  }

  initResult(key: string, ctx: CalculationContext): ComplexSpectrum[] {
    const settings = ctx.calculationSettings.get(key) as ExpandSettings;
    const expandFactor = settings?.expandFactor || 4;
    
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    // Use actual input length (may differ from nc if input is from INPUTN/EXPAND)
    const inputLength = inputData[0]?.re?.length || ctx.settings.nc;
    const expandedLength = inputLength * expandFactor;
    
    return Array.from({ length: channelCount }, () => ({
      re: new Float32Array(expandedLength),
      im: new Float32Array(expandedLength)
    }));
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const result = ctx.calculationResults.get(key) as ComplexSpectrum[];
    const settings = ctx.calculationSettings.get(key) as ExpandSettings;
    
    if (!settings) return;
    
    const expandFactor = settings.expandFactor || 4;
    
    // Process each channel
    for (let ch = 0; ch < inputData.length; ch++) {
      const input = inputData[ch];
      const output = result[ch];
      const inputLength = input.re.length;
      
      // Step 1: Place original samples at expanded positions with zeros in between
      output.re.fill(0);
      output.im.fill(0);
      
      for (let i = 0; i < inputLength; i++) {
        output.re[i * expandFactor] = input.re[i];
        output.im[i * expandFactor] = input.im[i];
      }
      
      // Step 2: Interpolate zero values based on neighboring samples
      this.interpolateZeros(output.re, expandFactor);
      this.interpolateZeros(output.im, expandFactor);
    }
  }

  private interpolateZeros(data: Float32Array, expandFactor: number): void {
    const originalLength = data.length / expandFactor;
    
    // Linear interpolation between original sample positions
    for (let i = 0; i < originalLength - 1; i++) {
      const startIdx = i * expandFactor;
      const endIdx = (i + 1) * expandFactor;
      const startVal = data[startIdx];
      const endVal = data[endIdx];
      
      // Interpolate values between startIdx and endIdx
      for (let j = 1; j < expandFactor; j++) {
        const t = j / expandFactor;
        data[startIdx + j] = startVal * (1 - t) + endVal * t;
      }
    }
    
    // Handle the last segment (wrap around for circular FFT data)
    const lastStartIdx = (originalLength - 1) * expandFactor;
    const startVal = data[lastStartIdx];
    const endVal = data[0]; // Wrap to beginning
    
    for (let j = 1; j < expandFactor; j++) {
      const idx = lastStartIdx + j;
      if (idx < data.length) {
        const t = j / expandFactor;
        data[idx] = startVal * (1 - t) + endVal * t;
      }
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }

  getSettingsUI(): Type<any> {
    return ExpandSettingsComponent;
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    const settings = ctx.calculationSettings.get(key) as ExpandSettings;
    const expandFactor = settings?.expandFactor || 4;
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Real', unit: '' },
      { name: 'Imaginary', unit: '' }
    ];
  }
}

// COMPACT Calculation Type
// Compacts complex spectrum data by keeping every nth sample (opposite of EXPAND)
export class COMPACTCalculation implements CalculationType<CompactSettings, ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'COMPACT';
  name = 'Spectrum Compact';
  description = 'Compacts complex spectrum by keeping every nth sample (opposite of expand)';

  constructor() {}

  initSettings(key: string, ctx: CalculationContext): CompactSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as CompactSettings;
    }
    return {
      compactFactor: 2,
      compactOffset: 0,
      channelOffsetMode: 'per_channel',
    };
  }

  initResult(key: string, ctx: CalculationContext): ComplexSpectrum[] {
    const settings = ctx.calculationSettings.get(key) as CompactSettings;
    const compactFactor = settings?.compactFactor || 2;
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = this.getOutputChannelCount(inputData.length, settings);
    
    return Array.from({ length: channelCount }, (_, channelIndex) => {
      const inputChannelIndex = this.getInputChannelIndex(inputData.length, settings, channelIndex);
      const inputLength = inputData[inputChannelIndex]?.re?.length || ctx.settings.nc;
      const compactedLength = this.getCompactedLength(
        inputLength,
        compactFactor,
        this.getCompactOffset(settings, channelIndex, inputData.length),
      );
      return {
        re: new Float32Array(compactedLength),
        im: new Float32Array(compactedLength),
      };
    });
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const result = ctx.calculationResults.get(key) as ComplexSpectrum[];
    const settings = ctx.calculationSettings.get(key) as CompactSettings;
    
    if (!settings) return;
    
    const compactFactor = settings.compactFactor || 2;
    const channelCount = this.getOutputChannelCount(inputData.length, settings);

    if (result.length !== channelCount) {
      const resultArray = ctx.calculationResults.get(key) as ComplexSpectrum[];
      resultArray.length = 0;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        const inputChannelIndex = this.getInputChannelIndex(inputData.length, settings, channelIndex);
        const input = inputData[inputChannelIndex];
        const expectedLength = this.getCompactedLength(
          input.re.length,
          compactFactor,
          this.getCompactOffset(settings, channelIndex, inputData.length),
        );
        resultArray.push({
          re: new Float32Array(expectedLength),
          im: new Float32Array(expectedLength),
        });
      }
    }
    
    // Process each channel
    for (let ch = 0; ch < channelCount; ch++) {
      const inputChannelIndex = this.getInputChannelIndex(inputData.length, settings, ch);
      const input = inputData[inputChannelIndex];
      const output = result[ch];
      const compactOffset = this.getCompactOffset(settings, ch, inputData.length);
      
      // Resize output if needed (settings may have changed)
      const expectedLength = this.getCompactedLength(input.re.length, compactFactor, compactOffset);
      if (output.re.length !== expectedLength) {
        const resultArray = ctx.calculationResults.get(key) as ComplexSpectrum[];
        resultArray[ch] = {
          re: new Float32Array(expectedLength),
          im: new Float32Array(expectedLength)
        };
      }
      
      const finalOutput = (ctx.calculationResults.get(key) as ComplexSpectrum[])[ch];
      
      // Keep every nth sample, starting with the configured offset.
      for (let i = 0; i < finalOutput.re.length; i++) {
        const srcIdx = compactOffset + i * compactFactor;
        finalOutput.re[i] = input.re[srcIdx];
        finalOutput.im[i] = input.im[srcIdx];
      }
    }
  }

  private getOutputChannelCount(inputChannelCount: number, settings: CompactSettings | undefined): number {
    const offsetCount = settings?.channelOffsets?.length ?? 0;
    if (this.getChannelOffsetMode(settings) === 'cross_product' && offsetCount > 0) {
      return Math.max(settings?.outputChannelCount ?? (inputChannelCount * offsetCount), 1);
    }

    return Math.max(
      inputChannelCount,
      settings?.outputChannelCount ?? 0,
      offsetCount,
      1,
    );
  }

  private getInputChannelIndex(
    inputChannelCount: number,
    settings: CompactSettings | undefined,
    outputChannelIndex: number,
  ): number {
    if (inputChannelCount <= 0) {
      return 0;
    }

    const offsetCount = settings?.channelOffsets?.length ?? 0;
    if (this.getChannelOffsetMode(settings) === 'cross_product' && offsetCount > 0) {
      const matrixSize = inputChannelCount * offsetCount;
      const normalizedIndex = matrixSize > 0 ? outputChannelIndex % matrixSize : 0;
      return Math.floor(normalizedIndex / offsetCount) % inputChannelCount;
    }

    return outputChannelIndex % inputChannelCount;
  }

  private getCompactOffset(
    settings: CompactSettings | undefined,
    outputChannelIndex: number,
    inputChannelCount: number,
  ): number {
    if (settings?.channelOffsets && settings.channelOffsets.length > 0) {
      const offsetCount = settings.channelOffsets.length;
      const offsetIndex = this.getChannelOffsetMode(settings) === 'cross_product' && inputChannelCount > 0
        ? outputChannelIndex % offsetCount
        : outputChannelIndex % offsetCount;
      const offset = settings.channelOffsets[offsetIndex];
      return Number.isInteger(offset) && offset >= 0 ? offset : 0;
    }

    return Number.isInteger(settings?.compactOffset) && (settings?.compactOffset ?? 0) >= 0
      ? settings!.compactOffset!
      : 0;
  }

  private getChannelOffsetMode(settings: CompactSettings | undefined): 'per_channel' | 'cross_product' {
    return settings?.channelOffsetMode === 'cross_product' ? 'cross_product' : 'per_channel';
  }

  private getCompactedLength(inputLength: number, compactFactor: number, compactOffset: number): number {
    if (compactOffset >= inputLength) {
      return 0;
    }

    return Math.floor((inputLength - 1 - compactOffset) / compactFactor) + 1;
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }

  getSettingsUI(): Type<any> {
    return CompactSettingsComponent;
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Real', unit: '' },
      { name: 'Imaginary', unit: '' }
    ];
  }
}

// INPUTN Calculation Type
// Reads from shared recording buffer with configurable length multiplier
// Unlike other calculations, this has no input dependencies - it reads directly from circular buffer
export class INPUTNCalculation implements CalculationType<InputNSettings, Float32Array[]> {
  id: COMPUTATION_TYPE_ID = 'INPUTN';
  name = 'Extended Input Buffer';
  description = 'Reads extended recording buffer (n times the standard nc length)';

  constructor() {}

  initSettings(key: string, ctx: CalculationContext): InputNSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as InputNSettings;
    }
    return {
      n: 1
    };
  }

  initResult(key: string, ctx: CalculationContext): Float32Array[] {
    const settings = ctx.calculationSettings.get(key) as InputNSettings;
    const n = settings?.n || 1;
    const nc = ctx.settings.nc;
    const extendedLength = nc * n;
    const channelCount = ctx.channelCount;
    return Array.from({ length: channelCount }, () => new Float32Array(extendedLength));
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const settings = ctx.calculationSettings.get(key) as InputNSettings;
    const n = settings?.n || 1;
    const nc = ctx.settings.nc;
    const n_y = ctx.settings.n_y;
    const extendedLength = nc * n;
    const circularBufferLength = nc * n_y;  // Total length of circular buffer
    const result = ctx.calculationResults.get(key) as Float32Array[];
    
    // Resize result arrays if settings changed
    if (result[0]?.length !== extendedLength) {
      const newResult = Array.from({ length: ctx.channelCount }, () => new Float32Array(extendedLength));
      ctx.calculationResults.set(key, newResult);
    }
    
    const finalResult = ctx.calculationResults.get(key) as Float32Array[];
    
    // Apply currentPositionOffset - subtract to look backward in time (future doesn't exist)
    const offset = ctx.currentPositionOffset;
    const offsetSamples = Math.round(offset * nc);
    const currentPos = ctx.currentPosition;
    
    // Read extended data from circular buffer
    // For n > 1, we read more "historic" samples preceding the current position
    // The newest samples are at the end of result, older samples at the beginning
    for (let ch = 0; ch < ctx.channelCount; ch++) {
      const channel = ctx.getCircularBufferChannel?.(ch);
      if (!channel) continue;
      
      for (let i = 0; i < extendedLength; i++) {
        // i=0 is the oldest sample, i=extendedLength-1 is the newest
        // currentPosition points to the next unwritten slot, so the newest valid
        // sample is currentPos - 1. Read extendedLength historic samples ending there.
        let srcIdx = (currentPos - offsetSamples - extendedLength + i) % circularBufferLength;
        // Handle negative modulo
        if (srcIdx < 0) srcIdx += circularBufferLength;
        
        finalResult[ch][i] = channel[srcIdx];
      }
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    // INPUTN has no dependencies - it reads from circular buffer directly
    return ctx.getDependencies?.(key) || [];
  }

  getSettingsUI(): Type<any> {
    return InputNSettingsComponent;
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    const settings = ctx.calculationSettings.get(key) as InputNSettings;
    const n = settings?.n || 1;
    const duration = (ctx.settings.nc * n) / ctx.settings.sampleRate;
    return [
      { name: 'Time', unit: 's', ranage: [0, duration] },
      { name: 'Amplitude', unit: '' }
    ];
  }
}

// ---------------------------------------------------------------------------
// 1/3-octave band helpers used by NOISEFLOOR and DIVIDE (Wiener mode)
// ---------------------------------------------------------------------------

/** Standard 1/3-octave center frequencies from 20 Hz to 20 kHz */
const THIRD_OCTAVE_CENTERS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
  630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
  10000, 12500, 16000, 20000
];

/** Get 1/3-octave band edges for a center frequency */
function thirdOctaveBandEdges(fc: number): [number, number] {
  const factor = Math.pow(2, 1 / 6);
  return [fc / factor, fc * factor];
}

/**
 * Assign DFT bin indices to 1/3-octave bands.
 * Returns an array of bands, each containing the bin indices that fall within it.
 */
function assignBinsToThirdOctaveBands(
  binCount: number,
  sampleRate: number,
  dftLength: number
): { centerFreq: number; binIndices: number[] }[] {
  const bands: { centerFreq: number; binIndices: number[] }[] = [];
  const binFreqResolution = sampleRate / dftLength;

  for (const fc of THIRD_OCTAVE_CENTERS) {
    const [fLow, fHigh] = thirdOctaveBandEdges(fc);
    const kLow = Math.max(1, Math.ceil(fLow / binFreqResolution));
    const kHigh = Math.min(binCount - 1, Math.floor(fHigh / binFreqResolution));
    const indices: number[] = [];
    for (let k = kLow; k <= kHigh; k++) {
      indices.push(k);
    }
    if (indices.length > 0) {
      bands.push({ centerFreq: fc, binIndices: indices });
    }
  }
  return bands;
}

/**
 * Log-frequency linear interpolation of band values to per-bin values.
 * bandCenters and bandValues are parallel arrays of band center frequencies and values (in log domain).
 * Returns value at frequency f using log-log interpolation; clamps to edge values outside range.
 */
function logFreqInterpolate(
  f: number,
  bandCenters: number[],
  bandLogValues: number[]
): number {
  if (bandCenters.length === 0) return 0;
  if (bandCenters.length === 1) return bandLogValues[0];
  const logF = Math.log(f);
  // Clamp below first band
  if (logF <= Math.log(bandCenters[0])) return bandLogValues[0];
  // Clamp above last band
  if (logF >= Math.log(bandCenters[bandCenters.length - 1])) return bandLogValues[bandLogValues.length - 1];
  // Find enclosing bands
  for (let i = 0; i < bandCenters.length - 1; i++) {
    const logA = Math.log(bandCenters[i]);
    const logB = Math.log(bandCenters[i + 1]);
    if (logF >= logA && logF <= logB) {
      const t = (logF - logA) / (logB - logA);
      return bandLogValues[i] * (1 - t) + bandLogValues[i + 1] * t;
    }
  }
  return bandLogValues[bandLogValues.length - 1];
}

// ---------------------------------------------------------------------------
// NOISEFLOOR Calculation Type
// Estimates a smooth noise floor from the off-bins of a multi-cycle FFT.
// Input: ComplexSpectrum[] (MN-point FFT from multi-cycle recording)
// Output: ComplexSpectrum[] (N-point, re = noise amplitude, im = 0)
// ---------------------------------------------------------------------------
export class NOISEFLOORCalculation implements CalculationType<NoisefloorSettings, ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'NOISEFLOOR';
  name = 'Noise Floor Estimation';
  description = 'Estimates noise floor from off-bins of multi-cycle FFT recording';

  constructor() {}

  initSettings(key: string, ctx: CalculationContext): NoisefloorSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) return existing as NoisefloorSettings;
    return { compactFactor: 2 };
  }

  initResult(key: string, ctx: CalculationContext): ComplexSpectrum[] {
    const settings = ctx.calculationSettings.get(key) as NoisefloorSettings;
    const compactFactor = settings?.compactFactor || 2;
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    const inputLength = inputData[0]?.re?.length || ctx.settings.nc;
    const compactedLength = Math.floor(inputLength / compactFactor);

    return Array.from({ length: channelCount }, () => ({
      re: new Float32Array(compactedLength),
      im: new Float32Array(compactedLength)
    }));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Noise Amplitude', unit: '' }
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const settings = ctx.calculationSettings.get(key) as NoisefloorSettings;
    const result = ctx.calculationResults.get(key) as ComplexSpectrum[];

    if (!settings) return;
    const M = settings.compactFactor || 2;

    for (let ch = 0; ch < inputData.length; ch++) {
      const input = inputData[ch];
      const MN = input.re.length;
      const N = Math.floor(MN / M);
      const sampleRate = ctx.settings.sampleRate;

      // Resize output if needed
      if (result[ch].re.length !== N) {
        result[ch] = { re: new Float32Array(N), im: new Float32Array(N) };
        (ctx.calculationResults.get(key) as ComplexSpectrum[])[ch] = result[ch];
      }

      // Step 1: Compute off-bin powers |Y_M[k]|^2 for k % M != 0
      // Assign to 1/3-octave bands based on their frequency in the MN-point DFT
      const bands = assignBinsToThirdOctaveBands(MN / 2 + 1, sampleRate, MN);

      // Collect off-bin powers per band
      const bandOffBinPowers: number[][] = bands.map(() => []);

      for (let b = 0; b < bands.length; b++) {
        for (const k of bands[b].binIndices) {
          if (k % M !== 0) {
            const re = input.re[k];
            const im = input.im[k];
            bandOffBinPowers[b].push(re * re + im * im);
          }
        }
      }

      // Step 2: Corrected median per band, merge small bands upward
      const MIN_BINS = 3;
      const bandCenters: number[] = [];
      const bandLogNoisePower: number[] = [];

      for (let b = 0; b < bands.length; b++) {
        let powers = bandOffBinPowers[b];

        // Merge upward if too few off-bins
        if (powers.length < MIN_BINS && b + 1 < bands.length) {
          bandOffBinPowers[b + 1] = powers.concat(bandOffBinPowers[b + 1]);
          continue;
        }

        if (powers.length === 0) continue;

        // Sort for median
        powers.sort((a, c) => a - c);
        const medianIdx = Math.floor(powers.length / 2);
        const medianPower = powers.length % 2 === 1
          ? powers[medianIdx]
          : (powers[medianIdx - 1] + powers[medianIdx]) / 2;

        // Correct for exponential distribution: mean = median / ln(2)
        const correctedPower = medianPower / Math.LN2;

        bandCenters.push(bands[b].centerFreq);
        // Store log power for interpolation; clamp to avoid log(0)
        bandLogNoisePower.push(Math.log(Math.max(correctedPower, 1e-30)));
      }

      // Step 3: Interpolate to each compacted signal bin
      const output = result[ch];
      output.im.fill(0);

      // DC bin: set to edge noise value
      output.re[0] = 0; // DC noise is typically not useful

      for (let m = 1; m < N; m++) {
        const freq = m * sampleRate / N; // signal bin frequency (compacted grid)
        if (bandCenters.length > 0 && freq > 0) {
          const logPower = logFreqInterpolate(freq, bandCenters, bandLogNoisePower);
          output.re[m] = Math.sqrt(Math.exp(logPower));
        } else {
          output.re[m] = 0;
        }
      }
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

export interface ZCHarmonicMatchSettings {
  root: number;
  orders: number[];
}

export class ZCHARMONICMATCHCalculation implements CalculationType<ZCHarmonicMatchSettings, ComplexSpectrum[]> {
  id: COMPUTATION_TYPE_ID = 'ZC_HARMONIC_MATCH';
  name = 'Zadoff-Chu Harmonic Match';
  description = 'Extracts matched-filter harmonic transfer functions for a Zadoff-Chu stimulus';

  private readonly referenceCache = new Map<string, ComplexSpectrum>();

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): ZCHarmonicMatchSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as ZCHarmonicMatchSettings;
    }

    return { root: 1, orders: [1, 2, 3] };
  }

  initResult(key: string, ctx: CalculationContext): ComplexSpectrum[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const settings = ctx.calculationSettings.get(key) as ZCHarmonicMatchSettings;
    const orders = this.normalizeOrders(settings?.orders);
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    const channelCount = Math.max(1, inputData.length * orders.length);

    const result = Array.from({ length: channelCount }, () => ({
      re: new Float32Array(dataLength),
      im: new Float32Array(dataLength),
    }));

    return writeChannelLabels(result, this.buildChannelLabels(inputData.length, orders));
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Frequency', unit: 'Hz', ranage: [0, ctx.settings.sampleRate / 2] },
      { name: 'Real', unit: '' },
      { name: 'Imaginary', unit: '' },
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const settings = ctx.calculationSettings.get(key) as ZCHarmonicMatchSettings;
    const orders = this.normalizeOrders(settings?.orders);
    const root = Number.isInteger(settings?.root) && (settings?.root ?? 0) > 0 ? settings.root : 1;
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    const liveCycleShift = dataLength > 0
      ? ((ctx.currentPosition % dataLength) + dataLength) % dataLength
      : 0;
    const result = ctx.calculationResults.get(key) as ComplexSpectrum[];
    const expectedChannelCount = Math.max(1, inputData.length * orders.length);

    if (result.length !== expectedChannelCount) {
      const resultArray = ctx.calculationResults.get(key) as ComplexSpectrum[];
      resultArray.length = 0;
      for (let channelIndex = 0; channelIndex < expectedChannelCount; channelIndex += 1) {
        resultArray.push({
          re: new Float32Array(dataLength),
          im: new Float32Array(dataLength),
        });
      }
    }

    let outputChannelIndex = 0;
    for (let inputChannelIndex = 0; inputChannelIndex < inputData.length; inputChannelIndex += 1) {
      const measuredSpectrum = inputData[inputChannelIndex];
      for (const order of orders) {
        const matchedSpectrum = this.getMatchedSpectrum(dataLength, root, order, liveCycleShift);
        const divided = this.wasm.complexDivide(measuredSpectrum, matchedSpectrum);
        const outputChannel = (ctx.calculationResults.get(key) as ComplexSpectrum[])[outputChannelIndex];

        if (outputChannel.re.length !== divided.re.length) {
          (ctx.calculationResults.get(key) as ComplexSpectrum[])[outputChannelIndex] = {
            re: new Float32Array(divided.re.length),
            im: new Float32Array(divided.im.length),
          };
        }

        const finalOutput = (ctx.calculationResults.get(key) as ComplexSpectrum[])[outputChannelIndex];
        finalOutput.re.set(divided.re);
        finalOutput.im.set(divided.im);
        outputChannelIndex += 1;
      }
    }

    writeChannelLabels(result, this.buildChannelLabels(inputData.length, orders));
  }

  private getMatchedSpectrum(length: number, root: number, order: number, shiftSamples: number): ComplexSpectrum {
    const baseSpectrum = this.getBaseMatchedSpectrum(length, root, order);
    if (shiftSamples === 0) {
      return baseSpectrum;
    }

    return this.shiftSpectrum(baseSpectrum, shiftSamples);
  }

  private getBaseMatchedSpectrum(length: number, root: number, order: number): ComplexSpectrum {
    const cacheKey = `${length}:${root}:${order}`;
    const cached = this.referenceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const harmonicSignal = this.wasm.generateZadoffChu(length, root * order);
    const fftContext = this.wasm.createFFTContext(length);
    const spectrum = this.wasm.fft(fftContext, harmonicSignal);
    this.referenceCache.set(cacheKey, spectrum);
    return spectrum;
  }

  private shiftSpectrum(spectrum: ComplexSpectrum, shiftSamples: number): ComplexSpectrum {
    const length = spectrum.re.length;
    if (length === 0) {
      return spectrum;
    }

    const normalizedShift = ((shiftSamples % length) + length) % length;
    if (normalizedShift === 0) {
      return spectrum;
    }

    const shifted = {
      re: new Float32Array(length),
      im: new Float32Array(length),
    };
    const phaseScale = (2 * Math.PI * normalizedShift) / length;

    // Match the same live cycle-phase alignment used for x_c in the worker.
    for (let bin = 0; bin < length; bin += 1) {
      const phase = phaseScale * bin;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      const real = spectrum.re[bin];
      const imag = spectrum.im[bin];
      shifted.re[bin] = real * cosPhase - imag * sinPhase;
      shifted.im[bin] = real * sinPhase + imag * cosPhase;
    }

    return shifted;
  }

  private normalizeOrders(orders: number[] | undefined): number[] {
    const normalized = Array.from(new Set((orders ?? [1, 2, 3]).filter((order) => Number.isInteger(order) && order > 0)));
    return normalized.length > 0 ? normalized : [1, 2, 3];
  }

  private buildChannelLabels(inputChannelCount: number, orders: number[]): string[] {
    const labels: string[] = [];
    for (let inputChannelIndex = 0; inputChannelIndex < inputChannelCount; inputChannelIndex += 1) {
      for (const order of orders) {
        labels.push(inputChannelCount === 1 ? `H${order}` : `Ch ${inputChannelIndex + 1} · H${order}`);
      }
    }
    return labels;
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

interface HarmonicLevelSummaryResult extends OctaveFilterResult {
  labels?: string[];
}

interface HarmonicChannelGrouping {
  groupLabels: string[];
  categoryLabels: string[];
  indicesByGroup: number[][];
}

export class HARMONICLEVELSCalculation implements CalculationType<void, HarmonicLevelSummaryResult[]> {
  id: COMPUTATION_TYPE_ID = 'HARMONIC_LEVELS';
  name = 'Harmonic Levels';
  description = 'Summarizes peak impulse level for each harmonic channel';

  initSettings(key: string, ctx: CalculationContext): void {}

  initResult(key: string, ctx: CalculationContext): HarmonicLevelSummaryResult[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as Float32Array[];
    const grouping = this.buildGrouping(this.getChannelLabels(inputData));
    return writeChannelLabels(
      grouping.indicesByGroup.map(() => this.createSummaryResult(grouping.categoryLabels)),
      grouping.groupLabels,
    );
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as Float32Array[];
    const grouping = this.buildGrouping(this.getChannelLabels(inputData));
    const result = ctx.calculationResults.get(key) as HarmonicLevelSummaryResult[];

    if (result.length !== grouping.indicesByGroup.length) {
      result.length = 0;
      grouping.indicesByGroup.forEach(() => {
        result.push(this.createSummaryResult(grouping.categoryLabels));
      });
    }

    for (let groupIndex = 0; groupIndex < grouping.indicesByGroup.length; groupIndex += 1) {
      const harmonicIndices = grouping.indicesByGroup[groupIndex];
      if (result[groupIndex].rmsValues.length !== harmonicIndices.length) {
        result[groupIndex] = this.createSummaryResult(grouping.categoryLabels);
      }

      const summary = result[groupIndex];
      summary.labels = [...grouping.categoryLabels];
      summary.frequencies = grouping.categoryLabels.map((_, index) => index + 1);
      summary.mode = 'full';

      for (let harmonicIndex = 0; harmonicIndex < harmonicIndices.length; harmonicIndex += 1) {
        const inputChannelIndex = harmonicIndices[harmonicIndex];
        const channel = inputData[inputChannelIndex];
        let peak = 0;
        for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
          peak = Math.max(peak, Math.abs(channel[sampleIndex]));
        }
        summary.rmsValues[harmonicIndex] = peak;
      }
    }

    writeChannelLabels(result, grouping.groupLabels);
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Harmonic', unit: '' },
      { name: 'Peak Level', unit: '' },
    ];
  }

  private createSummaryResult(labels: string[]): HarmonicLevelSummaryResult {
    return {
      frequencies: labels.map((_, index) => index + 1),
      rmsValues: new Float32Array(labels.length),
      mode: 'full',
      labels: [...labels],
    };
  }

  private getChannelLabels(inputData: Float32Array[]): string[] {
    return readChannelLabels(inputData) ?? inputData.map((_, index) => `H${index + 1}`);
  }

  private buildGrouping(labels: string[]): HarmonicChannelGrouping {
    const parsed = labels.map((label, index) => {
      const match = label.match(/^(.*?)(?:\s*·\s*)?(H\d+)$/);
      if (!match) {
        return {
          index,
          groupLabel: labels.length === 1 ? 'Summary' : `Series ${index + 1}`,
          harmonicLabel: label,
        };
      }

      const rawGroupLabel = match[1].trim();
      return {
        index,
        groupLabel: rawGroupLabel || 'Summary',
        harmonicLabel: match[2],
      };
    });

    const categoryLabels = Array.from(new Set(parsed.map((entry) => entry.harmonicLabel)));
    const groupLabels = Array.from(new Set(parsed.map((entry) => entry.groupLabel)));
    const indicesByGroup = groupLabels.map((groupLabel) =>
      categoryLabels.map((harmonicLabel) => {
        const match = parsed.find((entry) => entry.groupLabel === groupLabel && entry.harmonicLabel === harmonicLabel);
        return match?.index;
      }).filter((index): index is number => index !== undefined)
    );

    return {
      groupLabels,
      categoryLabels,
      indicesByGroup,
    };
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// Factory function to create all calculation types
export function createCalculationTypes(wasm: WasmService): CalculationType<any, any>[] {
  return [
    new FFTCalculation(wasm),
    new IFFTCalculation(wasm),
    new DivideCalculation(wasm),
    new ABSCalculation(wasm),
    new ARGCalculation(wasm),
    new UNWRAP_PHASECalculation(wasm),
    new OCTFILTERRMSCalculation(wasm),
    new RT60Calculation(wasm),
    new RT60OCTCalculation(wasm),
    new BANDPASSCalculation(wasm),
    new ChannelSumCalculation(),
    new EXPANDCalculation(),
    new COMPACTCalculation(),
    new NOISEFLOORCalculation(),
    new INPUTNCalculation(),
    new ZCHARMONICMATCHCalculation(wasm),
    new HARMONICLEVELSCalculation(),
    new POLYREGRESSION_JOINTCalculation(wasm),
    new POLYREGRESSION_MATCHEDCalculation(wasm),
    new TRACECalculation(),
    // Phase analysis
    new GROUP_DELAYCalculation(wasm),
    new PHASE_FROM_GROUP_DELAYCalculation(wasm),
    new PHASE_DELAYCalculation(wasm),
    new MINIMUM_PHASECalculation(wasm),
    new ALIGN_MINIMUM_PHASE_EXCESSCalculation(wasm),
  ];
}

// RT60_OCT Settings
export interface RT60OctSettings {
  mode: 'full' | 'third';  // Octave band mode
  rtMode: 'legacy' | 'full';  // RT60 calculation mode
}

// RT60_OCT Result - contains RT60 results for each octave band plus full bandwidth
export interface RT60OctResult {
  bandResults: (RT60Result | RT60FullResult)[];  // One per octave band
  fullBandwidthResult: RT60Result | RT60FullResult;  // Full bandwidth calculation
  frequencies: number[];  // Center frequencies for each band
  mode: 'full' | 'third';
}

// RT60_OCT Calculation Type
// Estimates RT60 in octave (or third-octave) bands
// Input is complex impulse response - filtering is done in frequency domain
export class RT60OCTCalculation implements CalculationType<RT60OctSettings, RT60OctResult[]> {
  id: COMPUTATION_TYPE_ID = 'RT60_OCT';
  name = 'RT60 per Octave Band';
  description = 'Calculates RT60 for each octave band - multichannel';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): RT60OctSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as RT60OctSettings;
    }
    return { mode: 'full', rtMode: 'full' };
  }

  initResult(key: string, ctx: CalculationContext): RT60OctResult[] {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const channelCount = inputData.length;
    const settings = ctx.calculationSettings.get(key) as RT60OctSettings;
    const dataLength = inputData[0]?.re?.length || ctx.settings.nc;
    
    const frequencies = this.getFrequencies(settings?.mode || 'full');
    const numBands = frequencies.length;
    
    return Array.from({ length: channelCount }, () => ({
      bandResults: Array.from({ length: numBands }, () => this.createEmptyResult(dataLength, settings?.rtMode || 'full')),
      fullBandwidthResult: this.createEmptyResult(dataLength, settings?.rtMode || 'full'),
      frequencies,
      mode: settings?.mode || 'full'
    }));
  }

  private getFrequencies(mode: 'full' | 'third'): number[] {
    if (mode === 'full') {
      return [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    } else {
      return [25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
    }
  }

  private getBandEdges(centerFreq: number, mode: 'full' | 'third'): [number, number] {
    const factor = mode === 'full' ? Math.sqrt(2) : Math.pow(2, 1/6);
    return [centerFreq / factor, centerFreq * factor];
  }

  private createEmptyResult(dataLength: number, rtMode: 'legacy' | 'full'): RT60Result | RT60FullResult {
    if (rtMode === 'full') {
      const emptyMeasurement: DecayMeasurement = {
        value: 0,
        slope: 0,
        intercept: 0,
        correlation: 0,
        startIdx: 0,
        endIdx: 0,
        isReliable: false
      };
      return {
        edt: { ...emptyMeasurement },
        t20: { ...emptyMeasurement },
        t30: { ...emptyMeasurement },
        topt: { ...emptyMeasurement },
        c50: 0,
        c80: 0,
        d50: 0,
        ts: 0,
        curvature: 0,
        decayCurve: new Float32Array(dataLength),
        timeAxis: new Float32Array(dataLength),
        noiseFloor: -60
      };
    } else {
      return {
        rt60: 0,
        decayCurve: new Float32Array(dataLength),
        timeAxis: new Float32Array(dataLength),
        coefficients: new Float32Array(2)
      };
    }
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    const inputKey = deps[0];
    const spectrumChannels = ctx.getVariable(inputKey) as ComplexSpectrum[];
    const settings = ctx.calculationSettings.get(key) as RT60OctSettings;
    const result = ctx.calculationResults.get(key) as RT60OctResult[];
    
    if (!spectrumChannels || spectrumChannels.length === 0) return;
    
    const frequencies = this.getFrequencies(settings.mode);
    const nc = spectrumChannels[0].re.length;
    const sampleRate = ctx.settings.sampleRate;
    
    // Process each channel
    for (let ch = 0; ch < spectrumChannels.length; ch++) {
      const spectrum = spectrumChannels[ch];
      const channelResult = result[ch];
      
      // Update frequencies and mode
      channelResult.frequencies = frequencies;
      channelResult.mode = settings.mode;
      
      // Calculate full bandwidth RT60 first
      const fullBandIR = this.wasm.ifft(this.wasm.createFFTContext(nc), spectrum);
      if (settings.rtMode === 'full') {
        const fullRT60 = this.wasm.calculateRT60Full(fullBandIR, sampleRate);
        Object.assign(channelResult.fullBandwidthResult, fullRT60);
      } else {
        const fullRT60 = this.wasm.calculateRT60(fullBandIR, sampleRate, -5, -35);
        Object.assign(channelResult.fullBandwidthResult, fullRT60);
      }
      
      // Process each octave band
      for (let bandIdx = 0; bandIdx < frequencies.length; bandIdx++) {
        const centerFreq = frequencies[bandIdx];
        const [lowFreq, highFreq] = this.getBandEdges(centerFreq, settings.mode);
        
        // Apply bandpass filter in frequency domain
        const filteredSpectrum = this.wasm.bandpassFilterSmooth(
          spectrum.re,
          spectrum.im,
          sampleRate,
          nc,
          lowFreq,
          highFreq,
          4  // 4th order Butterworth-like
        );
        
        // Convert to time domain
        const bandIR = this.wasm.ifft(this.wasm.createFFTContext(nc), filteredSpectrum);
        
        // Calculate RT60 for this band
        if (settings.rtMode === 'full') {
          const bandRT60 = this.wasm.calculateRT60Full(bandIR, sampleRate);
          channelResult.bandResults[bandIdx] = bandRT60;
        } else {
          const bandRT60 = this.wasm.calculateRT60(bandIR, sampleRate, -5, -35);
          channelResult.bandResults[bandIdx] = bandRT60;
        }
      }
    }
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    const settings = ctx.calculationSettings.get(key) as RT60OctSettings;
    return [
      { name: 'Frequency Band', unit: 'Hz' },
      { name: 'Time', unit: 's' },
      { name: 'Level', unit: 'dB', ranage: [-80, 0] }
    ];
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

// TRACE result structure - stores history of input values
// One TraceResult per channel, so traces is just [traceIndex] -> Float32Array
export interface TraceResult {
  traces: Float32Array[];    // [traceIndex] -> Float32Array of input data for this channel
  inputLength: number;       // Length of each input trace
  currentTraceIndex: number; // Index of most recently written trace (circular)
  nTrace: number;            // Number of traces configured
}

// TRACE Calculation Type
// Keeps a rolling history of its input data
export class TRACECalculation implements CalculationType<TraceSettings, TraceResult[]> {
  id: COMPUTATION_TYPE_ID = 'TRACE';
  name = 'Trace History';
  description = 'Maintains a rolling history of input data for visualization';

  constructor() {}

  initSettings(key: string, ctx: CalculationContext): TraceSettings {
    const existing = ctx.calculationSettings.get(key);
    if (existing) {
      return existing as TraceSettings;
    }
    return {
      nTrace: 50  // Default to 50 traces
    };
  }

  initResult(key: string, ctx: CalculationContext): TraceResult[] {
    const settings = ctx.calculationSettings.get(key) as TraceSettings;
    const nTrace = settings?.nTrace || 50;
    const deps = this.getDependencies(key, ctx);
    
    // Determine input length from first dependency
    let inputLength = ctx.settings.nc;
    if (deps.length > 0) {
      const inputData = ctx.getVariable(deps[0]);
      if (inputData && inputData[0]) {
        if (inputData[0] instanceof Float32Array) {
          inputLength = inputData[0].length;
        } else if (inputData[0].re instanceof Float32Array) {
          inputLength = inputData[0].re.length;  // Complex spectrum
        }
      }
    }
    
    const channelCount = ctx.channelCount;
    const result: TraceResult[] = [];
    
    for (let ch = 0; ch < channelCount; ch++) {
      result.push({
        traces: Array.from({ length: nTrace }, () => new Float32Array(inputLength)),
        inputLength,
        currentTraceIndex: 0,
        nTrace
      });
    }
    
    return result;
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const settings = ctx.calculationSettings.get(key) as TraceSettings;
    const nTrace = settings?.nTrace || 50;
    const deps = this.getDependencies(key, ctx);
    
    if (deps.length === 0) return;
    
    const inputKey = deps[0];
    const inputData = ctx.getVariable(inputKey);
    const result = ctx.calculationResults.get(key) as TraceResult[];
    
    if (!inputData || !result) return;
    
    // Handle both Float32Array and magnitude arrays from complex spectra
    for (let ch = 0; ch < inputData.length; ch++) {
      if (ch >= result.length) continue;
      
      const channelResult = result[ch];
      let inputArray: Float32Array;
      
      // Extract Float32Array from input
      if (inputData[ch] instanceof Float32Array) {
        inputArray = inputData[ch];
      } else {
        // Skip non-Float32Array inputs
        continue;
      }
      
      // Check if input length changed or nTrace changed
      if (inputArray.length !== channelResult.inputLength || nTrace !== channelResult.nTrace) {
        // Reinitialize traces
        channelResult.traces = Array.from({ length: nTrace }, () => new Float32Array(inputArray.length));
        channelResult.inputLength = inputArray.length;
        channelResult.currentTraceIndex = 0;
        channelResult.nTrace = nTrace;
      }
      
      // Add new trace at current index (circular buffer)
      const traceIdx = channelResult.currentTraceIndex;
      channelResult.traces[traceIdx].set(inputArray);
      
      // Advance index
      channelResult.currentTraceIndex = (traceIdx + 1) % nTrace;
    }
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }

  getSettingsUI(): Type<any> {
    return TraceSettingsComponent;
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    const settings = ctx.calculationSettings.get(key) as TraceSettings;
    const nTrace = settings?.nTrace || 50;
    return [
      { name: 'Index', unit: '' },
      { name: 'Trace', unit: '', ranage: [0, nTrace - 1] },
      { name: 'Value', unit: '' }
    ];
  }
}






// =============================================================================
// Polynomial gray-box regression
//
// See theory/CIRCULAR_NONLINEAR_REGRESSION.md §3.4 (joint form) and §3.10
// (matched-filter form). Backed by audio-circlelyzer-lib/src/poly_regression.rs
// via WasmService.polyRegressionJoint / polyRegressionMatched.
// =============================================================================

export type { PolyFitData };

export interface PolyRegressionSettings {
  /** Highest derivative order included as an axis (1=ẏ, 2=ÿ, …) */
  derivatives: number;
  /** Total polynomial degree across all axes */
  degree: number;
}

export interface PolyRegressionMatchedSettings extends PolyRegressionSettings {
  /** Zadoff–Chu root used for the original stimulus (must match upstream ZC source) */
  root: number;
  /** Harmonic orders to fit, one regression per order (must match upstream ZC_HARMONIC_MATCH) */
  orders: number[];
}

/**
 * A multi-channel container for one or more PolyFitData results.
 * - Joint form returns 1 channel.
 * - Matched-filter form returns 1 channel per harmonic order.
 * Channel labels carry the order tag so visualizations stay generic.
 */
export type PolyRegressionResult = PolyFitData[];

/**
 * POLYREGRESSION_JOINT — single regression over the whole spectrum (theory §3.4).
 * Inputs: [Y_c (measured, complex spectrum), U_c (forcing/stimulus, complex spectrum)].
 */
export class POLYREGRESSION_JOINTCalculation
  implements CalculationType<PolyRegressionSettings, PolyRegressionResult>
{
  id: COMPUTATION_TYPE_ID = 'POLYREGRESSION_JOINT';
  name = 'Polynomial Gray-Box Regression (Joint)';
  description = 'Fits a polynomial gray-box ODE in the equation-error sense across all bins';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): PolyRegressionSettings {
    const existing = ctx.calculationSettings.get(key) as PolyRegressionSettings | undefined;
    if (existing) return existing;
    return { derivatives: 2, degree: 3 };
  }

  initResult(key: string, ctx: CalculationContext): PolyRegressionResult {
    return [emptyPolyFit()];
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Monomial', unit: '' },
      { name: 'Coefficient', unit: '' },
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    if (deps.length < 2) return;
    const yChannels = ctx.getVariable(deps[0]) as ComplexSpectrum[];
    const uChannels = ctx.getVariable(deps[1]) as ComplexSpectrum[];
    if (!yChannels?.length || !uChannels?.length) return;
    const settings = (ctx.calculationSettings.get(key) as PolyRegressionSettings | undefined)
      ?? { derivatives: 2, degree: 3 };
    const result = ctx.calculationResults.get(key) as PolyRegressionResult;
    const channelCount = Math.min(yChannels.length, uChannels.length);

    while (result.length < channelCount) result.push(emptyPolyFit());
    if (result.length > channelCount) result.length = channelCount;

    const labels: string[] = [];
    for (let ch = 0; ch < channelCount; ch += 1) {
      const fit = this.wasm.polyRegressionJoint(
        yChannels[ch], uChannels[ch],
        settings.derivatives, settings.degree, ctx.settings.sampleRate,
      );
      result[ch] = fit;
      labels.push(channelCount === 1 ? 'Joint Fit' : `Ch ${ch + 1}`);
    }
    writeChannelLabels(result, labels);
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

/**
 * POLYREGRESSION_MATCHED — per-order matched-filter regression (theory §3.10).
 * Inputs: [Y_c (measured), x_c (Zadoff–Chu stimulus, time-domain)].
 *
 * Internally regenerates the stimulus's harmonic spectra U_p[k] from x_c,
 * combines them with the per-order H_p (settings.orders) measurement, and
 * runs one regression per harmonic.
 */
export class POLYREGRESSION_MATCHEDCalculation
  implements CalculationType<PolyRegressionMatchedSettings, PolyRegressionResult>
{
  id: COMPUTATION_TYPE_ID = 'POLYREGRESSION_MATCHED';
  name = 'Polynomial Gray-Box Regression (Matched Filter)';
  description = 'Per-harmonic polynomial gray-box regression for ZC stimuli';

  constructor(private wasm: WasmService) {}

  initSettings(key: string, ctx: CalculationContext): PolyRegressionMatchedSettings {
    const existing = ctx.calculationSettings.get(key) as PolyRegressionMatchedSettings | undefined;
    if (existing) return existing;
    return { derivatives: 2, degree: 3, root: 1, orders: [1, 2, 3] };
  }

  initResult(key: string, ctx: CalculationContext): PolyRegressionResult {
    const settings = ctx.calculationSettings.get(key) as PolyRegressionMatchedSettings | undefined;
    const orders = normalizePositiveOrders(settings?.orders);
    return orders.map(() => emptyPolyFit());
  }

  getResultDimensions(key: string, ctx: CalculationContext): ResultDimensionInfo[] {
    return [
      { name: 'Monomial', unit: '' },
      { name: 'Coefficient', unit: '' },
    ];
  }

  updateResult(key: string, ctx: CalculationContext): void {
    const deps = this.getDependencies(key, ctx);
    if (deps.length < 2) return;
    const yChannels = ctx.getVariable(deps[0]) as ComplexSpectrum[];
    const xTime = ctx.getVariable(deps[1]) as Float32Array[] | ComplexSpectrum[];
    if (!yChannels?.length || !xTime?.length) return;

    const settings = (ctx.calculationSettings.get(key) as PolyRegressionMatchedSettings | undefined)
      ?? { derivatives: 2, degree: 3, root: 1, orders: [1, 2, 3] };
    const orders = normalizePositiveOrders(settings.orders);
    const pMax = orders[orders.length - 1];

    // Stimulus must be a real time-domain signal (Float32Array per channel).
    const stimulus = xTime[0] instanceof Float32Array
      ? xTime[0]
      : null;
    if (!stimulus) return;

    // Re-pack y for each input channel into per-order regressions.
    // For multi-channel inputs we run per-channel and emit (channel × order) rows.
    const result = ctx.calculationResults.get(key) as PolyRegressionResult;
    const totalRows = yChannels.length * orders.length;
    while (result.length < totalRows) result.push(emptyPolyFit());
    if (result.length > totalRows) result.length = totalRows;

    const labels: string[] = [];
    let row = 0;
    for (let ch = 0; ch < yChannels.length; ch += 1) {
      const y = yChannels[ch];
      const n = y.re.length;
      // Build per-order H_p(k) by complex-dividing y by the matched ZC harmonic
      // (mirrors ZC_HARMONIC_MATCH but inline so we own the byte layout).
      const harmonicsRe = new Float32Array(pMax * n);
      const harmonicsIm = new Float32Array(pMax * n);
      const ctxFFT = this.wasm.createFFTContext(n);
      for (let p = 1; p <= pMax; p += 1) {
        const harmonicSignal = this.wasm.generateZadoffChu(n, settings.root * p);
        const refSpec = this.wasm.fft(ctxFFT, harmonicSignal);
        const divided = this.wasm.complexDivide(y, refSpec);
        const offset = (p - 1) * n;
        harmonicsRe.set(divided.re, offset);
        harmonicsIm.set(divided.im, offset);
      }

      const fits = this.wasm.polyRegressionMatched(
        y, harmonicsRe, harmonicsIm, stimulus,
        pMax, settings.derivatives, settings.degree, ctx.settings.sampleRate,
      );
      // Only take the orders the user asked for.
      for (const order of orders) {
        const fit = fits[order - 1] ?? emptyPolyFit();
        result[row] = fit;
        labels.push(yChannels.length === 1 ? `H${order}` : `Ch ${ch + 1} · H${order}`);
        row += 1;
      }
    }
    writeChannelLabels(result, labels);
  }

  private getDependencies(key: string, ctx: CalculationContext): string[] {
    return ctx.getDependencies?.(key) || [];
  }
}

function normalizePositiveOrders(orders: number[] | undefined): number[] {
  const cleaned = Array.from(new Set((orders ?? [1, 2, 3]).filter((o) => Number.isInteger(o) && o > 0)))
    .sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : [1, 2, 3];
}

function emptyPolyFit(): PolyFitData {
  return {
    coeffs: new Float32Array(),
    stdErrors: new Float32Array(),
    monomialLabels: [],
    monomialPowers: [],
    conditionNumber: 0,
    residualNorm: 0,
    rhsNorm: 0,
    residualRe: new Float32Array(),
    residualIm: new Float32Array(),
    stateTime: [],
    forcingTime: new Float32Array(),
  };
}
