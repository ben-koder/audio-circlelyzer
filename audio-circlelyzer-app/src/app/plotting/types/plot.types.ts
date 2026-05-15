/**
 * Plot Configuration Types
 *
 * Types for configuring plot appearance and behavior.
 */

import { AxisMetadata, PlotData } from './data.types';

// =============================================================================
// Plot Type Definitions
// =============================================================================

/** 2D plot rendering modes */
export type PlotType2D = 'line' | 'bars' | 'scatter' | 'heatmap';

/** 3D plot rendering modes */
export type PlotType3D = 'surface' | 'linestrips';

/** Rendering context types */
export type ContextType = 'webgpu' | 'webgl2' | '2d';

// =============================================================================
// Theme Configuration
// =============================================================================

/**
 * Visual theme for plots
 */
export interface PlotTheme {
  backgroundColor: string;
  axisColor: string;
  gridColor: string;
  fontFamily: string;
  fontSize: number;
  titleFontSize: number;
  channelColors: string[];
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  tickLength: number;
  labelPadding: number;
}

// =============================================================================
// Plot Options
// =============================================================================

/**
 * Base plot options shared by 2D and 3D plots
 */
export interface PlotOptionsBase {
  title: string;
  contextType: ContextType;
  axesMetadata: AxisMetadata[];
}

/**
 * Options specific to 2D plots
 */
export interface Plot2DOptions extends PlotOptionsBase {
  plotType: PlotType2D;
}

/**
 * Options specific to 3D plots
 */
export interface Plot3DOptions extends PlotOptionsBase {
  plotType: PlotType3D;
  /** Enable MSAA antialiasing (default: true) */
  antialias?: boolean;
  /** MSAA sample count (default: 4) */
  msaaSamples?: 1 | 4;
}

/** Union of all plot options */
export type PlotOptions = Plot2DOptions | Plot3DOptions;

// =============================================================================
// Dynamic Options (Runtime State)
// =============================================================================

/**
 * Dynamic options for 2D plots (zoom/pan state)
 */
export interface Plot2DDynamicOptions {
  zoomX: number;
  zoomY: number;
  panX: number;
  panY: number;
}

/**
 * Dynamic options for 3D plots (zoom/pan/rotation state)
 */
export interface Plot3DDynamicOptions extends Plot2DDynamicOptions {
  zoomZ: number;
  panZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
}

/** Union of all dynamic options */
export type PlotDynamicOptions = Plot2DDynamicOptions | Plot3DDynamicOptions;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if options are for a 2D plot
 */
export function isPlot2DOptions(options: PlotOptions): options is Plot2DOptions {
  return (
    'plotType' in options &&
    ['line', 'bars', 'heatmap'].includes((options as Plot2DOptions).plotType)
  );
}

/**
 * Check if options are for a 3D plot
 */
export function isPlot3DOptions(options: PlotOptions): options is Plot3DOptions {
  return (
    'plotType' in options && ['surface', 'linestrips'].includes((options as Plot3DOptions).plotType)
  );
}

/**
 * Check if dynamic options are for a 3D plot
 */
export function is3DDynamicOptions(options: PlotDynamicOptions): options is Plot3DDynamicOptions {
  return 'rotationX' in options;
}

// =============================================================================
// Plot Handle (Internal State)
// =============================================================================

/**
 * Extended WebGPU resources for rendering
 */
export interface WebGPUResources {
  // Pipelines
  linePipeline?: GPURenderPipeline;
  gridPipeline?: GPURenderPipeline;
  grid3dPipeline?: GPURenderPipeline;
  wallFillPipeline?: GPURenderPipeline;
  barPipeline?: GPURenderPipeline;
  heatmapPipeline?: GPURenderPipeline;
  surfacePipeline?: GPURenderPipeline;
  linestripPipeline?: GPURenderPipeline;
  overlayCompositePipeline?: GPURenderPipeline;

  // Buffers
  vertexBuffer?: GPUBuffer;
  gridVertexBuffer?: GPUBuffer;
  gridUniformBuffer?: GPUBuffer;
  grid3dVertexBuffer?: GPUBuffer;
  wallFillVertexBuffer?: GPUBuffer;
  indexBuffer?: GPUBuffer;
  uniformBuffer?: GPUBuffer;
  instanceBuffer?: GPUBuffer;
  quadVertexBuffer?: GPUBuffer; // Unit quad for instanced rendering
  heatmapVertexBuffer?: GPUBuffer;
  heatmapUniformBuffer?: GPUBuffer;

  // Generic vertex buffer map for 3D rendering
  vertexBuffers: Map<string, GPUBuffer>;

  // Textures and samplers
  heatmapTexture?: GPUTexture;
  heatmapSampler?: GPUSampler;
  overlayTexture?: GPUTexture;
  overlaySampler?: GPUSampler;
  overlayBindGroup?: GPUBindGroup;
  depthTexture?: GPUTexture;
  msaaTexture?: GPUTexture;
  msaaSampleCount?: number;

  // Bind groups
  bindGroup?: GPUBindGroup;
  gridBindGroup?: GPUBindGroup;
  grid3dBindGroup?: GPUBindGroup;
  wallFillBindGroup?: GPUBindGroup;
  heatmapBindGroup?: GPUBindGroup;

  // Sizes for reuse detection
  vertexBufferSize?: number;
  gridVertexBufferSize?: number;
  grid3dVertexBufferSize?: number;
  wallFillVertexBufferSize?: number;
  indexBufferSize?: number;
  instanceBufferSize?: number;

  // Format
  canvasFormat?: GPUTextureFormat;
  currentPipelineType?: 'line' | 'bars' | 'heatmap' | 'surface' | 'linestrips';
}

// =============================================================================
// WebGL2 Resources
// =============================================================================

/**
 * Cached WebGL2 program with attribute/uniform locations
 */
export interface WebGL2Program {
  program: WebGLProgram;
  attribLocations: Record<string, number>;
  uniformLocations: Record<string, WebGLUniformLocation | null>;
}

/**
 * WebGL2 resources for rendering
 */
export interface WebGL2Resources {
  programs: Map<string, WebGL2Program>;
  vaos: Map<string, WebGLVertexArrayObject>;
  buffers: Map<string, WebGLBuffer>;
  bufferSizes: Map<string, number>;
  textures: Map<string, WebGLTexture>;
  textureSizes: Map<string, { width: number; height: number }>;
  depthRenderbuffer?: WebGLRenderbuffer;
}

/**
 * Internal handle for tracking plot state
 */
export interface PlotHandle {
  id: string;
  canvas: HTMLCanvasElement | OffscreenCanvas | null;
  overlayCanvas?: HTMLCanvasElement | OffscreenCanvas | null;
  /** Separate canvas for WebGPU rendering (composited to main canvas) */
  webgpuCanvas?: OffscreenCanvas | null;
  webgpuContext?: GPUCanvasContext | null;
  /** Separate canvas for WebGL2 rendering (composited to main canvas) */
  webgl2Canvas?: OffscreenCanvas | null;
  webgl2Context?: WebGL2RenderingContext | null;
  webgl2Resources?: WebGL2Resources;
  context: GPUCanvasContext | CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  overlayContext?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  contextType: ContextType;
  /** Whether to use WebGPU for data rendering (composited to 2D canvas) */
  useWebGPU: boolean;
  /** Whether to use WebGL2 for data rendering (composited to 2D canvas) */
  useWebGL2?: boolean;
  gpuDevice?: GPUDevice;
  gpuPipeline?: GPURenderPipeline;
  gpuVertexBuffer?: GPUBuffer;
  gpuUniformBuffer?: GPUBuffer;
  gpuBindGroup?: GPUBindGroup;
  gpuResources?: WebGPUResources;
  data: PlotData;
  theme: PlotTheme;
  options: PlotOptions;
  dynamicOptions: PlotDynamicOptions;
  needsRender: boolean;
  vertexCount?: number;
  lastDataShape?: {
    channels: number;
    pointsPerChannel: number;
    gridWidth?: number;
    gridHeight?: number;
  };
}
