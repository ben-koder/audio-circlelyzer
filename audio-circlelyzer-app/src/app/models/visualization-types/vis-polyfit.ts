import type { Type } from '@angular/core';
import {
  VisualizationType,
  CalculationContext,
  VISUALIZATION_TYPE_ID,
  SpectrumVisualizationSettings,
} from '../types';
import { Data2D, PlotData, Plot2DOptions, PlotType2D } from '../../plotting/types';
import type { PolyFitData } from '../../services/wasm.service';

/**
 * VIS_POLYFIT — Polynomial gray-box regression curve plot.
 *
 * Renders the smooth polynomial K_d(x) recovered from a gray-box fit by
 * sweeping the input on the chosen derivative axis (other axes held at zero):
 *
 *     K_d(x) = Σ_{α : p_j = 0 ∀ j ≠ d}  θ_α · x^{p_d}
 *
 * The x-axis is "fraction of full scale" (the input we drive the system
 * with), defaulting to ±1.5 × full scale, configurable via
 *
 *     arg = { derivative: 0|1|2|…, xRangeFullScale: number, nPoints: number,
 *             title?, xAxisLabel?, yAxisLabel? }
 *
 * Multiple `VIS_POLYFIT(…)` invocations sharing the same poly_fit but with
 * different `derivative` produce one plot per axis (Klippel BL(x) / Kms(x) /
 * Le(x) style).
 *
 * Fit-quality is reported inline: each channel label includes
 *   "  RMS err: -34.2 dB"
 * so the regression error appears in the plot legend (similar to RT60's
 * T30/EDT readouts). The per-channel summary object is also attached to
 * the plot data as `summaries` for future use by a dedicated table widget.
 *
 * The pure coefficient bar chart lives in VIS_POLYFIT_COEFFS.
 */

const AXIS_NAMES: ReadonlyArray<string> = ['y', 'ẏ', 'ÿ', 'y⃛', 'y⁽⁴⁾'];

interface PolyfitCurveSettings extends SpectrumVisualizationSettings {
  /** Derivative axis index to sweep (0 = y, 1 = ẏ, …). Default 0. */
  derivative?: number;
  /** ± fraction of full-scale spanned by the x-axis. Default 1.5. */
  xRangeFullScale?: number;
  /** Number of evaluation points across the x-range. Default 256. */
  nPoints?: number;
  title?: string;
  description?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

interface PolyfitCurveSummary {
  residualRmsDb: number;
  residualRelative: number;
  conditionNumber: number;
  dominant: { label: string; value: number }[];
  derivative: number;
  axisName: string;
}

function axisName(d: number): string {
  return AXIS_NAMES[d] ?? `y^(${d})`;
}

/**
 * Evaluate the polynomial along `axisIdx` with all other axes pinned to 0.
 * Only monomials whose non-axis powers are exactly zero contribute.
 */
function evaluateCurve(fit: PolyFitData, axisIdx: number, xs: Float32Array): Float32Array {
  const ys = new Float32Array(xs.length);
  const coeffs = fit.coeffs;
  const powersList = fit.monomialPowers;
  if (!coeffs || !powersList || coeffs.length === 0) return ys;

  // Pre-collect (coefficient, power) pairs for monomials that depend only on `axisIdx`.
  const active: { c: number; p: number }[] = [];
  for (let i = 0; i < coeffs.length; i++) {
    const powers = powersList[i];
    if (!powers) continue;
    let onAxis = true;
    let p = 0;
    for (let j = 0; j < powers.length; j++) {
      if (j === axisIdx) {
        p = powers[j];
      } else if (powers[j] !== 0) {
        onAxis = false;
        break;
      }
    }
    if (onAxis) active.push({ c: coeffs[i], p });
  }

  for (let k = 0; k < xs.length; k++) {
    const x = xs[k];
    let sum = 0;
    for (const { c, p } of active) {
      sum += c * Math.pow(x, p);
    }
    ys[k] = sum;
  }
  return ys;
}

function buildSummary(fit: PolyFitData, derivative: number): PolyfitCurveSummary {
  const n = Math.max(1, fit.residualRe?.length ?? 0);
  const rms = Math.sqrt((fit.residualNorm * fit.residualNorm) / n);
  const residualRmsDb = 20 * Math.log10(Math.max(rms, 1e-12));
  const rhs = fit.rhsNorm > 0 ? fit.rhsNorm : 1;
  const residualRelative = fit.residualNorm / rhs;

  // Top-3 monomial coefficients by |θ|.
  const ranked = (fit.monomialLabels ?? [])
    .map((label, i) => ({ label, value: fit.coeffs[i] ?? 0 }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 3);

  return {
    residualRmsDb,
    residualRelative,
    conditionNumber: fit.conditionNumber,
    dominant: ranked,
    derivative,
    axisName: axisName(derivative),
  };
}

export class PolyfitVisualization implements VisualizationType<PolyfitCurveSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_POLYFIT';
  name = 'Polynomial Curve';
  description = 'Recovered polynomial curve K_d(x) along one derivative axis';
  hasSimpleValue = false;
  hasCanvas = true;

  initSettings(key: string, ctx: CalculationContext): PolyfitCurveSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) return existing as PolyfitCurveSettings;
    return {
      derivative: 0,
      xRangeFullScale: 1.5,
      nPoints: 256,
      xAxisSettings: { range: { min: undefined, max: undefined }, showGridLines: true, logarithmic: false },
      yAxisSettings: { range: { min: undefined, max: undefined }, showGridLines: true },
    };
  }

  /**
   * Evaluate the curve once per channel; attach the per-channel summary onto
   * the prepared object so updatePlotData can reach it without recomputing.
   */
  prepareData(dataChannels: any, ctx: CalculationContext, settings: PolyfitCurveSettings): any {
    if (!dataChannels || !Array.isArray(dataChannels) || dataChannels.length === 0) return null;
    const fits = dataChannels as PolyFitData[];
    const channelLabels = (dataChannels as { channelLabels?: string[] }).channelLabels ?? [];

    const derivative = Math.max(0, Math.floor(settings?.derivative ?? 0));
    const xRange = Math.max(1e-6, settings?.xRangeFullScale ?? 1.5);
    const nPoints = Math.max(8, Math.floor(settings?.nPoints ?? 256));

    const xs = new Float32Array(nPoints);
    for (let i = 0; i < nPoints; i++) {
      xs[i] = -xRange + (2 * xRange * i) / (nPoints - 1);
    }

    const curves: { x: Float32Array; y: Float32Array; label: string; summary: PolyfitCurveSummary }[] = [];
    for (let ch = 0; ch < fits.length; ch++) {
      const fit = fits[ch];
      if (!fit) continue;
      const nAxes = fit.monomialPowers?.[0]?.length ?? 1;
      // If the requested axis is out of range for this fit, emit an empty curve.
      let ys: Float32Array;
      if (derivative >= nAxes) {
        ys = new Float32Array(xs.length);
      } else {
        ys = evaluateCurve(fit, derivative, xs);
      }
      const summary = buildSummary(fit, derivative);
      const baseLabel = channelLabels[ch] ?? `K_${derivative}`;
      const label = `${baseLabel}  (RMS err: ${summary.residualRmsDb.toFixed(1)} dB)`;
      curves.push({ x: xs, y: ys, label, summary });
    }

    return {
      curves,
      derivative,
      xRange,
      channelLabels,
    };
  }

  getPlotMode(): '2d' { return '2d'; }
  getPlotType(): PlotType2D { return 'line'; }

  getPlotOptions(settings: PolyfitCurveSettings, ctx: CalculationContext): Plot2DOptions {
    const derivative = Math.max(0, Math.floor(settings?.derivative ?? 0));
    const xRange = Math.max(1e-6, settings?.xRangeFullScale ?? 1.5);
    const defaultXLabel = `${axisName(derivative)} / full-scale`;
    const defaultYLabel = `K_${derivative}(${axisName(derivative)})`;
    const defaultTitle = `Polynomial curve K_${derivative}(${axisName(derivative)})`;
    return {
      plotType: 'line',
      contextType: '2d',
      title: settings?.title || defaultTitle,
      axesMetadata: [
        {
          name: settings?.xAxisLabel || defaultXLabel,
          unit: '',
          range: {
            min: settings?.xAxisSettings?.range?.min ?? -xRange,
            max: settings?.xAxisSettings?.range?.max ?? xRange,
          },
          logarithmic: false,
          showGridlines: settings?.xAxisSettings?.showGridLines ?? true,
          minValue: -xRange,
          maxValue: xRange,
        },
        {
          name: settings?.yAxisLabel || defaultYLabel,
          unit: '',
          range: { min: settings?.yAxisSettings?.range?.min, max: settings?.yAxisSettings?.range?.max },
          logarithmic: false,
          showGridlines: settings?.yAxisSettings?.showGridLines ?? true,
          minValue: -1,
          maxValue: 1,
        },
      ],
    };
  }

  initPlotData(settings: PolyfitCurveSettings, ctx: CalculationContext): Data2D {
    const nPoints = Math.max(8, Math.floor(settings?.nPoints ?? 256));
    const channelCount = ctx.channelCount ?? 1;
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      channels.push({ x: new Float32Array(nPoints), y: new Float32Array(nPoints), length: 0 });
    }
    return { channels, generation: 0 };
  }

  updatePlotData(
    sourceData: any,
    plotData: PlotData,
    settings: PolyfitCurveSettings,
    ctx: CalculationContext,
  ): void {
    const data2d = plotData as Data2D;
    if (!sourceData?.curves || !Array.isArray(sourceData.curves)) return;
    const curves = sourceData.curves as {
      x: Float32Array;
      y: Float32Array;
      label: string;
      summary: PolyfitCurveSummary;
    }[];

    for (let ch = 0; ch < curves.length; ch++) {
      const { x, y, label } = curves[ch];
      while (ch >= data2d.channels.length) {
        data2d.channels.push({ x: new Float32Array(x.length), y: new Float32Array(y.length), length: 0 });
      }
      const channel = data2d.channels[ch];
      if (channel.x.length < x.length) {
        channel.x = new Float32Array(x.length);
        channel.y = new Float32Array(y.length);
      }
      channel.length = x.length;
      channel.label = label;
      for (let i = 0; i < x.length; i++) {
        channel.x[i] = x[i];
        channel.y[i] = y[i];
      }
    }
    // Drop stale channels.
    if (data2d.channels.length > curves.length) {
      data2d.channels.length = curves.length;
    }

    // Expose the per-channel summary on the plot data so a downstream table
    // widget (or the simple-value pipeline) can render the fit quality.
    (data2d as any).summaries = curves.map((c) => c.summary);
  }

  /**
   * Map this visualization's prepared data to the simple-value record the
   * worker writes into context.simpleValues. Currently unused (the worker's
   * simple-value extractor is RT60-specific) but kept for the future
   * tabular RT60-style fit-quality readout.
   */
  // getSimpleValue removed — see hasSimpleValue=false above.

}
