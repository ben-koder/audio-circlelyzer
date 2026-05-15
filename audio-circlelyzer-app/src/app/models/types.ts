/// <reference types="@webgpu/types" />
import type { Type } from '@angular/core';
import {
  Data2D, Data3D, PlotData, HeatmapData,
  PlotType2D, PlotType3D,
  Plot2DOptions, Plot3DOptions,
  PlotTheme,
  PlotHandle,
  Plot2DDynamicOptions, Plot3DDynamicOptions,
} from '../plotting/types';

export type COMPUTATION_TYPE_ID = string;
export type VISUALIZATION_TYPE_ID = string;
export type CONTEXT_KEY = string;
export type COMPUTATION_CONTEXT_ID = string;
export type COMPUTATION_SCRIPT = string;
export type SIGNAL_ID = string;

export interface CalculationContextSettings {
  nc: number;           // Number of samples in a cycle
  n_y: number;          // Number of cycles to record
  sampleRate: number;   // Sample rate in Hz (determined by WebAudio's AudioContext, not configurable in presets)
}

// For help in visualization/plotting of result data
export interface ResultDimensionInfo {
  name: string;
  unit: string;
  ranage?: [number, number];
}

export interface CalculationType<T_Settings, T_Result> {
  id: COMPUTATION_TYPE_ID;
  name: string;
  description: string;
  initSettings(key: string, ctx: CalculationContext): T_Settings;
  initResult(key: string, ctx: CalculationContext): T_Result;
  updateResult(key: string, ctx: CalculationContext): void;
  getResultDimensions?(key: string, ctx: CalculationContext): ResultDimensionInfo[];
  getSettingsUI?(key: string, ctx: CalculationContext): Type<any>;
}


export interface VisualizationType<T_Settings> {
  id: VISUALIZATION_TYPE_ID;
  name: string;
  description: string;
  hasSimpleValue: boolean;  // true if visualization includes simple text/number values
  hasCanvas: boolean;       // true if visualization includes canvas rendering
  useWebGPU?: boolean;      // true if visualization uses WebGPU for rendering
  initSettings(key: string, ctx: CalculationContext): T_Settings;
  
  /**
   * Prepare data for visualization (transforms calculation result to visualization format)
   */
  prepareData?(data: any, ctx: CalculationContext, settings: any): any;

  // --- New Plot Engine integration ---

  /**
   * Get the plot mode for this visualization ('2d' or '3d').
   * If not defined, assumed '2d'.
   */
  getPlotMode?(): '2d' | '3d';

  /**
   * Get the PlotType for this visualization (e.g., 'line', 'bars', 'heatmap', 'surface', 'linestrips').
   * Used by the worker to route to the correct rendering pipeline.
   */
  getPlotType?(): PlotType2D | PlotType3D;

  /**
   * Build Plot2DOptions or Plot3DOptions for the new rendering engine.
   * Called by the worker to configure the plot when creating/updating the PlotHandle.
   */
  getPlotOptions?(settings: any, ctx: CalculationContext): Plot2DOptions | Plot3DOptions;

  /**
   * Allocate pre-sized plot data structure. Called once per pipeline configuration.
   * The returned structure is persistent — values are updated in-place by updatePlotData().
   */
  initPlotData?(settings: any, ctx: CalculationContext): PlotData;

  /**
   * Update values in-place into a previously-allocated PlotData structure.
   * Called each frame when currentPosition changes.
   * @param sourceData Raw calculation result (multichannel Float32Array[] or similar)
   * @param plotData The pre-allocated PlotData from initPlotData()
   * @param settings Visualization settings
   * @param ctx Calculation context
   */
  updatePlotData?(sourceData: any, plotData: PlotData, settings: any, ctx: CalculationContext): void;
  
  getVisualizationUI?(key: string, ctx: CalculationContext): Type<any>;
  getSettingsUI?(key: string, ctx: CalculationContext): Type<any>;
}



// x_c, y_c, and items register in calculationResults are concidered variables. A new method is added getVariable(). Using "getVariable" shoud be preffered over accessing calculationResults directly.
// All variables are "multichannel", i.e. arrays of Float32Array, or arrays of signle channel result type even if there is only one channel.
// In old implementation, only y_c was multichannel, x_c was single channel and calculations/operations generally worked on single channel data.
// All calculation must be updated to work on multichannel data (both input and results). Generally this means applying core calculation on a channel by channel basis.
// Some calculations have multiple inputs (e.g. FFT division needs both numerator and denominator), in this case the "core calculation" must across all inputs on a channel by channel basis. If there are not the same number of channels on all inputs, the input with highest channel count determines the number of channels in result, and other inputs with lower channel count will have their last channel duplicated to match the channel count. Inputs with fewer channel repeats channels to result channel count, fx if result n_channel = 5 and input = [c1, c2], input = [c1, c2, c1, c2, c1] is used in calculation.
// All visualization inputs are also multichannel. Visualaizations generally must show all channel results in a proper way, for example:
// - Time signal visualization shows all channels overlaid with different colors.
// - Spectrum visualization shows all channels overlaid with different colors.
// - Octave, show channel bars side by side for each band (different colors).
// In recording processor, x_c is now multichannel too, if output channel count does not match x_c channel count, channels from x_c are repeat until the number of output is reached (in a similar fashion as for inouts described above).
export interface CalculationContext {
  id: COMPUTATION_CONTEXT_ID;
  settings: CalculationContextSettings;
  x_c: Float32Array[];              // Looping signal (SharedArrayBuffer backed) - multichannel
  currentPosition: number;          // Absolute index
  selectedRange: number;            // Selected samples (offline mode)
  
  // Controlled via slider in top-bar.
  currentPositionOffset: number;    // Offset proportion of settings.nc for currentPosition (0-1 range). Converted to a number of samples that must be subtracted from currentPosition before calculations to compensate for recording misalignment.

  // Coherent multi-cycle averaging factor for `y_c`. When > 1, getVariable('y_c')
  // sums n_average consecutive cycles ending at currentPosition (modulo nc) and
  // divides by n_average. Equivalent to time-domain coherent averaging.
  nAverage?: number;

  /**
   * Global active analysis frequency range. When set, the worker computes
   * `Y_c = FFT(y_c_raw)` and zeros out frequency bins outside [low, high],
   * then exposes both `Y_c` (bandpassed spectrum) and `y_c = IFFT(Y_c)` as
   * implicit variables. `null` (or omitted) disables this implicit bandpass
   * and falls back to the raw windowed `y_c`. Driven by the top-bar dual
   * slider; defaults from preset's `defaultFrequencyRange`.
   */
  activeFrequencyRange?: { low: number; high: number } | null;

  calculationSettings: Map<CONTEXT_KEY, any>;
  calculationResults: Map<CONTEXT_KEY, any[]>;  // Values or SharedArrayBuffer views, channel by channel - multichannel

  getVariable(key: CONTEXT_KEY | 'x_c' | 'y_c' | 'Y_c'): any[];  // Returns multichannel array (y_c is bandpassed when activeFrequencyRange is set; Y_c = bandpassed FFT)
  
  // Raw access to circular shared buffer (length = nc * n_y). Use for extended reads (e.g., INPUTN).
  // Returns undefined if not available (interface-only contexts).
  getCircularBufferChannel?(channel: number): Float32Array | undefined;
  channelCount: number;             // Number of audio channels
  
  visualizations: Map<CONTEXT_KEY, VISUALIZATION_TYPE_ID>;
  visualizationSettings: Map<CONTEXT_KEY, any>;
  visualizationDynamicSettings: Map<CONTEXT_KEY, any>;
  visualizationCanvases?: Map<CONTEXT_KEY, OffscreenCanvas>;  // Worker only
  currentPositionBuffer?: Int32Array;  // For Atomics (Worker only)
  
  getOperationsOrder(): CONTEXT_KEY[];
  getDependencies?(key: CONTEXT_KEY): CONTEXT_KEY[];
}

export interface VisualizationLayoutElement {
  type: 'node' | 'leaf';
}

export interface VisualizationLayoutNode extends VisualizationLayoutElement {
  type: 'node';
  split: 'h' | 'v';     // Horizontal or vertical split
  splitPos: number;      // 0.0 to 100.0
  children: [VisualizationLayoutElement, VisualizationLayoutElement];
}

export interface VisualizationLayoutLeaf extends VisualizationLayoutElement {
  type: 'leaf';
  visID: CONTEXT_KEY;   // Reference to visualization in context
}

export interface VisualizationLayoutTree {
  root: VisualizationLayoutElement;
}

export interface CalculationContextDefinition {
  id: COMPUTATION_CONTEXT_ID;
  name: string;
  description: string;
  script: COMPUTATION_SCRIPT;
  settings: CalculationContextSettings;
  layout?: VisualizationLayoutTree;
}

export interface SignalGenerator {
  id: SIGNAL_ID;
  name: string;
  description: string;
  generate(len: number, sampleRate: number): Float32Array;
}

// Complex number representation
export interface ComplexSpectrum {
  re: Float32Array;
  im: Float32Array;
}

// Octave filter result
export interface OctaveFilterResult {
  frequencies: number[];
  rmsValues: Float32Array;
  mode: 'full' | 'third';
}

// Calculation operation parsed from script
export interface CalculationOperation {
  key: CONTEXT_KEY;
  operationType: COMPUTATION_TYPE_ID | VISUALIZATION_TYPE_ID;
  args: CONTEXT_KEY[];
  isVisualization: boolean;
}

// Legacy RT60 result structure (for backward compatibility)
export interface RT60Result {
  rt60: number;
  coefficients: Float32Array;
  timeAxis: Float32Array;
  decayCurve: Float32Array;
}

// Decay measurement with quality metrics (ISO 3382)
export interface DecayMeasurement {
  value: number;           // Decay time in seconds
  slope: number;           // Regression slope (dB/s)
  intercept: number;       // Regression intercept (dB)
  correlation: number;     // Pearson correlation coefficient (r)
  startIdx: number;        // Start index for fit
  endIdx: number;          // End index for fit
  isReliable: boolean;     // Based on correlation and dynamic range
}

// Comprehensive RT60 result per ISO 3382
export interface RT60FullResult {
  // Decay times
  edt: DecayMeasurement;    // Early Decay Time (0 to -10 dB)
  t20: DecayMeasurement;    // T20: -5 to -25 dB
  t30: DecayMeasurement;    // T30: -5 to -35 dB
  topt: DecayMeasurement;   // Optimal range for best linear fit
  
  // Clarity and definition metrics
  c50: number;              // Clarity C50 (50ms cutoff) in dB
  c80: number;              // Clarity C80 (80ms cutoff) in dB
  d50: number;              // Definition D50 as percentage
  ts: number;               // Center Time in seconds
  curvature: number;        // 100 * |T30/T20 - 1|
  
  // Decay curve data
  decayCurve: Float32Array; // Schroeder decay curve in dB
  timeAxis: Float32Array;   // Time axis in seconds
  noiseFloor: number;       // Detected noise floor in dB
}

// Dynamic zoom/pan settings
export interface ZoomPanDynamicSettings {
  referenceRange?: { xMin: number; xMax: number; yMin: number; yMax: number };
  captureReferenceRangeX?: boolean;  // Request worker to capture current X range
  captureReferenceRangeY?: boolean;  // Request worker to capture current Y range
  zoomX?: number;  // Zoom factor (min 1, undefined = no zoom)
  zoomY?: number;  // Zoom factor (min 1, undefined = no zoom)
  panX?: number;  // Pan offset (0-1 range within zoomed view)
  panY?: number;  // Pan offset (0-1 range within zoomed view)
}

// Visualization settings interfaces
export interface RangeSettings {
  min: number | undefined; // "undefined", means autoscale
  max: number | undefined; // "undefined", means autoscale
}

export interface AxisSettings {
  range: RangeSettings;
  showGridLines: boolean;
}

export interface AxisSettingsWithLog extends AxisSettings {
  logarithmic: boolean;
}

export type VisualizationChannelInfo = string | string[] | Record<string, string>;

export interface VisualizationPresentationSettings {
  title?: string;
  description?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  zAxisLabel?: string;
  xAxisCategories?: string[];
  channelInfo?: VisualizationChannelInfo;
}

export interface SpectrumVisualizationSettings extends VisualizationPresentationSettings {
  xAxisSettings: AxisSettingsWithLog;
  yAxisSettings: AxisSettings;
}

export interface TimeSigVisualizationSettings extends VisualizationPresentationSettings {
  xAxisSettings: AxisSettings;
  yAxisSettings: AxisSettings;
}

export interface OctaveVisualizationSettings extends VisualizationPresentationSettings {
  xAxisSettings: AxisSettings;
  yAxisSettings: AxisSettings;
}

export type RT60Metric = 'edt' | 't20' | 't30' | 'topt';

export interface RT60VisualizationSettings extends VisualizationPresentationSettings {
  xAxisSettings: AxisSettings;
  yAxisSettings: AxisSettings;
  /**
   * Which decay metrics to overlay as regression lines.
   * Any combination of EDT, T20, T30, T-opt may be selected.
   */
  showMetrics: RT60Metric[];
  showRegressionLines: boolean;                 // Show regression lines on decay curve
  showDataTable: boolean;                       // Show tabular data
}

export interface ChannelSumSettings {
  channelSums: number[][];
}

// Octave filter settings
export interface OctaveFilterSettings {
  mode: 'full' | 'third';
}

// RT60 calculation settings (updated for full ISO 3382)
export interface RT60Settings {
  mode: 'legacy' | 'full';         // Legacy (simple) or full ISO 3382
  startDb: number;                  // For legacy mode: start dB
  endDb: number;                    // For legacy mode: end dB
}

// Bandpass filter settings
export interface BandpassSettings {
  lowFreq: number | null;           // Lower cutoff frequency (null = no low cut)
  highFreq: number | null;          // Upper cutoff frequency (null = no high cut)
  smooth: boolean;                  // Use smooth Butterworth-like rolloff
  order: number;                    // Filter order for smooth mode (2-8)
}

// Expand calculation settings (for unrolling impulse responses)
export interface ExpandSettings {
  expandFactor: number;             // Expansion factor (integer >= 1)
}

// Compact calculation settings (opposite of expand - keeps every nth element)
export interface CompactSettings {
  compactFactor: number;            // Compact factor (integer >= 1)
  compactOffset?: number;           // Scalar offset applied to all channels before sampling
  channelOffsets?: number[];        // Per-channel offsets used when deinterleaving multi-source spectra
  outputChannelCount?: number;      // Optional explicit output channel count when duplicating a source recording per extracted source
  channelOffsetMode?: 'per_channel' | 'cross_product'; // Whether offsets map 1:1 to outputs or expand every input channel across all offsets
}

// INPUTN calculation settings (reads extended recording buffer)
export interface InputNSettings {
  n: number;                        // Multiplier for buffer length (integer >= 1)
}

// Noise floor estimation settings (uses off-bins from multi-cycle recording)
export interface NoisefloorSettings {
  compactFactor: number;            // Same M used for COMPACT — determines signal vs off-bins
}

// Wiener-regularized division settings (used when DIVIDE has 3 inputs)
export interface WienerDivideSettings {
  alpha: number;                    // Oversubtraction factor (default 1.0)
  spectralFloor: number;            // Minimum gain in dB (default -80)
  gamma: number;                    // Denominator regularization coefficient (default 0.01)
}

// STFT visualization settings
export interface STFTVisualizationSettings extends VisualizationPresentationSettings {
  fftSize: number;                  // Size of each FFT window
  overlap: boolean;                 // If true, windows overlap by 50%
  xAxisSettings: AxisSettings;      // Time axis
  yAxisSettings: AxisSettingsWithLog; // Frequency axis (can be logarithmic)
  zAxisSettings: AxisSettings;      // Magnitude (dB) axis
}

// TRACE calculation settings
export interface TraceSettings {
  nTrace: number;                   // Number of traces to keep in history
}

// TRACE visualization settings
export interface TraceVisualizationSettings extends VisualizationPresentationSettings {
  xAxisSettings: AxisSettingsWithLog; // X axis of input 2D data (e.g., frequency)
  yAxisSettings: AxisSettings;      // Trace index axis
  zAxisSettings: AxisSettings;      // Z axis (value from input, e.g., dB)
  resample?: boolean;               // If true, resample for performance (default: false)
  fill?: boolean;                   // If true, fill under curves (default: false)
}

// Application mode
export type AppMode = 'online' | 'offline';

// Layout definition that can be saved/loaded
export interface LayoutDefinition {
  id: string;
  name: string;
  tree: VisualizationLayoutTree;
}
