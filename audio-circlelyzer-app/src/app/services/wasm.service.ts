import { Injectable } from '@angular/core';
import { ComplexSpectrum, RT60Result, RT60FullResult, DecayMeasurement, OctaveFilterResult } from '../models/types';
import * as wasm from '../../assets/wasm/audio_circlelyzer_wasm.js';

@Injectable({
  providedIn: 'root'
})
export class WasmService {
  private initialized = false;
  private fftContexts: Map<number, any> = new Map();

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize the WASM module with web target   
      // The default export is the initialization function
      await wasm.default();
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize WASM:', error);
      this.initialized = false;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      console.warn('WASM not initialized - operations will fail');
      throw new Error('WASM not initialized. Call initialize() first.');
    }
  }

  private isReady(): boolean {
    return this.initialized;
  }

  private getFFTContext(size: number): any {
    if (!this.fftContexts.has(size)) {
      this.ensureInitialized();
      this.fftContexts.set(size, new wasm.WasmFFTContext(size));
    }
    return this.fftContexts.get(size)!;
  }

  // Signal generation methods (synchronous versions)
  generatePerfectWhite(len: number, sampleRate: number): Float32Array {
    this.ensureInitialized();
    const result = wasm.generatePerfectWhite(len, sampleRate);
    return new Float32Array(result);
  }

  generatePerfectPink(len: number, sampleRate: number): Float32Array {
    this.ensureInitialized();
    const result = wasm.generatePerfectPink(len, sampleRate);
    return new Float32Array(result);
  }

  generateWhite(len: number): Float32Array {
    this.ensureInitialized();
    const result = wasm.generateWhite(len);
    return new Float32Array(result);
  }

  generatePink(len: number, sampleRate: number): Float32Array {
    this.ensureInitialized();
    const result = wasm.generatePink(len, sampleRate);
    return new Float32Array(result);
  }

  generateZadoffChu(len: number, root: number = 1): Float32Array {
    this.ensureInitialized();
    const result = wasm.generateZadoffChu(len, root);
    return new Float32Array(result);
  }

  generateFrequencyDivisionPerfectWhite(
    len: number,
    sampleRate: number,
    sourceIndex: number,
    sourceCount: number,
  ): Float32Array {
    this.ensureInitialized();
    const result = wasm.generateFrequencyDivisionPerfectWhite(len, sampleRate, sourceIndex, sourceCount);
    return new Float32Array(result);
  }

  // FFT operations
  createFFTContext(size: number): any {
    return this.getFFTContext(size);
  }

  fft(context: any, input: Float32Array): ComplexSpectrum {
    this.ensureInitialized();
    const spectrum = context.fft(input);
    
    return {
      re: spectrum.re,
      im: spectrum.im
    };
  }

  ifft(context: any, spectrum: ComplexSpectrum): Float32Array {
    this.ensureInitialized();
    const wasmSpectrum = new wasm.WasmComplexSpectrum(
      spectrum.re,
      spectrum.im
    );
    const result = context.ifft(wasmSpectrum);
    return new Float32Array(result);
  }

  // Complex operations
  complexDivide(numerator: ComplexSpectrum, denominator: ComplexSpectrum): ComplexSpectrum {
    this.ensureInitialized();
    const result = wasm.complexDivide(
      numerator.re, numerator.im,
      denominator.re, denominator.im
    );
    return {
      re: new Float32Array(result.re),
      im: new Float32Array(result.im)
    };
  }

  complexAbs(spectrum: ComplexSpectrum): Float32Array {
    this.ensureInitialized();
    const result = wasm.complexAbs(spectrum.re, spectrum.im);
    return new Float32Array(result);
  }

  complexArg(spectrum: ComplexSpectrum): Float32Array {
    this.ensureInitialized();
    const result = wasm.complexArg(spectrum.re, spectrum.im);
    return new Float32Array(result);
  }

  phaseUnwrap(phase: Float32Array): Float32Array {
    this.ensureInitialized();
    const result = wasm.phaseUnwrap(phase);
    return new Float32Array(result);
  }

  // Octave filtering
  octaveFilterRMS(
    magnitudeSpectrum: Float32Array,
    sampleRate: number,
    nc: number,
    mode: 'full' | 'third'
  ): OctaveFilterResult {
    this.ensureInitialized();
    const rmsValues = wasm.octaveFilterRms(magnitudeSpectrum, sampleRate, nc, mode);
    
    // Generate frequency array based on mode
    const frequencies = mode === 'full' 
      ? [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      : [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
    
    return {
      frequencies: frequencies.slice(0, rmsValues.length),
      rmsValues: new Float32Array(rmsValues),
      mode
    };
  }

  calculateRT60(
    impulseResponse: Float32Array,
    sampleRate: number,
    startDb: number = -5,
    endDb: number = -35
  ): RT60Result {
    this.ensureInitialized();
    const result = wasm.calculateRT60(impulseResponse, sampleRate, startDb, endDb);
    
    return {
      rt60: result.rt60,
      coefficients: new Float32Array([result.slope, result.intercept]),
      timeAxis: new Float32Array(result.timeAxis),
      decayCurve: new Float32Array(result.decayCurve),
    };
  }

  // RT60 calculation (full ISO 3382)
  calculateRT60Full(
    impulseResponse: Float32Array,
    sampleRate: number
  ): RT60FullResult {
    this.ensureInitialized();
    const result = wasm.calculateRT60Full(impulseResponse, sampleRate);
    
    const convertMeasurement = (m: any): DecayMeasurement => ({
      value: m.value,
      slope: m.slope,
      intercept: m.intercept,
      correlation: m.correlation,
      startIdx: m.startIdx,
      endIdx: m.endIdx,
      isReliable: m.isReliable
    });
    
    return {
      edt: convertMeasurement(result.edt),
      t20: convertMeasurement(result.t20),
      t30: convertMeasurement(result.t30),
      topt: convertMeasurement(result.topt),
      c50: result.c50,
      c80: result.c80,
      d50: result.d50,
      ts: result.ts,
      curvature: result.curvature,
      decayCurve: new Float32Array(result.decayCurve),
      timeAxis: new Float32Array(result.timeAxis),
      noiseFloor: result.noiseFloor
    };
  }

  // Bandpass filter
  bandpassFilter(
    re: Float32Array,
    im: Float32Array,
    sampleRate: number,
    nc: number,
    lowFreq: number | null,
    highFreq: number | null
  ): ComplexSpectrum {
    this.ensureInitialized();
    const result = wasm.bandpassFilter(
      re, im, sampleRate, nc,
      lowFreq !== null ? lowFreq : undefined,
      highFreq !== null ? highFreq : undefined
    );
    return {
      re: new Float32Array(result.re),
      im: new Float32Array(result.im)
    };
  }

  // Bandpass filter with smooth rolloff
  bandpassFilterSmooth(
    re: Float32Array,
    im: Float32Array,
    sampleRate: number,
    nc: number,
    lowFreq: number | null,
    highFreq: number | null,
    order: number
  ): ComplexSpectrum {
    this.ensureInitialized();
    const result = wasm.bandpassFilterSmooth(
      re, im, sampleRate, nc,
      lowFreq !== null ? lowFreq : undefined,
      highFreq !== null ? highFreq : undefined,
      order
    );
    return {
      re: new Float32Array(result.re),
      im: new Float32Array(result.im)
    };
  }

  // Preset YAML parsing with MiniJinja templating
  parsePresetYaml(yamlContent: string): unknown {
    this.ensureInitialized();
    return wasm.parsePresetYaml(yamlContent);
  }

  parsePresetYamlWithTemplating(yamlContent: string, variablesJson: string): unknown {
    this.ensureInitialized();
    return wasm.parsePresetYamlWithTemplating(yamlContent, variablesJson);
  }

  processScriptTemplate(script: string, variablesJson: string): string {
    this.ensureInitialized();
    return wasm.processScriptTemplate(script, variablesJson);
  }

  stripScriptComments(script: string): string {
    this.ensureInitialized();
    return wasm.stripScriptComments(script);
  }

  // ---------------------------------------------------------------------------
  // Phase analysis
  // ---------------------------------------------------------------------------

  /** Compute group delay from a complex spectrum (ramp-DFT method). */
  computeGroupDelay(spectrum: ComplexSpectrum): Float32Array {
    this.ensureInitialized();
    return new Float32Array(wasm.computeGroupDelay(spectrum.re, spectrum.im));
  }

  /** Reconstruct unwrapped phase by integrating group delay. */
  unwrappedPhaseFromGroupDelay(tau_g: Float32Array, spectrum: ComplexSpectrum): Float32Array {
    this.ensureInitialized();
    return new Float32Array(
      wasm.unwrappedPhaseFromGroupDelay(tau_g, spectrum.re, spectrum.im)
    );
  }

  /** Compute phase delay from unwrapped phase. */
  phaseDelayFromUnwrappedPhase(theta: Float32Array): Float32Array {
    this.ensureInitialized();
    return new Float32Array(wasm.phaseDelayFromUnwrappedPhase(theta));
  }

  /** Compute minimum-phase transfer function via cepstral method. */
  computeMinimumPhaseSpectrum(spectrum: ComplexSpectrum, floorDb: number = -120): ComplexSpectrum {
    this.ensureInitialized();
    const result = wasm.computeMinimumPhaseSpectrum(spectrum.re, spectrum.im, floorDb);
    return { re: new Float32Array(result.re), im: new Float32Array(result.im) };
  }

  /** Estimate onset delay via minimum-phase/all-pass decomposition. */
  estimateDelayMinimumPhaseExcess(spectrum: ComplexSpectrum, floorDb: number = -120): number {
    this.ensureInitialized();
    return wasm.estimateDelayMinimumPhaseExcess(spectrum.re, spectrum.im, floorDb);
  }

  /** Apply fractional circular shift to remove a known delay from a spectrum. */
  alignSpectrumFractionalShift(spectrum: ComplexSpectrum, delaySamples: number): ComplexSpectrum {
    this.ensureInitialized();
    const result = wasm.alignSpectrumFractionalShift(spectrum.re, spectrum.im, delaySamples);
    return { re: new Float32Array(result.re), im: new Float32Array(result.im) };
  }

  // ---------------------------------------------------------------------------
  // Polynomial gray-box regression
  //   See audio-circlelyzer-lib/src/poly_regression.rs and theory §3.4 / §3.10.
  // ---------------------------------------------------------------------------

  /** Joint-form (theory §3.4) polynomial regression. */
  polyRegressionJoint(
    y: ComplexSpectrum,
    u: ComplexSpectrum,
    derivatives: number,
    degree: number,
    sampleRate: number,
    weights?: Float32Array,
  ): PolyFitData {
    this.ensureInitialized();
    const n = y.re.length;
    const raw = (wasm as any).polyRegressionJoint(
      y.re, y.im, u.re, u.im, weights, derivatives, degree, n, sampleRate,
    );
    return adaptPolyFitResultJs(raw);
  }

  /** Matched-filter form (theory §3.10) polynomial regression — one fit per harmonic order. */
  polyRegressionMatched(
    y: ComplexSpectrum,
    harmonicsRe: Float32Array,
    harmonicsIm: Float32Array,
    stimulusTime: Float32Array,
    pMax: number,
    derivatives: number,
    degree: number,
    sampleRate: number,
  ): PolyFitData[] {
    this.ensureInitialized();
    const n = y.re.length;
    const upSpec = (wasm as any).polyMatchedFilterSpectra(stimulusTime, pMax);
    const upRe = upSpec.re as Float32Array;
    const upIm = upSpec.im as Float32Array;
    const raw = (wasm as any).polyRegressionMatchedFilter(
      y.re, y.im,
      harmonicsRe, harmonicsIm,
      upRe, upIm,
      pMax, derivatives, degree, n, sampleRate,
    );
    return (raw as any[]).map(adaptPolyFitResultJs);
  }

  /** Evaluate a recovered polynomial curve along one axis with the others fixed. */
  polyEvaluateCurveOnAxis(
    coeffs: Float32Array,
    monomialPowersFlat: Uint32Array,
    nAxes: number,
    targetAxis: number,
    fixed: Float32Array,
    xValues: Float32Array,
  ): Float32Array {
    this.ensureInitialized();
    return new Float32Array((wasm as any).polyEvaluateCurveOnAxis(
      coeffs, monomialPowersFlat, nAxes, targetAxis, fixed, xValues,
    ));
  }
}

// =============================================================================
// Polynomial gray-box regression bindings — see audio-circlelyzer-lib/src/poly_regression.rs
// =============================================================================

export interface PolyFitData {
  /** Recovered coefficient θ_α, one per monomial */
  coeffs: Float32Array;
  /** 1-σ standard error per coefficient */
  stdErrors: Float32Array;
  /** Display label per monomial, e.g. "y", "ydot", "y^2*yddot" */
  monomialLabels: string[];
  /** Powers per monomial, length = nAxes (= derivatives + 1) */
  monomialPowers: number[][];
  conditionNumber: number;
  residualNorm: number;
  rhsNorm: number;
  /** Per-bin complex residual U[k] − Σ θ Φ[k] (length N/2+1) */
  residualRe: Float32Array;
  residualIm: Float32Array;
  /** Time-domain y, ẏ, ÿ … (one row per derivative order) for scatter overlay */
  stateTime: Float32Array[];
  forcingTime: Float32Array;
}

declare module '../../assets/wasm/audio_circlelyzer_wasm.js' {
  // Augment to satisfy TS — actual symbol is provided at runtime.
}

function adaptPolyFitResultJs(raw: any): PolyFitData {
  return {
    coeffs: new Float32Array(raw.coeffs ?? []),
    stdErrors: new Float32Array(raw.std_errors ?? raw.stdErrors ?? []),
    monomialLabels: (raw.monomial_labels ?? raw.monomialLabels ?? []) as string[],
    monomialPowers: (raw.monomial_powers ?? raw.monomialPowers ?? []) as number[][],
    conditionNumber: raw.condition_number ?? raw.conditionNumber ?? 0,
    residualNorm: raw.residual_norm ?? raw.residualNorm ?? 0,
    rhsNorm: raw.rhs_norm ?? raw.rhsNorm ?? 0,
    residualRe: new Float32Array(raw.residual_re ?? raw.residualRe ?? []),
    residualIm: new Float32Array(raw.residual_im ?? raw.residualIm ?? []),
    stateTime: ((raw.state_time ?? raw.stateTime ?? []) as number[][]).map(
      (row) => new Float32Array(row),
    ),
    forcingTime: new Float32Array(raw.forcing_time ?? raw.forcingTime ?? []),
  };
}
