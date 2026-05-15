/**
 * Color Conversion Utilities
 */

/**
 * Convert hex color to RGBA values (0-1 range)
 */
export function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
      a: 1,
    };
  }
  return { r: 1, g: 1, b: 1, a: 1 };
}

/**
 * Convert a normalized value (0-1) to a heat color string
 * Color gradient: blue → cyan → green → yellow → red
 */
export function valueToHeatColor(value: number): string {
  const v = Math.max(0, Math.min(1, value));
  let r = 0,
    g = 0,
    b = 0;

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

/**
 * Convert a normalized value (0-1) to a surface gradient color
 * For 3D surface visualization
 */
export function valueToSurfaceColor(value: number): { r: number; g: number; b: number } {
  const v = Math.max(0, Math.min(1, value));

  // Gradient from blue (low) through green (mid) to red (high)
  if (v < 0.5) {
    const t = v * 2;
    return {
      r: 0,
      g: t,
      b: 1 - t,
    };
  } else {
    const t = (v - 0.5) * 2;
    return {
      r: t,
      g: 1 - t,
      b: 0,
    };
  }
}
