/**
 * WebGL2 2D Rendering
 *
 * Renders 2D plot data (lines, bars, heatmaps) using WebGL2.
 * Designed for compositing: render to OffscreenCanvas → transferToImageBitmap → main 2D canvas.
 */

import {
  PlotHandle,
  Plot2DOptions,
  Data2D,
  HeatmapData,
  isData2D,
  isHeatmapData,
  isPlot2DOptions,
} from '../../types';
import { hexToRgba, calculatePlotArea, calculateNiceTicks, PlotArea, getAxisRange, computeVisibleRange } from '../../utils';
import { ensureProgram, createWebGL2Resources } from './programs';
import { ensureBuffer, ensureFloatTexture } from './buffers';

// =============================================================================
// Main Entry Point
// =============================================================================

export function renderWebGL2_2D(handle: PlotHandle): void {
  const options = handle.options;
  if (!isPlot2DOptions(options)) return;

  const gl = handle.webgl2Context;
  const canvas = handle.webgl2Canvas || handle.canvas;
  if (!gl || !canvas) return;

  if (!handle.webgl2Resources) {
    handle.webgl2Resources = createWebGL2Resources();
  }

  const bgColor = hexToRgba(handle.theme.backgroundColor);
  const plotArea = calculatePlotArea(canvas.width, canvas.height, handle.theme);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(bgColor.r, bgColor.g, bgColor.b, bgColor.a);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Enable scissor for plot-area clipping
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(
    Math.floor(plotArea.left),
    Math.floor(canvas.height - plotArea.top - plotArea.height), // GL origin is bottom-left
    Math.ceil(plotArea.width),
    Math.ceil(plotArea.height)
  );

  // Render grid lines first
  renderGridLines(handle, gl, plotArea);

  // Render data
  switch (options.plotType) {
    case 'line':
      renderLines(handle, gl, plotArea);
      break;
    case 'bars':
      renderBars(handle, gl, plotArea);
      break;
    case 'heatmap':
      renderHeatmap(handle, gl, plotArea);
      break;
  }

  gl.disable(gl.SCISSOR_TEST);
  gl.flush();
}

// =============================================================================
// Grid Lines
// =============================================================================

// Per-handle render cache to prevent cache thrashing between plots
interface GL2RenderCache {
  gridZoomX: number; gridZoomY: number; gridPanX: number; gridPanY: number;
  gridVertexCount: number; gridVertices: Float32Array;
  lineGeneration: number; lineStripLengths: number[]; lineTotalVertices: number;
  barGeneration: number; barZoomX: number; barZoomY: number; barPanX: number; barPanY: number;
  barInstanceData: Float32Array; barInstanceCount: number;
  heatmapGeneration: number; heatmapTextureData: HeatmapTextureData | null;
}

const gl2RenderCaches = new Map<string, GL2RenderCache>();

function getGL2Cache(handleId: string): GL2RenderCache {
  let cache = gl2RenderCaches.get(handleId);
  if (!cache) {
    cache = {
      gridZoomX: NaN, gridZoomY: NaN, gridPanX: NaN, gridPanY: NaN,
      gridVertexCount: 0, gridVertices: new Float32Array(0),
      lineGeneration: -1, lineStripLengths: [], lineTotalVertices: 0,
      barGeneration: -1, barZoomX: NaN, barZoomY: NaN, barPanX: NaN, barPanY: NaN,
      barInstanceData: new Float32Array(0), barInstanceCount: 0,
      heatmapGeneration: -1, heatmapTextureData: null,
    };
    gl2RenderCaches.set(handleId, cache);
  }
  return cache;
}

function renderGridLines(handle: PlotHandle, gl: WebGL2RenderingContext, plotArea: PlotArea): void {
  const options = handle.options as Plot2DOptions;
  const dynOpts = handle.dynamicOptions;
  const theme = handle.theme;
  const resources = handle.webgl2Resources!;
  const cache = getGL2Cache(handle.id);

  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];
  if (!xAxis || !yAxis) return;

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

    const xTicks = calculateNiceTicks(xVisibleMin, xVisibleMax, 5, xAxis.logarithmic || false);
    const yTicks = calculateNiceTicks(yVisibleMin, yVisibleMax, 5, yAxis.logarithmic || false);

    const gridColor = hexToRgba(theme.gridColor);

    // Estimate max vertices: 2 per tick line (x ticks + y ticks)
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
    const buf = ensureBuffer(gl, resources, 'gridVertex', writeIdx * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, cache.gridVertices.subarray(0, writeIdx));
  }

  if (cache.gridVertexCount === 0) return;

  const data = cache.gridVertices;
  const vertexCount = cache.gridVertexCount;

  const prog = ensureProgram(gl, resources, 'grid');
  gl.useProgram(prog.program);

  // Upload vertices
  const buf = ensureBuffer(gl, resources, 'gridVertex', data.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);

  // Set up attributes
  const posLoc = prog.attribLocations['a_position'];
  const colLoc = prog.attribLocations['a_color'];
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(colLoc);
  gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 24, 8);

  // Uniforms
  setPlotBoundsUniform(gl, prog.uniformLocations['u_plotBounds'], handle, plotArea);

  gl.drawArrays(gl.LINES, 0, vertexCount);

  gl.disableVertexAttribArray(posLoc);
  gl.disableVertexAttribArray(colLoc);
}

// =============================================================================
// Line Rendering
// =============================================================================

function renderLines(handle: PlotHandle, gl: WebGL2RenderingContext, plotArea: PlotArea): void {
  const data = handle.data as Data2D;
  if (!data || data.channels.length === 0) return;

  const options = handle.options as Plot2DOptions;
  const dynOpts = handle.dynamicOptions;
  const theme = handle.theme;
  const resources = handle.webgl2Resources!;
  const cache = getGL2Cache(handle.id);

  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];
  if (!xAxis || !yAxis) return;

  const prog = ensureProgram(gl, resources, 'line');
  gl.useProgram(prog.program);

  // Only rebuild vertex buffer when data generation changes
  if (data.generation !== cache.lineGeneration) {
    cache.lineGeneration = data.generation;

    // Count total points for pre-allocation
    let totalPoints = 0;
    for (let ch = 0; ch < data.channels.length; ch++) {
      totalPoints += data.channels[ch].length;
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

    const buf = ensureBuffer(gl, resources, 'lineVertex', vertices.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
  } else {
    // Data unchanged — just bind existing buffer
    const buf = resources.buffers.get('lineVertex');
    if (!buf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  }

  if (cache.lineTotalVertices === 0) return;

  // Set up attributes
  const posLoc = prog.attribLocations['a_position'];
  const colLoc = prog.attribLocations['a_color'];
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(colLoc);
  gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 24, 8);

  // Uniforms — only these update on zoom/pan (cheap)
  setPlotBoundsUniform(gl, prog.uniformLocations['u_plotBounds'], handle, plotArea);
  setAxisTransformUniforms(gl, prog, handle, plotArea);

  let offset = 0;
  for (const stripLength of cache.lineStripLengths) {
    if (stripLength > 1) {
      gl.drawArrays(gl.LINE_STRIP, offset, stripLength);
    }
    offset += stripLength;
  }

  gl.disableVertexAttribArray(posLoc);
  gl.disableVertexAttribArray(colLoc);
}

// =============================================================================
// Bar Rendering (instanced)
// =============================================================================

// Static quad vertices (never changes)
const BAR_QUAD_VERTICES = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

function renderBars(handle: PlotHandle, gl: WebGL2RenderingContext, plotArea: PlotArea): void {
  const data = handle.data as Data2D;
  if (!data || data.channels.length === 0) return;

  const options = handle.options as Plot2DOptions;
  const dynOpts = handle.dynamicOptions;
  const theme = handle.theme;
  const resources = handle.webgl2Resources!;
  const cache = getGL2Cache(handle.id);

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

    const slotWidth = isCategorical ? 2 / numBars : 2 / (numBars * 1.5);
    const barGroupWidth = slotWidth * 0.8;
    const barWidth = barGroupWidth / numChannels;
    const barGap = barWidth * 0.1;

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
        const xNorm = isCategorical
          ? ((i + 0.5) / numBars) * 2 - 1
          : ((x - xVisibleMin) / (xVisibleMax - xVisibleMin)) * 2 - 1;
        const barX = xNorm - barGroupWidth / 2 + ch * barWidth + barGap / 2;
        const yNorm = ((y - yVisibleMin) / (yVisibleMax - yVisibleMin)) * 2 - 1;
        const barHeight = yNorm - (-1);

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

    // Upload to GPU
    const instBuf = ensureBuffer(gl, resources, 'barInstance', writeIdx * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, cache.barInstanceData.subarray(0, writeIdx));
  }

  if (cache.barInstanceCount === 0) return;

  const instanceCount = cache.barInstanceCount;

  const prog = ensureProgram(gl, resources, 'bar');
  gl.useProgram(prog.program);

  // Quad buffer (static)
  let quadBuf = resources.buffers.get('barQuad');
  if (!quadBuf) {
    quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, BAR_QUAD_VERTICES, gl.STATIC_DRAW);
    resources.buffers.set('barQuad', quadBuf);
    resources.bufferSizes.set('barQuad', BAR_QUAD_VERTICES.byteLength);
  }

  // Bind instance buffer (already uploaded above or from previous frame)
  const instBuf = resources.buffers.get('barInstance');
  if (!instBuf) return;

  // Set up corner attribute (per-vertex)
  const cornerLoc = prog.attribLocations['a_corner'];
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(cornerLoc);
  gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(cornerLoc, 0); // per-vertex

  // Set up instance attributes
  const rectLoc = prog.attribLocations['a_barRect'];
  const colLoc = prog.attribLocations['a_color'];
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);

  gl.enableVertexAttribArray(rectLoc);
  gl.vertexAttribPointer(rectLoc, 4, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(rectLoc, 1); // per-instance

  gl.enableVertexAttribArray(colLoc);
  gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(colLoc, 1); // per-instance

  // Uniforms
  setTransformUniform(gl, prog.uniformLocations['u_transform']);
  setPlotBoundsUniform(gl, prog.uniformLocations['u_plotBounds'], handle, plotArea);

  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);

  // Reset divisors
  gl.vertexAttribDivisor(rectLoc, 0);
  gl.vertexAttribDivisor(colLoc, 0);

  gl.disableVertexAttribArray(cornerLoc);
  gl.disableVertexAttribArray(rectLoc);
  gl.disableVertexAttribArray(colLoc);
}

// =============================================================================
// Heatmap Rendering
// =============================================================================

// Static heatmap quad vertices (never changes)
const HEATMAP_QUAD_VERTICES = new Float32Array([
  -1, -1, 0, 1,
   1, -1, 1, 1,
  -1,  1, 0, 0,
  -1,  1, 0, 0,
   1, -1, 1, 1,
   1,  1, 1, 0,
]);

function renderHeatmap(handle: PlotHandle, gl: WebGL2RenderingContext, plotArea: PlotArea): void {
  const data = handle.data as HeatmapData;
  if (!data || data.channels.length === 0) return;

  const resources = handle.webgl2Resources!;
  const cache = getGL2Cache(handle.id);

  // Only rebuild texture data when data generation changes
  if (data.generation !== cache.heatmapGeneration) {
    cache.heatmapGeneration = data.generation;
    cache.heatmapTextureData = buildHeatmapTextureData(data);
  }

  const textureData = cache.heatmapTextureData!;
  if (textureData.width === 0 || textureData.height === 0) return;

  // Ensure R32F texture
  const tex = ensureFloatTexture(gl, resources, 'heatmap', textureData.width, textureData.height);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, textureData.width, textureData.height, gl.RED, gl.FLOAT, textureData.data);

  const prog = ensureProgram(gl, resources, 'heatmap');
  gl.useProgram(prog.program);

  // Static quad buffer (uploaded once)
  let buf = resources.buffers.get('heatmapVertex');
  if (!buf) {
    buf = ensureBuffer(gl, resources, 'heatmapVertex', HEATMAP_QUAD_VERTICES.byteLength, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, HEATMAP_QUAD_VERTICES);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);

  const posLoc = prog.attribLocations['a_position'];
  const tcLoc = prog.attribLocations['a_texCoord'];
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(tcLoc);
  gl.vertexAttribPointer(tcLoc, 2, gl.FLOAT, false, 16, 8);

  // Uniforms
  setTransformUniform(gl, prog.uniformLocations['u_transform']);
  setPlotBoundsUniform(gl, prog.uniformLocations['u_plotBounds'], handle, plotArea);
  gl.uniform2f(prog.uniformLocations['u_valueRange'], textureData.minValue, textureData.maxValue);

  // Bind texture to unit 0
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(prog.uniformLocations['u_heatmapTexture'], 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.disableVertexAttribArray(posLoc);
  gl.disableVertexAttribArray(tcLoc);
}

// =============================================================================
// Heatmap Texture Data Builder (shared with WebGPU)
// =============================================================================

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

// =============================================================================
// Uniform Helpers
// =============================================================================

// Cached identity matrix to avoid re-creating every frame
const IDENTITY_MATRIX = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function setTransformUniform(gl: WebGL2RenderingContext, loc: WebGLUniformLocation | null): void {
  if (!loc) return;
  gl.uniformMatrix4fv(loc, false, IDENTITY_MATRIX);
}

function setPlotBoundsUniform(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  handle: PlotHandle,
  plotArea: PlotArea
): void {
  if (!loc) return;
  const canvas = handle.webgl2Canvas || handle.canvas;
  if (!canvas) return;

  const w = canvas.width;
  const h = canvas.height;

  const left = (plotArea.left / w) * 2 - 1;
  const right = ((plotArea.left + plotArea.width) / w) * 2 - 1;
  const bottom = 1 - ((plotArea.top + plotArea.height) / h) * 2;
  const top = 1 - (plotArea.top / h) * 2;

  gl.uniform4f(loc, left, bottom, right, top);
}

/**
 * Set axis transform uniforms for GPU-side data normalization.
 * Encodes visible range as scale+offset so the shader can transform
 * raw data coordinates to [-1,1] without CPU-side per-vertex work.
 * For logarithmic axes, the shader applies log10() then this linear transform.
 */
function setAxisTransformUniforms(
  gl: WebGL2RenderingContext,
  prog: { uniformLocations: Record<string, WebGLUniformLocation | null> },
  handle: PlotHandle,
  plotArea: PlotArea
): void {
  const options = handle.options as Plot2DOptions;
  const dynOpts = handle.dynamicOptions;
  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];

  // Visible ranges must be computed in log-space for logarithmic axes.
  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { visibleMin: xVisibleMin, visibleMax: xVisibleMax } = computeVisibleRange(
    xMin, xMax, dynOpts.zoomX, dynOpts.panX, xAxis.logarithmic || false
  );

  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { visibleMin: yVisibleMin, visibleMax: yVisibleMax } = computeVisibleRange(
    yMin, yMax, dynOpts.zoomY, dynOpts.panY, yAxis.logarithmic || false
  );

  // Compute scale + offset for linear transform: val * scale + offset = NDC [-1,1]
  let xScale: number, xOffset: number;
  const xLog = xAxis.logarithmic ? 1.0 : 0.0;
  if (xAxis.logarithmic) {
    const logMin = Math.log10(Math.max(xVisibleMin, 1e-10));
    const logMax = Math.log10(Math.max(xVisibleMax, 1e-10));
    xScale = 2 / (logMax - logMin);
    xOffset = -(logMin * xScale + 1);
  } else {
    xScale = 2 / (xVisibleMax - xVisibleMin);
    xOffset = -(xVisibleMin * xScale + 1);
  }

  let yScale: number, yOffset: number;
  const yLog = yAxis.logarithmic ? 1.0 : 0.0;
  if (yAxis.logarithmic) {
    const logMin = Math.log10(Math.max(yVisibleMin, 1e-10));
    const logMax = Math.log10(Math.max(yVisibleMax, 1e-10));
    yScale = 2 / (logMax - logMin);
    yOffset = -(logMin * yScale + 1);
  } else {
    yScale = 2 / (yVisibleMax - yVisibleMin);
    yOffset = -(yVisibleMin * yScale + 1);
  }

  const xTransformLoc = prog.uniformLocations['u_xTransform'];
  const yTransformLoc = prog.uniformLocations['u_yTransform'];
  if (xTransformLoc) gl.uniform4f(xTransformLoc, xScale, xOffset, xLog, 0);
  if (yTransformLoc) gl.uniform4f(yTransformLoc, yScale, yOffset, yLog, 0);
}
