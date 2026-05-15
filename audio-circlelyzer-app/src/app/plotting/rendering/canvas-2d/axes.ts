/**
 * Canvas 2D Axis Drawing
 */

import { PlotHandle, Plot2DOptions, isPlot2DOptions } from '../../types';
import { RenderingContext, PlotArea, calculateNiceTicks, getAxisRange, computeVisibleRange, formatAxisLabel } from '../../utils';

/**
 * Draw X and Y axes with ticks, labels, and gridlines
 */
export function drawAxes(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea,
  skipGridLines: boolean = false
): void {
  const theme = handle.theme;
  const options = handle.options;
  const dynOpts = handle.dynamicOptions;

  ctx.strokeStyle = theme.axisColor;
  ctx.lineWidth = 1;
  ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
  ctx.fillStyle = theme.axisColor;

  // Draw axis lines
  ctx.beginPath();
  ctx.moveTo(plotArea.left, plotArea.top + plotArea.height);
  ctx.lineTo(plotArea.left + plotArea.width, plotArea.top + plotArea.height);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(plotArea.left, plotArea.top);
  ctx.lineTo(plotArea.left, plotArea.top + plotArea.height);
  ctx.stroke();

  const xAxis = options.axesMetadata[0];
  const yAxis = options.axesMetadata[1];

  if (xAxis) {
    drawXAxis(ctx, handle, plotArea, skipGridLines);
  }

  if (yAxis) {
    drawYAxis(ctx, handle, plotArea, skipGridLines);
  }
}

function drawXAxis(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea,
  skipGridLines: boolean
): void {
  const theme = handle.theme;
  const xAxis = handle.options.axesMetadata[0];
  const dynOpts = handle.dynamicOptions;

  // Draw axis label
  ctx.textAlign = 'center';
  ctx.fillText(
    formatAxisLabel(xAxis),
    plotArea.left + plotArea.width / 2,
    plotArea.top + plotArea.height + theme.marginBottom - 12
  );

  // Calculate visible range using effective range
  const { min: xMin, max: xMax } = getAxisRange(xAxis);
  const { visibleMin: xVisibleMin, visibleMax: xVisibleMax } = computeVisibleRange(
    xMin, xMax, dynOpts.zoomX, dynOpts.panX, xAxis.logarithmic || false
  );

  // Determine if gridlines should be drawn for this axis
  const shouldDrawGridlines = !skipGridLines && xAxis.showGridlines !== false;

  if ((xAxis as any).categorical && (xAxis as any).categoryLabels) {
    drawCategoricalTicks(ctx, handle, plotArea, xVisibleMin, xVisibleMax, 'x');
  } else {
    drawNumericTicks(ctx, handle, plotArea, xVisibleMin, xVisibleMax, 'x', !shouldDrawGridlines);
  }
}

function drawYAxis(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea,
  skipGridLines: boolean
): void {
  const theme = handle.theme;
  const yAxis = handle.options.axesMetadata[1];
  const dynOpts = handle.dynamicOptions;

  // Draw rotated axis label
  ctx.save();
  ctx.translate(15, plotArea.top + plotArea.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(formatAxisLabel(yAxis), 0, 0);
  ctx.restore();

  // Calculate visible range using effective range
  const { min: yMin, max: yMax } = getAxisRange(yAxis);
  const { visibleMin: yVisibleMin, visibleMax: yVisibleMax } = computeVisibleRange(
    yMin, yMax, dynOpts.zoomY, dynOpts.panY, yAxis.logarithmic || false
  );

  // Check for heatmap with multiple channels
  const data = handle.data;
  const numChannels = data?.channels.length || 1;
  const isHeatmap = isPlot2DOptions(handle.options) && handle.options.plotType === 'heatmap';

  // Determine if gridlines should be drawn for this axis
  const shouldDrawGridlines = !skipGridLines && yAxis.showGridlines !== false;

  if (isHeatmap && numChannels > 1) {
    drawMultiChannelHeatmapYTicks(ctx, handle, plotArea, yVisibleMin, yVisibleMax, !shouldDrawGridlines);
  } else {
    drawNumericTicks(ctx, handle, plotArea, yVisibleMin, yVisibleMax, 'y', !shouldDrawGridlines);
  }
}

function drawCategoricalTicks(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea,
  visibleMin: number,
  visibleMax: number,
  axis: 'x' | 'y'
): void {
  const theme = handle.theme;
  const axisData = handle.options.axesMetadata[axis === 'x' ? 0 : 1];
  const categoryLabels = (axisData as any).categoryLabels as string[];
  const numLabels = categoryLabels.length;
  if (numLabels === 0) return;

  for (let i = 0; i < numLabels; i++) {
    // Position labels evenly: center of each bar slot
    const valueNorm = (i + 0.5) / numLabels;

    if (axis === 'x') {
      const x = plotArea.left + valueNorm * plotArea.width;
      if (x < plotArea.left - 50 || x > plotArea.left + plotArea.width + 50) continue;

      ctx.beginPath();
      ctx.moveTo(x, plotArea.top + plotArea.height);
      ctx.lineTo(x, plotArea.top + plotArea.height + theme.tickLength);
      ctx.stroke();

      ctx.textAlign = 'center';
      // Rotate labels if many categories to avoid overlap
      if (numLabels > 12) {
        ctx.save();
        ctx.translate(x, plotArea.top + plotArea.height + theme.tickLength + theme.labelPadding);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'right';
        ctx.fillText(categoryLabels[i], 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(categoryLabels[i], x, plotArea.top + plotArea.height + theme.tickLength + theme.labelPadding);
      }
    } else {
      const y = plotArea.top + plotArea.height - valueNorm * plotArea.height;
      if (y < plotArea.top - 20 || y > plotArea.top + plotArea.height + 20) continue;

      ctx.beginPath();
      ctx.moveTo(plotArea.left - theme.tickLength, y);
      ctx.lineTo(plotArea.left, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(categoryLabels[i], plotArea.left - theme.tickLength - 5, y);
    }
  }
}

function drawNumericTicks(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea,
  visibleMin: number,
  visibleMax: number,
  axis: 'x' | 'y',
  skipGridLines: boolean
): void {
  const theme = handle.theme;
  const axisData = handle.options.axesMetadata[axis === 'x' ? 0 : 1];
  const ticks = calculateNiceTicks(visibleMin, visibleMax, 5, axisData.logarithmic || false);

  for (let i = 0; i < ticks.values.length; i++) {
    const value = ticks.values[i];
    const label = ticks.labels[i];

    let valueNorm: number;
    if (axisData.logarithmic) {
      const logMin = Math.log10(Math.max(visibleMin, 1e-10));
      const logMax = Math.log10(Math.max(visibleMax, 1e-10));
      const logValue = Math.log10(Math.max(value, 1e-10));
      valueNorm = (logValue - logMin) / (logMax - logMin);
    } else {
      valueNorm = (value - visibleMin) / (visibleMax - visibleMin);
    }

    if (axis === 'x') {
      const x = plotArea.left + valueNorm * plotArea.width;
      if (x < plotArea.left || x > plotArea.left + plotArea.width) continue;

      ctx.beginPath();
      ctx.moveTo(x, plotArea.top + plotArea.height);
      ctx.lineTo(x, plotArea.top + plotArea.height + theme.tickLength);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillText(label, x, plotArea.top + plotArea.height + theme.tickLength + theme.labelPadding);

      if (!skipGridLines) {
        ctx.strokeStyle = theme.gridColor;
        ctx.beginPath();
        ctx.moveTo(x, plotArea.top);
        ctx.lineTo(x, plotArea.top + plotArea.height);
        ctx.stroke();
        ctx.strokeStyle = theme.axisColor;
      }
    } else {
      const y = plotArea.top + plotArea.height - valueNorm * plotArea.height;
      if (y < plotArea.top || y > plotArea.top + plotArea.height) continue;

      ctx.beginPath();
      ctx.moveTo(plotArea.left - theme.tickLength, y);
      ctx.lineTo(plotArea.left, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, plotArea.left - theme.tickLength - 5, y);

      if (!skipGridLines) {
        ctx.strokeStyle = theme.gridColor;
        ctx.beginPath();
        ctx.moveTo(plotArea.left, y);
        ctx.lineTo(plotArea.left + plotArea.width, y);
        ctx.stroke();
        ctx.strokeStyle = theme.axisColor;
      }
    }
  }
}

function drawMultiChannelHeatmapYTicks(
  ctx: RenderingContext,
  handle: PlotHandle,
  plotArea: PlotArea,
  visibleMin: number,
  visibleMax: number,
  skipGridLines: boolean
): void {
  const theme = handle.theme;
  const yAxis = handle.options.axesMetadata[1];
  const data = handle.data;
  const numChannels = data?.channels.length || 1;
  const channelHeight = plotArea.height / numChannels;
  const isLog = yAxis?.logarithmic || false;

  // Calculate frequency ticks for the visible range
  const ticks = calculateNiceTicks(visibleMin, visibleMax, 4, isLog);

  for (let ch = 0; ch < numChannels; ch++) {
    const channelTop = plotArea.top + ch * channelHeight;

    // Channel divider line
    if (ch > 0) {
      ctx.strokeStyle = theme.axisColor;
      ctx.beginPath();
      ctx.moveTo(plotArea.left, channelTop);
      ctx.lineTo(plotArea.left + plotArea.width, channelTop);
      ctx.stroke();
    }

    // Frequency tick marks within this channel band
    ctx.strokeStyle = theme.axisColor;
    ctx.fillStyle = theme.axisColor;
    ctx.font = `${theme.fontSize - 2}px ${theme.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < ticks.values.length; i++) {
      const value = ticks.values[i];
      let valueNorm: number;
      if (isLog) {
        const logMin = Math.log10(Math.max(visibleMin, 1e-10));
        const logMax = Math.log10(Math.max(visibleMax, 1e-10));
        valueNorm = (Math.log10(Math.max(value, 1e-10)) - logMin) / (logMax - logMin);
      } else {
        valueNorm = (value - visibleMin) / (visibleMax - visibleMin);
      }

      // Y position within channel band (bottom = low freq, top = high freq)
      const y = channelTop + channelHeight - valueNorm * channelHeight;
      if (y < channelTop || y > channelTop + channelHeight) continue;

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(plotArea.left - theme.tickLength, y);
      ctx.lineTo(plotArea.left, y);
      ctx.stroke();

      // Tick label
      ctx.fillText(ticks.labels[i], plotArea.left - theme.tickLength - 2, y);
    }

    // Channel label (small, top-right of channel band)
    ctx.font = `${theme.fontSize - 1}px ${theme.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Ch ${ch + 1}`, plotArea.left + 4, channelTop + 2);

    // Restore font for next channel
    ctx.font = `${theme.fontSize - 2}px ${theme.fontFamily}`;
  }
}
