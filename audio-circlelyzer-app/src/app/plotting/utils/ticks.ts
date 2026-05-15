/**
 * Axis Tick Calculation Utilities
 */

export interface TickResult {
  values: number[];
  labels: string[];
}

/**
 * Calculate nice tick values for an axis range
 */
export function calculateNiceTicks(
  min: number,
  max: number,
  targetCount: number = 5,
  logarithmic: boolean = false
): TickResult {
  if (logarithmic) {
    return calculateLogTicks(min, max, targetCount);
  }
  return calculateLinearTicks(min, max, targetCount);
}

/**
 * Calculate linear tick values with nice intervals
 */
function calculateLinearTicks(min: number, max: number, targetCount: number): TickResult {
  const range = max - min;
  if (range === 0) {
    return { values: [min], labels: [min.toFixed(1)] };
  }

  // Calculate nice step size
  const roughStep = range / targetCount;
  const magnitude = Math.floor(Math.log10(roughStep));
  const magnitudePow = Math.pow(10, magnitude);
  const normalizedStep = roughStep / magnitudePow;

  // Choose nice step from [1, 2, 5, 10]
  let niceStep: number;
  if (normalizedStep <= 1) niceStep = 1;
  else if (normalizedStep <= 2) niceStep = 2;
  else if (normalizedStep <= 5) niceStep = 5;
  else niceStep = 10;

  const step = niceStep * magnitudePow;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const values: number[] = [];
  const labels: string[] = [];

  // Determine appropriate decimal places
  const decimalPlaces = Math.max(0, -Math.floor(Math.log10(step)));

  for (let v = niceMin; v <= niceMax + step * 0.001; v += step) {
    values.push(v);
    labels.push(v.toFixed(decimalPlaces));
  }

  return { values, labels };
}

/**
 * Calculate logarithmic tick values
 */
function calculateLogTicks(min: number, max: number, targetCount: number): TickResult {
  if (min <= 0) min = 1e-10;
  if (max <= 0) max = 1;

  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const logRange = logMax - logMin;

  const values: number[] = [];
  const labels: string[] = [];

  if (logRange < targetCount) {
    // Use decade markers with subdivisions
    const startDecade = Math.floor(logMin);
    const endDecade = Math.ceil(logMax);

    for (let decade = startDecade; decade <= endDecade; decade++) {
      const decadeValue = Math.pow(10, decade);
      if (decadeValue >= min && decadeValue <= max) {
        values.push(decadeValue);
        labels.push(formatScientific(decadeValue));
      }
    }
  } else {
    // Use fewer decade markers
    const step = Math.ceil(logRange / targetCount);
    const startDecade = Math.floor(logMin);
    const endDecade = Math.ceil(logMax);

    for (let decade = startDecade; decade <= endDecade; decade += step) {
      const decadeValue = Math.pow(10, decade);
      if (decadeValue >= min && decadeValue <= max) {
        values.push(decadeValue);
        labels.push(formatScientific(decadeValue));
      }
    }
  }

  return { values, labels };
}

/**
 * Format a number in scientific notation
 */
function formatScientific(value: number): string {
  if (value === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(value)));
  if (exp >= -2 && exp <= 3) {
    return value.toFixed(Math.max(0, -exp));
  }
  const mantissa = value / Math.pow(10, exp);
  return `${mantissa.toFixed(1)}e${exp}`;
}
