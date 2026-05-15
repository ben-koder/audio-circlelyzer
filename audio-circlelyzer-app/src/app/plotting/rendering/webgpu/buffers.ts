/**
 * WebGPU Buffer Management
 */

import { WebGPUResources } from '../../types';

/**
 * Ensure GPU resources container exists
 */
export function ensureResources(resources: WebGPUResources | undefined): WebGPUResources {
  if (resources) {
    // Ensure vertexBuffers map exists
    if (!resources.vertexBuffers) {
      resources.vertexBuffers = new Map();
    }
    return resources;
  }
  return { vertexBuffers: new Map() };
}

/**
 * Create or resize a GPU buffer
 */
export function ensureBuffer(
  device: GPUDevice,
  existingBuffer: GPUBuffer | undefined,
  existingSize: number | undefined,
  requiredSize: number,
  usage: GPUBufferUsageFlags,
  label: string
): { buffer: GPUBuffer; size: number } {
  const safeRequiredSize =
    Number.isFinite(requiredSize) && requiredSize > 0 ? Math.ceil(requiredSize) : 4;

  if (existingBuffer && existingSize && existingSize >= safeRequiredSize) {
    return { buffer: existingBuffer, size: existingSize };
  }

  existingBuffer?.destroy();

  const buffer = device.createBuffer({
    size: safeRequiredSize,
    usage,
    label,
  });

  return { buffer, size: safeRequiredSize };
}

/**
 * Create a uniform buffer with initial data
 */
export function createUniformBuffer(device: GPUDevice, data: Float32Array, label: string): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label,
  });
  device.queue.writeBuffer(buffer, 0, data as Float32Array<ArrayBuffer>);
  return buffer;
}

/**
 * Create or resize depth texture
 */
export function ensureDepthTexture(
  device: GPUDevice,
  existing: GPUTexture | undefined,
  width: number,
  height: number,
  sampleCount: number = 1
): GPUTexture {
  if (existing && existing.width === width && existing.height === height) {
    return existing;
  }

  existing?.destroy();

  return device.createTexture({
    size: { width, height },
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    sampleCount,
    label: 'depth-texture',
  });
}

/**
 * Create or resize MSAA texture
 */
export function ensureMSAATexture(
  device: GPUDevice,
  existing: GPUTexture | undefined,
  width: number,
  height: number,
  format: GPUTextureFormat,
  sampleCount: number
): GPUTexture {
  if (
    existing &&
    existing.width === width &&
    existing.height === height &&
    existing.sampleCount === sampleCount
  ) {
    return existing;
  }

  existing?.destroy();

  return device.createTexture({
    size: { width, height },
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    sampleCount,
    label: 'msaa-texture',
  });
}

/**
 * Clean up all resources
 */
export function cleanupResources(resources: WebGPUResources): void {
  resources.vertexBuffer?.destroy();
  resources.gridVertexBuffer?.destroy();
  resources.gridUniformBuffer?.destroy();
  resources.grid3dVertexBuffer?.destroy();
  resources.wallFillVertexBuffer?.destroy();
  resources.indexBuffer?.destroy();
  resources.uniformBuffer?.destroy();
  resources.instanceBuffer?.destroy();
  resources.heatmapTexture?.destroy();
  resources.overlayTexture?.destroy();
  resources.depthTexture?.destroy();
  resources.msaaTexture?.destroy();
}
