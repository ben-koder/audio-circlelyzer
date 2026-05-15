/**
 * Canvas 2D - 3D Rendering (Software)
 *
 * Software-based 3D rendering for Canvas 2D fallback.
 * Includes 3D box with walls, grid lines, axis labels, and channel separators.
 */

import {
  Data3D,
  Data3DChannel,
  PlotHandle,
  Plot3DDynamicOptions,
  Plot3DOptions,
  PlotTheme,
  isData3D,
} from '../../types';
import { RenderingContext, PlotArea, hexToRgba, calculateNiceTicks, TickResult, getAxisRange, formatAxisLabel } from '../../utils';
import { getBackWallPositions, getLabelEdgePositions, WallPositions, LabelEdgePositions } from './box-utils';

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Draw 3D data using Canvas 2D (software rendering)
 */
export function draw3DData(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea
): void {
  const data = handle.data;
  if (!isData3D(data) || data.channels.length === 0) return;

  const theme = handle.theme;
  const dynOpts = handle.dynamicOptions as Plot3DDynamicOptions;
  const options = handle.options as Plot3DOptions;

  const centerX = plotArea.left + plotArea.width / 2;
  const centerY = plotArea.top + plotArea.height / 2;
  const scale = Math.min(plotArea.width, plotArea.height) * 0.3 * dynOpts.zoomX;

  // Get axis ranges using effective range
  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];
  const zAxis = options.axesMetadata[2];
  const { min: xMin, max: xMax } = xAxis ? getAxisRange(xAxis) : { min: -1, max: 1 };
  const { min: yMin, max: yMax } = yAxis ? getAxisRange(yAxis) : { min: -1, max: 1 };
  const { min: zMinBase, max: zMaxBase } = zAxis ? getAxisRange(zAxis) : { min: -1, max: 1 };

  // For multi-channel, expand z-axis to accommodate all channels
  const numChannels = data.channels.length;
  const channelSpacing = 0.15; // Extra space between channels (15% of channel range)
  const zAxisOriginalRange = zMaxBase - zMinBase;
  // Total range = numChannels * dataRange + (numChannels-1) * gapSize
  const zAxisExpandedRange = zAxisOriginalRange * (numChannels + (numChannels - 1) * channelSpacing);
  const zMin = zMinBase;
  const zMax = zMin + zAxisExpandedRange;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);
  ctx.clip();

  // Draw 3D box walls (before data so they appear behind)
  draw3DBox(ctx, handle, plotArea, centerX, centerY, scale, numChannels, zMin, zMax);

  // Draw separator lines between channels
  if (numChannels > 1) {
    drawChannelSeparators(
      ctx,
      theme,
      dynOpts,
      numChannels,
      zAxisOriginalRange,
      channelSpacing,
      zMin,
      zMax,
      centerX,
      centerY,
      scale
    );
  }

  // Draw data
  for (let ch = 0; ch < data.channels.length; ch++) {
    const channelData = data.channels[ch];
    if (!channelData || channelData.vertices.length === 0) continue;

    const channelColor = theme.channelColors[ch % theme.channelColors.length];
    ctx.strokeStyle = channelColor;
    ctx.lineWidth = 1.5;

    // Calculate z-offset for this channel
    const channelZOffset = ch * (zAxisOriginalRange + zAxisOriginalRange * channelSpacing);

    if (options.plotType === 'linestrips') {
      drawLinestrips(
        ctx,
        channelData,
        xMin,
        xMax,
        yMin,
        yMax,
        zMin,
        zMax,
        channelZOffset,
        dynOpts,
        centerX,
        centerY,
        scale
      );
    } else if (options.plotType === 'surface') {
      drawSurface(
        ctx,
        channelData,
        xMin,
        xMax,
        yMin,
        yMax,
        zMin,
        zMax,
        channelZOffset,
        dynOpts,
        centerX,
        centerY,
        scale,
        channelColor
      );
    }
  }

  ctx.restore();
}

// =============================================================================
// 3D Projection
// =============================================================================

/**
 * Project a 3D point to 2D screen coordinates
 */
function project3DTo2D(
  x: number,
  y: number,
  z: number,
  dynOpts: Plot3DDynamicOptions,
  centerX: number,
  centerY: number,
  scale: number
): [number, number] {
  // Apply zoom
  x *= dynOpts.zoomX;
  y *= dynOpts.zoomY;
  z *= dynOpts.zoomZ;

  // Apply rotations - using proper rotation order: Y then X
  const cosX = Math.cos(-dynOpts.rotationX);
  const sinX = Math.sin(-dynOpts.rotationX);
  const cosY = Math.cos(dynOpts.rotationY);
  const sinY = Math.sin(dynOpts.rotationY);

  // Rotate around Y axis (left-right rotation)
  let x1 = x * cosY + z * sinY;
  let z1 = -x * sinY + z * cosY;

  // Rotate around X axis (up-down rotation)
  let y1 = y * cosX - z1 * sinX;
  let z2 = y * sinX + z1 * cosX;

  // Apply pan in 3D space
  x1 += dynOpts.panX * 0.5;
  y1 += dynOpts.panY * 0.5;
  z2 += dynOpts.panZ * 0.5;

  // Perspective projection
  const perspective = 4.0;
  const depth = perspective + z2;
  const factor = perspective / Math.max(0.1, depth);

  const screenX = centerX + x1 * scale * factor;
  const screenY = centerY - y1 * scale * factor;

  return [screenX, screenY];
}

// =============================================================================
// Linestrip Drawing
// =============================================================================

/**
 * Draw linestrips for 3D data
 */
function drawLinestrips(
  ctx: RenderingContext,
  channelData: Data3DChannel,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  zMin: number,
  zMax: number,
  channelZOffset: number,
  dynOpts: Plot3DDynamicOptions,
  centerX: number,
  centerY: number,
  scale: number
): void {
  const { vertices, rowCount, pointsPerRow } = channelData;
  if (rowCount === 0 || pointsPerRow === 0) return;

  // Pre-compute constants
  const invXRange = 2 / (xMax - xMin);
  const invYRange = 2 / (yMax - yMin);
  const invZRange = 2 / (zMax - zMin);
  const cosRx = Math.cos(-dynOpts.rotationX);
  const sinRx = Math.sin(-dynOpts.rotationX);
  const cosRy = Math.cos(dynOpts.rotationY);
  const sinRy = Math.sin(dynOpts.rotationY);
  const panX = dynOpts.panX * 0.5;
  const panY = dynOpts.panY * 0.5;
  const panZ = dynOpts.panZ * 0.5;
  const zoomX = dynOpts.zoomX;
  const zoomY = dynOpts.zoomY;
  const zoomZ = dynOpts.zoomZ;
  const perspective = 4.0;

  for (let row = 0; row < rowCount; row++) {
    ctx.beginPath();
    let firstPoint = true;
    const rowBase = row * pointsPerRow * 3;

    for (let pt = 0; pt < pointsPerRow; pt++) {
      const idx = rowBase + pt * 3;
      let x = ((vertices[idx] - xMin) * invXRange - 1) * zoomX;
      let y = ((vertices[idx + 1] - yMin) * invYRange - 1) * zoomY;
      let z = ((vertices[idx + 2] + channelZOffset - zMin) * invZRange - 1) * zoomZ;

      const x1 = x * cosRy + z * sinRy + panX;
      const z1 = -x * sinRy + z * cosRy;
      const y1 = y * cosRx - z1 * sinRx + panY;
      const z2 = y * sinRx + z1 * cosRx + panZ;

      const factor = perspective / Math.max(0.1, perspective + z2);
      const sx = centerX + x1 * scale * factor;
      const sy = centerY - y1 * scale * factor;

      if (firstPoint) { ctx.moveTo(sx, sy); firstPoint = false; }
      else { ctx.lineTo(sx, sy); }
    }
    ctx.stroke();
  }
}

// =============================================================================
// Surface Drawing
// =============================================================================

/**
 * Draw surface for 3D data — uses Data3DChannel grid structure directly
 */
function drawSurface(
  ctx: RenderingContext,
  channelData: Data3DChannel,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  zMin: number,
  zMax: number,
  channelZOffset: number,
  dynOpts: Plot3DDynamicOptions,
  centerX: number,
  centerY: number,
  scale: number,
  channelColor: string
): void {
  const { vertices, rowCount, pointsPerRow } = channelData;
  if (rowCount < 2 || pointsPerRow < 2) return;

  // Pre-compute projection constants
  const invXRange = 2 / (xMax - xMin);
  const invYRange = 2 / (yMax - yMin);
  const invZRange = 2 / (zMax - zMin);
  const cosRx = Math.cos(-dynOpts.rotationX);
  const sinRx = Math.sin(-dynOpts.rotationX);
  const cosRy = Math.cos(dynOpts.rotationY);
  const sinRy = Math.sin(dynOpts.rotationY);
  const panX = dynOpts.panX * 0.5;
  const panY = dynOpts.panY * 0.5;
  const panZ = dynOpts.panZ * 0.5;
  const zoomX = dynOpts.zoomX;
  const zoomY = dynOpts.zoomY;
  const zoomZ = dynOpts.zoomZ;
  const perspective = 4.0;

  // Pre-compute channel color RGB once
  let baseR = 0, baseG = 128, baseB = 255;
  const hexMatch = channelColor.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (hexMatch) {
    baseR = parseInt(hexMatch[1], 16);
    baseG = parseInt(hexMatch[2], 16);
    baseB = parseInt(hexMatch[3], 16);
  }

  // Project all vertices once into flat arrays
  const numVerts = rowCount * pointsPerRow;
  const sxBuf = new Float32Array(numVerts);
  const syBuf = new Float32Array(numVerts);
  const depthBuf = new Float32Array(numVerts);
  const yNormBuf = new Float32Array(numVerts);

  for (let i = 0; i < numVerts; i++) {
    const idx = i * 3;
    const rawY = vertices[idx + 1];
    yNormBuf[i] = (rawY - yMin) / (yMax - yMin);

    let x = ((vertices[idx] - xMin) * invXRange - 1) * zoomX;
    let y = ((rawY - yMin) * invYRange - 1) * zoomY;
    let z = ((vertices[idx + 2] + channelZOffset - zMin) * invZRange - 1) * zoomZ;

    const x1 = x * cosRy + z * sinRy + panX;
    const z1 = -x * sinRy + z * cosRy;
    const y1 = y * cosRx - z1 * sinRx + panY;
    const z2 = y * sinRx + z1 * cosRx + panZ;

    const factor = perspective / Math.max(0.1, perspective + z2);
    sxBuf[i] = centerX + x1 * scale * factor;
    syBuf[i] = centerY - y1 * scale * factor;
    depthBuf[i] = z2;
  }

  // Build quad sort-order by average depth (back-to-front)
  const numQuads = (rowCount - 1) * (pointsPerRow - 1);
  const quadOrder = new Uint32Array(numQuads);
  const quadDepths = new Float32Array(numQuads);

  for (let row = 0; row < rowCount - 1; row++) {
    const r0 = row * pointsPerRow;
    const r1 = r0 + pointsPerRow;
    const qBase = row * (pointsPerRow - 1);
    for (let col = 0; col < pointsPerRow - 1; col++) {
      const q = qBase + col;
      quadOrder[q] = q;
      quadDepths[q] = (depthBuf[r0 + col] + depthBuf[r0 + col + 1] +
                        depthBuf[r1 + col] + depthBuf[r1 + col + 1]) * 0.25;
    }
  }

  // Sort back-to-front
  const sorted = Array.from(quadOrder).sort((a, b) => quadDepths[b] - quadDepths[a]);

  // Draw quads
  const cols = pointsPerRow - 1;
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = channelColor;

  for (let s = 0; s < sorted.length; s++) {
    const q = sorted[s];
    const row = (q / cols) | 0;
    const col = q % cols;
    const i00 = row * pointsPerRow + col;
    const i10 = i00 + 1;
    const i01 = i00 + pointsPerRow;
    const i11 = i01 + 1;

    // Color from average Y-normalized value
    const avgYNorm = (yNormBuf[i00] + yNormBuf[i10] + yNormBuf[i01] + yNormBuf[i11]) * 0.25;
    const clamped = avgYNorm < 0 ? 0 : avgYNorm > 1 ? 1 : avgYNorm;
    const brightness = 0.2 + clamped;
    const r = Math.min(255, (baseR * brightness) | 0);
    const g = Math.min(255, (baseG * brightness) | 0);
    const b = Math.min(255, (baseB * brightness) | 0);

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(sxBuf[i00], syBuf[i00]);
    ctx.lineTo(sxBuf[i10], syBuf[i10]);
    ctx.lineTo(sxBuf[i11], syBuf[i11]);
    ctx.lineTo(sxBuf[i01], syBuf[i01]);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.4;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Create gradient based on channel color
 */
function valueToSurfaceColorWithChannel(normalizedValue: number, channelColor: string): string {
  const clampedValue = Math.max(0, Math.min(1, normalizedValue));

  const hexMatch = channelColor.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!hexMatch) {
    return valueToHeatColor(normalizedValue);
  }

  const baseR = parseInt(hexMatch[1], 16);
  const baseG = parseInt(hexMatch[2], 16);
  const baseB = parseInt(hexMatch[3], 16);

  const minBrightness = 0.2;
  const maxBrightness = 1.2;
  const brightness = minBrightness + clampedValue * (maxBrightness - minBrightness);

  const r = Math.min(255, Math.round(baseR * brightness));
  const g = Math.min(255, Math.round(baseG * brightness));
  const b = Math.min(255, Math.round(baseB * brightness));

  return `rgb(${r}, ${g}, ${b})`;
}

function valueToHeatColor(value: number): string {
  const v = Math.max(0, Math.min(1, value));
  let r = 0, g = 0, b = 0;

  if (v < 0.25) {
    const t = v / 0.25;
    b = 255;
    g = Math.round(255 * t);
  } else if (v < 0.5) {
    const t = (v - 0.25) / 0.25;
    g = 255;
    b = Math.round(255 * (1 - t));
  } else if (v < 0.75) {
    const t = (v - 0.5) / 0.25;
    g = 255;
    r = Math.round(255 * t);
  } else {
    const t = (v - 0.75) / 0.25;
    r = 255;
    g = Math.round(255 * (1 - t));
  }

  return `rgb(${r}, ${g}, ${b})`;
}

// =============================================================================
// Channel Separators
// =============================================================================

/**
 * Draw separator lines between channels
 */
function drawChannelSeparators(
  ctx: RenderingContext,
  theme: PlotTheme,
  dynOpts: Plot3DDynamicOptions,
  numChannels: number,
  zAxisOriginalRange: number,
  channelSpacing: number,
  zMin: number,
  zMax: number,
  centerX: number,
  centerY: number,
  scale: number
): void {
  for (let ch = 1; ch < numChannels; ch++) {
    const separatorZ = zMin + ch * zAxisOriginalRange + (ch - 0.5) * zAxisOriginalRange * channelSpacing;
    const z3d = ((separatorZ - zMin) / (zMax - zMin)) * 2 - 1;

    ctx.strokeStyle = theme.channelColors[ch % theme.channelColors.length];
    ctx.lineWidth = 2;
    ctx.beginPath();

    const xSteps = 50;
    for (let i = 0; i <= xSteps; i++) {
      const xNorm = i / xSteps;
      const x3d = xNorm * 2 - 1;
      const y3d = -1;

      const [screenX, screenY] = project3DTo2D(x3d, y3d, z3d, dynOpts, centerX, centerY, scale);

      if (i === 0) {
        ctx.moveTo(screenX, screenY);
      } else {
        ctx.lineTo(screenX, screenY);
      }
    }
    ctx.stroke();
  }
}

// =============================================================================
// 3D Box and Walls
// =============================================================================

/**
 * Draw 3D box with walls and grid lines
 */
function draw3DBox(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea,
  centerX: number,
  centerY: number,
  scale: number,
  numChannels: number = 1,
  zMinExpanded?: number,
  zMaxExpanded?: number
): void {
  const theme = handle.theme;
  const dynOpts = handle.dynamicOptions as Plot3DDynamicOptions;
  const options = handle.options as Plot3DOptions;

  const walls = getBackWallPositions(dynOpts);
  const labelEdges = getLabelEdgePositions(dynOpts);

  ctx.lineWidth = 1;

  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];
  const zAxis = options.axesMetadata[2];

  const xRange = xAxis ? getAxisRange(xAxis) : { min: -1, max: 1 };
  const yRange = yAxis ? getAxisRange(yAxis) : { min: -1, max: 1 };
  const zRange = zAxis ? getAxisRange(zAxis) : { min: -1, max: 1 };
  const xTicks = calculateNiceTicks(xRange.min, xRange.max, 5, xAxis?.logarithmic || false);
  const yTicks = calculateNiceTicks(yRange.min, yRange.max, 5, yAxis?.logarithmic || false);

  let zTicks: TickResult;
  if (numChannels > 1 && zMinExpanded !== undefined && zMaxExpanded !== undefined) {
    zTicks = generateMultiChannelZTicks(zAxis, numChannels, zMinExpanded, zMaxExpanded);
  } else {
    zTicks = calculateNiceTicks(zRange.min, zRange.max, 5, zAxis?.logarithmic || false);
  }

  // Draw walls at positions farthest from camera (behind data)
  draw3DWallYZ(ctx, walls.backX, yTicks, zTicks, dynOpts, centerX, centerY, scale, theme, options, zMinExpanded, zMaxExpanded);
  draw3DWallXZ(ctx, walls.backY, xTicks, zTicks, dynOpts, centerX, centerY, scale, theme, options, zMinExpanded, zMaxExpanded);
  draw3DWallXY(ctx, walls.backZ, xTicks, yTicks, dynOpts, centerX, centerY, scale, theme, options);

  // Draw axis labels at edges closest to viewer
  draw3DAxisLabels(ctx, walls, labelEdges, dynOpts, centerX, centerY, scale, theme, options, xTicks, yTicks, zTicks, zMinExpanded, zMaxExpanded);
}

/**
 * Generate z-ticks for multi-channel display
 */
function generateMultiChannelZTicks(
  zAxis: any,
  numChannels: number,
  zMinExpanded: number,
  zMaxExpanded: number
): TickResult {
  const channelSpacing = 0.15;
  const zRange = zAxis ? getAxisRange(zAxis) : { min: -1, max: 1 };
  const zAxisOriginalRange = zRange.max - zRange.min;

  const singleChannelTicks = calculateNiceTicks(
    zRange.min,
    zRange.max,
    5,
    zAxis?.logarithmic || false
  );

  const values: number[] = [];
  const labels: string[] = [];

  for (let ch = 0; ch < numChannels; ch++) {
    const channelZOffset = ch * (zAxisOriginalRange + zAxisOriginalRange * channelSpacing);
    for (let i = 0; i < singleChannelTicks.values.length; i++) {
      values.push(singleChannelTicks.values[i] + channelZOffset);
      labels.push(singleChannelTicks.labels[i]);
    }
  }

  return { values, labels };
}

// =============================================================================
// Wall Drawing Functions
// =============================================================================

/**
 * Draw YZ wall (back wall)
 */
function draw3DWallYZ(
  ctx: RenderingContext,
  xPos: number,
  yTicks: TickResult,
  zTicks: TickResult,
  dynOpts: Plot3DDynamicOptions,
  centerX: number,
  centerY: number,
  scale: number,
  theme: PlotTheme,
  options: Plot3DOptions,
  zMinExpanded?: number,
  zMaxExpanded?: number
): void {
  const yAxis = options.axesMetadata[1];
  const zAxis = options.axesMetadata[2];
  const yRange = yAxis ? getAxisRange(yAxis) : { min: -1, max: 1 };
  const zRange = zAxis ? getAxisRange(zAxis) : { min: -1, max: 1 };
  const yMin = yRange.min;
  const yMax = yRange.max;
  const zMin = zMinExpanded ?? zRange.min;
  const zMax = zMaxExpanded ?? zRange.max;

  const corners = [
    [xPos, -1, -1],
    [xPos, 1, -1],
    [xPos, 1, 1],
    [xPos, -1, 1],
  ];
  const projected = corners.map((c) =>
    project3DTo2D(c[0], c[1], c[2], dynOpts, centerX, centerY, scale)
  );

  // Fill wall
  ctx.fillStyle = 'rgba(100, 100, 120, 0.15)';
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.fill();

  // Draw frame
  ctx.strokeStyle = theme.axisColor;
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.stroke();

  // Draw grid lines
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.clip();

  ctx.strokeStyle = theme.gridColor;
  ctx.globalAlpha = 0.3;

  for (const yVal of yTicks.values) {
    const y = ((yVal - yMin) / (yMax - yMin)) * 2 - 1;
    const [x1, y1] = project3DTo2D(xPos, y, -1, dynOpts, centerX, centerY, scale);
    const [x2, y2] = project3DTo2D(xPos, y, 1, dynOpts, centerX, centerY, scale);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  for (const zVal of zTicks.values) {
    const z = ((zVal - zMin) / (zMax - zMin)) * 2 - 1;
    const [x1, y1] = project3DTo2D(xPos, -1, z, dynOpts, centerX, centerY, scale);
    const [x2, y2] = project3DTo2D(xPos, 1, z, dynOpts, centerX, centerY, scale);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw XZ wall (floor/ceiling)
 */
function draw3DWallXZ(
  ctx: RenderingContext,
  yPos: number,
  xTicks: TickResult,
  zTicks: TickResult,
  dynOpts: Plot3DDynamicOptions,
  centerX: number,
  centerY: number,
  scale: number,
  theme: PlotTheme,
  options: Plot3DOptions,
  zMinExpanded?: number,
  zMaxExpanded?: number
): void {
  const xAxis = options.axesMetadata[0];
  const zAxis = options.axesMetadata[2];
  const xRange = xAxis ? getAxisRange(xAxis) : { min: -1, max: 1 };
  const zRange = zAxis ? getAxisRange(zAxis) : { min: -1, max: 1 };
  const xMin = xRange.min;
  const xMax = xRange.max;
  const zMin = zMinExpanded ?? zRange.min;
  const zMax = zMaxExpanded ?? zRange.max;

  const corners = [
    [-1, yPos, -1],
    [1, yPos, -1],
    [1, yPos, 1],
    [-1, yPos, 1],
  ];
  const projected = corners.map((c) =>
    project3DTo2D(c[0], c[1], c[2], dynOpts, centerX, centerY, scale)
  );

  // Fill wall
  ctx.fillStyle = 'rgba(100, 120, 100, 0.15)';
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.fill();

  // Draw frame
  ctx.strokeStyle = theme.axisColor;
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.stroke();

  // Draw grid lines
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.clip();

  ctx.strokeStyle = theme.gridColor;
  ctx.globalAlpha = 0.8;

  for (const xVal of xTicks.values) {
    const x = ((xVal - xMin) / (xMax - xMin)) * 2 - 1;
    const [x1, y1] = project3DTo2D(x, yPos, -1, dynOpts, centerX, centerY, scale);
    const [x2, y2] = project3DTo2D(x, yPos, 1, dynOpts, centerX, centerY, scale);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  for (const zVal of zTicks.values) {
    const z = ((zVal - zMin) / (zMax - zMin)) * 2 - 1;
    const [x1, y1] = project3DTo2D(-1, yPos, z, dynOpts, centerX, centerY, scale);
    const [x2, y2] = project3DTo2D(1, yPos, z, dynOpts, centerX, centerY, scale);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw XY wall (side wall)
 */
function draw3DWallXY(
  ctx: RenderingContext,
  zPos: number,
  xTicks: TickResult,
  yTicks: TickResult,
  dynOpts: Plot3DDynamicOptions,
  centerX: number,
  centerY: number,
  scale: number,
  theme: PlotTheme,
  options: Plot3DOptions
): void {
  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];
  const xRange = xAxis ? getAxisRange(xAxis) : { min: -1, max: 1 };
  const yRange = yAxis ? getAxisRange(yAxis) : { min: -1, max: 1 };
  const xMin = xRange.min;
  const xMax = xRange.max;
  const yMin = yRange.min;
  const yMax = yRange.max;

  const corners = [
    [-1, -1, zPos],
    [1, -1, zPos],
    [1, 1, zPos],
    [-1, 1, zPos],
  ];
  const projected = corners.map((c) =>
    project3DTo2D(c[0], c[1], c[2], dynOpts, centerX, centerY, scale)
  );

  // Fill wall
  ctx.fillStyle = 'rgba(120, 100, 100, 0.15)';
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.fill();

  // Draw frame
  ctx.strokeStyle = theme.axisColor;
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.stroke();

  // Draw grid lines
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(projected[0][0], projected[0][1]);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(projected[i][0], projected[i][1]);
  }
  ctx.closePath();
  ctx.clip();

  ctx.strokeStyle = theme.gridColor;
  ctx.globalAlpha = 0.8;

  for (const yVal of yTicks.values) {
    const y = ((yVal - yMin) / (yMax - yMin)) * 2 - 1;
    const [x1, y1] = project3DTo2D(-1, y, zPos, dynOpts, centerX, centerY, scale);
    const [x2, y2] = project3DTo2D(1, y, zPos, dynOpts, centerX, centerY, scale);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  for (const xVal of xTicks.values) {
    const x = ((xVal - xMin) / (xMax - xMin)) * 2 - 1;
    const [x1, y1] = project3DTo2D(x, -1, zPos, dynOpts, centerX, centerY, scale);
    const [x2, y2] = project3DTo2D(x, 1, zPos, dynOpts, centerX, centerY, scale);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// =============================================================================
// Axis Labels
// =============================================================================

/**
 * Draw 3D axis labels and tick marks
 */
function draw3DAxisLabels(
  ctx: RenderingContext,
  walls: WallPositions,
  labelEdges: LabelEdgePositions,
  dynOpts: Plot3DDynamicOptions,
  centerX: number,
  centerY: number,
  scale: number,
  theme: PlotTheme,
  options: Plot3DOptions,
  xTicks: TickResult,
  yTicks: TickResult,
  zTicks: TickResult,
  zMinExpanded?: number,
  zMaxExpanded?: number,
  plotArea?: PlotArea
): void {
  ctx.fillStyle = theme.axisColor;
  ctx.font = `${theme.fontSize + 2}px ${theme.fontFamily}`;

  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];
  const zAxis = options.axesMetadata[2];
  const xRange = xAxis ? getAxisRange(xAxis) : { min: -1, max: 1 };
  const yRange = yAxis ? getAxisRange(yAxis) : { min: -1, max: 1 };
  const zRange = zAxis ? getAxisRange(zAxis) : { min: -1, max: 1 };

  const xMin = xRange.min;
  const xMax = xRange.max;
  const yMin = yRange.min;
  const yMax = yRange.max;
  const zMin = zMinExpanded ?? zRange.min;
  const zMax = zMaxExpanded ?? zRange.max;

  ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;

  // Helper to check if a point is within plot bounds (with padding)
  const padding = 20;
  const isInBounds = (sx: number, sy: number): boolean => {
    if (!plotArea) return true;
    return sx >= plotArea.left - padding && 
           sx <= plotArea.left + plotArea.width + padding &&
           sy >= plotArea.top - padding && 
           sy <= plotArea.top + plotArea.height + padding;
  };

  // X-axis labels: place on XZ wall (floor at y=backY), at front Z edge
  const xEdgeY = labelEdges.xAxis.y;
  const xEdgeZ = labelEdges.xAxis.z;

  for (let i = 0; i < xTicks.values.length; i++) {
    const xVal = xTicks.values[i];
    const label = xTicks.labels[i];
    const x = ((xVal - xMin) / (xMax - xMin)) * 2 - 1;
    const [sx, sy] = project3DTo2D(x, xEdgeY, xEdgeZ, dynOpts, centerX, centerY, scale);
    if (isInBounds(sx, sy)) {
      ctx.textAlign = 'center';
      // Position below if at bottom edge (y < 0), above if at top edge
      ctx.fillText(label, sx, sy + (xEdgeY < 0 ? 15 : -5));
    }
  }

  // Y-axis labels: place on YZ wall (at x=backX), at front Z edge
  const yEdgeX = labelEdges.yAxis.x;
  const yEdgeZ = labelEdges.yAxis.z;

  for (let i = 0; i < yTicks.values.length; i++) {
    const yVal = yTicks.values[i];
    const label = yTicks.labels[i];
    const y = ((yVal - yMin) / (yMax - yMin)) * 2 - 1;
    const [sx, sy] = project3DTo2D(yEdgeX, y, yEdgeZ, dynOpts, centerX, centerY, scale);
    if (isInBounds(sx, sy)) {
      // Position left if edge is on left side, right if on right
      ctx.textAlign = yEdgeX < 0 ? 'right' : 'left';
      ctx.fillText(label, sx + (yEdgeX < 0 ? -8 : 8), sy + 4);
    }
  }

  // Z-axis labels: place at front edge closest to viewer
  // The Z-axis runs along a rendered wall edge
  const zEdgeX = labelEdges.zAxis.x;
  const zEdgeY = labelEdges.zAxis.y;

  for (let i = 0; i < zTicks.values.length; i++) {
    const zVal = zTicks.values[i];
    const label = zTicks.labels[i];
    const z = ((zVal - zMin) / (zMax - zMin)) * 2 - 1;
    const [sx, sy] = project3DTo2D(zEdgeX, zEdgeY, z, dynOpts, centerX, centerY, scale);
    if (isInBounds(sx, sy)) {
      // Determine if Z-axis is on YZ wall (x=backX, y=frontY) or XZ wall (x=frontX, y=backY)
      // On YZ wall: labels go to side based on x position
      // On XZ wall: labels go below/above based on y position
      const onYZWall = Math.abs(zEdgeX) === 1 && zEdgeY !== walls.backY;
      if (onYZWall) {
        ctx.textAlign = zEdgeX < 0 ? 'right' : 'left';
        ctx.fillText(label, sx + (zEdgeX < 0 ? -8 : 8), sy + 4);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(label, sx, sy + (zEdgeY < 0 ? 15 : -5));
      }
    }
  }

  // Draw axis name labels
  ctx.font = `${theme.fontSize + 2}px ${theme.fontFamily}`;
  ctx.textAlign = 'center';

  // X-axis name: centered along X edge (on XZ wall floor)
  const [xLabelX1, xLabelY1] = project3DTo2D(-1.2, xEdgeY, xEdgeZ * 1.15, dynOpts, centerX, centerY, scale);
  const [xLabelX2, xLabelY2] = project3DTo2D(1.2, xEdgeY, xEdgeZ * 1.15, dynOpts, centerX, centerY, scale);
  if (xAxis) {
    const xLabelX = (xLabelX1 + xLabelX2) / 2;
    // Position label below or above based on edge Y position
    const xLabelY = (xLabelY1 + xLabelY2) / 2 + (xEdgeY < 0 ? 30 : -20);
    if (isInBounds(xLabelX, xLabelY)) {
      ctx.fillText(formatAxisLabel(xAxis), xLabelX, xLabelY);
    }
  }

  // Y-axis name: centered along Y edge (on YZ wall)
  const [yLabelX1, yLabelY1] = project3DTo2D(yEdgeX, -1.2, yEdgeZ * 1.15, dynOpts, centerX, centerY, scale);
  const [yLabelX2, yLabelY2] = project3DTo2D(yEdgeX, 1.2, yEdgeZ * 1.15, dynOpts, centerX, centerY, scale);
  if (yAxis) {
    // Position label left or right based on edge X position
    const yLabelX = (yLabelX1 + yLabelX2) / 2 + (yEdgeX < 0 ? -40 : 40);
    const yLabelY = (yLabelY1 + yLabelY2) / 2;
    if (isInBounds(yLabelX, yLabelY)) {
      ctx.fillText(formatAxisLabel(yAxis), yLabelX, yLabelY);
    }
  }

  // Z-axis name: centered along Z edge
  // Position depends on which wall the Z-axis edge is on
  const onYZWall = Math.abs(zEdgeX) === 1 && zEdgeY !== walls.backY;
  if (onYZWall) {
    // Z is on YZ wall (vertical wall), position to the side
    const [zLabelX1, zLabelY1] = project3DTo2D(zEdgeX * 1.15, zEdgeY, -1.2, dynOpts, centerX, centerY, scale);
    const [zLabelX2, zLabelY2] = project3DTo2D(zEdgeX * 1.15, zEdgeY, 1.2, dynOpts, centerX, centerY, scale);
    if (zAxis) {
      const zLabelX = (zLabelX1 + zLabelX2) / 2 + (zEdgeX < 0 ? -40 : 40);
      const zLabelY = (zLabelY1 + zLabelY2) / 2;
      if (isInBounds(zLabelX, zLabelY)) {
        ctx.fillText(formatAxisLabel(zAxis), zLabelX, zLabelY);
      }
    }
  } else {
    // Z is on XZ wall (floor), position below/above
    const [zLabelX1, zLabelY1] = project3DTo2D(zEdgeX, zEdgeY, -1.2, dynOpts, centerX, centerY, scale);
    const [zLabelX2, zLabelY2] = project3DTo2D(zEdgeX, zEdgeY, 1.2, dynOpts, centerX, centerY, scale);
    if (zAxis) {
      const zLabelX = (zLabelX1 + zLabelX2) / 2;
      const zLabelY = (zLabelY1 + zLabelY2) / 2 + (zEdgeY < 0 ? 30 : -20);
      if (isInBounds(zLabelX, zLabelY)) {
        ctx.fillText(formatAxisLabel(zAxis), zLabelX, zLabelY);
      }
    }
  }
}

// =============================================================================
// Exported function for WebGPU overlay
// =============================================================================

/**
 * Draw 3D axis labels only (without data or box)
 * Used by WebGPU renderer for text overlay on top of GPU-rendered content
 */
export function draw3DLabelsOverlay(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea
): void {
  const data = handle.data;
  if (!isData3D(data)) return;

  const theme = handle.theme;
  const dynOpts = handle.dynamicOptions as Plot3DDynamicOptions;
  const options = handle.options as Plot3DOptions;

  const centerX = plotArea.left + plotArea.width / 2;
  const centerY = plotArea.top + plotArea.height / 2;
  const scale = Math.min(plotArea.width, plotArea.height) * 0.3 * dynOpts.zoomX;

  // Get axis ranges
  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];
  const zAxis = options.axesMetadata[2];
  const xRange = xAxis ? getAxisRange(xAxis) : { min: -1, max: 1 };
  const yRange = yAxis ? getAxisRange(yAxis) : { min: -1, max: 1 };
  const zRange = zAxis ? getAxisRange(zAxis) : { min: -1, max: 1 };
  const xMin = xRange.min;
  const xMax = xRange.max;
  const yMin = yRange.min;
  const yMax = yRange.max;

  // For multi-channel, expand z-axis
  const numChannels = data?.channels.length || 1;
  const channelSpacing = 0.15;
  const zAxisOriginalMin = zRange.min;
  const zAxisOriginalMax = zRange.max;
  const zAxisOriginalRange = zAxisOriginalMax - zAxisOriginalMin;
  const zAxisExpandedRange = zAxisOriginalRange * (numChannels + (numChannels - 1) * channelSpacing);
  const zMinExpanded = zAxisOriginalMin;
  const zMaxExpanded = zMinExpanded + zAxisExpandedRange;

  // Calculate wall and label edge positions
  const walls = getBackWallPositions(dynOpts);
  const labelEdges = getLabelEdgePositions(dynOpts);

  // Calculate ticks for X and Y (use normal tick calculation)
  const xTicks = calculateNiceTicks(xMin, xMax, 5, false);
  const yTicks = calculateNiceTicks(yMin, yMax, 5, false);
  
  // For Z-axis, generate ticks that show the original range repeated per channel
  const zTicks = generateChannelAlignedZTicks(
    zAxisOriginalMin,
    zAxisOriginalMax,
    numChannels,
    channelSpacing,
    zMinExpanded,
    zMaxExpanded
  );

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.rect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);
  ctx.clip();

  // Draw axis labels
  draw3DAxisLabels(
    ctx,
    walls,
    labelEdges,
    dynOpts,
    centerX,
    centerY,
    scale,
    theme,
    options,
    xTicks,
    yTicks,
    zTicks,
    zMinExpanded,
    zMaxExpanded,
    plotArea
  );

  ctx.restore();
}

/**
 * Generate Z-axis ticks that repeat the original range for each channel
 */
function generateChannelAlignedZTicks(
  originalMin: number,
  originalMax: number,
  numChannels: number,
  channelSpacing: number,
  expandedMin: number,
  expandedMax: number
): TickResult {
  const originalRange = originalMax - originalMin;
  const values: number[] = [];
  const labels: string[] = [];

  // Calculate nice ticks for the original range
  const originalTicks = calculateNiceTicks(originalMin, originalMax, 3, false);

  // For each channel, add ticks at the correct expanded positions
  for (let ch = 0; ch < numChannels; ch++) {
    const channelZOffset = ch * (originalRange + originalRange * channelSpacing);
    const isLastChannel = ch === numChannels - 1;

    for (let i = 0; i < originalTicks.values.length; i++) {
      const originalVal = originalTicks.values[i];
      const isLastTick = i === originalTicks.values.length - 1;
      
      // Skip the last tick of non-last channels to avoid overlap with next channel
      if (!isLastChannel && isLastTick) {
        continue;
      }
      
      const expandedVal = originalVal + channelZOffset;
      
      // Only include if within the expanded range
      if (expandedVal >= expandedMin && expandedVal <= expandedMax) {
        values.push(expandedVal);
        labels.push(originalTicks.labels[i]);
      }
    }
  }

  return { values, labels };
}
