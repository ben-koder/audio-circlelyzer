/**
 * WebGPU 3D Rendering
 * Handles rendering of 3D plots: surfaces, linestrips, and 3D coordinate box
 */

import {
  PlotHandle,
  Plot3DOptions,
  Plot3DDynamicOptions,
  isPlot3DOptions,
  Data3D,
  PlotTheme,
} from '../../types';
import { PlotArea, calculatePlotArea, getAxisRange } from '../../utils';
import { ensurePipeline } from './pipelines';
import { getBackWallPositions } from '../3d/box-utils';

// =============================================================================
// Types
// =============================================================================

interface Box3DData {
  lineVertices: Float32Array;
  lineVertexCount: number;
  fillVertices: Float32Array;
  fillVertexCount: number;
}

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// =============================================================================
// Per-Handle 3D Cache
// =============================================================================

interface Gpu3DCache {
  lsGeneration: number;
  lsOptionsRef: Plot3DOptions | null;
  lsThemeRef: PlotTheme | null;
  lsVertexData: Float32Array | null;
  lsStripLengths: number[];
  sfGeneration: number;
  sfOptionsRef: Plot3DOptions | null;
  sfThemeRef: PlotTheme | null;
  sfVertexData: Float32Array | null;
  sfIndexData: Uint32Array | null;
  boxRotX: number;
  boxRotY: number;
  boxNumCh: number;
  boxZMin: number;
  boxZMax: number;
  boxAxisColor: string;
  boxGridColor: string;
  boxData: Box3DData | null;
}

const gpu3DCaches = new Map<string, Gpu3DCache>();

function get3DCache(id: string): Gpu3DCache {
  let c = gpu3DCaches.get(id);
  if (!c) {
    c = {
      lsGeneration: -1, lsOptionsRef: null, lsThemeRef: null, lsVertexData: null, lsStripLengths: [],
      sfGeneration: -1, sfOptionsRef: null, sfThemeRef: null, sfVertexData: null, sfIndexData: null,
      boxRotX: NaN, boxRotY: NaN, boxNumCh: -1,
      boxZMin: NaN, boxZMax: NaN, boxAxisColor: '', boxGridColor: '',
      boxData: null,
    };
    gpu3DCaches.set(id, c);
  }
  return c;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Render a 3D plot using WebGPU
 */
export function renderWebGPU3D(
  handle: PlotHandle,
  ctx: GPUCanvasContext,
  device: GPUDevice,
  format: GPUTextureFormat
): void {
  const options = handle.options;
  if (!isPlot3DOptions(options)) return;

  const canvas = handle.webgpuCanvas || handle.canvas;
  if (!canvas) return;

  const bgColor = hexToRgba(handle.theme.backgroundColor);
  const plotArea = calculatePlotArea(canvas.width, canvas.height, handle.theme);

  // Initialize resources if needed
  if (!handle.gpuResources) {
    handle.gpuResources = {
      vertexBuffers: new Map(),
    };
  }

  const resources = handle.gpuResources;

  // Get or create depth texture
  const depthFormat: GPUTextureFormat = 'depth24plus';
  const depthTexture = ensureDepthTexture(device, resources, canvas.width, canvas.height, depthFormat);

  // Build 3D box data
  const boxData = build3DBoxData(handle);

  // Build uniform data
  const uniforms = build3DUniforms(handle, plotArea);

  // Create or update uniform buffer
  if (!resources.uniformBuffer) {
    resources.uniformBuffer = device.createBuffer({
      size: 256, // 4 mat4x4 + extras, aligned to 256
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  device.queue.writeBuffer(resources.uniformBuffer, 0, uniforms as Float32Array<ArrayBuffer>);

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
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });

  // Set viewport to plot area
  renderPass.setViewport(
    plotArea.left,
    plotArea.top,
    plotArea.width,
    plotArea.height,
    0,
    1
  );

  // Render walls (filled quads) first
  renderWalls(handle, device, renderPass, format, boxData, resources);

  // Render grid/frame lines
  renderGrid3D(handle, device, renderPass, format, boxData, resources);

  // Render data
  switch (options.plotType) {
    case 'linestrips':
      renderLinestrips(handle, device, renderPass, format, resources);
      break;
    case 'surface':
      renderSurface(handle, device, renderPass, format, resources);
      break;
  }

  renderPass.end();
  device.queue.submit([commandEncoder.finish()]);
}

// =============================================================================
// Wall Rendering (filled quads behind grid)
// =============================================================================

function renderWalls(
  handle: PlotHandle,
  device: GPUDevice,
  renderPass: GPURenderPassEncoder,
  format: GPUTextureFormat,
  boxData: Box3DData,
  resources: NonNullable<PlotHandle['gpuResources']>
): void {
  if (boxData.fillVertexCount === 0) return;

  const pipeline = ensurePipeline(device, 'wall', format);

  // Create or update wall vertex buffer
  const bufferKey = 'wallFill';
  let buffer = resources.vertexBuffers.get(bufferKey);
  const neededSize = boxData.fillVertices.byteLength;

  if (!buffer || buffer.size < neededSize) {
    buffer?.destroy();
    buffer = device.createBuffer({
      size: neededSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    resources.vertexBuffers.set(bufferKey, buffer);
  }
  device.queue.writeBuffer(buffer, 0, boxData.fillVertices as Float32Array<ArrayBuffer>);

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: resources.uniformBuffer! } }],
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, buffer);
  renderPass.draw(boxData.fillVertexCount);
}

// =============================================================================
// 3D Grid/Frame Rendering
// =============================================================================

function renderGrid3D(
  handle: PlotHandle,
  device: GPUDevice,
  renderPass: GPURenderPassEncoder,
  format: GPUTextureFormat,
  boxData: Box3DData,
  resources: NonNullable<PlotHandle['gpuResources']>
): void {
  if (boxData.lineVertexCount === 0) return;

  const pipeline = ensurePipeline(device, 'grid3d', format);

  // Create or update grid vertex buffer
  const bufferKey = 'grid3d';
  let buffer = resources.vertexBuffers.get(bufferKey);
  const neededSize = boxData.lineVertices.byteLength;

  if (!buffer || buffer.size < neededSize) {
    buffer?.destroy();
    buffer = device.createBuffer({
      size: neededSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    resources.vertexBuffers.set(bufferKey, buffer);
  }
  device.queue.writeBuffer(buffer, 0, boxData.lineVertices as Float32Array<ArrayBuffer>);

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: resources.uniformBuffer! } }],
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, buffer);
  renderPass.draw(boxData.lineVertexCount);
}

// =============================================================================
// Linestrip Rendering
// =============================================================================

function renderLinestrips(
  handle: PlotHandle,
  device: GPUDevice,
  renderPass: GPURenderPassEncoder,
  format: GPUTextureFormat,
  resources: NonNullable<PlotHandle['gpuResources']>
): void {
  const data = handle.data as Data3D;
  if (!data || data.channels.length === 0) return;

  const options = handle.options as Plot3DOptions;
  const theme = handle.theme;
  const cache = get3DCache(handle.id);

  const pipeline = ensurePipeline(device, 'linestrip', format);

  let vertexData: Float32Array;
  let needsUpload = true;

  if (data.generation === cache.lsGeneration && options === cache.lsOptionsRef && theme === cache.lsThemeRef && cache.lsVertexData) {
    vertexData = cache.lsVertexData;
    needsUpload = false;
  } else {
    const result = buildLinestripVertices(handle, data, options, theme);
    if (result.vertices.length === 0) return;
    vertexData = new Float32Array(result.vertices);
    cache.lsGeneration = data.generation;
    cache.lsOptionsRef = options;
    cache.lsThemeRef = theme;
    cache.lsVertexData = vertexData;
    cache.lsStripLengths = result.stripLengths;
  }

  // Create or update vertex buffer
  const bufferKey = 'linestrip';
  let buffer = resources.vertexBuffers.get(bufferKey);
  const neededSize = vertexData.byteLength;

  if (!buffer || buffer.size < neededSize) {
    buffer?.destroy();
    buffer = device.createBuffer({
      size: neededSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    resources.vertexBuffers.set(bufferKey, buffer);
    needsUpload = true;
  }
  if (needsUpload) {
    device.queue.writeBuffer(buffer, 0, vertexData as Float32Array<ArrayBuffer>);
  }

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: resources.uniformBuffer! } }],
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, buffer);

  // Draw each linestrip separately
  let offset = 0;
  for (const stripLength of cache.lsStripLengths) {
    if (stripLength > 1) {
      renderPass.draw(stripLength, 1, offset);
    }
    offset += stripLength;
  }
}

function buildLinestripVertices(
  handle: PlotHandle,
  data: Data3D,
  options: Plot3DOptions,
  theme: PlotTheme
): { vertices: number[]; stripLengths: number[] } {
  const vertices: number[] = [];
  const stripLengths: number[] = [];
  const axes = options.axesMetadata;
  const xAxis = axes[0];
  const yAxis = axes[1];
  const zAxis = axes[2];

  if (!xAxis || !yAxis || !zAxis) return { vertices, stripLengths };

  // Get effective ranges
  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { min: zMin, max: zMax } = getAxisRange(zAxis);

  const numChannels = data.channels.length;
  const channelColors = getChannelColors(numChannels, theme);

  // Calculate channel spacing for multi-channel plots
  const channelSpacing = 0.15;
  const zAxisOriginalRange = zMax - zMin;
  const yRange = yMax - yMin;

  for (let ch = 0; ch < numChannels; ch++) {
    const channel = data.channels[ch];
    if (!channel || channel.vertices.length === 0) continue;

    const baseColor = channelColors[ch];

    // Calculate z-offset for this channel (separate channels in z-space)
    const channelZOffset = ch * (zAxisOriginalRange + zAxisOriginalRange * channelSpacing);

    // Expanded z-range to accommodate all channels
    const zAxisExpandedRange = zAxisOriginalRange * (numChannels + (numChannels - 1) * channelSpacing);
    const zMinExpanded = zMin;
    const zMaxExpanded = zMinExpanded + zAxisExpandedRange;

    const verts = channel.vertices;
    const ppr = channel.pointsPerRow;

    for (let row = 0; row < channel.rowCount; row++) {
      const rowStart = row * ppr * 3;
      let count = 0;
      for (let p = 0; p < ppr; p++) {
        const idx = rowStart + p * 3;
        const xVal = verts[idx];
        const yVal = verts[idx + 1];
        const zVal = verts[idx + 2];

        // Normalize to [-1, 1]
        const nx = ((xVal - xMin) / (xMax - xMin)) * 2 - 1;
        const ny = ((yVal - yMin) / yRange) * 2 - 1;
        const zValWithOffset = zVal + channelZOffset;
        const nz = ((zValWithOffset - zMinExpanded) / (zMaxExpanded - zMinExpanded)) * 2 - 1;

        const yNormalized = (yVal - yMin) / yRange;
        const color = getGradientColor(baseColor, yNormalized);

        vertices.push(nx, ny, nz, color.r, color.g, color.b, color.a);
        count++;
      }
      stripLengths.push(count);
    }
  }

  return { vertices, stripLengths };
}

// =============================================================================
// Surface Rendering
// =============================================================================

function renderSurface(
  handle: PlotHandle,
  device: GPUDevice,
  renderPass: GPURenderPassEncoder,
  format: GPUTextureFormat,
  resources: NonNullable<PlotHandle['gpuResources']>
): void {
  const data = handle.data as Data3D;
  if (!data || data.channels.length === 0) return;

  const options = handle.options as Plot3DOptions;
  const theme = handle.theme;
  const cache = get3DCache(handle.id);

  const pipeline = ensurePipeline(device, 'surface', format);

  let vertexData: Float32Array;
  let indexData: Uint32Array;
  let needsUpload = true;

  if (data.generation === cache.sfGeneration && options === cache.sfOptionsRef && theme === cache.sfThemeRef && cache.sfVertexData && cache.sfIndexData) {
    vertexData = cache.sfVertexData;
    indexData = cache.sfIndexData;
    needsUpload = false;
  } else {
    const result = buildSurfaceVertices(handle, data, options, theme);
    if (result.vertices.length === 0) return;
    vertexData = new Float32Array(result.vertices);
    indexData = new Uint32Array(result.indices);
    cache.sfGeneration = data.generation;
    cache.sfOptionsRef = options;
    cache.sfThemeRef = theme;
    cache.sfVertexData = vertexData;
    cache.sfIndexData = indexData;
  }

  // Create or update vertex buffer
  const vBufferKey = 'surface';
  let vBuffer = resources.vertexBuffers.get(vBufferKey);
  const vNeededSize = vertexData.byteLength;

  if (!vBuffer || vBuffer.size < vNeededSize) {
    vBuffer?.destroy();
    vBuffer = device.createBuffer({
      size: vNeededSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    resources.vertexBuffers.set(vBufferKey, vBuffer);
    needsUpload = true;
  }
  if (needsUpload) {
    device.queue.writeBuffer(vBuffer, 0, vertexData as Float32Array<ArrayBuffer>);
  }

  // Create or update index buffer
  const iBufferKey = 'surfaceIndex';
  let iBuffer = resources.vertexBuffers.get(iBufferKey);
  const iNeededSize = indexData.byteLength;

  if (!iBuffer || iBuffer.size < iNeededSize) {
    iBuffer?.destroy();
    iBuffer = device.createBuffer({
      size: iNeededSize,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    resources.vertexBuffers.set(iBufferKey, iBuffer);
    needsUpload = true;
  }
  if (needsUpload) {
    device.queue.writeBuffer(iBuffer, 0, indexData as Uint32Array<ArrayBuffer>);
  }

  // Create bind group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: resources.uniformBuffer! } }],
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, vBuffer);
  renderPass.setIndexBuffer(iBuffer, 'uint32');
  renderPass.drawIndexed(indexData.length);
}

function buildSurfaceVertices(
  handle: PlotHandle,
  data: Data3D,
  options: Plot3DOptions,
  theme: PlotTheme
): { vertices: number[]; indices: number[] } {
  const vertices: number[] = [];
  const indices: number[] = [];

  // For surface, data format is: data[channel][lineStrip][point] where point = [x, y, z]
  // We need to build a grid from the linestrips
  const axes = options.axesMetadata;
  const xAxis = axes[0];
  const yAxis = axes[1];
  const zAxis = axes[2];

  if (!xAxis || !yAxis || !zAxis) return { vertices, indices };

  // Get effective ranges
  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { min: zMinBase, max: zMaxBase } = getAxisRange(zAxis);

  const numChannels = data.channels.length;
  if (numChannels < 1) return { vertices, indices };

  const channelColors = getChannelColors(numChannels, theme);

  // Calculate channel spacing for multi-channel plots
  const channelSpacing = 0.15;
  const zAxisOriginalRange = zMaxBase - zMinBase;
  const zAxisExpandedRange = zAxisOriginalRange * (numChannels + (numChannels - 1) * channelSpacing);
  const zMin = zMinBase;
  const zMax = zMin + zAxisExpandedRange;
  const yRange = yMax - yMin;

  let globalVertexOffset = 0;

  // Process each channel
  for (let ch = 0; ch < numChannels; ch++) {
    const channel = data.channels[ch];
    if (!channel || channel.rowCount < 2) continue;

    const baseColor = channelColors[ch];
    const channelZOffset = ch * (zAxisOriginalRange + zAxisOriginalRange * channelSpacing);

    const pointsPerStrip = channel.pointsPerRow;
    if (pointsPerStrip < 2) continue;

    const channelVertexOffset = globalVertexOffset;
    const verts = channel.vertices;

    // Build vertices for this channel's surface
    for (let row = 0; row < channel.rowCount; row++) {
      const rowStart = row * pointsPerStrip * 3;
      for (let p = 0; p < pointsPerStrip; p++) {
        const idx = rowStart + p * 3;
        const xVal = verts[idx];
        const yVal = verts[idx + 1];
        const zVal = verts[idx + 2];

        // Normalize to [-1, 1]
        const nx = ((xVal - xMin) / (xMax - xMin)) * 2 - 1;
        const ny = ((yVal - yMin) / yRange) * 2 - 1;
        const zValWithOffset = zVal + channelZOffset;
        const nz = ((zValWithOffset - zMin) / (zMax - zMin)) * 2 - 1;

        // Placeholder normal (up)
        const normal = { x: 0, y: 1, z: 0 };

        // Apply y-value based gradient shading
        const yNormalized = (yVal - yMin) / yRange;
        const color = getGradientColor(baseColor, yNormalized);

        // vertex format: pos(3) + normal(3) + color(4) = 10 floats
        vertices.push(nx, ny, nz, normal.x, normal.y, normal.z, color.r, color.g, color.b, color.a);
        globalVertexOffset++;
      }
    }

    // Build indices for triangles between adjacent rows
    for (let row = 0; row < channel.rowCount - 1; row++) {
      const row0Start = channelVertexOffset + row * pointsPerStrip;
      const row1Start = channelVertexOffset + (row + 1) * pointsPerStrip;

      for (let i = 0; i < pointsPerStrip - 1; i++) {
        const v00 = row0Start + i;
        const v01 = row0Start + i + 1;
        const v10 = row1Start + i;
        const v11 = row1Start + i + 1;

        // Two triangles for each quad
        indices.push(v00, v10, v01);
        indices.push(v01, v10, v11);
      }
    }
  }

  return { vertices, indices };
}

// =============================================================================
// 3D Box Building
// =============================================================================

function build3DBoxData(handle: PlotHandle): Box3DData {
  const theme = handle.theme;
  const dynOpts = handle.dynamicOptions as Plot3DDynamicOptions;
  const options = handle.options as Plot3DOptions;
  const data = handle.data as Data3D;

  // Cache check
  const cache = get3DCache(handle.id);
  const numCh = data?.channels.length || 1;
  const zAxisMeta = options.axesMetadata[2];
  const zRng = zAxisMeta ? getAxisRange(zAxisMeta) : { min: -1, max: 1 };

  if (
    cache.boxData &&
    cache.boxRotX === dynOpts.rotationX &&
    cache.boxRotY === dynOpts.rotationY &&
    cache.boxNumCh === numCh &&
    cache.boxZMin === zRng.min &&
    cache.boxZMax === zRng.max &&
    cache.boxAxisColor === theme.axisColor &&
    cache.boxGridColor === theme.gridColor
  ) {
    return cache.boxData;
  }

  const walls = getBackWallPositions(dynOpts);

  const axisColor = hexToRgba(theme.axisColor);
  const gridColor = hexToRgba(theme.gridColor);

  // Wall fill colors (faint transparent)
  const wallColorYZ: RGBA = { r: 0.4, g: 0.4, b: 0.5, a: 0.12 };
  const wallColorXZ: RGBA = { r: 0.4, g: 0.5, b: 0.4, a: 0.12 };
  const wallColorXY: RGBA = { r: 0.5, g: 0.4, b: 0.4, a: 0.12 };

  const lineVertices: number[] = [];
  const fillVertices: number[] = [];

  // Calculate channel info for Z grid alignment
  const numChannels = data?.channels.length || 1;
  const channelSpacing = 0.15;
  const zAxis = options.axesMetadata[2];
  const zRange = zAxis ? getAxisRange(zAxis) : { min: -1, max: 1 };
  const zAxisOriginalMin = zRange.min;
  const zAxisOriginalMax = zRange.max;
  const zAxisOriginalRange = zAxisOriginalMax - zAxisOriginalMin;
  const zAxisExpandedRange = zAxisOriginalRange * (numChannels + (numChannels - 1) * channelSpacing);

  // Generate Z positions for grid lines aligned with channel ticks
  const zGridPositions: number[] = [];
  const ticksPerChannel = 3; // Match the ticks used in labels
  for (let ch = 0; ch < numChannels; ch++) {
    const channelZOffset = ch * (zAxisOriginalRange + zAxisOriginalRange * channelSpacing);
    for (let t = 0; t <= ticksPerChannel; t++) {
      const tickFraction = t / ticksPerChannel;
      const zVal = zAxisOriginalMin + tickFraction * zAxisOriginalRange + channelZOffset;
      // Normalize to [-1, 1]
      const zNorm = ((zVal - zAxisOriginalMin) / zAxisExpandedRange) * 2 - 1;
      // Avoid duplicates at channel boundaries
      if (!zGridPositions.some(z => Math.abs(z - zNorm) < 0.01)) {
        zGridPositions.push(zNorm);
      }
    }
  }

  const addLine = (
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    color: RGBA
  ) => {
    lineVertices.push(x1, y1, z1, color.r, color.g, color.b, color.a);
    lineVertices.push(x2, y2, z2, color.r, color.g, color.b, color.a);
  };

  const addQuad = (corners: [number, number, number][], color: RGBA) => {
    // Triangle 1: 0, 1, 2
    fillVertices.push(corners[0][0], corners[0][1], corners[0][2], color.r, color.g, color.b, color.a);
    fillVertices.push(corners[1][0], corners[1][1], corners[1][2], color.r, color.g, color.b, color.a);
    fillVertices.push(corners[2][0], corners[2][1], corners[2][2], color.r, color.g, color.b, color.a);
    // Triangle 2: 0, 2, 3
    fillVertices.push(corners[0][0], corners[0][1], corners[0][2], color.r, color.g, color.b, color.a);
    fillVertices.push(corners[2][0], corners[2][1], corners[2][2], color.r, color.g, color.b, color.a);
    fillVertices.push(corners[3][0], corners[3][1], corners[3][2], color.r, color.g, color.b, color.a);
  };

  const gridSteps = 5;
  const gridAlpha: RGBA = { ...gridColor, a: gridColor.a * 0.5 };

  // Use pre-computed back wall positions (farthest from camera)
  const solidWallX = walls.backX;
  const solidWallY = walls.backY;
  const solidWallZ = walls.backZ;

  // Wall 1: YZ plane (at x = solidWallX)
  const yzCorners: [number, number, number][] = [
    [solidWallX, -1, -1],
    [solidWallX, 1, -1],
    [solidWallX, 1, 1],
    [solidWallX, -1, 1],
  ];
  addQuad(yzCorners, wallColorYZ);

  // Frame edges
  addLine(solidWallX, -1, -1, solidWallX, 1, -1, axisColor);
  addLine(solidWallX, 1, -1, solidWallX, 1, 1, axisColor);
  addLine(solidWallX, 1, 1, solidWallX, -1, 1, axisColor);
  addLine(solidWallX, -1, 1, solidWallX, -1, -1, axisColor);

  // Grid lines on YZ wall
  // Y grid lines (horizontal on wall) - use uniform steps
  for (let i = 1; i < gridSteps; i++) {
    const t = (i / gridSteps) * 2 - 1;
    addLine(solidWallX, t, -1, solidWallX, t, 1, gridAlpha);
  }
  // Z grid lines (vertical on wall) - use channel-aligned positions
  for (const zPos of zGridPositions) {
    if (zPos > -0.99 && zPos < 0.99) { // Skip edges
      addLine(solidWallX, -1, zPos, solidWallX, 1, zPos, gridAlpha);
    }
  }

  // Wall 2: XZ plane (at y = solidWallY)
  const xzCorners: [number, number, number][] = [
    [-1, solidWallY, -1],
    [1, solidWallY, -1],
    [1, solidWallY, 1],
    [-1, solidWallY, 1],
  ];
  addQuad(xzCorners, wallColorXZ);

  // Frame edges
  addLine(-1, solidWallY, -1, 1, solidWallY, -1, axisColor);
  addLine(1, solidWallY, -1, 1, solidWallY, 1, axisColor);
  addLine(1, solidWallY, 1, -1, solidWallY, 1, axisColor);
  addLine(-1, solidWallY, 1, -1, solidWallY, -1, axisColor);

  // Grid lines on XZ wall
  // Z grid lines - use channel-aligned positions
  for (const zPos of zGridPositions) {
    if (zPos > -0.99 && zPos < 0.99) { // Skip edges
      addLine(-1, solidWallY, zPos, 1, solidWallY, zPos, gridAlpha);
    }
  }
  // X grid lines - use uniform steps
  for (let i = 1; i < gridSteps; i++) {
    const t = (i / gridSteps) * 2 - 1;
    addLine(t, solidWallY, -1, t, solidWallY, 1, gridAlpha);
  }

  // Wall 3: XY plane (at z = solidWallZ)
  const xyCorners: [number, number, number][] = [
    [-1, -1, solidWallZ],
    [1, -1, solidWallZ],
    [1, 1, solidWallZ],
    [-1, 1, solidWallZ],
  ];
  addQuad(xyCorners, wallColorXY);

  // Frame edges
  addLine(-1, -1, solidWallZ, 1, -1, solidWallZ, axisColor);
  addLine(1, -1, solidWallZ, 1, 1, solidWallZ, axisColor);
  addLine(1, 1, solidWallZ, -1, 1, solidWallZ, axisColor);
  addLine(-1, 1, solidWallZ, -1, -1, solidWallZ, axisColor);

  // Grid lines on XY wall
  for (let i = 1; i < gridSteps; i++) {
    const t = (i / gridSteps) * 2 - 1;
    addLine(-1, t, solidWallZ, 1, t, solidWallZ, gridAlpha);
    addLine(t, -1, solidWallZ, t, 1, solidWallZ, gridAlpha);
  }

  // Connecting edges between walls
  addLine(solidWallX, solidWallY, -1, solidWallX, solidWallY, 1, axisColor);
  addLine(solidWallX, -1, solidWallZ, solidWallX, 1, solidWallZ, axisColor);
  addLine(-1, solidWallY, solidWallZ, 1, solidWallY, solidWallZ, axisColor);

  const result: Box3DData = {
    lineVertices: new Float32Array(lineVertices),
    lineVertexCount: lineVertices.length / 7,
    fillVertices: new Float32Array(fillVertices),
    fillVertexCount: fillVertices.length / 7,
  };

  cache.boxRotX = dynOpts.rotationX;
  cache.boxRotY = dynOpts.rotationY;
  cache.boxNumCh = numCh;
  cache.boxZMin = zRng.min;
  cache.boxZMax = zRng.max;
  cache.boxAxisColor = theme.axisColor;
  cache.boxGridColor = theme.gridColor;
  cache.boxData = result;

  return result;
}

// =============================================================================
// 3D Uniform Building
// =============================================================================

function build3DUniforms(handle: PlotHandle, plotArea: PlotArea): Float32Array {
  const dynOpts = handle.dynamicOptions as Plot3DDynamicOptions;

  // Create model matrix from zoom, rotation, and pan - matching Canvas 2D transform order
  const modelMatrix = createModelMatrix(dynOpts);

  // Create view matrix (identity - no view transform needed)
  const viewMatrix = createViewMatrix();

  // Create projection matrix matching Canvas 2D's projection
  // Canvas 2D uses: screenX = centerX + x1 * scale * factor
  // where scale = min(width, height) * 0.3 * zoomX
  // and factor = 4 / (4 + z)
  const aspect = plotArea.width / plotArea.height;
  const projectionMatrix = createProjectionMatrix(aspect, dynOpts.zoomX);

  // Light direction
  const lightDir = new Float32Array([0.5, 0.8, 0.6, 0]);

  // Pack into uniform buffer: model(16) + view(16) + projection(16) + light(4) = 52 floats
  const uniforms = new Float32Array(64); // Aligned to 256 bytes for uniform buffer
  uniforms.set(modelMatrix, 0);
  uniforms.set(viewMatrix, 16);
  uniforms.set(projectionMatrix, 32);
  uniforms.set(lightDir, 48);

  return uniforms;
}

/**
 * Create model matrix matching Canvas 2D transform order:
 * 1. Apply zoom (scale)
 * 2. Apply rotation (Y then X)
 * 3. Apply pan (translation)
 */
function createModelMatrix(dynOpts: Plot3DDynamicOptions): Float32Array {
  // Zoom/scale factors
  const sx = dynOpts.zoomX;
  const sy = dynOpts.zoomY;
  const sz = dynOpts.zoomZ;

  // Rotation - negate rotationX to match Canvas 2D
  const cosX = Math.cos(-dynOpts.rotationX);
  const sinX = Math.sin(-dynOpts.rotationX);
  const cosY = Math.cos(dynOpts.rotationY);
  const sinY = Math.sin(dynOpts.rotationY);

  // Pan/translation (scaled by 0.5 to match Canvas 2D)
  const tx = dynOpts.panX * 0.5;
  const ty = dynOpts.panY * 0.5;
  const tz = dynOpts.panZ * 0.5;

  // Build combined matrix: T * Rx * Ry * S (in reverse order for column-major)
  // Scale matrix S:
  // [sx  0  0  0]
  // [ 0 sy  0  0]
  // [ 0  0 sz  0]
  // [ 0  0  0  1]
  
  // Rotation around Y (Ry):
  // [ cosY  0  sinY  0]
  // [    0  1     0  0]
  // [-sinY  0  cosY  0]
  // [    0  0     0  1]
  
  // Rotation around X (Rx):
  // [1     0      0  0]
  // [0  cosX  -sinX  0]
  // [0  sinX   cosX  0]
  // [0     0      0  1]
  
  // Combined Rx * Ry:
  // [        cosY,         0,        sinY, 0]
  // [ sinX * sinY,      cosX, -sinX * cosY, 0]
  // [-cosX * sinY,      sinX,  cosX * cosY, 0]
  // [           0,         0,            0, 1]
  
  // Combined Rx * Ry * S (apply scale first):
  // [        cosY * sx,              0,        sinY * sz, 0]
  // [ sinX * sinY * sx,       cosX * sy, -sinX * cosY * sz, 0]
  // [-cosX * sinY * sx,       sinX * sy,  cosX * cosY * sz, 0]
  // [                0,              0,                  0, 1]
  
  // Final with translation T * (Rx * Ry * S):
  // Add translation to the last column
  
  return new Float32Array([
    // Column 0
    cosY * sx,
    sinX * sinY * sx,
    -cosX * sinY * sx,
    0,
    // Column 1
    0,
    cosX * sy,
    sinX * sy,
    0,
    // Column 2
    sinY * sz,
    -sinX * cosY * sz,
    cosX * cosY * sz,
    0,
    // Column 3 (translation applied after rotation)
    tx,
    ty,
    tz,
    1,
  ]);
}

function createViewMatrix(): Float32Array {
  // Identity - no view transform needed since we're matching Canvas 2D's direct projection
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function createProjectionMatrix(aspect: number, zoomX: number): Float32Array {
  // Match Canvas 2D projection formula:
  //   depth = perspective + z  (perspective = 4.0)
  //   factor = perspective / depth
  //   screenX = centerX + x1 * scale * factor
  //   screenY = centerY - y1 * scale * factor
  //
  // Canvas 2D's screenY formula has a minus because canvas Y points down.
  // WebGPU clip space Y points up, and viewport transform handles the flip.
  // So we should NOT negate Y in the projection matrix.
  //
  // For depth buffer, we need z_ndc in [0, 1].
  // Use perspective = 6 to handle z values from -4 to 4 without w going to zero.
  // z_clip is computed to map z range to valid z_ndc.
  //
  // For z in [-4, 4] mapping to z_ndc in [0, 1]:
  //   z = -4: w_clip = 6 + (-4) = 2, z_clip = 0, z_ndc = 0
  //   z = 4: w_clip = 6 + 4 = 10, z_clip = 10, z_ndc = 1
  // z_clip = 1.25 * z + 5 gives this mapping:
  //   z = -4: z_clip = -5 + 5 = 0 ✓
  //   z = 4: z_clip = 5 + 5 = 10 ✓
  
  const perspective = 6.0;  // Larger than 4 to handle negative z after rotation
  // Scale factor: Canvas 2D uses 4/(4+z), we use scale/(6+z)
  // To match at z=0: scale/6 should give same visual as 4/4 = 1
  // So scale = 6 * 2.4/4 * zoomX = 3.6 * zoomX
  const scale = 3.6 * zoomX;
  
  // z_clip coefficients: z_clip = 1.25 * z + 5
  const zScale = 1.25;
  const zOffset = 5.0;
  
  return new Float32Array([
    // Column 0: affects x_clip
    scale / aspect, 0, 0, 0,
    // Column 1: affects y_clip (NOT negated - WebGPU handles Y flip in viewport)
    0, scale, 0, 0,
    // Column 2: affects z_clip and w_clip
    0, 0, zScale, 1,  // z_clip = zScale * z, w_clip contribution from z
    // Column 3: constant terms
    0, 0, zOffset, perspective,  // z_clip offset, w_clip = perspective + z
  ]);
}

// =============================================================================
// Depth Texture Management
// =============================================================================

function ensureDepthTexture(
  device: GPUDevice,
  resources: NonNullable<PlotHandle['gpuResources']>,
  width: number,
  height: number,
  format: GPUTextureFormat
): GPUTexture {
  const current = resources.depthTexture;

  if (current && current.width === width && current.height === height) {
    return current;
  }

  current?.destroy();

  const texture = device.createTexture({
    size: { width, height },
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  resources.depthTexture = texture;
  return texture;
}

// =============================================================================
// Helpers
// =============================================================================

function hexToRgba(hex: string): RGBA {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
      a: 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function getChannelColors(numChannels: number, theme: PlotTheme): RGBA[] {
  const colors: RGBA[] = [];

  for (let i = 0; i < numChannels; i++) {
    const themeColor = theme.channelColors[i % theme.channelColors.length];
    colors.push(hexToRgba(themeColor));
  }

  return colors;
}

/**
 * Calculate a color with gradient shading based on y-value (normalized 0-1)
 * Higher y values = brighter, lower y values = darker shades of the base color
 */
function getGradientColor(baseColor: RGBA, yNormalized: number): RGBA {
  // Clamp y to [0, 1]
  const y = Math.max(0, Math.min(1, yNormalized));
  
  // Create gradient: darker at low y, brighter at high y
  // Shade factor goes from 0.4 (dark) to 1.2 (bright)
  const shadeFactor = 0.4 + y * 0.8;
  
  return {
    r: Math.min(1, baseColor.r * shadeFactor),
    g: Math.min(1, baseColor.g * shadeFactor),
    b: Math.min(1, baseColor.b * shadeFactor),
    a: baseColor.a,
  };
}
