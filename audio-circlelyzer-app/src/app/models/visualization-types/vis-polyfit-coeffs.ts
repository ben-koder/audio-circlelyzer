import { Type } from '@angular/core';
import {
  VisualizationType,
  CalculationContext,
  VISUALIZATION_TYPE_ID,
  SpectrumVisualizationSettings,
} from '../types';
import { Data2D, PlotData, Plot2DOptions, PlotType2D } from '../../plotting/types';
import { OctaveBars } from '../../components/visualizations/octave-bars/octave-bars';
import type { PolyFitData } from '../../services/wasm.service';

/**
 * VIS_POLYFIT_COEFFS — Polynomial gray-box regression coefficient bar chart.
 *
 * Consumes a PolyFitData[] (one entry per harmonic / channel) and renders the
 * recovered coefficients on a categorical x-axis labeled by monomial.
 * Y values are sign-preserving log magnitudes:
 *   y = sign(θ) · 20·log10(max(|θ|, 1e-12))
 * which makes both small and large coefficients visible while keeping sign.
 *
 * For the smooth polynomial-curve view (BL(x), Kms(x), Le(x) style) see
 * VIS_POLYFIT in vis-polyfit.ts.
 */
export class PolyfitCoeffsVisualization implements VisualizationType<SpectrumVisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_POLYFIT_COEFFS';
  name = 'Polynomial Coefficients';
  description = 'Recovered polynomial gray-box regression coefficients';
  hasSimpleValue = false;
  hasCanvas = true;

  initSettings(key: string, ctx: CalculationContext): SpectrumVisualizationSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) return existing as SpectrumVisualizationSettings;
    return {
      xAxisSettings: { range: { min: undefined, max: undefined }, showGridLines: false, logarithmic: false },
      yAxisSettings: { range: { min: undefined, max: undefined }, showGridLines: true },
    };
  }

  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    if (Array.isArray(dataChannels)) {
      for (const fit of dataChannels) {
        if (fit && Array.isArray(fit.monomialLabels)) {
          fit.labels = fit.monomialLabels;
        }
      }
    }
    return dataChannels;
  }

  getPlotMode(): '2d' { return '2d'; }
  getPlotType(): PlotType2D { return 'bars'; }

  getPlotOptions(settings: SpectrumVisualizationSettings, ctx: CalculationContext): Plot2DOptions {
    return {
      plotType: 'bars',
      contextType: '2d',
      title: (settings as any)?.title || 'Polynomial Coefficients',
      axesMetadata: [
        {
          name: 'Monomial',
          unit: '',
          range: { min: 0, max: undefined },
          logarithmic: false,
          showGridlines: false,
          minValue: 0,
          maxValue: 1,
          categorical: true,
          categoryLabels: [],
        },
        {
          name: 'Coefficient (signed dB)',
          unit: 'dB',
          range: { min: settings?.yAxisSettings?.range?.min, max: settings?.yAxisSettings?.range?.max },
          logarithmic: false,
          showGridlines: settings?.yAxisSettings?.showGridLines ?? true,
          minValue: -120,
          maxValue: 20,
        },
      ],
    };
  }

  initPlotData(settings: SpectrumVisualizationSettings, ctx: CalculationContext): Data2D {
    const channelCount = ctx.channelCount ?? 1;
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      channels.push({ x: new Float32Array(0), y: new Float32Array(0), length: 0 });
    }
    return { channels, generation: 0 };
  }

  updatePlotData(
    sourceData: any,
    plotData: PlotData,
    settings: SpectrumVisualizationSettings,
    ctx: CalculationContext,
  ): void {
    const data2d = plotData as Data2D;
    if (!sourceData || !Array.isArray(sourceData) || sourceData.length === 0) return;
    const fits = sourceData as PolyFitData[];
    const channelLabels = (sourceData as { channelLabels?: string[] }).channelLabels ?? [];

    // Use the labels from the first non-empty fit as the categorical axis.
    const reference = fits.find((f) => f && f.coeffs && f.coeffs.length > 0);
    if (!reference) return;
    const numCoeffs = reference.coeffs.length;
    const labels = reference.monomialLabels.slice(0, numCoeffs);

    // Stash labels on the axis metadata when reachable. Worker re-reads it.
    const xAxis = (plotData as any)?.axesMetadata?.[0];
    if (xAxis && Array.isArray(xAxis.categoryLabels)) {
      xAxis.categoryLabels.length = 0;
      for (const l of labels) xAxis.categoryLabels.push(l);
    }

    for (let ch = 0; ch < fits.length; ch++) {
      const fit = fits[ch];
      while (ch >= data2d.channels.length) {
        data2d.channels.push({ x: new Float32Array(numCoeffs), y: new Float32Array(numCoeffs), length: numCoeffs });
      }
      const channel = data2d.channels[ch];
      channel.label = channelLabels[ch];
      if (channel.x.length < numCoeffs) {
        channel.x = new Float32Array(numCoeffs);
        channel.y = new Float32Array(numCoeffs);
      }
      channel.length = numCoeffs;
      const coeffs = fit?.coeffs ?? new Float32Array();
      for (let i = 0; i < numCoeffs; i++) {
        const v = coeffs[i] ?? 0;
        const mag = Math.max(Math.abs(v), 1e-12);
        channel.x[i] = i;
        channel.y[i] = Math.sign(v) * 20 * Math.log10(mag);
      }
    }
    if (data2d.channels.length > fits.length) {
      data2d.channels.length = fits.length;
    }
  }

  getVisualizationUI(key: string, ctx: CalculationContext): Type<any> {
    return OctaveBars;
  }
}
