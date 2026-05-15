/// <reference lib="webworker" />

import {
  WorkerMessageType,
  WorkerMessage,
  InitContextMessage,
  UpdateSettingMessage,
  UpdateScriptMessage,
  UpdateVisualizationDynamicSettingsMessage,
  UpdatePositionOffsetMessage,
  SetModeMessage,
  SetActiveContextMessage,
  TransferCanvasMessage,
  ResizeCanvasMessage,
  DestroyContextMessage,
  SetContextTypeMessage,
  WebGPUSupportMessage,
  WebGL2SupportMessage,
  ContextInitializedMessage,
  CalculationCompleteMessage,
  ErrorMessage,
  CanvasRenderedMessage,
  RequestResultSnapshotMessage,
  ResultSnapshotMessage,
  PlotPreferencesPayload,
} from '../models/worker-protocol';
import {
  CalculationContext,
  CalculationContextDefinition,
  COMPUTATION_CONTEXT_ID,
  COMPUTATION_TYPE_ID,
  CONTEXT_KEY,
  ComplexSpectrum,
  RT60Result,
  RT60FullResult,
  DecayMeasurement,
  OctaveFilterResult,
  ZoomPanDynamicSettings,
  VisualizationType
} from '../models/types';
import type { PolyFitData } from '../services/wasm.service';
import { createCalculationTypes } from '../models/calculation-types';
import { createVisualizationTypes } from '../models/visualization-types';
import { applyVisualizationPresentation } from '../models/visualization-types/presentation';
import { ScriptParserService } from '../services/script-parser.service';

// New plot engine imports
import { PlotHandle, PlotData, Plot2DOptions, Plot3DOptions, Plot2DDynamicOptions, Plot3DDynamicOptions, isPlot3DOptions, isPlot2DOptions, isData2D, isData3D, isHeatmapData } from '../plotting/types';
import { RenderingContext, calculatePlotArea, drawTitle } from '../plotting/utils';
import { renderCanvas2D, drawAxes, drawHeatmapLegend } from '../plotting/rendering/canvas-2d/renderer';
import { draw3DLabelsOverlay } from '../plotting/rendering/3d/renderer';
import { renderWebGPU2D } from '../plotting/rendering/webgpu/render-2d';
import { renderWebGPU3D } from '../plotting/rendering/webgpu/render-3d';
import { renderWebGL2_2D } from '../plotting/rendering/webgl2/render-2d';
import { renderWebGL2_3D } from '../plotting/rendering/webgl2/render-3d';
import { cleanupWebGL2Resources } from '../plotting/rendering/webgl2/programs';
import { DEFAULT_THEME } from '../plotting/constants/theme';

// Import WASM module
import * as wasm from '../../assets/wasm/audio_circlelyzer_wasm.js';


// WASM service for worker thread
class WorkerWasmService {
  private initialized = false;
  private fftContexts = new Map<number, any>();
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await wasm.default();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize WASM in worker:', error);
      // Initialize with stub methods so worker can still function
      this.initialized = true;
    }
  }
  
  private getFFTContext(size: number): any {
    if (!this.fftContexts.has(size)) {
      this.fftContexts.set(size, new wasm.WasmFFTContext(size));
    }
    return this.fftContexts.get(size)!;
  }
  
  createFFTContext(size: number): any {
    return this.getFFTContext(size);
  }
  
  fft(contextOrInput: any | Float32Array, input?: Float32Array): ComplexSpectrum {
    // Support both interfaces: fft(input) and fft(context, input)
    const actualInput = input !== undefined ? input : contextOrInput;
    const context = input !== undefined ? contextOrInput : this.getFFTContext(actualInput.length);
    const spectrum = context.fft(actualInput);
    return {
      re: spectrum.re,
      im: spectrum.im
    };
  }
  
  ifft(contextOrSpectrum: any | ComplexSpectrum, spectrum?: ComplexSpectrum): Float32Array {
    // Support both interfaces: ifft(spectrum) and ifft(context, spectrum)
    const actualSpectrum = spectrum !== undefined ? spectrum : contextOrSpectrum;
    const context = spectrum !== undefined ? contextOrSpectrum : this.getFFTContext(actualSpectrum.re.length);
    const wasmSpectrum = new wasm.WasmComplexSpectrum(actualSpectrum.re, actualSpectrum.im);
    return new Float32Array(context.ifft(wasmSpectrum));
  }

  generateZadoffChu(len: number, root: number = 1): Float32Array {
    return new Float32Array(wasm.generateZadoffChu(len, root));
  }

  generateFrequencyDivisionPerfectWhite(
    len: number,
    sampleRate: number,
    sourceIndex: number,
    sourceCount: number,
  ): Float32Array {
    return new Float32Array(
      wasm.generateFrequencyDivisionPerfectWhite(len, sampleRate, sourceIndex, sourceCount),
    );
  }
  
  private complexDivideLengthWarned = false;
  
  complexDivide(numerator: ComplexSpectrum, denominator: ComplexSpectrum): ComplexSpectrum {
    // Handle mismatched lengths by truncating to the shorter length
    const numLen = numerator.re.length;
    const denLen = denominator.re.length;
    if (numLen !== denLen) {
      const minLen = Math.min(numLen, denLen);
      if (!this.complexDivideLengthWarned) {
        console.warn(`complexDivide: length mismatch (numerator=${numLen}, denominator=${denLen}), truncating to ${minLen}. Further warnings suppressed.`);
        this.complexDivideLengthWarned = true;
      }
      const numRe = numLen > minLen ? numerator.re.subarray(0, minLen) : numerator.re;
      const numIm = numLen > minLen ? numerator.im.subarray(0, minLen) : numerator.im;
      const denRe = denLen > minLen ? denominator.re.subarray(0, minLen) : denominator.re;
      const denIm = denLen > minLen ? denominator.im.subarray(0, minLen) : denominator.im;
      const result = wasm.complexDivide(numRe, numIm, denRe, denIm);
      return { re: result.re, im: result.im };
    }
    const result = wasm.complexDivide(numerator.re, numerator.im, denominator.re, denominator.im);
    return {
      re: result.re,
      im: result.im
    };
  }
  
  complexAbs(spectrum: ComplexSpectrum): Float32Array {
    return new Float32Array(wasm.complexAbs(spectrum.re, spectrum.im));
  }
  
  complexArg(spectrum: ComplexSpectrum): Float32Array {
    return new Float32Array(wasm.complexArg(spectrum.re, spectrum.im));
  }
  
  phaseUnwrap(phase: Float32Array): Float32Array {
    return new Float32Array(wasm.phaseUnwrap(phase));
  }
  
  octaveFilterRMS(
    spectrum: Float32Array,
    sampleRate: number,
    nc: number,
    mode: 'full' | 'third'
  ): OctaveFilterResult {
    const rmsValues = wasm.octaveFilterRms(spectrum, sampleRate, nc, mode);
    const frequencies = mode === 'full' 
      ? [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      : [25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];
    
    return {
      frequencies,
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
    const result = wasm.calculateRT60(impulseResponse, sampleRate, startDb, endDb);
    return {
      rt60: result.rt60,
      decayCurve: new Float32Array(result.decayCurve),
      timeAxis: new Float32Array(result.timeAxis),
      coefficients: new Float32Array([result.slope, result.intercept])
    };
  }

  calculateRT60Full(
    impulseResponse: Float32Array,
    sampleRate: number
  ): RT60FullResult {
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

  bandpassFilter(
    re: Float32Array,
    im: Float32Array,
    sampleRate: number,
    nc: number,
    lowFreq: number | null,
    highFreq: number | null
  ): ComplexSpectrum {
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

  bandpassFilterSmooth(
    re: Float32Array,
    im: Float32Array,
    sampleRate: number,
    nc: number,
    lowFreq: number | null,
    highFreq: number | null,
    order: number
  ): ComplexSpectrum {
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

  computeStft(
    signal: Float32Array,
    sampleRate: number,
    fftSize: number,
    overlap: boolean
  ): STFTResult {
    const result = wasm.computeStft(signal, sampleRate, fftSize, overlap);
    return {
      magnitudesDb: new Float32Array(result.magnitudesDb),
      timeAxis: new Float32Array(result.timeAxis),
      frequencyAxis: new Float32Array(result.frequencyAxis),
      numFrames: result.numFrames,
      numBins: result.numBins
    };
  }

  // ---------------------------------------------------------------------------
  // Phase analysis
  // ---------------------------------------------------------------------------

  computeGroupDelay(spectrum: ComplexSpectrum): Float32Array {
    return new Float32Array(wasm.computeGroupDelay(spectrum.re, spectrum.im));
  }

  unwrappedPhaseFromGroupDelay(tau_g: Float32Array, spectrum: ComplexSpectrum): Float32Array {
    return new Float32Array(
      wasm.unwrappedPhaseFromGroupDelay(tau_g, spectrum.re, spectrum.im)
    );
  }

  phaseDelayFromUnwrappedPhase(theta: Float32Array): Float32Array {
    return new Float32Array(wasm.phaseDelayFromUnwrappedPhase(theta));
  }

  computeMinimumPhaseSpectrum(spectrum: ComplexSpectrum, floorDb: number = -120): ComplexSpectrum {
    const result = wasm.computeMinimumPhaseSpectrum(spectrum.re, spectrum.im, floorDb);
    return { re: new Float32Array(result.re), im: new Float32Array(result.im) };
  }

  estimateDelayMinimumPhaseExcess(spectrum: ComplexSpectrum, floorDb: number = -120): number {
    return wasm.estimateDelayMinimumPhaseExcess(spectrum.re, spectrum.im, floorDb);
  }

  alignSpectrumFractionalShift(spectrum: ComplexSpectrum, delaySamples: number): ComplexSpectrum {
    const result = wasm.alignSpectrumFractionalShift(spectrum.re, spectrum.im, delaySamples);
    return { re: new Float32Array(result.re), im: new Float32Array(result.im) };
  }

  polyRegressionJoint(
    y: ComplexSpectrum,
    u: ComplexSpectrum,
    derivatives: number,
    degree: number,
    sampleRate: number,
    weights?: Float32Array,
  ): PolyFitData {
    const n = y.re.length;
    const raw = (wasm as any).polyRegressionJoint(
      y.re, y.im, u.re, u.im, weights, derivatives, degree, n, sampleRate,
    );
    return adaptPolyFitResultJs(raw);
  }

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
    const n = y.re.length;
    const upSpec = (wasm as any).polyMatchedFilterSpectra(stimulusTime, pMax);
    const raw = (wasm as any).polyRegressionMatchedFilter(
      y.re, y.im,
      harmonicsRe, harmonicsIm,
      upSpec.re as Float32Array, upSpec.im as Float32Array,
      pMax, derivatives, degree, n, sampleRate,
    );
    return (raw as any[]).map(adaptPolyFitResultJs);
  }

  polyEvaluateCurveOnAxis(
    coeffs: Float32Array,
    monomialPowersFlat: Uint32Array,
    nAxes: number,
    targetAxis: number,
    fixed: Float32Array,
    xValues: Float32Array,
  ): Float32Array {
    return new Float32Array((wasm as any).polyEvaluateCurveOnAxis(
      coeffs, monomialPowersFlat, nAxes, targetAxis, fixed, xValues,
    ));
  }
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

// STFT computation result
interface STFTResult {
  magnitudesDb: Float32Array;  // Flattened row-major: [frame0_bins..., frame1_bins..., ...]
  timeAxis: Float32Array;
  frequencyAxis: Float32Array;
  numFrames: number;
  numBins: number;
}

/**
 * Compute a robust autoscale range from a buffer of finite samples.
 *
 * Sorts `values` in place and returns
 *   [ pLow - padding * (pHigh - pLow), pHigh + padding * (pHigh - pLow) ]
 * clamped to the actual data extent, where pLow/pHigh are the requested
 * percentiles. Used for the *measured* axis only (Y for 2D, Z for heatmap,
 * Z for 3D vertex plots) so that pathological outliers (e.g. group-delay
 * spikes near divide-by-zero frequencies) don't crush the visible signal.
 */
function percentileRange(
  values: Float64Array,
  lowPct: number,
  highPct: number,
  padding: number,
): { min: number; max: number } {
  const n = values.length;
  if (n === 0) return { min: 0, max: 1 };
  if (n === 1) return { min: values[0], max: values[0] };
  // Float64Array.sort sorts numerically by default.
  values.sort();
  const dataMin = values[0];
  const dataMax = values[n - 1];
  const idx = (p: number) => {
    const i = Math.floor((p / 100) * (n - 1));
    return i < 0 ? 0 : i >= n ? n - 1 : i;
  };
  const pLow = values[idx(lowPct)];
  const pHigh = values[idx(highPct)];
  const span = pHigh - pLow;
  let lo = pLow - padding * span;
  let hi = pHigh + padding * span;
  if (lo < dataMin) lo = dataMin;
  if (hi > dataMax) hi = dataMax;
  if (!(hi > lo)) {
    // All-equal or numerical underflow — fall back to data extent
    return { min: dataMin, max: dataMax };
  }
  return { min: lo, max: hi };
}

class CalculationManagerWorker {
  private contexts = new Map<COMPUTATION_CONTEXT_ID, CalculationContext>();
  private calculationTypes = new Map();
  private visualizationTypes = new Map();
  private canvases = new Map<string, OffscreenCanvas>();
  private pendingCanvases = new Map<string, TransferCanvasMessage>(); // Queue for canvases that arrive before context is ready
  private globalContextType: 'webgpu' | 'webgl2' | '2d' = '2d'; // Global rendering context type preference
  private plotHandles = new Map<string, PlotHandle>(); // Persistent handles for WebGPU state
  private plotSourceSettings = new Map<string, any>(); // Track settings identity to avoid redundant getPlotOptions() calls
  private plotDataStore = new Map<string, PlotData>(); // Pre-allocated PlotData for in-place updates
  private lastProcessedPosition = new Map<COMPUTATION_CONTEXT_ID, number>(); // Track last-processed position per context for change detection
  private gpuDevice: GPUDevice | null = null;
  private gpuAdapter: GPUAdapter | null = null;
  private mode: 'live' | 'offline' = 'offline';
  private activeContextId: COMPUTATION_CONTEXT_ID | null = null;
  private contextGenerations = new Map<COMPUTATION_CONTEXT_ID, number>();
  private animationFrameId: number | null = null;
  private wasm: WorkerWasmService;
  private scriptParser: ScriptParserService;
  private executionOrders = new Map<COMPUTATION_CONTEXT_ID, CONTEXT_KEY[]>();
  private calculationTypeIds = new Map<string, COMPUTATION_TYPE_ID>(); // contextId:key -> type ID
  private parsedOperations = new Map<COMPUTATION_CONTEXT_ID, Map<CONTEXT_KEY, any>>(); // contextId -> operations map
  private x_c_shifted: Float32Array[] | null = null;
  /** Per-context cache for the implicit `y_c` / `Y_c` variables. Cache key
   *  encodes (currentPosition, offsetSamples, nAverage, range) so multiple
   *  references to `y_c` or `Y_c` within one calculation tick share a single
   *  FFT/IFFT pass. `Y_c` may be lazily filled (see getVariable). */
  private _ycCache = new Map<COMPUTATION_CONTEXT_ID, {
    key: string;
    raw: Float32Array[];
    y_c: Float32Array[];
    Y_c: ComplexSpectrum[];
  }>();
  // Global plot preferences pushed from the UI thread. Used by the autoscale
  // pass so the *measured* axis (Y for 2D, Z for heatmap, Y+Z for 3D) can be
  // computed via robust percentiles instead of true min/max.
  private plotPreferences: PlotPreferencesPayload = {
    autoscaleAlgorithm: 'minmax',
    percentileLow: 2.5,
    percentileHigh: 97.5,
    percentilePadding: 0.05,
  };
  
  constructor() {
    this.wasm = new WorkerWasmService();
    this.scriptParser = new ScriptParserService();
    this.registerTypes();
  }
  
  async initialize(): Promise<void> {
    await this.wasm.initialize();
  }
  
  private registerTypes(): void {
    // Register calculation types
    const calcTypes = createCalculationTypes(this.wasm as any);
    calcTypes.forEach(type => {
      this.calculationTypes.set(type.id, type);
    });
    
    // Register visualization types
    const visTypes = createVisualizationTypes();
    visTypes.forEach(type => {
      this.visualizationTypes.set(type.id, type);
    });
  }
  
  handleMessage(event: MessageEvent<WorkerMessage>): void {
    const message = event.data;

    try {
      switch (message.type) {
        case WorkerMessageType.INIT_CONTEXT:
          this.handleInitContext(message as InitContextMessage);
          break;
        
        case WorkerMessageType.UPDATE_SETTING:
          this.handleUpdateSetting(message as UpdateSettingMessage);
          break;
        
        case WorkerMessageType.UPDATE_SCRIPT:
          this.handleUpdateScript(message as UpdateScriptMessage);
          break;
        
        case WorkerMessageType.UPDATE_VISUALIZATION_DYNAMIC_SETTINGS:
          this.handleUpdateVisualizationDynamicSettings(message as any);
          break;
        
        case WorkerMessageType.UPDATE_POSITION_OFFSET:
          this.handleUpdatePositionOffset(message as UpdatePositionOffsetMessage);
          break;

        case WorkerMessageType.UPDATE_N_AVERAGE:
          this.handleUpdateNAverage(message as any);
          break;
        case WorkerMessageType.UPDATE_ACTIVE_FREQ_RANGE:
          this.handleUpdateActiveFreqRange(message as any);
          break;
        
        case WorkerMessageType.SET_MODE:
          this.handleSetMode(message as SetModeMessage);
          break;
        
        case WorkerMessageType.SET_ACTIVE_CONTEXT:
          this.handleSetActiveContext(message as SetActiveContextMessage);
          break;
        
        case WorkerMessageType.TRIGGER_CALCULATION:
          this.triggerCalculation(Boolean(message.payload?.force));
          break;
        
        case WorkerMessageType.TRANSFER_CANVAS:
          this.handleTransferCanvas(message as TransferCanvasMessage);
          break;
        
        case WorkerMessageType.UNREGISTER_CANVAS:
          const unregMsg = message as any;
          this.handleUnregisterCanvas(unregMsg.payload.contextId, unregMsg.payload.visKey);
          break;
        
        case WorkerMessageType.RESIZE_CANVAS:
          this.handleResizeCanvas(message as ResizeCanvasMessage);
          break;
        
        case WorkerMessageType.DESTROY_CONTEXT:
          this.handleDestroyContext(message as DestroyContextMessage);
          break;
        
        case WorkerMessageType.SET_CONTEXT_TYPE:
          this.handleSetContextType(message as SetContextTypeMessage);
          break;

        case WorkerMessageType.CHECK_WEBGPU_SUPPORT:
          this.handleCheckWebGPUSupport();
          break;

        case WorkerMessageType.CHECK_WEBGL2_SUPPORT:
          this.handleCheckWebGL2Support();
          break;

        case WorkerMessageType.REQUEST_RESULT_SNAPSHOT:
          this.handleRequestResultSnapshot(message as RequestResultSnapshotMessage);
          break;

        case WorkerMessageType.UI_READY:
          // UI is ready, start live mode if needed
          break;

        case WorkerMessageType.SET_PLOT_PREFERENCES: {
          const payload = (message as any).payload as PlotPreferencesPayload | undefined;
          if (payload) {
            this.plotPreferences = {
              autoscaleAlgorithm: payload.autoscaleAlgorithm === 'percentile' ? 'percentile' : 'minmax',
              percentileLow: payload.percentileLow,
              percentileHigh: payload.percentileHigh,
              percentilePadding: payload.percentilePadding,
            };
          }
          break;
        }
      }
    } catch (error: any) {
      this.sendError(error.message, error.stack);
    }
  }
  
  private handleInitContext(message: InitContextMessage): void {
    const { definition, sharedBuffers } = message.payload;
    
    // Increment generation counter for this context (used for tracking reinitializations)
    const currentGen = this.contextGenerations.get(definition.id) || 0;
    const newGen = currentGen + 1;
    this.contextGenerations.set(definition.id, newGen);
    
    // Get existing context to preserve settings
    const existingContext = this.contexts.get(definition.id);
    
    // Parse script to get operations
    const parsed = this.scriptParser.parse(definition.script);
    
    // Check if visualization keys have changed (different preset)
    const newVisKeys = new Set<string>();
    parsed.operations.forEach((op, key) => {
      if (op.isVisualization) {
        newVisKeys.add(key);
      }
    });
    
    const oldVisKeys = existingContext ? Array.from(existingContext.visualizations.keys()) : [];
    const keysMatch = oldVisKeys.length === newVisKeys.size && 
                      oldVisKeys.every(k => newVisKeys.has(k));
    
    if (!keysMatch) {
      // Different visualization keys - only clear canvases for keys that no longer exist.
      // Keep canvases for keys present in both old and new sets so that UI components
      // that aren't recreated (same vis type/key) continue to render.
      this.clearRemovedCanvases(definition.id, newVisKeys);
    }
    // If keys match, keep existing canvases - they're stored by visKey, no migration needed
    
    // Create views on SharedArrayBuffers - now multichannel
    // y_circular_shared is the full circular buffer (length = nc * n_y per channel)
    const x_c = sharedBuffers.x_c.map(buf => new Float32Array(buf));
    const y_circular_shared = sharedBuffers.y_c.map(buf => new Float32Array(buf));
    const currentPositionBuffer = new Int32Array(sharedBuffers.currentPosition);
    
    const nc = definition.settings.nc;
    const n_y = definition.settings.n_y;
    const circularBufferLength = nc * n_y;  // Total length of circular buffer
    
    // Reuse parsed script from above (already parsed for key comparison)
    const executionOrder = parsed.executionOrder;
    this.executionOrders.set(definition.id, executionOrder);
    this.parsedOperations.set(definition.id, parsed.operations);
    
    // Create context with getVariable method
    const context: CalculationContext = {
      id: definition.id,
      settings: definition.settings,
      x_c,
      currentPosition: 0,
      selectedRange: 0,
      currentPositionOffset: 0,
      nAverage: existingContext?.nAverage ?? 1,
      activeFrequencyRange: existingContext?.activeFrequencyRange ?? null,
      calculationSettings: new Map(),
      calculationResults: new Map(),
      visualizations: new Map(),
      visualizationSettings: new Map(),
      visualizationDynamicSettings: existingContext?.visualizationDynamicSettings ?? new Map(),
      visualizationCanvases: existingContext?.visualizationCanvases ?? new Map(),
      currentPositionBuffer,
      channelCount: y_circular_shared.length,
      getCircularBufferChannel: (channel: number): Float32Array | undefined => {
        return y_circular_shared[channel];
      },
      getVariable: (key: CONTEXT_KEY | 'x_c' | 'y_c' | 'Y_c') => {
        if (key === 'x_c') {
          if(!context.x_c || context.x_c.length === 0) return [];
          if(!this.x_c_shifted || this.x_c_shifted.length !== context.x_c.length || this.x_c_shifted[0].length !== context.x_c[0].length) {
            this.x_c_shifted = context.x_c.map(channel => new Float32Array(channel.length));      
          }
          // Align x_c with the *unshifted* recording head only.
          //
          // Contract (DO NOT change without reading this comment fully):
          //   x_c is the period-nc excitation as it was actually played.
          //   currentPosition = T = absolute sample count after the worklet
          //   has written samples [T-bufferSize .. T-1]. The played sample at
          //   absolute time t is x_c[t mod nc], so to expose x_c "as played
          //   over the last nc samples ending at T-1" we shift by
          //   n_shift = T mod nc, i.e. shiftedChannel[i] = x_c[(i + T) mod nc].
          //
          // The position-offset slider (`currentPositionOffset`) is applied
          // ONLY to y_c (it slides the y window backwards into the past so it
          // never reads future/unrecorded samples). Its purpose is to let the
          // user introduce a deliberate circular misalignment between x and y,
          // which appears as a temporal shift of the impulse peak in h_c =
          // IFFT(Y_c/X_c). That manual peak alignment is required for RT60
          // decay estimation. Including offsetSamples here would *cancel* that
          // shift and defeat the slider — do not do it.
          let n_shift = context.currentPosition % nc;
          if (n_shift < 0) n_shift += nc;
          for(let ch = 0; ch < context.x_c.length; ch++) {
            const channel = context.x_c[ch];
            const shiftedChannel = this.x_c_shifted[ch];
            for(let i = 0; i < channel.length; i++) {
              const srcIdx = (i + n_shift) % nc;
              shiftedChannel[i] = channel[srcIdx];
            }
          }
          return this.x_c_shifted;
        }

        if (key === 'y_c' || key === 'Y_c') {
          // Implicit Y_c / y_c with optional global bandpass.
          //
          // Pipeline (when activeFrequencyRange is set):
          //   raw_y_c → FFT → zero out bins outside [low, high] → Y_c
          //   Y_c → IFFT → bandpassed y_c
          //
          // When the range is null, `Y_c` is plain FFT(raw_y_c) and `y_c` is
          // the raw windowed signal (no extra IFFT).
          //
          // We cache both per (currentPosition, offset, nAverage, range) so
          // multiple operations referring to the same variable in one tick
          // share a single FFT/IFFT pass.
          //
          // Position offset semantics (paired with the x_c branch above):
          //   `currentPositionOffset` ∈ [0, 1] slides the y window strictly
          //   *backwards* in time by offsetSamples = round(offset * nc). The
          //   window covers absolute samples [T - nc - offsetSamples,
          //   T - 1 - offsetSamples] (and analogously for nAverage > 1), so it
          //   never reads future/unrecorded samples. Because x_c is NOT
          //   shifted by the same offset, this misalignment shows up as a
          //   circular time shift of the impulse peak in IFFT(Y_c/X_c) — that
          //   is the whole point of the slider (manual peak alignment for
          //   RT60 estimation). Do not "fix" this by also shifting x_c.
          const offset = context.currentPositionOffset;
          const offsetSamples = Math.round(offset * nc);
          const currentPos = context.currentPosition;
          const nAvgRaw = Math.max(1, Math.floor(context.nAverage ?? 1));
          const nAverage = Math.min(nAvgRaw, n_y);
          const range = context.activeFrequencyRange ?? null;
          const cacheKey =
            `${currentPos}|${offsetSamples}|${nAverage}|${range ? `${range.low},${range.high}` : 'null'}`;

          let cache = this._ycCache.get(definition.id);
          if (!cache || cache.key !== cacheKey) {
            // Recompute raw windowed y_c.
            const rawChannels = y_circular_shared.map(channel => {
              const adjusted = new Float32Array(nc);
              if (nAverage <= 1) {
                for (let i = 0; i < nc; i++) {
                  let srcIdx = (currentPos - nc + i - offsetSamples) % circularBufferLength;
                  if (srcIdx < 0) srcIdx += circularBufferLength;
                  adjusted[i] = channel[srcIdx];
                }
              } else {
                const totalLen = nAverage * nc;
                const baseStart = currentPos - totalLen - offsetSamples;
                for (let cyc = 0; cyc < nAverage; cyc++) {
                  const cycleStart = baseStart + cyc * nc;
                  for (let i = 0; i < nc; i++) {
                    let srcIdx = (cycleStart + i) % circularBufferLength;
                    if (srcIdx < 0) srcIdx += circularBufferLength;
                    adjusted[i] += channel[srcIdx];
                  }
                }
                const inv = 1 / nAverage;
                for (let i = 0; i < nc; i++) adjusted[i] *= inv;
              }
              return adjusted;
            });

            let Y_c: ComplexSpectrum[];
            let y_c: Float32Array[];

            if (range && context.settings.sampleRate > 0) {
              // FFT each channel, zero bins outside [low, high], then IFFT.
              const sampleRate = context.settings.sampleRate;
              Y_c = rawChannels.map(ch => {
                const spec = this.wasm.fft(ch);
                // Hard-gate: zero out bins outside the active band.
                // NOTE: wasm.fft returns a FULL N-bin complex spectrum (not nc/2+1).
                // For a real time-domain signal the spectrum is Hermitian: bin k and
                // bin (N-k) are conjugates. We must gate symmetrically — bin k for
                // k > N/2 represents the negative-frequency mirror of (N-k), so its
                // physical frequency is (N-k)*sampleRate/N, not k*sampleRate/N.
                // Gating with the one-sided mapping zeroes the entire upper half and
                // breaks Hermitian symmetry → IFFT(Y_c/X_c) becomes complex and the
                // real part shows analytic-signal artifacts that depend on X_c phase
                // (very visible on Zadoff-Chu, less so on random-phase noise).
                const re = new Float32Array(spec.re);
                const im = new Float32Array(spec.im);
                const len = re.length; // full N bins
                const binHz = sampleRate / nc;
                const half = nc >>> 1;
                // The loop iterates every bin k in [0, N). For k > N/2 the
                // physical frequency is (N-k)*binHz (Hermitian mirror), which
                // `kPos` already accounts for, so iterating the full range
                // gates both positive and negative-frequency halves correctly.
                // (An earlier version also wrote `re[len-k-1]=0` as a manual
                // mirror — that was off-by-one (mirror of bin k is N-k, not
                // N-1-k) and corrupted unrelated bins; removed.)
                for (let k = 0; k < len; k++) {
                  const kPos = k <= half ? k : nc - k;
                  const f = kPos * binHz;
                  if (f < range.low || f > range.high) {
                    re[k] = 0;
                    im[k] = 0;
                  }
                }
                return { re, im };
              });
              y_c = Y_c.map(spec => this.wasm.ifft(spec));
            } else {
              // No bandpass: y_c is raw, Y_c is plain FFT (computed lazily
              // only if requested).
              y_c = rawChannels;
              Y_c = null as unknown as ComplexSpectrum[];
            }

            cache = { key: cacheKey, raw: rawChannels, y_c, Y_c };
            this._ycCache.set(definition.id, cache);
          }

          if (key === 'y_c') return cache.y_c;

          // key === 'Y_c': compute lazily if not already cached.
          if (!cache.Y_c) {
            cache.Y_c = cache.raw.map(ch => this.wasm.fft(ch));
          }
          return cache.Y_c;
        }

        return context.calculationResults.get(key) || [];
      },
      getOperationsOrder: () => executionOrder,
      getDependencies: (key: CONTEXT_KEY) => {
        const operation = parsed.operations.get(key);
        return operation?.args || [];
      }
    };
    
    // Initialize calculations and visualizations based on script (preserving existing settings)
    this.initializeFromScript(context, parsed, executionOrder, existingContext);
    
    this.contexts.set(definition.id, context);
    
    // Set as active context
    this.activeContextId = definition.id;
    
    // Send confirmation with visualization info
    const visInfo = Array.from(context.visualizations.entries()).map(([key, typeId]) => {
      const visType = this.visualizationTypes.get(typeId);
      return {
        key,
        type: typeId,
        isSimpleValue: visType?.isSimpleValue || false
      };
    });
    
    const response: ContextInitializedMessage = {
      type: WorkerMessageType.CONTEXT_INITIALIZED,
      payload: {
        contextId: definition.id,
        visualizations: visInfo
      }
    };
    
    self.postMessage(response);
    
    // Process any canvas transfers that arrived before context was ready
    this.processPendingCanvases(definition.id);
  }
  
  private initializeFromScript(
    context: CalculationContext,
    parsed: any,
    executionOrder: CONTEXT_KEY[],
    existingContext?: CalculationContext
  ): void {
    // Initialize all calculations and visualizations from parsed script
    for (const key of executionOrder) {
      const operation = parsed.operations.get(key);
      
      if (operation.type.startsWith('VIS_')) {
        // Visualization
        const visType = this.visualizationTypes.get(operation.type);
        if (visType) {
          context.visualizations.set(key, operation.type);
          // Priority: 1) existing settings, 2) merge script arg settings into defaults, 3) default init settings
          const existingSettings = existingContext?.visualizationSettings.get(key);
          const scriptArgSettings = operation.argSettings;
          const defaultSettings = visType.initSettings(key, context);
          // Merge scriptArgSettings into defaults so partial YAML args don't override required fields
          const settings = existingSettings ?? (scriptArgSettings ? { ...defaultSettings, ...scriptArgSettings } : defaultSettings);
          context.visualizationSettings.set(key, settings);
        }
      } else {
        // Calculation
        const calcType = this.calculationTypes.get(operation.type);
        if (calcType) {
          try {
            // Track which type this key uses
            this.calculationTypeIds.set(`${context.id}:${key}`, operation.type);
            
            // Priority: 1) existing settings, 2) arg settings from script, 3) default init settings
            const existingSettings = existingContext?.calculationSettings.get(key);
            const scriptArgSettings = operation.argSettings;
            const settings = existingSettings ?? scriptArgSettings ?? calcType.initSettings(key, context);
            context.calculationSettings.set(key, settings);
            const result = calcType.initResult(key, context);
            
            context.calculationResults.set(key, result);
          } catch (error) {
            console.error(`Error initializing calculation ${key} (type: ${operation.type}):`, error);
          }
        }
      }
    }
  }
  
  private handleUpdateSetting(message: UpdateSettingMessage): void {
    const { contextId, key, value } = message.payload;
    const context = this.contexts.get(contextId);
    
    if (context) {
      // Update calculation or visualization setting
      // Check if this is a calculation key or visualization key
      if (context.calculationSettings.has(key)) {
        context.calculationSettings.set(key, value);
      } else if (context.visualizationSettings.has(key) || context.visualizations.has(key)) {
        // Also accept if it's a known visualization key (even if settings not yet initialized)
        context.visualizationSettings.set(key, value);
      }
      
      // Trigger recalculation if needed.  In offline/review mode the
      // currentPosition doesn't change, so we must force a recompute or
      // updateContext() will short-circuit on the dataChanged guard.
      if (this.mode === 'offline') {
        this.triggerCalculation(true);
      }
    }
  }

  private handleUpdatePositionOffset(message: UpdatePositionOffsetMessage): void {
    const { contextId, offset } = message.payload;
    const context = this.contexts.get(contextId);
    
    if (context) {
      // Store offset as proportion (0-1 range)
      context.currentPositionOffset = Math.max(0, Math.min(1, offset));
      
      // Trigger recalculation to apply new offset (force in offline mode
      // — see handleUpdateSetting note about the dataChanged guard).
      if (this.mode === 'offline') {
        this.triggerCalculation(true);
      }
    }
  }

  private handleUpdateNAverage(message: { payload: { contextId: string; nAverage: number } }): void {
    const { contextId, nAverage } = message.payload;
    const context = this.contexts.get(contextId);
    if (!context) return;
    const requested = Math.max(1, Math.floor(nAverage || 1));
    const cap = Math.max(1, context.settings.n_y);
    context.nAverage = Math.min(requested, cap);
    if (this.mode === 'offline') {
      this.triggerCalculation(true);
    }
  }

  private handleUpdateActiveFreqRange(
    message: { payload: { contextId: string; low: number | null; high: number | null } },
  ): void {
    const { contextId, low, high } = message.payload;
    const context = this.contexts.get(contextId);
    if (!context) return;
    if (low === null && high === null) {
      context.activeFrequencyRange = null;
    } else {
      const nyquist = context.settings.sampleRate / 2;
      const lo = low === null ? 0 : Math.max(0, low);
      const hi = high === null ? nyquist : Math.min(nyquist, high);
      context.activeFrequencyRange = (hi > lo) ? { low: lo, high: hi } : null;
    }
    if (this.mode === 'offline') {
      this.triggerCalculation(true);
    }
  }
  
  private handleUpdateScript(message: UpdateScriptMessage): void {
    const { contextId, script } = message.payload;
    const context = this.contexts.get(contextId);
    
    if (context) {
      // Re-parse script and reinitialize
      const parsed = this.scriptParser.parse(script);
      const executionOrder = parsed.executionOrder;
      this.executionOrders.set(contextId, executionOrder);
      
      // Clear old calculations
      context.calculationResults.clear();
      context.calculationSettings.clear();
      context.visualizations.clear();
      context.visualizationSettings.clear();
      
      // Reinitialize
      this.initializeFromScript(context, parsed, executionOrder);
    }
  }
  
  private handleUpdateVisualizationDynamicSettings(message: UpdateVisualizationDynamicSettingsMessage): void {
    const { contextId, visKey, settings } = message.payload;
    const context = this.contexts.get(contextId);
    
    if (context) {
      // Get existing settings to preserve reference ranges
      const existingSettings = context.visualizationDynamicSettings.get(visKey) || {};
      
      // Merge settings, preserving existing reference ranges unless explicitly clearing
      const mergedSettings = {
        ...existingSettings,
        ...settings
      };
      
      // If no zoom, clear reference ranges (reset)
      if (!settings.zoomX && !settings.zoomY) {
        delete mergedSettings.referenceRange;
      }
      
      context.visualizationDynamicSettings.set(visKey, mergedSettings);
      
      // Trigger immediate re-render with existing data (dataChanged=false).
      // In live mode this is needed because updateContext() skips rendering when
      // currentPosition hasn't changed.
      this.renderVisualization(contextId, visKey, context, false);
    }
  }
  
  private handleSetMode(message: SetModeMessage): void {
    this.mode = message.payload.mode;
    
    if (this.mode === 'live') {
      this.startLiveMode();
    } else {
      this.stopLiveMode();
    }
  }
  
  private handleSetActiveContext(message: SetActiveContextMessage): void {
    const { contextId } = message.payload;
    this.activeContextId = contextId;
  }

  private handleDestroyContext(message: DestroyContextMessage): void {
    const { contextId } = message.payload;

    // Remove context
    this.contexts.delete(contextId);

    // Clear all canvases for this context
    this.clearContextCanvases(contextId);

    // Clear pending canvases
    const prefix = `${contextId}:`;
    for (const key of Array.from(this.pendingCanvases.keys())) {
      if (key.startsWith(prefix)) {
        this.pendingCanvases.delete(key);
      }
    }

    // Clear execution orders and parsed operations
    this.executionOrders.delete(contextId);
    this.parsedOperations.delete(contextId);
    this.contextGenerations.delete(contextId);
    this.lastProcessedPosition.delete(contextId);

    // Clear plotDataStore entries for this context
    for (const key of Array.from(this.plotDataStore.keys())) {
      if (key.startsWith(prefix)) {
        this.plotDataStore.delete(key);
      }
    }

    // Clear calculationTypeIds for this context
    for (const key of Array.from(this.calculationTypeIds.keys())) {
      if (key.startsWith(prefix)) {
        this.calculationTypeIds.delete(key);
      }
    }

    // If this was the active context, clear it
    if (this.activeContextId === contextId) {
      this.activeContextId = null;
    }
  }
  
  private handleTransferCanvas(message: TransferCanvasMessage): void {
    const { contextId, visKey, canvas, width, height } = message.payload;
    const context = this.contexts.get(contextId);
    
    if (context) {
      // Store canvas for this visualization (simple key without generation)
      const fullKey = `${contextId}:${visKey}`;
      this.canvases.set(fullKey, canvas);
      context.visualizationCanvases?.set(visKey, canvas);
      
      // Set canvas size
      canvas.width = width;
      canvas.height = height;
      
      // Trigger an immediate initial render so the canvas shows content right away
      this.renderVisualization(contextId, visKey, context, true);
    } else {
      // Context not ready yet - queue the canvas transfer for later
      const fullKey = `${contextId}:${visKey}`;
      this.pendingCanvases.set(fullKey, message);
    }
  }
  
  private processPendingCanvases(contextId: COMPUTATION_CONTEXT_ID): void {
    // Process any pending canvas transfers for this context
    const prefix = `${contextId}:`;
    const toProcess: TransferCanvasMessage[] = [];
    
    for (const [key, message] of this.pendingCanvases.entries()) {
      if (key.startsWith(prefix)) {
        toProcess.push(message);
        this.pendingCanvases.delete(key);
      }
    }
    
    for (const message of toProcess) {
      this.handleTransferCanvas(message);
    }
  }
  
  private clearContextCanvases(contextId: COMPUTATION_CONTEXT_ID): void {
    // Remove all canvases for this context
    const keysToDelete: string[] = [];
    for (const key of this.canvases.keys()) {
      if (key.startsWith(`${contextId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.canvases.delete(key));
  }

  private clearRemovedCanvases(contextId: COMPUTATION_CONTEXT_ID, newVisKeys: Set<string>): void {
    // Only remove canvases whose vis key is NOT in the new set.
    // This prevents losing canvases for visualizations that still exist
    // (their UI component won't be recreated, so the canvas won't be re-transferred).
    const prefix = `${contextId}:`;
    const keysToDelete: string[] = [];
    for (const fullKey of this.canvases.keys()) {
      if (fullKey.startsWith(prefix)) {
        const visKey = fullKey.slice(prefix.length);
        if (!newVisKeys.has(visKey)) {
          keysToDelete.push(fullKey);
        }
      }
    }
    keysToDelete.forEach(key => {
      this.canvases.delete(key);
      // Clean up associated GPU resources and plot handle
      const handle = this.plotHandles.get(key);
      if (handle) {
        this.cleanupWebGL2Context(handle);
        this.plotHandles.delete(key);
      }
      this.plotDataStore.delete(key);
      this.plotSourceSettings.delete(key);
      this.lastProcessedPosition.delete(key);
    });

    // Also clean up visualizationCanvases on the existing context
    const existingContext = this.contexts.get(contextId);
    if (existingContext?.visualizationCanvases) {
      for (const visKey of Array.from(existingContext.visualizationCanvases.keys())) {
        if (!newVisKeys.has(visKey)) {
          existingContext.visualizationCanvases.delete(visKey);
        }
      }
    }
  }
  
  private handleUnregisterCanvas(contextId: COMPUTATION_CONTEXT_ID, visKey: CONTEXT_KEY): void {
    // Delete canvas with simple key
    const fullKey = `${contextId}:${visKey}`;
    const deleted = this.canvases.delete(fullKey);
    
    // Clean up associated GPU resources and plot handle
    const handle = this.plotHandles.get(fullKey);
    if (handle) {
      this.cleanupWebGL2Context(handle);
      this.plotHandles.delete(fullKey);
    }
    this.plotDataStore.delete(fullKey);
    this.plotSourceSettings.delete(fullKey);
    this.lastProcessedPosition.delete(fullKey);

    const context = this.contexts.get(contextId);
    if (context?.visualizationCanvases) {
      context.visualizationCanvases.delete(visKey);
    }
  }

  private handleResizeCanvas(message: ResizeCanvasMessage): void {
    const { contextId, visKey, width, height } = message.payload;
    const fullKey = `${contextId}:${visKey}`;
    const canvas = this.canvases.get(fullKey);
    
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
      
      // Also resize WebGPU canvas in persistent handle if it exists
      const existingHandle = this.plotHandles.get(fullKey);
      if (existingHandle?.webgpuCanvas) {
        existingHandle.webgpuCanvas.width = width;
        existingHandle.webgpuCanvas.height = height;
      }

      // Trigger re-render with new size (no new data, just re-render)
      const context = this.contexts.get(contextId);
      if (context) {
        this.renderVisualization(contextId, visKey, context, false);
      }
    }
  }

  private async handleCheckWebGPUSupport(): Promise<void> {
    const supported = await this.checkWebGPUSupport();
    const response: WebGPUSupportMessage = {
      type: WorkerMessageType.WEBGPU_SUPPORT,
      payload: { supported }
    };
    self.postMessage(response);
  }

  private handleCheckWebGL2Support(): void {
    let supported = false;
    try {
      const testCanvas = new OffscreenCanvas(1, 1);
      const gl = testCanvas.getContext('webgl2');
      supported = gl !== null;
      // Immediately release the test context to avoid leaking
      if (gl) {
        const ext = gl.getExtension('WEBGL_lose_context');
        ext?.loseContext();
      }
    } catch {
      supported = false;
    }
    const response: WebGL2SupportMessage = {
      type: WorkerMessageType.WEBGL2_SUPPORT,
      payload: { supported }
    };
    self.postMessage(response);
  }

  private async checkWebGPUSupport(): Promise<boolean> {
    if (this.gpuDevice !== null) return true;
    try {
      if (!navigator.gpu) return false;
      this.gpuAdapter = await navigator.gpu.requestAdapter();
      if (!this.gpuAdapter) return false;
      this.gpuDevice = await this.gpuAdapter.requestDevice();
      return true;
    } catch {
      return false;
    }
  }

  private async handleSetContextType(message: SetContextTypeMessage): Promise<void> {
    const { contextType } = message.payload;
    this.globalContextType = contextType;

    if (contextType === 'webgpu') {
      const supported = await this.checkWebGPUSupport();
      if (!supported) {
        this.globalContextType = '2d';
        return;
      }
      // Suspend WebGL2 without destroying contexts (they can be reused when switching back)
      for (const handle of this.plotHandles.values()) {
        handle.useWebGL2 = false;
      }
      // Initialize or reuse WebGPU context for all existing handles
      for (const handle of this.plotHandles.values()) {
        await this.initWebGPUContext(handle);
      }
    } else if (contextType === 'webgl2') {
      // Suspend WebGPU without destroying contexts (they can be reused when switching back)
      for (const handle of this.plotHandles.values()) {
        handle.useWebGPU = false;
      }
      // Initialize or reuse WebGL2 context for all existing handles
      for (const handle of this.plotHandles.values()) {
        this.initWebGL2Context(handle);
      }
    } else {
      // Switching to 2D – suspend GPU contexts without destroying them so they can be reused
      for (const handle of this.plotHandles.values()) {
        handle.useWebGPU = false;
        handle.useWebGL2 = false;
      }
    }

    // Re-render all active visualizations (context type changed, not new data)
    for (const [contextId, context] of this.contexts.entries()) {
      if (context.visualizations) {
        for (const visKey of context.visualizations.keys()) {
          this.renderVisualization(contextId, visKey, context, false);
        }
      }
    }
  }

  private async initWebGPUContext(handle: PlotHandle): Promise<void> {
    if (!handle.canvas || !this.gpuDevice) {
      handle.useWebGPU = false;
      return;
    }

    // Reuse existing WebGPU context if available (avoids creating a new context on every mode switch)
    if (handle.webgpuCanvas && handle.webgpuContext && handle.gpuDevice) {
      handle.useWebGPU = true;
      return;
    }

    try {
      const mainCanvas = handle.canvas as OffscreenCanvas;

      // Create separate OffscreenCanvas for WebGPU rendering
      const webgpuCanvas = new OffscreenCanvas(mainCanvas.width, mainCanvas.height);
      const webgpuCtx = webgpuCanvas.getContext('webgpu') as GPUCanvasContext | null;

      if (!webgpuCtx) {
        console.warn('WebGPU context not available, falling back to Canvas 2D');
        handle.useWebGPU = false;
        return;
      }

      const format = navigator.gpu.getPreferredCanvasFormat();
      webgpuCtx.configure({
        device: this.gpuDevice,
        format,
        alphaMode: 'premultiplied',
      });

      handle.webgpuCanvas = webgpuCanvas;
      handle.webgpuContext = webgpuCtx;
      handle.gpuDevice = this.gpuDevice;
      handle.useWebGPU = true;
    } catch (e) {
      console.error('Failed to initialize WebGPU:', e);
      handle.useWebGPU = false;
    }
  }

  private initWebGL2Context(handle: PlotHandle): void {
    if (!handle.canvas) {
      handle.useWebGL2 = false;
      return;
    }

    // Reuse existing WebGL2 context if available and not lost (avoids creating a new context on every mode switch)
    if (handle.webgl2Context && handle.webgl2Canvas && !handle.webgl2Context.isContextLost()) {
      handle.useWebGL2 = true;
      return;
    }

    // Clean up any stale/lost context before creating a new one
    this.cleanupWebGL2Context(handle);

    try {
      const mainCanvas = handle.canvas as OffscreenCanvas;
      const webgl2Canvas = new OffscreenCanvas(mainCanvas.width, mainCanvas.height);
      const gl = webgl2Canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });

      if (!gl) {
        console.warn('WebGL2 context not available, falling back to Canvas 2D');
        handle.useWebGL2 = false;
        return;
      }

      // Enable OES_element_index_uint for Uint32 index buffers
      // (implicit in WebGL2 but some implementations need the check)
      handle.webgl2Canvas = webgl2Canvas;
      handle.webgl2Context = gl;
      handle.useWebGL2 = true;
    } catch (e) {
      console.error('Failed to initialize WebGL2:', e);
      handle.useWebGL2 = false;
    }
  }

  private cleanupWebGL2Context(handle: PlotHandle): void {
    if (handle.webgl2Resources && handle.webgl2Context) {
      cleanupWebGL2Resources(handle.webgl2Context, handle.webgl2Resources);
    }
    // Explicitly lose the WebGL2 context so the browser can reclaim it immediately
    if (handle.webgl2Context) {
      const ext = handle.webgl2Context.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    }
    handle.useWebGL2 = false;
    handle.webgl2Canvas = null;
    handle.webgl2Context = null;
    handle.webgl2Resources = undefined;
  }
  
  private startLiveMode(): void {
    if (this.animationFrameId !== null) return;
    
    const loop = () => {
      this.updateActiveContext();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    
    this.animationFrameId = requestAnimationFrame(loop);
  }
  
  private stopLiveMode(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  private triggerCalculation(forceRecompute: boolean = false): void {
    this.updateActiveContext(forceRecompute);
  }
  
  private updateActiveContext(forceRecompute: boolean = false): void {
    // Only update the active context
    if (this.activeContextId) {
      const context = this.contexts.get(this.activeContextId);
      if (context) {
        this.updateContext(this.activeContextId, context, forceRecompute);
      }
    }
  }

  isUpdating: boolean = false;
  
  private updateContext(
    contextId: COMPUTATION_CONTEXT_ID,
    context: CalculationContext,
    forceRecompute: boolean = false,
  ): void {
    if(this.isUpdating) {
      console.warn('Calculation skipped');
      return;
    }
      
    this.isUpdating = true;
    // Read current position from shared buffer (Atomics)
    let dataChanged = true;
    if (context.currentPositionBuffer) {
      const newPosition = Atomics.load(context.currentPositionBuffer, 0);
      const lastPosition = this.lastProcessedPosition.get(contextId) ?? -1;
      dataChanged = forceRecompute || newPosition !== lastPosition;
      if (dataChanged) {
        context.currentPosition = newPosition;
        this.lastProcessedPosition.set(contextId, newPosition);
      }
    }

    if (!dataChanged) {
      // No new audio data — skip all calculations and rendering
      this.isUpdating = false;
      return;
    }

    // Execute all operations in order
    const executionOrder = this.executionOrders.get(contextId) || [];
    const simpleValues: { [key: string]: any } = {};
    for (const key of executionOrder) {
      
      const visTypeId = context.visualizations.get(key);
      
      if (visTypeId) {
        // Visualization - may have canvas, simple value, or both
        const visType = this.visualizationTypes.get(visTypeId);
        
        // Collect simple value if visualization has one
        if (visType?.hasSimpleValue || visType?.isSimpleValue) {
          const result = this.getVisualizationData(key, context);
          simpleValues[key] = result;
        }
        
        // Render to canvas if visualization has one (and not just simple value)
        if (visType?.hasCanvas || (!visType?.isSimpleValue && !visType?.hasSimpleValue)) {
          this.renderVisualization(contextId, key, context);
        }
      } else {
        // Calculation - update result
        const calcType = this.findCalculationType(key, context);
        if (calcType) {
          try {
            calcType.updateResult(key, context);
          } catch (error) {
            console.error(`Error updating calculation ${key} (type: ${calcType.id}):`, error);
            console.error('Context data:', {
              dependencies: context.getDependencies?.(key),
              hasResults: Array.from(context.calculationResults.keys())
            });
          }
        } else {
          console.warn(`No calculation type found for key: ${key}`);
        }
      }
    }
    
    // Send completion message
    const response: CalculationCompleteMessage = {
      type: WorkerMessageType.CALCULATION_COMPLETE,
      payload: {
        contextId,
        simpleValues: Object.keys(simpleValues).length > 0 ? simpleValues : undefined
      }
    };
    
    self.postMessage(response);

    this.isUpdating = false;
  }
  
  private findCalculationType(key: CONTEXT_KEY, context: CalculationContext): any {
    // Get the calculation type ID for this key
    const typeId = this.calculationTypeIds.get(`${context.id}:${key}`);
    if (typeId) {
      return this.calculationTypes.get(typeId);
    }
    return null;
  }

  private getVisualizationData(key: CONTEXT_KEY, context: CalculationContext): any {
    // Visualizations reference their data source via args[0] (e.g. p_rt60 = VIS_RT60(rt60))
    // so we need to look up the result under the source key, not the visualization key.
    const operations = this.parsedOperations.get(context.id);
    const dataKey = operations?.get(key)?.args?.[0] ?? key;
    const result = context.calculationResults.get(dataKey);

    if (result && Array.isArray(result) && result.length > 0) {
      const firstChannel = result[0];
      if (firstChannel && typeof firstChannel === 'object') {
        // Return the full RT60FullResult so the component can display the table
        if ('edt' in firstChannel) {
          return firstChannel as RT60FullResult;
        }
        // Older RT60Result shape — return the whole object so the component can use it.
        if ('rt60' in firstChannel) {
          return firstChannel as RT60Result;
        }
      }
    }

    return null;
  }

  private handleRequestResultSnapshot(message: RequestResultSnapshotMessage): void {
    const { requestId, contextId, keys } = message.payload;
    const context = this.contexts.get(contextId);

    if (!context) {
      const response: ResultSnapshotMessage = {
        type: WorkerMessageType.RESULT_SNAPSHOT,
        payload: {
          requestId,
          contextId,
          error: `Unknown calculation context: ${contextId}`,
        }
      };
      self.postMessage(response);
      return;
    }

    const results: Record<string, any> = {};
    keys.forEach((key) => {
      results[key] = this.serializeSnapshotValue(context.calculationResults.get(key) ?? null);
    });

    const response: ResultSnapshotMessage = {
      type: WorkerMessageType.RESULT_SNAPSHOT,
      payload: {
        requestId,
        contextId,
        results,
      }
    };

    self.postMessage(response);
  }

  private serializeSnapshotValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (
      value instanceof Float32Array
      || value instanceof Float64Array
      || value instanceof Int32Array
      || value instanceof Uint32Array
      || value instanceof Uint8Array
      || value instanceof Int16Array
      || value instanceof Uint16Array
      || value instanceof Int8Array
      || value instanceof Uint8ClampedArray
    ) {
      return Array.from(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.serializeSnapshotValue(entry));
    }

    if (typeof value === 'object') {
      const result: Record<string, any> = {};
      Object.entries(value).forEach(([key, entry]) => {
        result[key] = this.serializeSnapshotValue(entry);
      });
      return result;
    }

    return value;
  }
  
  private renderVisualization(
    contextId: COMPUTATION_CONTEXT_ID,
    key: CONTEXT_KEY,
    context: CalculationContext,
    dataChanged: boolean = true
  ): void {
    const fullKey = `${contextId}:${key}`;
    const canvas = this.canvases.get(fullKey);
    if (!canvas) {
      // Canvas might not be transferred yet - this is normal during initialization
      return;
    }
    
    // Use a lazy 2D context to avoid blocking WebGPU initialisation for GPU visualizations.
    const visTypeId = context.visualizations.get(key);
    const visType = this.visualizationTypes.get(visTypeId) as VisualizationType<any> | undefined;
    
    // Get visualization data from the correct calculation result
    // Visualizations have args like: abs_spectrum = VIS_ABSSPEC(H_c_abs)
    // So we need to get data from H_c_abs, not abs_spectrum
    const operations = this.parsedOperations.get(contextId);
    const operation = operations?.get(key);
    const dataKey = operation?.args?.[0]; // First arg is the data source
    
    // Get multichannel data
    let dataChannels = dataKey ? context.getVariable(dataKey) : undefined;
    const settings = context.visualizationSettings.get(key);
    const dynamicSettings = context.visualizationDynamicSettings.get(key);
    const sampleRate = context.settings.sampleRate;
    const nc = context.settings.nc;

    // Use the visualization type's plot engine methods
    if (visType && typeof visType.getPlotType === 'function' && typeof visType.initPlotData === 'function') {
      try {
        const plotMode = visType.getPlotMode?.() ?? '2d';
        const existingHandle = this.plotHandles.get(fullKey);
        let plotData: any;
        let plotOptions: Plot2DOptions | Plot3DOptions;

        // When dataChanged is false AND we already have handle data, skip the entire
        // data pipeline (prepareData, STFT, updatePlotData, post-processing).
        // Just re-render with existing data + options and updated dynamic options.
        if (!dataChanged && existingHandle?.data && existingHandle?.options) {
          plotData = existingHandle.data;
          plotOptions = existingHandle.options;
        } else {
          // FULL PIPELINE: prepare data, compute STFT if needed, build plot data + options

          // Prepare data using the visualization type's prepareData method if available
          let data = dataChannels;
          if (typeof visType.prepareData === 'function') {
            data = visType.prepareData(dataChannels, context, settings);
          }

          // Pre-compute STFT for STFT visualization types
          if ((visTypeId === 'VIS_STFT_ABSSPEC' || visTypeId === 'VIS_STFT_ABSSPEC_2D_CONTEXT' || visTypeId === 'VIS_STFT_ABSSPEC_HEATMAP') && 
              Array.isArray(data) && data.length > 0 && data[0] instanceof Float32Array) {
            const fftSize = settings?.fftSize ?? 256;
            const overlap = settings?.overlap ?? true;
            const stftResults: STFTResult[] = [];
            for (const channelData of data) {
              if (channelData instanceof Float32Array && channelData.length >= fftSize) {
                const stft = this.wasm.computeStft(channelData, sampleRate, fftSize, overlap);
                stftResults.push(stft);
              }
            }
            data = stftResults;
          }

          // Rebuild plot options when settings change
          const prevSettings = this.plotSourceSettings.get(fullKey);
          const settingsChanged = settings !== prevSettings;
          if (settingsChanged || !existingHandle?.options) {
            const rawPlotOptions = visType.getPlotOptions?.(settings, context) ?? {
              plotType: visType.getPlotType(),
              contextType: '2d' as const,
              title: settings?.title || visType.name,
              axesMetadata: []
            };
            plotOptions = applyVisualizationPresentation(rawPlotOptions, settings, rawPlotOptions.title || visType.name);
            this.plotSourceSettings.set(fullKey, settings);
          } else {
            plotOptions = existingHandle.options;
          }

          // Build plot data from prepared data — in-place update path
          let storedPlotData = this.plotDataStore.get(fullKey);
          if (!storedPlotData) {
            storedPlotData = visType.initPlotData(settings, context);
            this.plotDataStore.set(fullKey, storedPlotData);
          }
          visType.updatePlotData!(data, storedPlotData, settings, context);
          storedPlotData.generation = (storedPlotData.generation || 0) + 1;
          plotData = storedPlotData;

          // Post-process: populate categorical labels from data if needed
          if (plotOptions.axesMetadata?.[0]) {
            const xAxis = plotOptions.axesMetadata[0] as any;
            if (xAxis.categorical && Array.isArray(xAxis.categoryLabels) && xAxis.categoryLabels.length === 0) {
              if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.labels) && data[0].labels.length > 0) {
                xAxis.categoryLabels = data[0].labels;
              } else if (Array.isArray(data) && data.length > 0 && data[0]?.frequencies) {
                const frequencies = data[0].frequencies;
                const labels: string[] = [];
                for (let i = 0; i < frequencies.length; i++) {
                  const freq = frequencies[i];
                  labels.push(freq >= 1000 ? `${(freq / 1000).toFixed(1)}k` : `${Math.round(freq)}`);
                }
                xAxis.categoryLabels = labels;
              }
            }
          }

          // Post-process: update STFT 3D time axis maxValue from STFT timeAxis
          if ((visTypeId === 'VIS_STFT_ABSSPEC' || visTypeId === 'VIS_STFT_ABSSPEC_2D_CONTEXT') &&
              plotOptions.axesMetadata?.[2] && Array.isArray(data) && data.length > 0 && data[0]?.timeAxis) {
            const timeAxis = data[0].timeAxis;
            const maxTime = timeAxis[timeAxis.length - 1] || 1;
            plotOptions.axesMetadata[2].maxValue = maxTime;
          }

          // Post-process: update heatmap time axis maxValue from STFT timeAxis
          if (visTypeId === 'VIS_STFT_ABSSPEC_HEATMAP' &&
              plotOptions.axesMetadata?.[0] && Array.isArray(data) && data.length > 0 && data[0]?.timeAxis) {
            const timeAxis = data[0].timeAxis;
            const maxTime = timeAxis[timeAxis.length - 1] || 1;
            plotOptions.axesMetadata[0].maxValue = maxTime;
          }

          // Generic post-process: compute data-driven minValue/maxValue from plotData
          if (plotData && plotOptions.axesMetadata) {
            const axes = plotOptions.axesMetadata;
            const usePercentile = this.plotPreferences.autoscaleAlgorithm === 'percentile';
            const pLow = this.plotPreferences.percentileLow;
            const pHigh = this.plotPreferences.percentileHigh;
            const pPad = this.plotPreferences.percentilePadding;

            if (isData2D(plotData)) {
              // If the user has configured an explicit X range in plot settings,
              // restrict the Y autoscale to data points whose X falls within that range
              // (data outside the visible window can fluctuate wildly, e.g. group-delay
              // estimates near DC/Nyquist, and would crush the visible signal otherwise).
              const xRange = axes[0]?.range;
              const xClipMin = (xRange && typeof xRange.min === 'number') ? xRange.min : -Infinity;
              const xClipMax = (xRange && typeof xRange.max === 'number') ? xRange.max : Infinity;
              const xClipped = xClipMin > -Infinity || xClipMax < Infinity;

              // Pre-count finite-y samples within the X window so we can allocate
              // exactly one Float64Array for the percentile sort (avoids growth).
              let yCount = 0;
              for (const ch of plotData.channels) {
                for (let i = 0; i < ch.length; i++) {
                  const xv = ch.x[i], yv = ch.y[i];
                  if (isFinite(yv) && (!xClipped || (isFinite(xv) && xv >= xClipMin && xv <= xClipMax))) {
                    yCount++;
                  }
                }
              }

              const yValues = usePercentile ? new Float64Array(yCount) : null;
              let yIdx = 0;
              let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
              for (const ch of plotData.channels) {
                for (let i = 0; i < ch.length; i++) {
                  const xv = ch.x[i], yv = ch.y[i];
                  if (isFinite(xv)) { if (xv < xMin) xMin = xv; if (xv > xMax) xMax = xv; }
                  if (isFinite(yv) && (!xClipped || (isFinite(xv) && xv >= xClipMin && xv <= xClipMax))) {
                    if (yv < yMin) yMin = yv; if (yv > yMax) yMax = yv;
                    if (yValues) yValues[yIdx++] = yv;
                  }
                }
              }
              if (axes[0] && !(axes[0] as any).categorical && xMin <= xMax) {
                axes[0].minValue = xMin; axes[0].maxValue = xMax;
              }
              if (axes[1] && yMin <= yMax) {
                if (yValues && yValues.length > 1) {
                  const r = percentileRange(yValues, pLow, pHigh, pPad);
                  axes[1].minValue = r.min;
                  axes[1].maxValue = r.max;
                } else {
                  axes[1].minValue = yMin;
                  axes[1].maxValue = yMax;
                }
              }
            } else if (isData3D(plotData)) {
              // X (e.g. frequency) and Y (e.g. time) are deterministic grids;
              // only Z (the measured magnitude/value) needs robust autoscale.
              let zCount = 0;
              if (usePercentile) {
                for (const ch of plotData.channels) {
                  const n = ch.rowCount * ch.pointsPerRow;
                  for (let i = 0; i < n; i++) {
                    if (isFinite(ch.vertices[i * 3 + 2])) zCount++;
                  }
                }
              }
              const zValues = usePercentile ? new Float64Array(zCount) : null;
              let zIdx = 0;
              let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, zMin = Infinity, zMax = -Infinity;
              for (const ch of plotData.channels) {
                const n = ch.rowCount * ch.pointsPerRow;
                for (let i = 0; i < n; i++) {
                  const xv = ch.vertices[i * 3], yv = ch.vertices[i * 3 + 1], zv = ch.vertices[i * 3 + 2];
                  if (isFinite(xv)) { if (xv < xMin) xMin = xv; if (xv > xMax) xMax = xv; }
                  if (isFinite(yv)) { if (yv < yMin) yMin = yv; if (yv > yMax) yMax = yv; }
                  if (isFinite(zv)) {
                    if (zv < zMin) zMin = zv; if (zv > zMax) zMax = zv;
                    if (zValues) zValues[zIdx++] = zv;
                  }
                }
              }
              if (axes[0] && xMin <= xMax) { axes[0].minValue = xMin; axes[0].maxValue = xMax; }
              if (axes[1] && yMin <= yMax) { axes[1].minValue = yMin; axes[1].maxValue = yMax; }
              if (axes[2] && zMin <= zMax) {
                if (zValues && zValues.length > 1) {
                  const r = percentileRange(zValues, pLow, pHigh, pPad);
                  axes[2].minValue = r.min;
                  axes[2].maxValue = r.max;
                } else {
                  axes[2].minValue = zMin;
                  axes[2].maxValue = zMax;
                }
              }
            } else if (isHeatmapData(plotData)) {
              // Only Z axis (magnitude, index 2) is derivable from heatmap values
              // X/Y axes (time/frequency) are set from STFT parameters above
              let zCount = 0;
              if (usePercentile) {
                for (const ch of plotData.channels) {
                  const len = ch.width * ch.height;
                  for (let i = 0; i < len; i++) {
                    if (isFinite(ch.values[i])) zCount++;
                  }
                }
              }
              const zValues = usePercentile ? new Float64Array(zCount) : null;
              let zIdx = 0;
              let zMin = Infinity, zMax = -Infinity;
              for (const ch of plotData.channels) {
                const len = ch.width * ch.height;
                for (let i = 0; i < len; i++) {
                  const v = ch.values[i];
                  if (isFinite(v)) {
                    if (v < zMin) zMin = v; if (v > zMax) zMax = v;
                    if (zValues) zValues[zIdx++] = v;
                  }
                }
              }
              if (axes[2] && zMin <= zMax) {
                if (zValues && zValues.length > 1) {
                  const r = percentileRange(zValues, pLow, pHigh, pPad);
                  axes[2].minValue = r.min;
                  axes[2].maxValue = r.max;
                } else {
                  axes[2].minValue = zMin;
                  axes[2].maxValue = zMax;
                }
              }
            }
          }
        }

        // Convert dynamic settings to rendering options.
        let dynOpts: Plot2DDynamicOptions | Plot3DDynamicOptions;
        if (plotMode === '3d') {
          const ds = dynamicSettings as any;
          dynOpts = {
            zoomX: ds?.zoomX ?? 1,
            zoomY: ds?.zoomY ?? 1,
            zoomZ: ds?.zoomZ ?? 1,
            panX: ds?.panX ?? 0,
            panY: ds?.panY ?? 0,
            panZ: ds?.panZ ?? 0,
            rotationX: ds?.rotationX ?? -0.5,
            rotationY: ds?.rotationY ?? 0.5,
            rotationZ: ds?.rotationZ ?? 0,
          };
        } else {
          const dyn2d = dynamicSettings as ZoomPanDynamicSettings | undefined;
          dynOpts = {
            zoomX: dyn2d?.zoomX ?? 1,
            zoomY: dyn2d?.zoomY ?? 1,
            panX: dyn2d?.panX ?? 0,
            panY: dyn2d?.panY ?? 0,
          };
        }

        // Build or update PlotHandle for the new rendering engine
        const contextTypePref = this.globalContextType;
        let handle = this.plotHandles.get(fullKey);

        if (handle) {
          // Update existing handle with new data/options
          handle.data = plotData;
          handle.options = plotOptions;
          handle.dynamicOptions = dynOpts;
          handle.needsRender = true;
          // Ensure canvas reference is current (may change on resize)
          if (handle.canvas !== canvas) {
            handle.canvas = canvas;
            handle.context = canvas.getContext('2d');
          }
        } else {
          handle = {
            id: fullKey,
            canvas,
            context: canvas.getContext('2d'),
            contextType: contextTypePref,
            useWebGPU: false,
            data: plotData,
            theme: DEFAULT_THEME,
            options: plotOptions,
            dynamicOptions: dynOpts,
            needsRender: true,
          };
          this.plotHandles.set(fullKey, handle);

          // Auto-init GPU context for new handles
          if (contextTypePref === 'webgpu' && this.gpuDevice) {
            this.initWebGPUContext(handle).catch(() => {});
          } else if (contextTypePref === 'webgl2') {
            this.initWebGL2Context(handle);
          }
        }

        // Render using appropriate renderer
        if (contextTypePref === 'webgpu' && handle.useWebGPU && handle.webgpuContext && handle.webgpuCanvas && handle.gpuDevice) {
          this.renderWithWebGPUCompositing(handle);
        } else if (contextTypePref === 'webgl2' && handle.useWebGL2 && handle.webgl2Context && handle.webgl2Canvas) {
          this.renderWithWebGL2Compositing(handle);
        } else {
          renderCanvas2D(handle);
        }

        const response: CanvasRenderedMessage = {
          type: WorkerMessageType.CANVAS_RENDERED,
          payload: { visKey: key }
        };
        self.postMessage(response);
        return;
      } catch (err) {
        console.error('New plot engine rendering failed:', err);
        return;
      }
    }
  }

  private renderWithWebGPUCompositing(handle: PlotHandle): void {
    const webgpuCanvas = handle.webgpuCanvas as OffscreenCanvas;
    const webgpuCtx = handle.webgpuContext as GPUCanvasContext;
    const mainCanvas = handle.canvas as OffscreenCanvas;
    const mainCtx = handle.context as OffscreenCanvasRenderingContext2D;
    const device = handle.gpuDevice!;

    if (mainCanvas.width <= 0 || mainCanvas.height <= 0) {
      return;
    }

    // Ensure WebGPU canvas matches main canvas size
    if (webgpuCanvas.width !== mainCanvas.width || webgpuCanvas.height !== mainCanvas.height) {
      webgpuCanvas.width = mainCanvas.width;
      webgpuCanvas.height = mainCanvas.height;
    }

    // Configure and render via WebGPU
    const format = navigator.gpu.getPreferredCanvasFormat();
    webgpuCtx.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    });

    if (isPlot2DOptions(handle.options)) {
      renderWebGPU2D(handle, webgpuCtx, device, format);
    } else if (isPlot3DOptions(handle.options)) {
      renderWebGPU3D(handle, webgpuCtx, device, format);
    }

    // Composite WebGPU canvas to main 2D canvas
    try {
      const bitmap = webgpuCanvas.transferToImageBitmap();
      mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
      mainCtx.drawImage(bitmap, 0, 0);
      bitmap.close();
    } catch (e) {
      console.error('Failed to transfer WebGPU bitmap, falling back to 2D:', e);
      renderCanvas2D(handle);
      return;
    }

    // Draw text overlay using Canvas 2D on top of WebGPU content
    this.renderTextOverlay(handle, mainCtx);
  }

  private renderWithWebGL2Compositing(handle: PlotHandle): void {
    const webgl2Canvas = handle.webgl2Canvas as OffscreenCanvas;
    const gl = handle.webgl2Context as WebGL2RenderingContext;
    const mainCanvas = handle.canvas as OffscreenCanvas;
    const mainCtx = handle.context as OffscreenCanvasRenderingContext2D;

    // If the WebGL2 context was lost, tear down and re-create it
    if (gl.isContextLost()) {
      this.cleanupWebGL2Context(handle);
      this.initWebGL2Context(handle);
      if (!handle.useWebGL2) {
        // Re-init failed — fall back to Canvas 2D for this frame
        renderCanvas2D(handle);
        return;
      }
    }

    // Ensure WebGL2 canvas matches main canvas size
    if (webgl2Canvas.width !== mainCanvas.width || webgl2Canvas.height !== mainCanvas.height) {
      webgl2Canvas.width = mainCanvas.width;
      webgl2Canvas.height = mainCanvas.height;
    }

    if (isPlot2DOptions(handle.options)) {
      renderWebGL2_2D(handle);
    } else if (isPlot3DOptions(handle.options)) {
      renderWebGL2_3D(handle);
    }

    // Composite WebGL2 canvas to main 2D canvas
    try {
      const bitmap = webgl2Canvas.transferToImageBitmap();
      mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
      mainCtx.drawImage(bitmap, 0, 0);
      bitmap.close();
    } catch (e) {
      console.error('Failed to transfer WebGL2 bitmap, falling back to 2D:', e);
      renderCanvas2D(handle);
      return;
    }

    this.renderTextOverlay(handle, mainCtx);
  }

  private renderTextOverlay(handle: PlotHandle, ctx: OffscreenCanvasRenderingContext2D): void {
    const canvas = handle.canvas as OffscreenCanvas;
    if (!canvas) return;

    const { width, height } = canvas;
    const theme = handle.theme;
    const options = handle.options;
    const plotArea = calculatePlotArea(width, height, theme);

    // Draw title
    drawTitle(ctx as RenderingContext, options.title, width, theme);

    // Draw axes text (ticks, labels) - skip gridlines since GPU already rendered them
    if (isPlot2DOptions(options)) {
      drawAxes(ctx as RenderingContext, handle, plotArea, true /* skipGridLines */);

      // Draw heatmap color legend if applicable
      if ((options as Plot2DOptions).plotType === 'heatmap') {
        drawHeatmapLegend(ctx as RenderingContext, handle, width, height);
      }
    } else if (isPlot3DOptions(options)) {
      draw3DLabelsOverlay(ctx as RenderingContext, handle, plotArea);
    }
  }

  private sendError(message: string, stack?: string): void {
    const response: ErrorMessage = {
      type: WorkerMessageType.ERROR,
      payload: { message, stack }
    };
    
    self.postMessage(response);
  }
}

// Initialize worker
const manager = new CalculationManagerWorker();
const messageQueue: MessageEvent<WorkerMessage>[] = [];
let initialized = false;

manager.initialize().then(() => {
  initialized = true;
  // Process queued messages
  while (messageQueue.length > 0) {
    const event = messageQueue.shift()!;
    manager.handleMessage(event);
  }
});

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  if (initialized) {
    manager.handleMessage(event);
  } else {
    // Queue messages until WASM is initialized
    messageQueue.push(event);
  }
};
