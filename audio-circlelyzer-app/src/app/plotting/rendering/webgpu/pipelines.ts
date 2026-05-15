/**
 * WebGPU Pipeline Management
 */

import { PlotHandle, WebGPUResources } from '../../types';
import {
  LINE_SHADER,
  BAR_SHADER,
  HEATMAP_SHADER,
  GRID_SHADER,
} from './shaders/2d.wgsl';
import {
  SURFACE_SHADER,
  LINESTRIP_SHADER,
  WALL_SHADER,
  GRID_3D_SHADER,
  OVERLAY_COMPOSITE_SHADER,
} from './shaders/3d.wgsl';

export type PipelineType =
  | 'line'
  | 'bar'
  | 'heatmap'
  | 'grid'
  | 'surface'
  | 'linestrip'
  | 'wall'
  | 'grid3d'
  | 'overlayComposite';

const pipelineCache = new Map<string, GPURenderPipeline>();

/**
 * Get or create a render pipeline
 */
export function ensurePipeline(
  device: GPUDevice,
  type: PipelineType,
  format: GPUTextureFormat,
  sampleCount: number = 1
): GPURenderPipeline {
  const cacheKey = `${type}-${format}-${sampleCount}`;

  if (pipelineCache.has(cacheKey)) {
    return pipelineCache.get(cacheKey)!;
  }

  const pipeline = createPipeline(device, type, format, sampleCount);
  pipelineCache.set(cacheKey, pipeline);
  return pipeline;
}

function createPipeline(
  device: GPUDevice,
  type: PipelineType,
  format: GPUTextureFormat,
  sampleCount: number
): GPURenderPipeline {
  switch (type) {
    case 'line':
      return createLinePipeline(device, format, sampleCount);
    case 'bar':
      return createBarPipeline(device, format, sampleCount);
    case 'heatmap':
      return createHeatmapPipeline(device, format, sampleCount);
    case 'grid':
      return createGridPipeline(device, format, sampleCount);
    case 'surface':
      return createSurfacePipeline(device, format, sampleCount);
    case 'linestrip':
      return createLinestripPipeline(device, format, sampleCount);
    case 'wall':
      return createWallPipeline(device, format, sampleCount);
    case 'grid3d':
      return createGrid3DPipeline(device, format, sampleCount);
    case 'overlayComposite':
      return createOverlayCompositePipeline(device, format);
    default:
      throw new Error(`Unknown pipeline type: ${type}`);
  }
}

function createLinePipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  sampleCount: number
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: LINE_SHADER });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 24, // 2 floats position + 4 floats color
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: { topology: 'line-strip' },
    multisample: { count: sampleCount },
  });
}

function createBarPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  sampleCount: number
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: BAR_SHADER });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          // Per-vertex: corner position
          arrayStride: 8,
          stepMode: 'vertex',
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
        },
        {
          // Per-instance: bar rect + color
          arrayStride: 32,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x4' }, // barRect
            { shaderLocation: 2, offset: 16, format: 'float32x4' }, // color
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-strip' },
    multisample: { count: sampleCount },
  });
}

function createHeatmapPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  sampleCount: number
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: HEATMAP_SHADER });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 16, // 2 floats position + 2 floats texCoord
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
    multisample: { count: sampleCount },
  });
}

function createGridPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  sampleCount: number
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: GRID_SHADER });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: { topology: 'line-list' },
    multisample: { count: sampleCount },
  });
}

function createSurfacePipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  sampleCount: number
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: SURFACE_SHADER });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 40, // 3 floats position + 3 floats normal + 4 floats color
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: { count: sampleCount },
  });
}

function createLinestripPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  sampleCount: number
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: LINESTRIP_SHADER });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 28, // 3 floats position + 4 floats color
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: { topology: 'line-strip' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: { count: sampleCount },
  });
}

function createWallPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  sampleCount: number
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: WALL_SHADER });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 28,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{
        format,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: false, // Don't write depth for transparent walls
      depthCompare: 'less',
    },
    multisample: { count: sampleCount },
  });
}

function createGrid3DPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  sampleCount: number
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: GRID_3D_SHADER });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
      buffers: [
        {
          arrayStride: 28,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: { topology: 'line-list' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: { count: sampleCount },
  });
}

function createOverlayCompositePipeline(
  device: GPUDevice,
  format: GPUTextureFormat
): GPURenderPipeline {
  const shaderModule = device.createShaderModule({ code: OVERLAY_COMPOSITE_SHADER });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertexMain',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragmentMain',
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-strip' },
  });
}

/**
 * Create bind group for overlay compositing
 */
export function createOverlayBindGroup(
  device: GPUDevice,
  pipeline: GPURenderPipeline,
  texture: GPUTexture,
  sampler: GPUSampler
): GPUBindGroup {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: texture.createView() },
      { binding: 1, resource: sampler },
    ],
  });
}
