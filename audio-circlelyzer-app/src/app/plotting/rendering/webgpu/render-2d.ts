/// <reference types="@webgpu/types" />

/**
 * WebGPU 2D Rendering
 *
 * Renders 2D plot data (lines, bars, heatmaps) using WebGPU.
 * This is designed to be used with the compositing approach:
 * - Render to a separate WebGPU canvas
 * - Transfer to ImageBitmap
 * - Composite to main 2D canvas with text overlay
 */

import {
  PlotHandle,
  Plot2DOptions,
  Data2D,
  HeatmapData,
  WebGPUResources,
  isPlot2DOptions,
} from '../../types';
import { ensurePipeline } from './pipelines';
import { ensureBuffer, ensureResources } from './buffers';
import { hexToRgba, calculatePlotArea, calculateNiceTicks, PlotArea, getAxisRange, computeVisibleRange } from '../../utils';

// =============================================================================
// Types
// =============================================================================

interface LineVertexData {
  vertices: Float32Array;
  vertexCount: number;
  stripLengths: number[];
}

interface BarInstanceData {
  instances: Float32Array;
  instanceCount: number;
}

interface PlotScissor {
  x: number;
  y: number;
  width: number;
  height: number;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Render 2D plot content using WebGPU
 * Does not render text - that's handled by the 2D canvas overlay
 */
export function renderWebGPU2D(
  handle: PlotHandle,
  ctx: GPUCanvasContext,
  device: GPUDevice,
  format: GPUTextureFormat
): void {
  const options = handle.options;
  if (!isPlot2DOptions(options)) return;

  const canvas = handle.webgpuCanvas || handle.canvas;
  if (!canvas) return;

  const canvasWidth = Math.floor(canvas.width);
  const canvasHeight = Math.floor(canvas.height);
  if (
    !Number.isFinite(canvasWidth) ||
    !Number.isFinite(canvasHeight) ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return;
  }

  const bgColor = hexToRgba(handle.theme.backgroundColor);
  const plotArea = calculatePlotArea(canvasWidth, canvasHeight, handle.theme);
  const plotScissor = computePlotScissor(plotArea, canvasWidth, canvasHeight);

  // Initialize resources if needed
  if (!handle.gpuResources) {
    handle.gpuResources = ensureResources(handle.gpuResources);
  }

  // Begin render pass
  const commandEncoder = device.createCommandEncoder();
  const textureView = ctx.getCurrentTexture().createView();

  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: bgColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  if (!plotScissor) {
    renderPass.end();
    device.queue.submit([commandEncoder.finish()]);
    return;
  }

  // Set scissor to plot area for clipping
  renderPass.setScissorRect(
    plotScissor.x,
    plotScissor.y,
    plotScissor.width,
    plotScissor.height
  );

  // Render grid lines first
  renderGridLines(handle, device, renderPass, format, plotArea);

  // Render data based on plot type
  switch (options.plotType) {
    case 'line':
      renderLines(handle, device, renderPass, format, plotArea);
      break;
    case 'bars':
      renderBars(handle, device, renderPass, format, plotArea);
      break;
    case 'heatmap':
      renderHeatmap(handle, device, renderPass, format, plotArea);
      break;
  }

  renderPass.end();
  device.queue.submit([commandEncoder.finish()]);
}

function computePlotScissor(
  plotArea: PlotArea,
  canvasWidth: number,
  canvasHeight: number
): PlotScissor | null {
  const right = plotArea.left + plotArea.width;
  const bottom = plotArea.top + plotArea.height;
  if (![plotArea.left, plotArea.top, right, bottom].every(Number.isFinite)) {
    return null;
  }

  const x = Math.max(0, Math.min(canvasWidth, Math.floor(plotArea.left)));
  const y = Math.max(0, Math.min(canvasHeight, Math.floor(plotArea.top)));
  const scissorRight = Math.max(0, Math.min(canvasWidth, Math.ceil(right)));
  const scissorBottom = Math.max(0, Math.min(canvasHeight, Math.ceil(bottom)));
  const width = scissorRight - x;
  const height = scissorBottom - y;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

// =============================================================================
// Grid Lines
// =============================================================================

// Per-handle render cache to prevent cache thrashing between plots
interface GpuRenderCache {
  gridZoomX: number; gridZoomY: number; gridPanX: number; gridPanY: number;
  gridVertexCount: number; gridVertices: Float32Array;
  lineGeneration: number; lineStripLengths: number[]; lineTotalVertices: number;
  barGeneration: number; barZoomX: number; barZoomY: number; barPanX: number; barPanY: number;
  barInstanceData: Float32Array; barInstanceCount: number;
  heatmapGeneration: number; heatmapTextureData: HeatmapTextureData | null;
}

const gpuRenderCaches = new Map<string, GpuRenderCache>();

function getGpuCache(handleId: string): GpuRenderCache {
  let cache = gpuRenderCaches.get(handleId);
  if (!cache) {
    cache = {
      gridZoomX: NaN, gridZoomY: NaN, gridPanX: NaN, gridPanY: NaN,
      gridVertexCount: 0, gridVertices: new Float32Array(0),
      lineGeneration: -1, lineStripLengths: [], lineTotalVertices: 0,
      barGeneration: -1, barZoomX: NaN, barZoomY: NaN, barPanX: NaN, barPanY: NaN,
      barInstanceData: new Float32Array(0), barInstanceCount: 0,
      heatmapGeneration: -1, heatmapTextureData: null,
    };
    gpuRenderCaches.set(handleId, cache);
  }
  return cache;
}

function renderGridLines(
  handle: PlotHandle,
  device: GPUDevice,
  renderPass: GPURenderPassEncoder,
  format: GPUTextureFormat,
  plotArea: PlotArea
): void {
  const options = handle.options as Plot2DOptions;
  const dynOpts = handle.dynamicOptions;
  const theme = handle.theme;
  const resources = handle.gpuResources!;
  const cache = getGpuCache(handle.id);

  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];
  if (!xAxis || !yAxis) return;

  // Check if any gridlines should be shown
  const showXGridlines = xAxis.showGridlines !== false;
  const showYGridlines = yAxis.showGridlines !== false;
  if (!showXGridlines && !showYGridlines) return;

  // Only rebuild grid vertices when zoom/pan changes
  const viewChanged = dynOpts.zoomX !== cache.gridZoomX || dynOpts.zoomY !== cache.gridZoomY ||
    dynOpts.panX !== cache.gridPanX || dynOpts.panY !== cache.gridPanY;

  if (viewChanged) {
    cache.gridZoomX = dynOpts.zoomX;
    cache.gridZoomY = dynOpts.zoomY;
    cache.gridPanX = dynOpts.panX;
    cache.gridPanY = dynOpts.panY;

    // Calculate visible ranges using the same log-aware mapping as Canvas2D.
    const { min: xMin, max: xMax } = getAxisRange(xAxis);
    const { visibleMin: xVisibleMin, visibleMax: xVisibleMax } = computeVisibleRange(
      xMin, xMax, dynOpts.zoomX, dynOpts.panX, xAxis.logarithmic || false
    );

    const { min: yMin, max: yMax } = getAxisRange(yAxis);
    const { visibleMin: yVisibleMin, visibleMax: yVisibleMax } = computeVisibleRange(
      yMin, yMax, dynOpts.zoomY, dynOpts.panY, yAxis.logarithmic || false
    );

    // Get ticks
    const xTicks = calculateNiceTicks(xVisibleMin, xVisibleMax, 5, xAxis.logarithmic || false);
    const yTicks = calculateNiceTicks(yVisibleMin, yVisibleMax, 5, yAxis.logarithmic || false);

    // Build grid vertices
    const gridColor = hexToRgba(theme.gridColor);

    const maxVertices = (xTicks.values.length + yTicks.values.length) * 2;
    if (cache.gridVertices.length < maxVertices * 6) {
      cache.gridVertices = new Float32Array(maxVertices * 6);
    }
    let writeIdx = 0;

    if (showXGridlines) {
      for (const value of xTicks.values) {
        const xNorm = xAxis.logarithmic
          ? (Math.log10(Math.max(value, 1e-10)) - Math.log10(Math.max(xVisibleMin, 1e-10))) /
            (Math.log10(Math.max(xVisibleMax, 1e-10)) - Math.log10(Math.max(xVisibleMin, 1e-10))) * 2 - 1
          : ((value - xVisibleMin) / (xVisibleMax - xVisibleMin)) * 2 - 1;
        if (xNorm < -1 || xNorm > 1) continue;
        cache.gridVertices[writeIdx++] = xNorm; cache.gridVertices[writeIdx++] = -1;
        cache.gridVertices[writeIdx++] = gridColor.r; cache.gridVertices[writeIdx++] = gridColor.g;
        cache.gridVertices[writeIdx++] = gridColor.b; cache.gridVertices[writeIdx++] = gridColor.a;
        cache.gridVertices[writeIdx++] = xNorm; cache.gridVertices[writeIdx++] = 1;
        cache.gridVertices[writeIdx++] = gridColor.r; cache.gridVertices[writeIdx++] = gridColor.g;
        cache.gridVertices[writeIdx++] = gridColor.b; cache.gridVertices[writeIdx++] = gridColor.a;
      }
    }

    if (showYGridlines) {
      for (const value of yTicks.values) {
        const yNorm = yAxis.logarithmic
          ? (Math.log10(Math.max(value, 1e-10)) - Math.log10(Math.max(yVisibleMin, 1e-10))) /
            (Math.log10(Math.max(yVisibleMax, 1e-10)) - Math.log10(Math.max(yVisibleMin, 1e-10))) * 2 - 1
          : ((value - yVisibleMin) / (yVisibleMax - yVisibleMin)) * 2 - 1;
        if (yNorm < -1 || yNorm > 1) continue;
        cache.gridVertices[writeIdx++] = -1; cache.gridVertices[writeIdx++] = yNorm;
        cache.gridVertices[writeIdx++] = gridColor.r; cache.gridVertices[writeIdx++] = gridColor.g;
        cache.gridVertices[writeIdx++] = gridColor.b; cache.gridVertices[writeIdx++] = gridColor.a;
        cache.gridVertices[writeIdx++] = 1; cache.gridVertices[writeIdx++] = yNorm;
        cache.gridVertices[writeIdx++] = gridColor.r; cache.gridVertices[writeIdx++] = gridColor.g;
        cache.gridVertices[writeIdx++] = gridColor.b; cache.gridVertices[writeIdx++] = gridColor.a;
      }
    }

    cache.gridVertexCount = writeIdx / 6;

    if (cache.gridVertexCount === 0) return;

    // Upload to GPU
    const { buffer: gridBuffer, size } = ensureBuffer(
      device,
      resources.gridVertexBuffer,
      resources.gridVertexBufferSize,
      writeIdx * 4,
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      'grid-vertex-buffer'
    );
    resources.gridVertexBuffer = gridBuffer;
    resources.gridVertexBufferSize = size;

    device.queue.writeBuffer(gridBuffer, 0, cache.gridVertices.subarray(0, writeIdx) as Float32Array<ArrayBuffer>);
  }

  if (cache.gridVertexCount === 0) return;
  if (!resources.gridVertexBuffer) return;

  // Create uniform buffer for grid
  const uniforms = buildGridUniforms(handle, plotArea);
  if (!resources.gridUniformBuffer) {
    resources.gridUniformBuffer = device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'grid-uniform-buffer',
    });
  }
  device.queue.writeBuffer(resources.gridUniformBuffer, 0, uniforms.buffer as ArrayBuffer, uniforms.byteOffset, uniforms.byteLength);

  // Get or create grid pipeline
  const pipeline = ensurePipeline(device, 'grid', format);

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: resources.gridUniformBuffer } }],
  });

  // Draw
  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, resources.gridVertexBuffer);
  renderPass.draw(cache.gridVertexCount);
}

// =============================================================================
// Line Rendering
// =============================================================================

function renderLines(
  handle: PlotHandle,
  device: GPUDevice,
  renderPass: GPURenderPassEncoder,
  format: GPUTextureFormat,
  plotArea: PlotArea
): void {
  const data = handle.data as Data2D;
  if (!data || data.channels.length === 0) return;

  const theme = handle.theme;
  const resources = handle.gpuResources!;
  const cache = getGpuCache(handle.id);

  // Only rebuild vertex buffer when data generation changes
  if (data.generation !== cache.lineGeneration) {
    cache.lineGeneration = data.generation;

    // Count total points for pre-allocation
    let totalPoints = 0;
    for (let ch = 0; ch < data.channels.length; ch++) {
      totalPoints += data.channels[ch].length;
    }

    if (totalPoints === 0) {
      cache.lineStripLengths = [];
      cache.lineTotalVertices = 0;
      return;
    }

    // Pre-allocate typed array: 6 floats per vertex (x, y, r, g, b, a)
    const vertices = new Float32Array(totalPoints * 6);
    const stripLengths: number[] = [];
    let writeIdx = 0;

    for (let ch = 0; ch < data.channels.length; ch++) {
      const channel = data.channels[ch];
      const color = hexToRgba(theme.channelColors[ch % theme.channelColors.length]);

      for (let i = 0; i < channel.length; i++) {
        // Upload raw data coordinates — shader handles normalization
        vertices[writeIdx++] = channel.x[i];
        vertices[writeIdx++] = channel.y[i];
        vertices[writeIdx++] = color.r;
        vertices[writeIdx++] = color.g;
        vertices[writeIdx++] = color.b;
        vertices[writeIdx++] = color.a;
      }

      stripLengths.push(channel.length);
    }

    cache.lineStripLengths = stripLengths;
    cache.lineTotalVertices = totalPoints;

    // Ensure vertex buffer
    const { buffer: vertexBuffer, size } = ensureBuffer(
      device,
      resources.vertexBuffer,
      resources.vertexBufferSize,
      vertices.byteLength,
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      'line-vertex-buffer'
    );
    resources.vertexBuffer = vertexBuffer;
    resources.vertexBufferSize = size;

    device.queue.writeBuffer(vertexBuffer, 0, vertices);
  }

  if (cache.lineTotalVertices === 0) return;
  if (!resources.vertexBuffer) return;

  // Update uniforms — only these change on zoom/pan (cheap)
  const uniforms = buildLineUniforms(handle, plotArea);
  if (!resources.uniformBuffer) {
    resources.uniformBuffer = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'line-uniform-buffer',
    });
  }
  device.queue.writeBuffer(resources.uniformBuffer, 0, uniforms.buffer as ArrayBuffer, uniforms.byteOffset, uniforms.byteLength);

  // Get pipeline
  const pipeline = ensurePipeline(device, 'line', format);

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: resources.uniformBuffer } }],
  });

  // Draw each channel as separate line strip
  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, resources.vertexBuffer);

  let offset = 0;
  for (const stripLength of cache.lineStripLengths) {
    if (stripLength > 1) {
      renderPass.draw(stripLength, 1, offset, 0);
    }
    offset += stripLength;
  }
}

// =============================================================================
// Bar Rendering
// =============================================================================

// Static quad vertices (never changes)
const GPU_BAR_QUAD_VERTICES = new Float32Array([
  0, 0, // bottom-left
  1, 0, // bottom-right
  0, 1, // top-left
  1, 1, // top-right
]);

function renderBars(
  handle: PlotHandle,
  device: GPUDevice,
  renderPass: GPURenderPassEncoder,
  format: GPUTextureFormat,
  plotArea: PlotArea
): void {
  const data = handle.data as Data2D;
  if (!data || data.channels.length === 0) return;

  const options = handle.options as Plot2DOptions;
  const dynOpts = handle.dynamicOptions;
  const theme = handle.theme;
  const resources = handle.gpuResources!;
  const cache = getGpuCache(handle.id);

  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];
  if (!xAxis || !yAxis) return;

  // Only rebuild instance data when data or view changes
  const dataChanged = data.generation !== cache.barGeneration;
  const viewChanged = dynOpts.zoomX !== cache.barZoomX || dynOpts.zoomY !== cache.barZoomY ||
    dynOpts.panX !== cache.barPanX || dynOpts.panY !== cache.barPanY;

  if (dataChanged || viewChanged) {
    cache.barGeneration = data.generation;
    cache.barZoomX = dynOpts.zoomX;
    cache.barZoomY = dynOpts.zoomY;
    cache.barPanX = dynOpts.panX;
    cache.barPanY = dynOpts.panY;

    const { min: xMin, max: xMax } = getAxisRange(xAxis);
    const { visibleMin: xVisibleMin, visibleMax: xVisibleMax } = computeVisibleRange(
      xMin, xMax, dynOpts.zoomX, dynOpts.panX, xAxis.logarithmic || false
    );

    const { min: yMin, max: yMax } = getAxisRange(yAxis);
    const { visibleMin: yVisibleMin, visibleMax: yVisibleMax } = computeVisibleRange(
      yMin, yMax, dynOpts.zoomY, dynOpts.panY, yAxis.logarithmic || false
    );

    const isCategorical = !!(xAxis as any)?.categorical;
    const numChannels = data.channels.length;
    const numBars = data.channels[0]?.length || 0;
    if (numBars === 0) { cache.barInstanceCount = 0; return; }

    // Calculate bar dimensions in normalized space
    const slotWidth = isCategorical ? 2 / numBars : 2 / (numBars * 1.5);
    const barGroupWidth = slotWidth * 0.8;
    const barWidth = barGroupWidth / numChannels;
    const barGap = barWidth * 0.1;

    // Pre-allocate or reuse Float32Array
    const totalInstances = numChannels * numBars;
    const requiredSize = totalInstances * 8;
    if (cache.barInstanceData.length < requiredSize) {
      cache.barInstanceData = new Float32Array(requiredSize);
    }
    let writeIdx = 0;

    for (let ch = 0; ch < numChannels; ch++) {
      const channel = data.channels[ch];
      const color = hexToRgba(theme.channelColors[ch % theme.channelColors.length]);

      for (let i = 0; i < channel.length; i++) {
        const x = channel.x[i];
        const y = channel.y[i];

        // X position normalized - categorical uses index-based even spacing
        const xNorm = isCategorical
          ? ((i + 0.5) / numBars) * 2 - 1
          : ((x - xVisibleMin) / (xVisibleMax - xVisibleMin)) * 2 - 1;
        const barX = xNorm - barGroupWidth / 2 + ch * barWidth + barGap / 2;

        // Y position: bar extends from bottom (-1) to data value
        const yNorm = ((y - yVisibleMin) / (yVisibleMax - yVisibleMin)) * 2 - 1;
        const barHeight = yNorm - (-1);

        // Instance: barRect (x, y, width, height), color (r, g, b, a)
        cache.barInstanceData[writeIdx++] = barX;
        cache.barInstanceData[writeIdx++] = -1;
        cache.barInstanceData[writeIdx++] = barWidth - barGap;
        cache.barInstanceData[writeIdx++] = barHeight;
        cache.barInstanceData[writeIdx++] = color.r;
        cache.barInstanceData[writeIdx++] = color.g;
        cache.barInstanceData[writeIdx++] = color.b;
        cache.barInstanceData[writeIdx++] = color.a;
      }
    }

    cache.barInstanceCount = writeIdx / 8;

    if (cache.barInstanceCount === 0) return;

    // Upload instance data to GPU
    const { buffer: instanceBuffer, size } = ensureBuffer(
      device,
      resources.instanceBuffer,
      resources.instanceBufferSize,
      writeIdx * 4,
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      'bar-instance-buffer'
    );
    resources.instanceBuffer = instanceBuffer;
    resources.instanceBufferSize = size;

    device.queue.writeBuffer(instanceBuffer, 0, cache.barInstanceData.subarray(0, writeIdx) as Float32Array<ArrayBuffer>);
  }

  if (cache.barInstanceCount === 0) return;
  if (!resources.instanceBuffer) return;

  const instanceCount = cache.barInstanceCount;

  // Ensure quad vertex buffer (static, created once)
  if (!resources.quadVertexBuffer) {
    resources.quadVertexBuffer = device.createBuffer({
      size: GPU_BAR_QUAD_VERTICES.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'quad-vertex-buffer',
    });
    device.queue.writeBuffer(resources.quadVertexBuffer, 0, GPU_BAR_QUAD_VERTICES);
  }

  // Uniform buffer (bar shader uses identity transform layout)
  const uniforms = buildIdentityTransformUniforms(handle, plotArea);
  if (!resources.uniformBuffer) {
    resources.uniformBuffer = device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'bar-uniform-buffer',
    });
  }
  device.queue.writeBuffer(resources.uniformBuffer, 0, uniforms.buffer as ArrayBuffer, uniforms.byteOffset, uniforms.byteLength);

  // Get pipeline
  const pipeline = ensurePipeline(device, 'bar', format);

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: resources.uniformBuffer } }],
  });

  // Draw instanced quads (4 vertices for triangle-strip)
  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, resources.quadVertexBuffer);
  renderPass.setVertexBuffer(1, resources.instanceBuffer);
  renderPass.draw(4, instanceCount); // 4 vertices per quad (triangle-strip), instanceCount instances
}

// =============================================================================
// Heatmap Rendering
// =============================================================================

// Static heatmap quad vertices (never changes)
const GPU_HEATMAP_QUAD_VERTICES = new Float32Array([
  // Triangle 1
  -1, -1, 0, 1,
  1, -1, 1, 1,
  -1, 1, 0, 0,
  // Triangle 2
  -1, 1, 0, 0,
  1, -1, 1, 1,
  1, 1, 1, 0,
]);

function renderHeatmap(
  handle: PlotHandle,
  device: GPUDevice,
  renderPass: GPURenderPassEncoder,
  format: GPUTextureFormat,
  plotArea: PlotArea
): void {
  const data = handle.data as HeatmapData;
  if (!data || data.channels.length === 0) return;

  const options = handle.options as Plot2DOptions;
  const resources = handle.gpuResources!;
  const cache = getGpuCache(handle.id);

  // Only rebuild texture data when data generation changes
  if (data.generation !== cache.heatmapGeneration) {
    cache.heatmapGeneration = data.generation;
    cache.heatmapTextureData = buildHeatmapTextureData(data);
  }

  const textureData = cache.heatmapTextureData!;
  if (textureData.width === 0 || textureData.height === 0) return;

  // Create or update heatmap texture
  if (
    !resources.heatmapTexture ||
    resources.heatmapTexture.width !== textureData.width ||
    resources.heatmapTexture.height !== textureData.height
  ) {
    resources.heatmapTexture?.destroy();
    resources.heatmapTexture = device.createTexture({
      size: { width: textureData.width, height: textureData.height },
      format: 'r32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Create sampler - must be non-filtering for r32float
    if (!resources.heatmapSampler) {
      resources.heatmapSampler = device.createSampler({
        magFilter: 'nearest',
        minFilter: 'nearest',
      });
    }
  }

  // Update texture data
  device.queue.writeTexture(
    { texture: resources.heatmapTexture },
    textureData.data.buffer,
    { offset: textureData.data.byteOffset, bytesPerRow: textureData.width * 4 },
    { width: textureData.width, height: textureData.height }
  );

  // Static quad vertex buffer (created once)
  if (!resources.heatmapVertexBuffer || resources.heatmapVertexBuffer.size < GPU_HEATMAP_QUAD_VERTICES.byteLength) {
    resources.heatmapVertexBuffer?.destroy();
    resources.heatmapVertexBuffer = device.createBuffer({
      size: GPU_HEATMAP_QUAD_VERTICES.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(resources.heatmapVertexBuffer, 0, GPU_HEATMAP_QUAD_VERTICES);
  }

  // Build and update uniforms
  const uniforms = buildHeatmapUniforms(handle, plotArea, textureData);
  if (!resources.heatmapUniformBuffer) {
    resources.heatmapUniformBuffer = device.createBuffer({
      size: 96, // 20 floats (80 bytes) aligned to 96
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  device.queue.writeBuffer(resources.heatmapUniformBuffer, 0, uniforms as Float32Array<ArrayBuffer>);

  // Get pipeline and create bind group
  const pipeline = ensurePipeline(device, 'heatmap', format);
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: resources.heatmapUniformBuffer } },
      { binding: 1, resource: resources.heatmapTexture.createView() },
    ],
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, resources.heatmapVertexBuffer);
  renderPass.draw(6);
}

interface HeatmapTextureData {
  data: Float32Array;
  width: number;
  height: number;
  minValue: number;
  maxValue: number;
}

function buildHeatmapTextureData(data: HeatmapData): HeatmapTextureData {
  if (!data || data.channels.length === 0) {
    return { data: new Float32Array(0), width: 0, height: 0, minValue: 0, maxValue: 1 };
  }

  const firstChannel = data.channels[0];
  const numBins = firstChannel.width;    // frequency bins (columns in source)
  const numFrames = firstChannel.height; // time frames (rows in source)

  if (numBins === 0 || numFrames === 0) {
    return { data: new Float32Array(0), width: 0, height: 0, minValue: 0, maxValue: 1 };
  }

  // Transpose: texture width = numFrames (time), height = numBins * numChannels (freq stacked)
  // Channels are reversed so Ch0 is at top of screen, freq is flipped so high freq is at top of each band
  const numChannels = data.channels.length;
  const texWidth = numFrames;
  const texHeight = numBins * numChannels;
  const textureData = new Float32Array(texWidth * texHeight);
  let minValue = Infinity;
  let maxValue = -Infinity;

  for (let ch = 0; ch < numChannels; ch++) {
    const channel = data.channels[ch];
    const values = channel.values;
    const chBins = channel.width;
    const chFrames = channel.height;

    for (let bin = 0; bin < chBins; bin++) {
      // Reverse channel order so Ch0 is at top of screen (shader flips Y for freq orientation)
      const texRow = (numChannels - 1 - ch) * numBins + bin;
      for (let frame = 0; frame < chFrames; frame++) {
        const srcIdx = frame * chBins + bin;
        const dstIdx = texRow * texWidth + frame;
        const value = values[srcIdx];
        textureData[dstIdx] = value;
        if (value < minValue) minValue = value;
        if (value > maxValue) maxValue = value;
      }
    }
  }

  if (!isFinite(minValue)) minValue = 0;
  if (!isFinite(maxValue)) maxValue = 1;
  if (minValue === maxValue) maxValue = minValue + 1;

  return { data: textureData, width: texWidth, height: texHeight, minValue, maxValue };
}

function buildHeatmapUniforms(
  handle: PlotHandle,
  plotArea: PlotArea,
  textureData: HeatmapTextureData
): Float32Array {
  const canvas = handle.webgpuCanvas || handle.canvas;
  if (!canvas) return new Float32Array(24);

  const width = canvas.width;
  const height = canvas.height;
  const dynOpts = handle.dynamicOptions;

  // Plot bounds in clip space
  const left = (plotArea.left / width) * 2 - 1;
  const right = ((plotArea.left + plotArea.width) / width) * 2 - 1;
  const bottom = 1 - ((plotArea.top + plotArea.height) / height) * 2;
  const top = 1 - (plotArea.top / height) * 2;

  // Transform matrix with zoom/pan
  const transform = new Float32Array(16);
  transform[0] = dynOpts.zoomX;
  transform[5] = dynOpts.zoomY;
  transform[10] = 1;
  transform[12] = dynOpts.panX;
  transform[13] = dynOpts.panY;
  transform[15] = 1;

  // Uniforms: transform (16) + plotBounds (4) + valueRange (2) + channelInfo (2) = 24 floats
  const uniforms = new Float32Array(24);
  uniforms.set(transform, 0);
  uniforms[16] = left;
  uniforms[17] = bottom;
  uniforms[18] = right;
  uniforms[19] = top;
  uniforms[20] = textureData.minValue;
  uniforms[21] = textureData.maxValue;
  uniforms[22] = (handle.data as any)?.channels?.length || 1; // num channels
  uniforms[23] = 0; // padding

  return uniforms;
}

// =============================================================================
// Uniform Builders
// =============================================================================

function buildLineUniforms(handle: PlotHandle, plotArea: PlotArea): Float32Array {
  const canvas = handle.webgpuCanvas || handle.canvas;
  if (!canvas) return new Float32Array(12);

  const width = canvas.width;
  const height = canvas.height;

  const options = handle.options as Plot2DOptions;
  const dynOpts = handle.dynamicOptions;
  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];

  // Plot bounds in clip space (-1 to 1)
  const left = (plotArea.left / width) * 2 - 1;
  const right = ((plotArea.left + plotArea.width) / width) * 2 - 1;
  const bottom = 1 - ((plotArea.top + plotArea.height) / height) * 2;
  const top = 1 - (plotArea.top / height) * 2;

  // Visible ranges must be computed in log-space for logarithmic axes.
  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { visibleMin: xVisibleMin, visibleMax: xVisibleMax } = computeVisibleRange(
    xMin, xMax, dynOpts.zoomX, dynOpts.panX, xAxis?.logarithmic || false
  );

  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { visibleMin: yVisibleMin, visibleMax: yVisibleMax } = computeVisibleRange(
    yMin, yMax, dynOpts.zoomY, dynOpts.panY, yAxis?.logarithmic || false
  );

  let xScale: number, xOffset: number;
  const xLog = xAxis?.logarithmic ? 1.0 : 0.0;
  if (xAxis?.logarithmic) {
    const logMin = Math.log10(Math.max(xVisibleMin, 1e-10));
    const logMax = Math.log10(Math.max(xVisibleMax, 1e-10));
    xScale = 2 / (logMax - logMin);
    xOffset = -(logMin * xScale + 1);
  } else {
    xScale = 2 / (xVisibleMax - xVisibleMin);
    xOffset = -(xVisibleMin * xScale + 1);
  }

  let yScale: number, yOffset: number;
  const yLog = yAxis?.logarithmic ? 1.0 : 0.0;
  if (yAxis?.logarithmic) {
    const logMin = Math.log10(Math.max(yVisibleMin, 1e-10));
    const logMax = Math.log10(Math.max(yVisibleMax, 1e-10));
    yScale = 2 / (logMax - logMin);
    yOffset = -(logMin * yScale + 1);
  } else {
    yScale = 2 / (yVisibleMax - yVisibleMin);
    yOffset = -(yVisibleMin * yScale + 1);
  }

  // Layout: plotBounds(4) + xTransform(4) + yTransform(4) = 12 floats = 48 bytes
  const uniforms = new Float32Array(12);
  uniforms[0] = left;
  uniforms[1] = bottom;
  uniforms[2] = right;
  uniforms[3] = top;
  uniforms[4] = xScale;
  uniforms[5] = xOffset;
  uniforms[6] = xLog;
  uniforms[7] = 0;
  uniforms[8] = yScale;
  uniforms[9] = yOffset;
  uniforms[10] = yLog;
  uniforms[11] = 0;

  return uniforms;
}

function buildGridUniforms(handle: PlotHandle, plotArea: PlotArea): Float32Array {
  return buildIdentityTransformUniforms(handle, plotArea);
}

/**
 * Build uniforms with identity mat4 + plotBounds for shaders that use the old transform layout.
 * Used by bar, grid, and heatmap shaders.
 */
function buildIdentityTransformUniforms(handle: PlotHandle, plotArea: PlotArea): Float32Array {
  const canvas = handle.webgpuCanvas || handle.canvas;
  if (!canvas) return new Float32Array(20);

  const width = canvas.width;
  const height = canvas.height;

  const left = (plotArea.left / width) * 2 - 1;
  const right = ((plotArea.left + plotArea.width) / width) * 2 - 1;
  const bottom = 1 - ((plotArea.top + plotArea.height) / height) * 2;
  const top = 1 - (plotArea.top / height) * 2;

  const uniforms = new Float32Array(20);
  uniforms[0] = 1; uniforms[5] = 1; uniforms[10] = 1; uniforms[15] = 1;
  uniforms[16] = left; uniforms[17] = bottom; uniforms[18] = right; uniforms[19] = top;
  return uniforms;
}
