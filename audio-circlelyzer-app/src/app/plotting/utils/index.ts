/**
 * Rendering Utilities
 *
 * Shared types and functions for rendering.
 */

import { PlotTheme, AxisMetadata } from '../types';

/** Canvas rendering context type alias */
export type RenderingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Plot area dimensions */
export interface PlotArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Axis effective range */
export interface AxisRange {
  min: number;
  max: number;
}

/**
 * Get the effective display range for an axis.
 * Uses range.min/max if defined, otherwise falls back to minValue/maxValue.
 */
export function getAxisRange(axis: AxisMetadata): AxisRange {
  return {
    min: axis.range.min !== undefined ? axis.range.min : axis.minValue,
    max: axis.range.max !== undefined ? axis.range.max : axis.maxValue,
  };
}

/**
 * Compute the visible range after applying zoom/pan.
 * For logarithmic axes, zoom and pan operate in log-space so that equal
 * scroll distances correspond to equal factors (octaves/decades).
 */
export function computeVisibleRange(
  rangeMin: number,
  rangeMax: number,
  zoom: number,
  pan: number,
  logarithmic: boolean
): { visibleMin: number; visibleMax: number } {
  if (logarithmic && rangeMin > 0 && rangeMax > rangeMin) {
    const logMin = Math.log10(rangeMin);
    const logMax = Math.log10(rangeMax);
    const logRange = logMax - logMin;
    const visibleLogRange = logRange / zoom;
    const logCenter = logMin + logRange / 2 - (pan / 2) * logRange;
    const logVisibleMin = logCenter - visibleLogRange / 2;
    const logVisibleMax = logCenter + visibleLogRange / 2;
    return {
      visibleMin: Math.pow(10, logVisibleMin),
      visibleMax: Math.pow(10, logVisibleMax),
    };
  }
  // Linear
  const range = rangeMax - rangeMin;
  const visibleRange = range / zoom;
  const center = rangeMin + range / 2 - (pan / 2) * range;
  return {
    visibleMin: center - visibleRange / 2,
    visibleMax: center + visibleRange / 2,
  };
}

/**
 * Calculate plot area from canvas dimensions and theme margins
 */
export function calculatePlotArea(width: number, height: number, theme: PlotTheme): PlotArea {
  return {
    left: theme.marginLeft,
    top: theme.marginTop,
    width: width - theme.marginLeft - theme.marginRight,
    height: height - theme.marginTop - theme.marginBottom,
  };
}

/**
 * Draw plot title
 */
export function drawTitle(
  ctx: RenderingContext,
  title: string,
  width: number,
  theme: PlotTheme
): void {
  ctx.fillStyle = theme.axisColor;
  ctx.font = `bold ${theme.titleFontSize}px ${theme.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(title, width / 2, 10);
}

export function formatAxisLabel(axis: AxisMetadata): string {
  const explicitLabel = axis.label?.trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  return axis.unit ? `${axis.name} (${axis.unit})` : axis.name;
}

export * from './color';
export * from './ticks';
