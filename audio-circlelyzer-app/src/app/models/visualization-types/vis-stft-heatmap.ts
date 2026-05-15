import type { Type } from '@angular/core';
import { 
  VisualizationType, 
  CalculationContext, 
  VISUALIZATION_TYPE_ID,
  STFTVisualizationSettings
} from '../types';
import { HeatmapData, PlotData, Plot2DOptions, PlotType2D, AxisMetadata } from '../../plotting/types';

/**
 * VIS_STFT_ABSSPEC_HEATMAP - STFT Heatmap visualization
 * Displays STFT as a 2D heatmap with time on x-axis and frequency on y-axis
 */
export class STFTHeatmapVisualization implements VisualizationType<STFTVisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_STFT_ABSSPEC_HEATMAP';
  name = 'STFT Heatmap';
  description = 'Displays STFT as a 2D heatmap';
  hasSimpleValue = false;
  hasCanvas = true;

  initSettings(key: string, ctx: CalculationContext): STFTVisualizationSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) {
      return existing as STFTVisualizationSettings;
    }
    
    return {
      fftSize: 256,
      overlap: true,
      xAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true
      },
      yAxisSettings: {
        range: { min: 20, max: 20000 },
        showGridLines: true,
        logarithmic: false
      },
      zAxisSettings: {
        range: { min: -80, max: 0 },
        showGridLines: false
      },
      title: 'STFT Heatmap'
    };
  }

  /**
   * Prepare data - STFT heatmap needs WASM computation, done in worker
   * This method is called by the worker after STFT computation
   */
  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    return dataChannels;
  }

  // --- New Plot Engine integration ---

  getPlotMode(): '2d' { return '2d'; }
  getPlotType(): PlotType2D { return 'heatmap'; }

  getPlotOptions(settings: STFTVisualizationSettings, ctx: CalculationContext): Plot2DOptions {
    const sampleRate = ctx.settings.sampleRate;
    return {
      plotType: 'heatmap',
      contextType: '2d',
      title: settings?.title || 'STFT Heatmap',
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
          maxValue: 1
        },
        {
          name: 'Frequency',
          unit: 'Hz',
          range: {
            min: settings?.yAxisSettings?.range?.min,
            max: settings?.yAxisSettings?.range?.max
          },
          logarithmic: settings?.yAxisSettings?.logarithmic ?? false,
          showGridlines: settings?.yAxisSettings?.showGridLines ?? true,
          minValue: 0,
          maxValue: sampleRate / 2
        },
        {
          name: 'Magnitude',
          unit: 'dB',
          range: {
            min: settings?.zAxisSettings?.range?.min,
            max: settings?.zAxisSettings?.range?.max
          },
          logarithmic: false,
          showGridlines: false,
          minValue: -80,
          maxValue: 0
        }
      ]
    };
  }

  initPlotData(settings: STFTVisualizationSettings, ctx: CalculationContext): HeatmapData {
    const channelCount = ctx.channelCount ?? 1;
    const fftSize = settings?.fftSize ?? 256;
    const numBins = fftSize / 2;
    const nc = ctx.settings.nc;
    const numFrames = Math.max(1, Math.floor(nc / (fftSize / 2)));
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      channels.push({
        values: new Float32Array(numFrames * numBins),
        width: numBins,
        height: numFrames,
      });
    }
    return { channels, generation: 0 };
  }

  updatePlotData(sourceData: any, plotData: PlotData, settings: STFTVisualizationSettings, ctx: CalculationContext): void {
    const heatmap = plotData as HeatmapData;
    if (!sourceData || !Array.isArray(sourceData)) return;
    const zMin = settings?.zAxisSettings?.range?.min ?? -80;

    for (let ch = 0; ch < sourceData.length; ch++) {
      const stft = sourceData[ch];
      if (!stft?.magnitudesDb || !stft?.numFrames || !stft?.numBins) continue;
      const { magnitudesDb, numFrames, numBins } = stft;

      while (ch >= heatmap.channels.length) {
        heatmap.channels.push({ values: new Float32Array(numFrames * numBins), width: numBins, height: numFrames });
      }
      const channel = heatmap.channels[ch];
      const requiredSize = numFrames * numBins;
      if (channel.values.length < requiredSize) {
        channel.values = new Float32Array(requiredSize);
      }
      channel.width = numBins;
      channel.height = numFrames;

      // Copy magnitudesDb directly — it's already row-major [frame][bin]
      for (let t = 0; t < numFrames; t++) {
        for (let f = 0; f < numBins; f++) {
          const idx = t * numBins + f;
          channel.values[idx] = magnitudesDb[idx] ?? zMin;
        }
      }
    }
  }

}
