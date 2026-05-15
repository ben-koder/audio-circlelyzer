import type { Type } from '@angular/core';
import { 
  VisualizationType, 
  CalculationContext, 
  VISUALIZATION_TYPE_ID,
  STFTVisualizationSettings,
} from '../types';
import { Data3D, PlotData, Plot3DOptions, PlotType3D } from '../../plotting/types';

/**
 * VIS_STFT_ABSSPEC - STFT 3D Waterfall visualization with WebGPU
 * Displays STFT as a 3D waterfall plot using WebGPU for rendering
 * Falls back to Canvas 2D for browsers without WebGPU support
 */
export class STFTWaterfallWebGPUVisualization implements VisualizationType<STFTVisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_STFT_ABSSPEC';
  name = 'STFT Waterfall (WebGPU)';
  description = 'Displays STFT as a 3D waterfall plot using WebGPU';
  hasSimpleValue = false;
  hasCanvas = true;
  useWebGPU = true;

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
        showGridLines: true
      },
      title: 'STFT Waterfall'
    };
  }

  /**
   * Prepare data - STFT computation is done in worker
   */
  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    return dataChannels;
  }

  // --- New Plot Engine integration ---

  getPlotMode(): '3d' { return '3d'; }
  getPlotType(): PlotType3D { return 'linestrips'; }

  getPlotOptions(settings: STFTVisualizationSettings, ctx: CalculationContext): Plot3DOptions {
    const sampleRate = ctx.settings.sampleRate;
    return {
      plotType: 'linestrips',
      contextType: 'webgpu',
      title: settings?.title || 'STFT Waterfall',
      antialias: true,
      msaaSamples: 4,
      axesMetadata: [
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
          showGridlines: settings?.zAxisSettings?.showGridLines ?? true,
          minValue: -80,
          maxValue: 0
        },
        {
          name: 'Time',
          unit: 's',
          range: { min: settings?.xAxisSettings?.range?.min, max: settings?.xAxisSettings?.range?.max },
          logarithmic: false,
          showGridlines: settings?.xAxisSettings?.showGridLines ?? true,
          minValue: 0,
          maxValue: 1
        }
      ]
    };
  }

  initPlotData(settings: STFTVisualizationSettings, ctx: CalculationContext): Data3D {
    const channelCount = ctx.channelCount ?? 1;
    const fftSize = settings?.fftSize ?? 256;
    const numBins = fftSize / 2;
    const nc = ctx.settings.nc;
    const numFrames = Math.max(1, Math.floor(nc / (fftSize / 2)));
    const freqStep = Math.max(1, Math.floor(numBins / 128));
    const frameStep = Math.max(1, Math.floor(numFrames / 64));
    const pointsPerRow = Math.ceil(numBins / freqStep);
    const rowCount = Math.ceil(numFrames / frameStep);
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      channels.push({ vertices: new Float32Array(rowCount * pointsPerRow * 3), rowCount, pointsPerRow });
    }
    return { channels, generation: 0 };
  }

  updatePlotData(sourceData: any, plotData: PlotData, settings: STFTVisualizationSettings, ctx: CalculationContext): void {
    const data3d = plotData as Data3D;
    if (!sourceData || !Array.isArray(sourceData)) return;
    const zMin = settings?.zAxisSettings?.range?.min ?? -80;
    const zMax = settings?.zAxisSettings?.range?.max ?? 0;
    for (let ch = 0; ch < sourceData.length; ch++) {
      const stft = sourceData[ch];
      if (!stft?.magnitudesDb || !stft?.numFrames || !stft?.numBins) continue;
      const { magnitudesDb, numFrames, numBins, frequencyAxis, timeAxis } = stft;
      const freqStep = Math.max(1, Math.floor(numBins / 128));
      const frameStep = Math.max(1, Math.floor(numFrames / 64));
      const pointsPerRow = Math.ceil(numBins / freqStep);
      const rowCount = Math.ceil(numFrames / frameStep);
      while (ch >= data3d.channels.length) {
        data3d.channels.push({ vertices: new Float32Array(rowCount * pointsPerRow * 3), rowCount, pointsPerRow });
      }
      const channel = data3d.channels[ch];
      const requiredSize = rowCount * pointsPerRow * 3;
      if (channel.vertices.length < requiredSize) {
        channel.vertices = new Float32Array(requiredSize);
      }
      channel.rowCount = rowCount;
      channel.pointsPerRow = pointsPerRow;
      let writeIdx = 0;
      for (let frameIdx = 0; frameIdx < numFrames; frameIdx += frameStep) {
        for (let freqIdx = 0; freqIdx < numBins; freqIdx += freqStep) {
          const idx = frameIdx * numBins + freqIdx;
          const db = magnitudesDb[idx] ?? zMin;
          const freq = frequencyAxis ? frequencyAxis[freqIdx] : freqIdx / numBins;
          const time = timeAxis ? timeAxis[frameIdx] : frameIdx / numFrames;
          channel.vertices[writeIdx++] = freq;
          channel.vertices[writeIdx++] = Math.max(zMin, Math.min(zMax, db));
          channel.vertices[writeIdx++] = time;
        }
      }
    }
  }

}
