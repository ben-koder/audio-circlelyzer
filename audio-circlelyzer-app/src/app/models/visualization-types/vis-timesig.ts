import { Type } from '@angular/core';
import { 
  VisualizationType, 
  CalculationContext, 
  VISUALIZATION_TYPE_ID,
  TimeSigVisualizationSettings
} from '../types';
import { Data2D, PlotData, Plot2DOptions, PlotType2D } from '../../plotting/types';
import { TimeSignal } from '../../components/visualizations/time-signal/time-signal';

/**
 * VIS_TIMESIG - Time signal visualization
 * Displays amplitude vs time (seconds) for time-domain signals
 */
export class TimeSigVisualization implements VisualizationType<TimeSigVisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_TIMESIG';
  name = 'Time Signal';
  description = 'Displays amplitude vs time';
  hasSimpleValue = false;
  hasCanvas = true;

  initSettings(key: string, ctx: CalculationContext): TimeSigVisualizationSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) {
      return existing as TimeSigVisualizationSettings;
    }
    
    return {
      xAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true
      },
      yAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true
      }
    };
  }

  /**
   * Prepare data - for time signal, data is already in correct format (array of Float32Array)
   */
  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    return dataChannels;
  }

  // --- New Plot Engine integration ---

  getPlotMode(): '2d' { return '2d'; }
  getPlotType(): PlotType2D { return 'line'; }

  getPlotOptions(settings: TimeSigVisualizationSettings, ctx: CalculationContext): Plot2DOptions {
    const nc = ctx.settings.nc;
    const sampleRate = ctx.settings.sampleRate;
    const duration = nc / sampleRate;
    return {
      plotType: 'line',
      contextType: '2d',
      title: (settings as any)?.title || 'Time Signal',
      axesMetadata: [
        {
          name: 'Time',
          unit: 's',
          range: {
            min: settings?.xAxisSettings?.range?.min,
            max: settings?.xAxisSettings?.range?.max
          },
          logarithmic: false,
          showGridlines: settings?.xAxisSettings?.showGridLines ?? true,
          minValue: 0,
          maxValue: duration
        },
        {
          name: 'Amplitude',
          unit: '',
          range: {
            min: settings?.yAxisSettings?.range?.min,
            max: settings?.yAxisSettings?.range?.max
          },
          logarithmic: false,
          showGridlines: settings?.yAxisSettings?.showGridLines ?? true,
          minValue: -1,
          maxValue: 1
        }
      ]
    };
  }

  initPlotData(settings: TimeSigVisualizationSettings, ctx: CalculationContext): Data2D {
    const nc = ctx.settings.nc;
    const channelCount = ctx.channelCount ?? 1;
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      channels.push({
        x: new Float32Array(nc),
        y: new Float32Array(nc),
        length: nc,
      });
    }
    return { channels, generation: 0 };
  }

  updatePlotData(sourceData: any, plotData: PlotData, settings: TimeSigVisualizationSettings, ctx: CalculationContext): void {
    const data2d = plotData as Data2D;
    if (!sourceData || !Array.isArray(sourceData)) return;
    const sampleRate = ctx.settings.sampleRate;
    const channelLabels = (sourceData as { channelLabels?: string[] }).channelLabels ?? [];
    for (let ch = 0; ch < sourceData.length; ch++) {
      const samples: Float32Array = sourceData[ch];
      if (!samples) continue;
      // Grow channels array if needed (source may have more channels than init expected)
      while (ch >= data2d.channels.length) {
        data2d.channels.push({ x: new Float32Array(samples.length), y: new Float32Array(samples.length), length: samples.length });
      }
      const channel = data2d.channels[ch];
      channel.label = channelLabels[ch];
      const len = Math.min(samples.length, channel.x.length);
      channel.length = len;
      for (let i = 0; i < len; i++) {
        channel.x[i] = i / sampleRate;
        channel.y[i] = samples[i];
      }
    }
  }

  getVisualizationUI(key: string, ctx: CalculationContext): Type<any> {
    return TimeSignal;
  }
}
