/**
 * Data Types for Plot Visualization
 *
 * Typed-array-based data structures for efficient rendering.
 * Pre-allocated once per pipeline configuration, updated in-place each frame.
 */

// ── Data2D ──────────────────────────────────────────────────────────────────

export interface Data2DChannel {
  x: Float32Array;
  y: Float32Array;
  /** Number of active points (≤ x.length). Allows pre-allocating for max size. */
  length: number;
  /** Optional display label for legends and channel-aware overlays. */
  label?: string;
}

/** 2D plot data — typed arrays, pre-allocated, updated in-place */
export interface Data2D {
  channels: Data2DChannel[];
  /** Monotonically increasing counter, bumped on data update */
  generation: number;
}

// ── Data3D ──────────────────────────────────────────────────────────────────

export interface Data3DChannel {
  /** Interleaved [x0,y0,z0, x1,y1,z1, ...] — all rows concatenated */
  vertices: Float32Array;
  /** Number of rows (line strips / time frames) */
  rowCount: number;
  /** Points per row (uniform grid assumed) */
  pointsPerRow: number;
}

/** 3D plot data — typed arrays for linestrips/surfaces */
export interface Data3D {
  channels: Data3DChannel[];
  generation: number;
}

// ── HeatmapData ─────────────────────────────────────────────────────────────

export interface HeatmapChannel {
  /** Row-major values: [t0f0, t0f1, ..., t1f0, t1f1, ...] */
  values: Float32Array;
  /** Number of columns (frequency bins) */
  width: number;
  /** Number of rows (time frames) */
  height: number;
}

/** Heatmap data — single flat array per channel, row-major */
export interface HeatmapData {
  channels: HeatmapChannel[];
  generation: number;
}

// ── Union + Type Guards ─────────────────────────────────────────────────────

export type PlotData = Data2D | Data3D | HeatmapData;

export function isData2D(data: PlotData): data is Data2D {
  return 'channels' in data && data.channels.length > 0 && 'x' in data.channels[0];
}

export function isData3D(data: PlotData): data is Data3D {
  return 'channels' in data && data.channels.length > 0 && 'vertices' in data.channels[0];
}

export function isHeatmapData(data: PlotData): data is HeatmapData {
  return 'channels' in data && data.channels.length > 0 && 'values' in data.channels[0];
}

/**
 * Metadata for a single axis
 */
export interface AxisMetadata {
  /** Display name for the axis */
  name: string;
  /** Unit of measurement */
  unit: string;
  /** Optional full display label, used instead of combining name + unit. */
  label?: string;
  /** Visual range for display */
  range: { min?: number; max?: number };
  /** Whether to use logarithmic scale */
  logarithmic?: boolean;
  /** Whether to show gridlines */
  showGridlines?: boolean;
  /** Minimum data value */
  minValue: number;
  /** Maximum data value */
  maxValue: number;
  /** Whether this is a categorical axis */
  categorical?: boolean;
  /** Labels for categorical axis */
  categoryLabels?: string[];
}
