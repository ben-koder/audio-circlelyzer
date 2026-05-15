/**
 * WebGL2 3D Rendering
 *
 * Renders 3D plot data (surfaces, linestrips) and the 3D coordinate box.
 * Mirrors the WebGPU 3D renderer but uses WebGL2 API.
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
import { getBackWallPositions } from '../3d/box-utils';
import { ensureProgram, createWebGL2Resources } from './programs';
import { ensureBuffer, ensureIndexBuffer, ensureDepthRenderbuffer } from './buffers';

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

interface GL2_3DCache {
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

const gl2_3DCaches = new Map<string, GL2_3DCache>();

function get3DCache(id: string): GL2_3DCache {
  let c = gl2_3DCaches.get(id);
  if (!c) {
    c = {
      lsGeneration: -1, lsOptionsRef: null, lsThemeRef: null, lsVertexData: null, lsStripLengths: [],
      sfGeneration: -1, sfOptionsRef: null, sfThemeRef: null, sfVertexData: null, sfIndexData: null,
      boxRotX: NaN, boxRotY: NaN, boxNumCh: -1,
      boxZMin: NaN, boxZMax: NaN, boxAxisColor: '', boxGridColor: '',
      boxData: null,
    };
    gl2_3DCaches.set(id, c);
  }
  return c;
}

// =============================================================================
// Main Entry Point
// =============================================================================

export function renderWebGL2_3D(handle: PlotHandle): void {
  
  const options = handle.options;
  if (!isPlot3DOptions(options)) return;

  const gl = handle.webgl2Context;
  const canvas = handle.webgl2Canvas || handle.canvas;
  if (!gl || !canvas) return;

  if (!handle.webgl2Resources) {
    handle.webgl2Resources = createWebGL2Resources();
  }

  const resources = handle.webgl2Resources;
  const bgColor = hexToRgba(handle.theme.backgroundColor);
  const plotArea = calculatePlotArea(canvas.width, canvas.height, handle.theme);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(bgColor.r, bgColor.g, bgColor.b, bgColor.a);

  // Enable depth testing
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Set viewport to plot area
  gl.viewport(
    Math.floor(plotArea.left),
    Math.floor(canvas.height - plotArea.top - plotArea.height),
    Math.ceil(plotArea.width),
    Math.ceil(plotArea.height)
  );

  // Build uniforms (model, view, projection)
  const uniforms = build3DUniforms(handle, plotArea);

  // Build 3D box data
  const boxData = build3DBoxData(handle);

  // Render walls (transparent, blended)
  renderWalls(handle, gl, boxData, uniforms);

  // Render grid
  renderGrid3D(handle, gl, boxData, uniforms);

  // Render data
  switch (options.plotType) {
    case 'linestrips':
      renderLinestrips(handle, gl, uniforms);
      break;
    case 'surface':
      renderSurface(handle, gl, uniforms);
      break;
  }

  gl.disable(gl.DEPTH_TEST);
  gl.flush();
}

// =============================================================================
// Uniform Struct
// =============================================================================

interface Uniforms3D {
  model: Float32Array;
  view: Float32Array;
  projection: Float32Array;
  lightDirection: Float32Array;
}

function set3DMatrixUniforms(
  gl: WebGL2RenderingContext,
  prog: { uniformLocations: Record<string, WebGLUniformLocation | null> },
  uniforms: Uniforms3D
): void {
  gl.uniformMatrix4fv(prog.uniformLocations['u_modelMatrix'], false, uniforms.model);
  gl.uniformMatrix4fv(prog.uniformLocations['u_viewMatrix'], false, uniforms.view);
  gl.uniformMatrix4fv(prog.uniformLocations['u_projectionMatrix'], false, uniforms.projection);
  if (prog.uniformLocations['u_lightDirection']) {
    gl.uniform4fv(prog.uniformLocations['u_lightDirection'], uniforms.lightDirection);
  }
}

// =============================================================================
// Wall Rendering
// =============================================================================

function renderWalls(
  handle: PlotHandle,
  gl: WebGL2RenderingContext,
  boxData: Box3DData,
  uniforms: Uniforms3D
): void {
  if (boxData.fillVertexCount === 0) return;

  const resources = handle.webgl2Resources!;
  const prog = ensureProgram(gl, resources, 'wall');
  gl.useProgram(prog.program);

  set3DMatrixUniforms(gl, prog, uniforms);

  const buf = ensureBuffer(gl, resources, 'wallFill', boxData.fillVertices.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, boxData.fillVertices);

  const posLoc = prog.attribLocations['a_position'];
  const colLoc = prog.attribLocations['a_color'];
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(colLoc);
  gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 28, 12);

  // Enable blending for transparent walls
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);

  gl.drawArrays(gl.TRIANGLES, 0, boxData.fillVertexCount);

  gl.depthMask(true);
  gl.disable(gl.BLEND);

  gl.disableVertexAttribArray(posLoc);
  gl.disableVertexAttribArray(colLoc);
}

// =============================================================================
// Grid 3D Rendering
// =============================================================================

function renderGrid3D(
  handle: PlotHandle,
  gl: WebGL2RenderingContext,
  boxData: Box3DData,
  uniforms: Uniforms3D
): void {
  if (boxData.lineVertexCount === 0) return;

  const resources = handle.webgl2Resources!;
  const prog = ensureProgram(gl, resources, 'grid3d');
  gl.useProgram(prog.program);

  set3DMatrixUniforms(gl, prog, uniforms);

  const buf = ensureBuffer(gl, resources, 'grid3d', boxData.lineVertices.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, boxData.lineVertices);

  const posLoc = prog.attribLocations['a_position'];
  const colLoc = prog.attribLocations['a_color'];
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(colLoc);
  gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 28, 12);

  gl.drawArrays(gl.LINES, 0, boxData.lineVertexCount);

  gl.disableVertexAttribArray(posLoc);
  gl.disableVertexAttribArray(colLoc);
}

// =============================================================================
// Linestrip Rendering
// =============================================================================

function renderLinestrips(
  handle: PlotHandle,
  gl: WebGL2RenderingContext,
  uniforms: Uniforms3D
): void {
  const data = handle.data as Data3D;
  if (!data || data.channels.length === 0) return;

  const options = handle.options as Plot3DOptions;
  const theme = handle.theme;
  const resources = handle.webgl2Resources!;
  const cache = get3DCache(handle.id);

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

  const prog = ensureProgram(gl, resources, 'linestrip');
  gl.useProgram(prog.program);

  set3DMatrixUniforms(gl, prog, uniforms);

  const buf = ensureBuffer(gl, resources, 'linestrip', vertexData.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  if (needsUpload) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
  }

  const posLoc = prog.attribLocations['a_position'];
  const colLoc = prog.attribLocations['a_color'];
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(colLoc);
  gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 28, 12);

  // Draw each linestrip separately
  let offset = 0;
  for (const stripLength of cache.lsStripLengths) {
    if (stripLength > 1) {
      gl.drawArrays(gl.LINE_STRIP, offset, stripLength);
    }
    offset += stripLength;
  }

  gl.disableVertexAttribArray(posLoc);
  gl.disableVertexAttribArray(colLoc);
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

  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { min: zMin, max: zMax } = getAxisRange(zAxis);

  const numChannels = data.channels.length;
  const channelColors = getChannelColors(numChannels, theme);
  const channelSpacing = 0.15;
  const zAxisOriginalRange = zMax - zMin;
  const yRange = yMax - yMin;

  for (let ch = 0; ch < numChannels; ch++) {
    const channel = data.channels[ch];
    if (!channel || channel.vertices.length === 0) continue;

    const baseColor = channelColors[ch];
    const channelZOffset = ch * (zAxisOriginalRange + zAxisOriginalRange * channelSpacing);
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
        const px = verts[idx];
        const py = verts[idx + 1];
        const pz = verts[idx + 2];

        const nx = ((px - xMin) / (xMax - xMin)) * 2 - 1;
        const ny = ((py - yMin) / yRange) * 2 - 1;
        const zValWithOffset = pz + channelZOffset;
        const nz = ((zValWithOffset - zMinExpanded) / (zMaxExpanded - zMinExpanded)) * 2 - 1;

        const yNormalized = (py - yMin) / yRange;
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
  gl: WebGL2RenderingContext,
  uniforms: Uniforms3D
): void {
  const data = handle.data as Data3D;
  if (!data || data.channels.length === 0) return;

  const options = handle.options as Plot3DOptions;
  const theme = handle.theme;
  const resources = handle.webgl2Resources!;
  const cache = get3DCache(handle.id);

  let vertexData: Float32Array;
  let indexData: Uint32Array;
  let needsUpload = true;

  if (data.generation === cache.sfGeneration && options === cache.sfOptionsRef && theme === cache.sfThemeRef && cache.sfVertexData && cache.sfIndexData) {
    vertexData = cache.sfVertexData;
    indexData = cache.sfIndexData;
    needsUpload = false;
  } else {
    const result = buildSurfaceVertices(handle, data, options, theme);
    if (result.vertices.length === 0 || result.indices.length === 0) return;
    vertexData = new Float32Array(result.vertices);
    indexData = new Uint32Array(result.indices);
    cache.sfGeneration = data.generation;
    cache.sfOptionsRef = options;
    cache.sfThemeRef = theme;
    cache.sfVertexData = vertexData;
    cache.sfIndexData = indexData;
  }

  const prog = ensureProgram(gl, resources, 'surface');
  gl.useProgram(prog.program);

  set3DMatrixUniforms(gl, prog, uniforms);

  // Vertex buffer
  const vBuf = ensureBuffer(gl, resources, 'surface', vertexData.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, vBuf);
  if (needsUpload) {
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
  }

  // Index buffer
  const iBuf = ensureIndexBuffer(gl, resources, 'surfaceIndex', indexData.byteLength, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf);
  if (needsUpload) {
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indexData);
  }

  // Attributes: position(3) + normal(3) + color(4) = 40 bytes stride
  const posLoc = prog.attribLocations['a_position'];
  const normLoc = prog.attribLocations['a_normal'];
  const colLoc = prog.attribLocations['a_color'];

  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(normLoc);
  gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(colLoc);
  gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 40, 24);

  gl.disable(gl.CULL_FACE);
  gl.drawElements(gl.TRIANGLES, indexData.length, gl.UNSIGNED_INT, 0);

  gl.disableVertexAttribArray(posLoc);
  gl.disableVertexAttribArray(normLoc);
  gl.disableVertexAttribArray(colLoc);
}

function buildSurfaceVertices(
  handle: PlotHandle,
  data: Data3D,
  options: Plot3DOptions,
  theme: PlotTheme
): { vertices: number[]; indices: number[] } {
  const vertices: number[] = [];
  const indices: number[] = [];

  const axes = options.axesMetadata;
  const xAxis = axes[0];
  const yAxis = axes[1];
  const zAxis = axes[2];
  if (!xAxis || !yAxis || !zAxis) return { vertices, indices };

  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { min: zMinBase, max: zMaxBase } = getAxisRange(zAxis);

  const numChannels = data.channels.length;
  if (numChannels < 1) return { vertices, indices };

  const channelColors = getChannelColors(numChannels, theme);
  const channelSpacing = 0.15;
  const zAxisOriginalRange = zMaxBase - zMinBase;
  const zAxisExpandedRange = zAxisOriginalRange * (numChannels + (numChannels - 1) * channelSpacing);
  const zMin = zMinBase;
  const zMax = zMin + zAxisExpandedRange;
  const yRange = yMax - yMin;

  let globalVertexOffset = 0;

  for (let ch = 0; ch < numChannels; ch++) {
    const channel = data.channels[ch];
    if (!channel || channel.rowCount < 2) continue;

    const baseColor = channelColors[ch];
    const channelZOffset = ch * (zAxisOriginalRange + zAxisOriginalRange * channelSpacing);

    const pointsPerStrip = channel.pointsPerRow;
    if (pointsPerStrip < 2) continue;

    const channelVertexOffset = globalVertexOffset;
    const verts = channel.vertices;

    for (let row = 0; row < channel.rowCount; row++) {
      const rowStart = row * pointsPerStrip * 3;
      for (let p = 0; p < pointsPerStrip; p++) {
        const idx = rowStart + p * 3;
        const px = verts[idx];
        const py = verts[idx + 1];
        const pz = verts[idx + 2];

        const nx = ((px - xMin) / (xMax - xMin)) * 2 - 1;
        const ny = ((py - yMin) / yRange) * 2 - 1;
        const zValWithOffset = pz + channelZOffset;
        const nz = ((zValWithOffset - zMin) / (zMax - zMin)) * 2 - 1;

        const yNormalized = (py - yMin) / yRange;
        const color = getGradientColor(baseColor, yNormalized);

        // pos(3) + normal(3) + color(4)
        vertices.push(nx, ny, nz, 0, 1, 0, color.r, color.g, color.b, color.a);
        globalVertexOffset++;
      }
    }

    for (let row = 0; row < channel.rowCount - 1; row++) {
      const row0Start = channelVertexOffset + row * pointsPerStrip;
      const row1Start = channelVertexOffset + (row + 1) * pointsPerStrip;
      for (let i = 0; i < pointsPerStrip - 1; i++) {
        const v00 = row0Start + i;
        const v01 = row0Start + i + 1;
        const v10 = row1Start + i;
        const v11 = row1Start + i + 1;
        indices.push(v00, v10, v01);
        indices.push(v01, v10, v11);
      }
    }
  }

  return { vertices, indices };
}

// =============================================================================
// 3D Box Building (same as WebGPU)
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

  const wallColorYZ: RGBA = { r: 0.4, g: 0.4, b: 0.5, a: 0.12 };
  const wallColorXZ: RGBA = { r: 0.4, g: 0.5, b: 0.4, a: 0.12 };
  const wallColorXY: RGBA = { r: 0.5, g: 0.4, b: 0.4, a: 0.12 };

  const lineVertices: number[] = [];
  const fillVertices: number[] = [];

  const numChannels = data?.channels.length || 1;
  const channelSpacing = 0.15;
  const zAxis = options.axesMetadata[2];
  const zRange = zAxis ? getAxisRange(zAxis) : { min: -1, max: 1 };
  const zAxisOriginalMin = zRange.min;
  const zAxisOriginalMax = zRange.max;
  const zAxisOriginalRange = zAxisOriginalMax - zAxisOriginalMin;
  const zAxisExpandedRange = zAxisOriginalRange * (numChannels + (numChannels - 1) * channelSpacing);

  const zGridPositions: number[] = [];
  const ticksPerChannel = 3;
  for (let ch = 0; ch < numChannels; ch++) {
    const channelZOffset = ch * (zAxisOriginalRange + zAxisOriginalRange * channelSpacing);
    for (let t = 0; t <= ticksPerChannel; t++) {
      const tickFraction = t / ticksPerChannel;
      const zVal = zAxisOriginalMin + tickFraction * zAxisOriginalRange + channelZOffset;
      const zNorm = ((zVal - zAxisOriginalMin) / zAxisExpandedRange) * 2 - 1;
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
    fillVertices.push(corners[0][0], corners[0][1], corners[0][2], color.r, color.g, color.b, color.a);
    fillVertices.push(corners[1][0], corners[1][1], corners[1][2], color.r, color.g, color.b, color.a);
    fillVertices.push(corners[2][0], corners[2][1], corners[2][2], color.r, color.g, color.b, color.a);
    fillVertices.push(corners[0][0], corners[0][1], corners[0][2], color.r, color.g, color.b, color.a);
    fillVertices.push(corners[2][0], corners[2][1], corners[2][2], color.r, color.g, color.b, color.a);
    fillVertices.push(corners[3][0], corners[3][1], corners[3][2], color.r, color.g, color.b, color.a);
  };

  const gridSteps = 5;
  const gridAlpha: RGBA = { ...gridColor, a: gridColor.a * 0.5 };

  const solidWallX = walls.backX;
  const solidWallY = walls.backY;
  const solidWallZ = walls.backZ;

  // Wall 1: YZ plane
  addQuad([
    [solidWallX, -1, -1], [solidWallX, 1, -1],
    [solidWallX, 1, 1], [solidWallX, -1, 1],
  ], wallColorYZ);
  addLine(solidWallX, -1, -1, solidWallX, 1, -1, axisColor);
  addLine(solidWallX, 1, -1, solidWallX, 1, 1, axisColor);
  addLine(solidWallX, 1, 1, solidWallX, -1, 1, axisColor);
  addLine(solidWallX, -1, 1, solidWallX, -1, -1, axisColor);
  for (let i = 1; i < gridSteps; i++) {
    const t = (i / gridSteps) * 2 - 1;
    addLine(solidWallX, t, -1, solidWallX, t, 1, gridAlpha);
  }
  for (const zPos of zGridPositions) {
    if (zPos > -0.99 && zPos < 0.99) {
      addLine(solidWallX, -1, zPos, solidWallX, 1, zPos, gridAlpha);
    }
  }

  // Wall 2: XZ plane
  addQuad([
    [-1, solidWallY, -1], [1, solidWallY, -1],
    [1, solidWallY, 1], [-1, solidWallY, 1],
  ], wallColorXZ);
  addLine(-1, solidWallY, -1, 1, solidWallY, -1, axisColor);
  addLine(1, solidWallY, -1, 1, solidWallY, 1, axisColor);
  addLine(1, solidWallY, 1, -1, solidWallY, 1, axisColor);
  addLine(-1, solidWallY, 1, -1, solidWallY, -1, axisColor);
  for (const zPos of zGridPositions) {
    if (zPos > -0.99 && zPos < 0.99) {
      addLine(-1, solidWallY, zPos, 1, solidWallY, zPos, gridAlpha);
    }
  }
  for (let i = 1; i < gridSteps; i++) {
    const t = (i / gridSteps) * 2 - 1;
    addLine(t, solidWallY, -1, t, solidWallY, 1, gridAlpha);
  }

  // Wall 3: XY plane
  addQuad([
    [-1, -1, solidWallZ], [1, -1, solidWallZ],
    [1, 1, solidWallZ], [-1, 1, solidWallZ],
  ], wallColorXY);
  addLine(-1, -1, solidWallZ, 1, -1, solidWallZ, axisColor);
  addLine(1, -1, solidWallZ, 1, 1, solidWallZ, axisColor);
  addLine(1, 1, solidWallZ, -1, 1, solidWallZ, axisColor);
  addLine(-1, 1, solidWallZ, -1, -1, solidWallZ, axisColor);
  for (let i = 1; i < gridSteps; i++) {
    const t = (i / gridSteps) * 2 - 1;
    addLine(-1, t, solidWallZ, 1, t, solidWallZ, gridAlpha);
    addLine(t, -1, solidWallZ, t, 1, solidWallZ, gridAlpha);
  }

  // Connecting edges
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

function build3DUniforms(handle: PlotHandle, plotArea: PlotArea): Uniforms3D {
  const dynOpts = handle.dynamicOptions as Plot3DDynamicOptions;

  const model = createModelMatrix(dynOpts);
  const view = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  const aspect = plotArea.width / plotArea.height;
  const projection = createProjectionMatrix(aspect, dynOpts.zoomX);
  const lightDirection = new Float32Array([0.5, 0.8, 0.6, 0]);

  return { model, view, projection, lightDirection };
}

function createModelMatrix(dynOpts: Plot3DDynamicOptions): Float32Array {
  const sx = dynOpts.zoomX;
  const sy = dynOpts.zoomY;
  const sz = dynOpts.zoomZ;

  const cosX = Math.cos(-dynOpts.rotationX);
  const sinX = Math.sin(-dynOpts.rotationX);
  const cosY = Math.cos(dynOpts.rotationY);
  const sinY = Math.sin(dynOpts.rotationY);

  const tx = dynOpts.panX * 0.5;
  const ty = dynOpts.panY * 0.5;
  const tz = dynOpts.panZ * 0.5;

  return new Float32Array([
    cosY * sx, sinX * sinY * sx, -cosX * sinY * sx, 0,
    0, cosX * sy, sinX * sy, 0,
    sinY * sz, -sinX * cosY * sz, cosX * cosY * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function createProjectionMatrix(aspect: number, zoomX: number): Float32Array {
  const perspective = 6.0;
  const scale = 3.6 * zoomX;
  const zScale = 1.25;
  const zOffset = 5.0;

  return new Float32Array([
    scale / aspect, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, zScale, 1,
    0, 0, zOffset, perspective,
  ]);
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
    colors.push(hexToRgba(theme.channelColors[i % theme.channelColors.length]));
  }
  return colors;
}

function getGradientColor(baseColor: RGBA, yNormalized: number): RGBA {
  const y = Math.max(0, Math.min(1, yNormalized));
  const shadeFactor = 0.4 + y * 0.8;
  return {
    r: Math.min(1, baseColor.r * shadeFactor),
    g: Math.min(1, baseColor.g * shadeFactor),
    b: Math.min(1, baseColor.b * shadeFactor),
    a: baseColor.a,
  };
}
