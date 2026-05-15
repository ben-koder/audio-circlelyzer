import { Type } from '@angular/core';
import { 
  VisualizationType, 
  CalculationContext, 
  VISUALIZATION_TYPE_ID,
  TraceVisualizationSettings,
} from '../types';
import { Data3D, PlotData, Plot3DOptions, PlotType3D } from '../../plotting/types';
import { TraceWaterfall } from '../../components/visualizations/trace-waterfall/trace-waterfall';

// Import TraceResult type
interface TraceResult {
  traces: Float32Array[];
  currentTraceIndex: number;
  nTrace: number;
  inputLength: number;
}

// Import TraceResult type
interface TraceResult {
  traces: Float32Array[];
  currentTraceIndex: number;
  nTrace: number;
  inputLength: number;
}

/**
 * VIS_TRACE_2D_CONTEXT - Trace 3D Waterfall visualization (Canvas 2D)
 * Displays trace history as a 3D waterfall plot using Canvas 2D context
 * This is the legacy implementation before WebGPU
 */
export class TraceVisualization implements VisualizationType<TraceVisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_TRACE_2D_CONTEXT';
  name = 'Trace Waterfall (2D)';
  description = 'Displays trace history as a 3D waterfall plot (Canvas 2D)';
  hasSimpleValue = false;
  hasCanvas = true;

  initSettings(key: string, ctx: CalculationContext): TraceVisualizationSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) {
      return existing as TraceVisualizationSettings;
    }
    
    return {
      xAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true,
        logarithmic: true
      },
      yAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true
      },
      zAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true
      },
      title: 'Trace Waterfall',
      resample: false,
      fill: false
    };
  }

  /**
   * Prepare data - data is already in TraceResult format
   */
  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    return dataChannels;
  }

  // --- New Plot Engine integration ---

  getPlotMode(): '3d' { return '3d'; }
  getPlotType(): PlotType3D { return 'linestrips'; }

  getPlotOptions(settings: TraceVisualizationSettings, ctx: CalculationContext): Plot3DOptions {
    return {
      plotType: 'linestrips',
      contextType: '2d',  // Canvas 2D fallback for legacy type
      title: settings?.title || 'Trace Waterfall',
      axesMetadata: [
        {
          name: 'Input X', unit: '',
          range: { min: settings?.xAxisSettings?.range?.min, max: settings?.xAxisSettings?.range?.max },
          logarithmic: settings?.xAxisSettings?.logarithmic ?? false,
          showGridlines: true, minValue: 0, maxValue: 1
        },
        {
          name: 'Value', unit: '',
          range: { min: settings?.zAxisSettings?.range?.min, max: settings?.zAxisSettings?.range?.max },
          logarithmic: false, showGridlines: true, minValue: -1, maxValue: 1
        },
        {
          name: 'Trace', unit: '',
          range: { min: 0, max: 1 }, logarithmic: false, showGridlines: true, minValue: 0, maxValue: 1
        }
      ]
    };
  }

  initPlotData(settings: TraceVisualizationSettings, ctx: CalculationContext): Data3D {
    const channelCount = ctx.channelCount ?? 1;
    const nc = ctx.settings.nc;
    const resample = settings?.resample ?? false;
    // Estimate row/col counts from settings
    const nTrace = 64; // default trace count
    const inputLength = nc;
    const pointsPerRow = resample ? Math.min(128, inputLength) : inputLength;
    const rowCount = resample ? Math.min(64, nTrace) : nTrace;
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      channels.push({
        vertices: new Float32Array(rowCount * pointsPerRow * 3),
        rowCount,
        pointsPerRow,
      });
    }
    return { channels, generation: 0 };
  }

  updatePlotData(sourceData: any, plotData: PlotData, settings: TraceVisualizationSettings, ctx: CalculationContext): void {
    const data3d = plotData as Data3D;
    if (!sourceData || !Array.isArray(sourceData)) return;
    const resample = settings?.resample ?? false;

    for (let ch = 0; ch < sourceData.length; ch++) {
      const traceResult = sourceData[ch] as TraceResult;
      if (!traceResult?.traces || !traceResult?.nTrace) continue;
      const { traces, currentTraceIndex, nTrace, inputLength } = traceResult;
      const xStep = resample ? Math.max(1, Math.floor(inputLength / 128)) : 1;
      const traceStep = resample ? Math.max(1, Math.floor(nTrace / 64)) : 1;
      const pointsPerRow = Math.ceil(inputLength / xStep);
      const rowCount = Math.ceil(nTrace / traceStep);

      // Ensure channel exists with correct dimensions
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
      for (let tidxRaw = 0; tidxRaw < nTrace; tidxRaw += traceStep) {
        const actualIdx = (currentTraceIndex + tidxRaw) % nTrace;
        const trace: Float32Array = traces[actualIdx];
        if (!trace) {
          // Write zeros for missing trace
          for (let xi = 0; xi < inputLength; xi += xStep) {
            channel.vertices[writeIdx++] = xi / inputLength;
            channel.vertices[writeIdx++] = 0;
            channel.vertices[writeIdx++] = tidxRaw / nTrace;
          }
          continue;
        }
        for (let xi = 0; xi < inputLength; xi += xStep) {
          channel.vertices[writeIdx++] = xi / inputLength;
          channel.vertices[writeIdx++] = trace[xi] !== undefined ? trace[xi] : 0;
          channel.vertices[writeIdx++] = tidxRaw / nTrace;
        }
      }
    }
  }

  getVisualizationUI(key: string, ctx: CalculationContext): Type<any> {
    return TraceWaterfall;
  }
}
