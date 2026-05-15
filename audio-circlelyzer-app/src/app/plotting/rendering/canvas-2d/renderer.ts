/**
 * Canvas 2D Renderer
 *
 * Main entry point for 2D canvas rendering.
 */

import { PlotHandle, Plot2DOptions, isPlot2DOptions, isPlot3DOptions } from '../../types';
import { RenderingContext, PlotArea, calculatePlotArea, drawTitle } from '../../utils';
import { drawAxes } from './axes';
import { draw2DData, drawHeatmapLegend } from './plots';
import { draw3DData } from '../3d/renderer';

/**
 * Main 2D rendering function
 */
export function renderCanvas2D(handle: PlotHandle): void {
  const ctx = handle.context as RenderingContext;
  if (!ctx || !handle.canvas) return;

  const { width, height } = handle.canvas;
  const theme = handle.theme;
  const options = handle.options;

  // Clear background
  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const plotArea = calculatePlotArea(width, height, theme);

  // Draw title
  drawTitle(ctx, options.title, width, theme);

  // Render based on plot type
  if (isPlot3DOptions(options)) {
    draw3DData(ctx, handle, plotArea);
  } else {
    drawAxes(ctx, handle, plotArea);
    draw2DData(ctx, handle, plotArea);

    // Draw color legend for heatmaps
    if ((options as Plot2DOptions).plotType === 'heatmap') {
      drawHeatmapLegend(ctx, handle, width, height);
    }
  }
}

export { drawAxes, draw2DData, drawHeatmapLegend };
