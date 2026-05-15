import { Type } from '@angular/core';
import { 
  VisualizationType, 
  CalculationContext, 
  VISUALIZATION_TYPE_ID,
  SpectrumVisualizationSettings
} from '../types';
import { Data2D, PlotData, Plot2DOptions, PlotType2D } from '../../plotting/types';
import { PhaseSpectrum } from '../../components/visualizations/phase-spectrum/phase-spectrum';

/**
 * VIS_PHASE - Phase spectrum visualization
 * Displays phase (radians or degrees) vs frequency (Hz)
 */
export class PhaseVisualization implements VisualizationType<SpectrumVisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_PHASE';
  name = 'Phase Spectrum';
  description = 'Displays phase vs frequency';
  hasSimpleValue = false;
  hasCanvas = true;

  initSettings(key: string, ctx: CalculationContext): SpectrumVisualizationSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) {
      return existing as SpectrumVisualizationSettings;
    }
    
    return {
      xAxisSettings: {
        range: { min: 20, max: 20000 },
        showGridLines: true,
        logarithmic: true
      },
      yAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true
      }
    };
  }

  /**
   * Prepare data from calculation result to visualization format
   */
  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    if (!dataChannels || !Array.isArray(dataChannels)) {
      return null;
    }
    
    const sampleRate = ctx.settings.sampleRate;
    const nc = ctx.settings.nc;
    const firstChannel = dataChannels[0] as Float32Array;
    const half = Math.max(1, Math.floor(firstChannel.length / 2));
    
    const frequencies = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      frequencies[i] = (i * sampleRate) / nc;
    }
    
    const phasePerChannel = dataChannels.map((ch: Float32Array) => ch.slice(0, half));
    return {
      frequencies,
      phasePerChannel,
      channelLabels: (dataChannels as { channelLabels?: string[] }).channelLabels,
    };
  }

  // --- New Plot Engine integration ---

  getPlotMode(): '2d' { return '2d'; }
  getPlotType(): PlotType2D { return 'line'; }

  getPlotOptions(settings: SpectrumVisualizationSettings, ctx: CalculationContext): Plot2DOptions {
    return {
      plotType: 'line',
      contextType: '2d',
      title: (settings as any)?.title || 'Phase Spectrum',
      axesMetadata: [
        {
          name: 'Frequency',
          unit: 'Hz',
          range: {
            min: settings?.xAxisSettings?.range?.min,
            max: settings?.xAxisSettings?.range?.max
          },
          logarithmic: settings?.xAxisSettings?.logarithmic ?? true,
          showGridlines: settings?.xAxisSettings?.showGridLines ?? true,
          minValue: 0,
          maxValue: ctx.settings.sampleRate / 2
        },
        {
          name: 'Phase',
          unit: 'rad',
          range: {
            min: settings?.yAxisSettings?.range?.min,
            max: settings?.yAxisSettings?.range?.max
          },
          logarithmic: false,
          showGridlines: settings?.yAxisSettings?.showGridLines ?? true,
          minValue: -Math.PI,
          maxValue: Math.PI
        }
      ]
    };
  }

  initPlotData(settings: SpectrumVisualizationSettings, ctx: CalculationContext): Data2D {
    const nc = ctx.settings.nc;
    const half = Math.max(1, Math.floor(nc / 2));
    const channelCount = ctx.channelCount ?? 1;
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      channels.push({ x: new Float32Array(half), y: new Float32Array(half), length: half });
    }
    return { channels, generation: 0 };
  }

  updatePlotData(sourceData: any, plotData: PlotData, settings: SpectrumVisualizationSettings, ctx: CalculationContext): void {
    const data2d = plotData as Data2D;
    if (!sourceData?.frequencies || !sourceData?.phasePerChannel) return;
    const { frequencies, phasePerChannel } = sourceData;
    const channelLabels = sourceData.channelLabels ?? [];
    for (let ch = 0; ch < phasePerChannel.length; ch++) {
      const phase: Float32Array = phasePerChannel[ch];
      while (ch >= data2d.channels.length) {
        data2d.channels.push({ x: new Float32Array(phase.length), y: new Float32Array(phase.length), length: phase.length });
      }
      const channel = data2d.channels[ch];
      channel.label = channelLabels[ch];
      const len = Math.min(phase.length, channel.x.length);
      channel.length = len;
      for (let i = 0; i < len; i++) {
        channel.x[i] = frequencies[i];
        channel.y[i] = phase[i];
      }
    }
  }

  getVisualizationUI(key: string, ctx: CalculationContext): Type<any> {
    return PhaseSpectrum;
  }
}
