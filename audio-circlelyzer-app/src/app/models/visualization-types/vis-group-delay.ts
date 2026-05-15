import type { Type } from '@angular/core';
import {
  VisualizationType,
  CalculationContext,
  VISUALIZATION_TYPE_ID,
  SpectrumVisualizationSettings
} from '../types';
import { Data2D, PlotData, Plot2DOptions, PlotType2D } from '../../plotting/types';

/**
 * Shared data preparation for delay-vs-frequency visualizations.
 * Source data is Float32Array[] (one per channel), indexed by DFT bin.
 * The first half of each array (bins 0..N/2) is mapped onto a linear
 * frequency axis using sampleRate/nc.
 */
function prepareDelayData(dataChannels: any, ctx: CalculationContext): any {
  if (!dataChannels || !Array.isArray(dataChannels)) return null;

  const sampleRate = ctx.settings.sampleRate;
  const nc = ctx.settings.nc;
  const firstChannel = dataChannels[0] as Float32Array;
  const half = Math.max(1, Math.floor(firstChannel.length / 2));

  const frequencies = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    frequencies[i] = (i * sampleRate) / nc;
  }

  const valuesPerChannel = dataChannels.map((ch: Float32Array) => ch.slice(0, half));
  return { frequencies, valuesPerChannel };
}

function updateDelayPlotData(
  sourceData: any,
  plotData: PlotData,
  _settings: SpectrumVisualizationSettings,
  _ctx: CalculationContext
): void {
  const data2d = plotData as Data2D;
  if (!sourceData?.frequencies || !sourceData?.valuesPerChannel) return;

  const { frequencies, valuesPerChannel } = sourceData;
  for (let ch = 0; ch < valuesPerChannel.length; ch++) {
    const values: Float32Array = valuesPerChannel[ch];
    while (ch >= data2d.channels.length) {
      data2d.channels.push({
        x: new Float32Array(values.length),
        y: new Float32Array(values.length),
        length: values.length
      });
    }
    const channel = data2d.channels[ch];
    const len = Math.min(values.length, channel.x.length);
    channel.length = len;
    for (let i = 0; i < len; i++) {
      channel.x[i] = frequencies[i];
      channel.y[i] = values[i];
    }
  }
}

/**
 * VIS_GROUP_DELAY — Group delay vs frequency
 * Input: Float32Array[] (group delay in samples per DFT bin)
 */
export class GroupDelayVisualization implements VisualizationType<SpectrumVisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_GROUP_DELAY';
  name = 'Group Delay';
  description = 'Displays group delay (samples) vs frequency';
  hasSimpleValue = false;
  hasCanvas = true;

  initSettings(key: string, ctx: CalculationContext): SpectrumVisualizationSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) return existing as SpectrumVisualizationSettings;
    return {
      xAxisSettings: { range: { min: 20, max: 20000 }, showGridLines: true, logarithmic: true },
      yAxisSettings: { range: { min: undefined, max: undefined }, showGridLines: true }
    };
  }

  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    return prepareDelayData(dataChannels, ctx);
  }

  getPlotMode(): '2d' { return '2d'; }
  getPlotType(): PlotType2D { return 'line'; }

  getPlotOptions(settings: SpectrumVisualizationSettings, ctx: CalculationContext): Plot2DOptions {
    return {
      plotType: 'line',
      contextType: '2d',
      title: (settings as any)?.title || 'Group Delay',
      axesMetadata: [
        {
          name: 'Frequency',
          unit: 'Hz',
          range: { min: settings?.xAxisSettings?.range?.min, max: settings?.xAxisSettings?.range?.max },
          logarithmic: settings?.xAxisSettings?.logarithmic ?? true,
          showGridlines: settings?.xAxisSettings?.showGridLines ?? true,
          minValue: 0,
          maxValue: ctx.settings.sampleRate / 2
        },
        {
          name: 'Group Delay',
          unit: 'samples',
          range: { min: settings?.yAxisSettings?.range?.min, max: settings?.yAxisSettings?.range?.max },
          logarithmic: false,
          showGridlines: settings?.yAxisSettings?.showGridLines ?? true,
          minValue: -ctx.settings.nc,
          maxValue: ctx.settings.nc
        }
      ]
    };
  }

  initPlotData(settings: SpectrumVisualizationSettings, ctx: CalculationContext): Data2D {
    const half = Math.max(1, Math.floor(ctx.settings.nc / 2));
    const channelCount = ctx.channelCount ?? 1;
    const channels = Array.from({ length: channelCount }, () => ({
      x: new Float32Array(half),
      y: new Float32Array(half),
      length: half
    }));
    return { channels, generation: 0 };
  }

  updatePlotData(sourceData: any, plotData: PlotData, settings: SpectrumVisualizationSettings, ctx: CalculationContext): void {
    // Remap valuesPerChannel field used for delay data
    const remapped = sourceData
      ? { frequencies: sourceData.frequencies, valuesPerChannel: sourceData.valuesPerChannel }
      : null;
    updateDelayPlotData(remapped, plotData, settings, ctx);
  }

}

/**
 * VIS_PHASE_DELAY — Phase delay vs frequency
 * Input: Float32Array[] (phase delay in samples per DFT bin)
 */
export class PhaseDelayVisualization implements VisualizationType<SpectrumVisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_PHASE_DELAY';
  name = 'Phase Delay';
  description = 'Displays phase delay (samples) vs frequency';
  hasSimpleValue = false;
  hasCanvas = true;

  initSettings(key: string, ctx: CalculationContext): SpectrumVisualizationSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) return existing as SpectrumVisualizationSettings;
    return {
      xAxisSettings: { range: { min: 20, max: 20000 }, showGridLines: true, logarithmic: true },
      yAxisSettings: { range: { min: undefined, max: undefined }, showGridLines: true }
    };
  }

  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    return prepareDelayData(dataChannels, ctx);
  }

  getPlotMode(): '2d' { return '2d'; }
  getPlotType(): PlotType2D { return 'line'; }

  getPlotOptions(settings: SpectrumVisualizationSettings, ctx: CalculationContext): Plot2DOptions {
    return {
      plotType: 'line',
      contextType: '2d',
      title: (settings as any)?.title || 'Phase Delay',
      axesMetadata: [
        {
          name: 'Frequency',
          unit: 'Hz',
          range: { min: settings?.xAxisSettings?.range?.min, max: settings?.xAxisSettings?.range?.max },
          logarithmic: settings?.xAxisSettings?.logarithmic ?? true,
          showGridlines: settings?.xAxisSettings?.showGridLines ?? true,
          minValue: 0,
          maxValue: ctx.settings.sampleRate / 2
        },
        {
          name: 'Phase Delay',
          unit: 'samples',
          range: { min: settings?.yAxisSettings?.range?.min, max: settings?.yAxisSettings?.range?.max },
          logarithmic: false,
          showGridlines: settings?.yAxisSettings?.showGridLines ?? true,
          minValue: -ctx.settings.nc,
          maxValue: ctx.settings.nc
        }
      ]
    };
  }

  initPlotData(settings: SpectrumVisualizationSettings, ctx: CalculationContext): Data2D {
    const half = Math.max(1, Math.floor(ctx.settings.nc / 2));
    const channelCount = ctx.channelCount ?? 1;
    const channels = Array.from({ length: channelCount }, () => ({
      x: new Float32Array(half),
      y: new Float32Array(half),
      length: half
    }));
    return { channels, generation: 0 };
  }

  updatePlotData(sourceData: any, plotData: PlotData, settings: SpectrumVisualizationSettings, ctx: CalculationContext): void {
    const remapped = sourceData
      ? { frequencies: sourceData.frequencies, valuesPerChannel: sourceData.valuesPerChannel }
      : null;
    updateDelayPlotData(remapped, plotData, settings, ctx);
  }

}
