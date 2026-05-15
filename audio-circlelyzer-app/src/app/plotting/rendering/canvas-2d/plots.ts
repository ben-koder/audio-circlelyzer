/**
 * Canvas 2D Plot Drawing
 *
 * Renders line charts, bar charts, and heatmaps.
 */

import { Data2D, HeatmapData, PlotHandle, Plot2DOptions, isHeatmapData } from '../../types';
import { RenderingContext, PlotArea, valueToHeatColor, getAxisRange, computeVisibleRange } from '../../utils';

/**
 * Draw 2D data (lines, bars, or heatmap)
 */
export function draw2DData(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea
): void {
  const options = handle.options as Plot2DOptions;

  switch (options.plotType) {
    case 'line':
      drawLineChart(ctx, handle, plotArea);
      break;
    case 'bars':
      drawBarChart(ctx, handle, plotArea);
      break;
    case 'scatter':
      drawScatterChart(ctx, handle, plotArea);
      break;
    case 'heatmap':
      drawHeatmap(ctx, handle, plotArea);
      break;
  }
}

function drawLineChart(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea
): void {
  const data = handle.data as Data2D;
  const theme = handle.theme;
  const dynOpts = handle.dynamicOptions;
  const xAxis = handle.options.axesMetadata[0];
  const yAxis = handle.options.axesMetadata[1];

  if (!data || data.channels.length === 0) return;

  // Calculate visible ranges using effective range
  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { visibleMin: xVisibleMin, visibleMax: xVisibleMax } = computeVisibleRange(
    xMin, xMax, dynOpts.zoomX, dynOpts.panX, xAxis.logarithmic || false
  );
  const { visibleMin: yVisibleMin, visibleMax: yVisibleMax } = computeVisibleRange(
    yMin, yMax, dynOpts.zoomY, dynOpts.panY, yAxis.logarithmic || false
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);
  ctx.clip();

  for (let ch = 0; ch < data.channels.length; ch++) {
    const channel = data.channels[ch];
    if (!channel || channel.length === 0) continue;

    ctx.strokeStyle = theme.channelColors[ch % theme.channelColors.length];
    ctx.lineWidth = 2;
    ctx.beginPath();

    let started = false;
    for (let i = 0; i < channel.length; i++) {
      const x = channel.x[i];
      const y = channel.y[i];

      let xNorm: number;
      if (xAxis.logarithmic) {
        const logMin = Math.log10(Math.max(xVisibleMin, 1e-10));
        const logMax = Math.log10(Math.max(xVisibleMax, 1e-10));
        const logX = Math.log10(Math.max(x, 1e-10));
        xNorm = (logX - logMin) / (logMax - logMin);
      } else {
        xNorm = (x - xVisibleMin) / (xVisibleMax - xVisibleMin);
      }

      const yNorm = (y - yVisibleMin) / (yVisibleMax - yVisibleMin);

      const px = plotArea.left + xNorm * plotArea.width;
      const py = plotArea.top + plotArea.height - yNorm * plotArea.height;

      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.stroke();
  }

  ctx.restore();
  drawChannelLegend(ctx, handle, plotArea, data.channels.map((channel) => channel.label));
}

function drawBarChart(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea
): void {
  const data = handle.data as Data2D;
  const theme = handle.theme;
  const dynOpts = handle.dynamicOptions;
  const xAxis = handle.options.axesMetadata[0];
  const yAxis = handle.options.axesMetadata[1];

  if (!data || data.channels.length === 0) return;

  const numChannels = data.channels.length;
  const numBars = data.channels[0]?.length || 0;
  if (numBars === 0) return;

  const isCategorical = !!(xAxis as any)?.categorical;

  // Calculate visible Y range using effective range
  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { visibleMin: yVisibleMin, visibleMax: yVisibleMax } = computeVisibleRange(
    yMin, yMax, dynOpts.zoomY, dynOpts.panY, yAxis.logarithmic || false
  );

  // Calculate visible X range
  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { visibleMin: xVisibleMin, visibleMax: xVisibleMax } = computeVisibleRange(
    xMin, xMax, dynOpts.zoomX, dynOpts.panX, xAxis.logarithmic || false
  );

  // For categorical bars, use even spacing by index
  const effectiveBarSpacing = isCategorical
    ? plotArea.width / numBars
    : plotArea.width / (numBars * 1.5);
  const barGroupWidth = effectiveBarSpacing * 0.8;
  const barWidth = barGroupWidth / numChannels;
  const barGap = barWidth * 0.1;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);
  ctx.clip();

  for (let ch = 0; ch < numChannels; ch++) {
    const channel = data.channels[ch];
    ctx.fillStyle = theme.channelColors[ch % theme.channelColors.length];

    for (let i = 0; i < channel.length; i++) {
      const x = channel.x[i];
      const y = channel.y[i];

      // For categorical bars, position evenly by index; otherwise use data x value
      let centerX: number;
      if (isCategorical) {
        centerX = plotArea.left + (i + 0.5) / numBars * plotArea.width;
      } else {
        const xNorm = (x - xVisibleMin) / (xVisibleMax - xVisibleMin);
        centerX = plotArea.left + xNorm * plotArea.width;
      }
      const barX = centerX - barGroupWidth / 2 + ch * barWidth + barGap / 2;

      const yNorm = (y - yVisibleMin) / (yVisibleMax - yVisibleMin);
      const barY = plotArea.top + plotArea.height - yNorm * plotArea.height;

      // Bar extends from the data point down to the bottom of the plot area (y-axis minimum)
      const barBottom = plotArea.top + plotArea.height;
      const height = barBottom - barY;
      ctx.fillRect(barX, barY, barWidth - barGap, height);
    }
  }

  ctx.restore();
  drawChannelLegend(ctx, handle, plotArea, data.channels.map((channel) => channel.label));
}

function drawChannelLegend(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea,
  labels: Array<string | undefined>,
): void {
  const entries = labels
    .map((label, index) => ({ label: label?.trim(), color: handle.theme.channelColors[index % handle.theme.channelColors.length] }))
    .filter((entry): entry is { label: string; color: string } => Boolean(entry.label));

  if (entries.length === 0) {
    return;
  }

  const padding = 8;
  const swatchSize = 10;
  const lineHeight = 16;

  ctx.save();
  ctx.font = `${Math.max(10, handle.theme.fontSize - 1)}px ${handle.theme.fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let maxLabelWidth = 0;
  for (const entry of entries) {
    maxLabelWidth = Math.max(maxLabelWidth, ctx.measureText(entry.label).width);
  }

  const boxWidth = padding * 2 + swatchSize + 8 + maxLabelWidth;
  const boxHeight = padding * 2 + entries.length * lineHeight;
  const x = plotArea.left + plotArea.width - boxWidth - 8;
  const y = plotArea.top + 8;

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = handle.theme.backgroundColor;
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = handle.theme.gridColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, boxWidth, boxHeight);

  entries.forEach((entry, index) => {
    const rowY = y + padding + index * lineHeight;
    ctx.fillStyle = entry.color;
    ctx.fillRect(x + padding, rowY + 2, swatchSize, swatchSize);
    ctx.fillStyle = handle.theme.axisColor;
    ctx.fillText(entry.label, x + padding + swatchSize + 8, rowY);
  });

  ctx.restore();
}

function drawScatterChart(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea
): void {
  const data = handle.data as Data2D;
  const theme = handle.theme;
  const dynOpts = handle.dynamicOptions;
  const xAxis = handle.options.axesMetadata[0];
  const yAxis = handle.options.axesMetadata[1];

  if (!data || data.channels.length === 0) return;

  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { visibleMin: xVisibleMin, visibleMax: xVisibleMax } = computeVisibleRange(
    xMin, xMax, dynOpts.zoomX, dynOpts.panX, xAxis.logarithmic || false
  );
  const { visibleMin: yVisibleMin, visibleMax: yVisibleMax } = computeVisibleRange(
    yMin, yMax, dynOpts.zoomY, dynOpts.panY, yAxis.logarithmic || false
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(plotArea.left, plotArea.top, plotArea.width, plotArea.height);
  ctx.clip();

  const radius = 2;
  for (let ch = 0; ch < data.channels.length; ch++) {
    const channel = data.channels[ch];
    if (!channel || channel.length === 0) continue;
    ctx.fillStyle = theme.channelColors[ch % theme.channelColors.length];
    for (let i = 0; i < channel.length; i++) {
      const x = channel.x[i];
      const y = channel.y[i];
      let xNorm: number;
      if (xAxis.logarithmic) {
        const logMin = Math.log10(Math.max(xVisibleMin, 1e-10));
        const logMax = Math.log10(Math.max(xVisibleMax, 1e-10));
        const logX = Math.log10(Math.max(x, 1e-10));
        xNorm = (logX - logMin) / (logMax - logMin);
      } else {
        xNorm = (x - xVisibleMin) / (xVisibleMax - xVisibleMin);
      }
      const yNorm = (y - yVisibleMin) / (yVisibleMax - yVisibleMin);
      const px = plotArea.left + xNorm * plotArea.width;
      const py = plotArea.top + plotArea.height - yNorm * plotArea.height;
      // Cull obvious off-screen points cheaply.
      if (px < plotArea.left - radius || px > plotArea.left + plotArea.width + radius) continue;
      if (py < plotArea.top - radius || py > plotArea.top + plotArea.height + radius) continue;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  drawChannelLegend(ctx, handle, plotArea, data.channels.map((channel) => channel.label));
}

function drawHeatmap(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea
): void {
  const data = handle.data;
  const theme = handle.theme;
  const dynOpts = handle.dynamicOptions;
  const xAxis = handle.options.axesMetadata[0];
  const yAxis = handle.options.axesMetadata[1];
  const zAxis = handle.options.axesMetadata[2];

  if (!data) return;

  if (!isHeatmapData(data)) return;
  const heatmap = data as HeatmapData;
  const numChannels = heatmap.channels.length;
  if (numChannels === 0) return;
  const channelHeight = plotArea.height / numChannels;

  for (let ch = 0; ch < numChannels; ch++) {
    const channel = heatmap.channels[ch];
    if (!channel || channel.values.length === 0) continue;

    const timeFrames = channel.height;
    const freqBins = channel.width;
    if (freqBins === 0 || timeFrames === 0) continue;

    const channelTop = Math.floor(plotArea.top + ch * channelHeight);

    // Get value range for color mapping
    const zAxisRange = zAxis ? getAxisRange(zAxis) : { min: -80, max: 0 };
    const zMin = zAxisRange.min;
    const zMax = zAxisRange.max;
    const zRange = zMax - zMin;
    const invZRange = zRange !== 0 ? 1 / zRange : 0;

    // Render to ImageData at display resolution — single putImageData vs 131k+ fillRect calls
    const displayWidth = Math.ceil(plotArea.width);
    const displayHeight = Math.ceil(channelHeight);
    if (displayWidth <= 0 || displayHeight <= 0) continue;

    const imageData = ctx.createImageData(displayWidth, displayHeight);
    const pixels = imageData.data;
    const values = channel.values;

    for (let py = 0; py < displayHeight; py++) {
      const f = Math.min(freqBins - 1, Math.floor((1 - py / displayHeight) * freqBins));
      const rowOffset = py * displayWidth * 4;

      for (let px = 0; px < displayWidth; px++) {
        const t = Math.min(timeFrames - 1, Math.floor(px / displayWidth * timeFrames));
        const value = values[t * freqBins + f];
        const v = Math.max(0, Math.min(1, (value - zMin) * invZRange));

        // Inline heat color: blue → cyan → green → yellow → red
        let r = 0, g = 0, b = 0;
        if (v < 0.25) {
          b = 255; g = (255 * v / 0.25) | 0;
        } else if (v < 0.5) {
          g = 255; b = (255 * (1 - (v - 0.25) / 0.25)) | 0;
        } else if (v < 0.75) {
          g = 255; r = (255 * (v - 0.5) / 0.25) | 0;
        } else {
          r = 255; g = (255 * (1 - (v - 0.75) / 0.25)) | 0;
        }

        const idx = rowOffset + px * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, Math.floor(plotArea.left), channelTop);
  }
}

/**
 * Draw heatmap color legend
 */
export function drawHeatmapLegend(
  ctx: RenderingContext,
  handle: PlotHandle,
  width: number,
  height: number
): void {
  const theme = handle.theme;
  const zAxis = handle.options.axesMetadata[2];
  if (!zAxis) return;

  const legendWidth = 20;
  const legendHeight = 100;
  const legendX = width - theme.marginRight + 5;
  const legendY = theme.marginTop + 20;

  // Draw gradient
  for (let i = 0; i < legendHeight; i++) {
    const normalized = 1 - i / legendHeight;
    ctx.fillStyle = valueToHeatColor(normalized);
    ctx.fillRect(legendX, legendY + i, legendWidth, 1);
  }

  // Draw border
  ctx.strokeStyle = theme.axisColor;
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

  // Draw labels
  ctx.fillStyle = theme.axisColor;
  ctx.font = `${theme.fontSize - 2}px ${theme.fontFamily}`;
  ctx.textAlign = 'left';
  const zRange = getAxisRange(zAxis);
  ctx.fillText(`${zRange.max}`, legendX + legendWidth + 5, legendY + 5);
  ctx.fillText(`${zRange.min}`, legendX + legendWidth + 5, legendY + legendHeight);
  ctx.fillText(zAxis.unit, legendX + legendWidth + 5, legendY + legendHeight / 2);
}
