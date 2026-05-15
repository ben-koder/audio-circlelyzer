import type { Type } from '@angular/core';
import { 
  VisualizationType, 
  CalculationContext, 
  VISUALIZATION_TYPE_ID,
  OctaveVisualizationSettings,
  OctaveFilterResult
} from '../types';
import { Data2D, PlotData, Plot2DOptions, PlotType2D } from '../../plotting/types';

/**
 * VIS_OCTBARS - Octave band bar chart visualization
 * Displays RMS values per octave (or third-octave) frequency band
 */
export class OctaveBarsVisualization implements VisualizationType<OctaveVisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_OCTBARS';
  name = 'Octave Bands';
  description = 'Displays RMS values per octave band';
  hasSimpleValue = false;
  hasCanvas = true;

  initSettings(key: string, ctx: CalculationContext): OctaveVisualizationSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) {
      return existing as OctaveVisualizationSettings;
    }
    
    return {
      xAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: false
      },
      yAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true
      }
    };
  }

  /**
   * Prepare data - for octave bars, data is already in correct format
   */
  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    return dataChannels;
  }

  // --- New Plot Engine integration ---

  getPlotMode(): '2d' { return '2d'; }
  getPlotType(): PlotType2D { return 'bars'; }

  getPlotOptions(settings: OctaveVisualizationSettings, ctx: CalculationContext): Plot2DOptions {
    return {
      plotType: 'bars',
      contextType: '2d',
      title: (settings as any)?.title || 'Octave Bands',
      axesMetadata: [
        {
          name: 'Frequency',
          unit: 'Hz',
          range: { min: 0, max: undefined },
          logarithmic: false,
          showGridlines: false,
          minValue: 0,
          maxValue: 1,
          categorical: true,
          categoryLabels: []  // Populated dynamically in worker after updatePlotData
        },
        {
          name: 'Level',
          unit: 'dB',
          range: {
            min: settings?.yAxisSettings?.range?.min,
            max: settings?.yAxisSettings?.range?.max
          },
          logarithmic: false,
          showGridlines: settings?.yAxisSettings?.showGridLines ?? true,
          minValue: -120,
          maxValue: 0
        }
      ]
    };
  }

  initPlotData(settings: OctaveVisualizationSettings, ctx: CalculationContext): Data2D {
    // Octave band count: 10 for full octave, 30 for third-octave
    // Use a reasonable default; actual count comes from the filter result
    const numBands = 30; // max third-octave bands
    const channelCount = ctx.channelCount ?? 1;
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      channels.push({ x: new Float32Array(numBands), y: new Float32Array(numBands), length: 0 });
    }
    return { channels, generation: 0 };
  }

  updatePlotData(sourceData: any, plotData: PlotData, settings: OctaveVisualizationSettings, ctx: CalculationContext): void {
    const data2d = plotData as Data2D;
    if (!sourceData || !Array.isArray(sourceData) || sourceData.length === 0) return;
    const firstResult = sourceData[0] as OctaveFilterResult;
    const channelLabels = (sourceData as { channelLabels?: string[] }).channelLabels ?? [];
    if (!firstResult?.frequencies || !firstResult?.rmsValues) return;
    const numBands = firstResult.frequencies.length;

    for (let ch = 0; ch < sourceData.length; ch++) {
      const result = sourceData[ch] as OctaveFilterResult;
      if (!result?.rmsValues) continue;
      while (ch >= data2d.channels.length) {
        data2d.channels.push({ x: new Float32Array(numBands), y: new Float32Array(numBands), length: numBands });
      }
      const channel = data2d.channels[ch];
      channel.label = channelLabels[ch];
      // Reallocate if band count changed
      if (channel.x.length < numBands) {
        channel.x = new Float32Array(numBands);
        channel.y = new Float32Array(numBands);
      }
      channel.length = numBands;
      for (let i = 0; i < numBands; i++) {
        channel.x[i] = i;
        channel.y[i] = 20 * Math.log10(Math.max(result.rmsValues[i], 1e-10));
      }
    }
  }

}
