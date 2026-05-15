import type { Type } from '@angular/core';
import { 
  VisualizationType, 
  CalculationContext, 
  VISUALIZATION_TYPE_ID,
  RT60VisualizationSettings,
  RT60FullResult,
  RT60Result,
  DecayMeasurement,
  RT60Metric
} from '../types';
import { Data2D, PlotData, Plot2DOptions, PlotType2D } from '../../plotting/types';

const METRIC_ORDER: RT60Metric[] = ['edt', 't20', 't30', 'topt'];
// Each audio channel reserves: 1 decay curve + one slot per supported metric.
const SLOTS_PER_CHANNEL = 1 + METRIC_ORDER.length;

/**
 * VIS_RT60 - RT60 reverberation time visualization
 * Displays RT60 decay curve with regression lines for all channels overlaid
 */
export class RT60Visualization implements VisualizationType<RT60VisualizationSettings> {
  id: VISUALIZATION_TYPE_ID = 'VIS_RT60';
  name = 'RT60 Reverberation Time';
  description = 'Displays RT60 value and decay curve for all channels';
  hasSimpleValue = true; // Sends RT60 data for table display
  hasCanvas = true; // Has canvas for decay curve rendering

  initSettings(key: string, ctx: CalculationContext): RT60VisualizationSettings {
    const existing = ctx.visualizationSettings.get(key);
    if (existing) {
      return existing as RT60VisualizationSettings;
    }
    
    return {
      xAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true
      },
      yAxisSettings: {
        range: { min: undefined, max: undefined },
        showGridLines: true
      },
      showMetrics: ['t30'],
      showRegressionLines: true,
      showDataTable: true
    };
  }

  /**
   * Prepare data - for RT60, data is already in correct format
   */
  prepareData(dataChannels: any, ctx: CalculationContext, settings: any): any {
    return dataChannels;
  }

  // --- New Plot Engine integration ---

  getPlotMode(): '2d' { return '2d'; }
  getPlotType(): PlotType2D { return 'line'; }

  getPlotOptions(settings: RT60VisualizationSettings, ctx: CalculationContext): Plot2DOptions {
    return {
      plotType: 'line',
      contextType: '2d',
      title: (settings as any)?.title || 'RT60 Decay Curve',
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
          name: 'Level',
          unit: 'dB',
          range: {
            min: settings?.yAxisSettings?.range?.min,
            max: settings?.yAxisSettings?.range?.max
          },
          logarithmic: false,
          showGridlines: settings?.yAxisSettings?.showGridLines ?? true,
          minValue: -80,
          maxValue: 0
        }
      ]
    };
  }

  initPlotData(settings: RT60VisualizationSettings, ctx: CalculationContext): Data2D {
    const nc = ctx.settings.nc;
    const channelCount = ctx.channelCount ?? 1;
    // Reserve a decay curve channel + one regression channel per supported metric.
    const channels = [];
    for (let ch = 0; ch < channelCount; ch++) {
      for (let slot = 0; slot < SLOTS_PER_CHANNEL; slot++) {
        channels.push({ x: new Float32Array(nc), y: new Float32Array(nc), length: 0 });
      }
    }
    return { channels, generation: 0 };
  }

  updatePlotData(sourceData: any, plotData: PlotData, settings: RT60VisualizationSettings, ctx: CalculationContext): void {
    const data2d = plotData as Data2D;
    if (!sourceData || !Array.isArray(sourceData)) return;
    const showRegression = settings?.showRegressionLines ?? true;
    const selectedMetrics = new Set<RT60Metric>(
      Array.isArray(settings?.showMetrics) && settings!.showMetrics!.length > 0
        ? settings!.showMetrics!
        : ['t30'],
    );

    for (let ch = 0; ch < sourceData.length; ch++) {
      const rt60Data = sourceData[ch] as RT60FullResult | RT60Result;
      const baseIdx = ch * SLOTS_PER_CHANNEL;
      const decayIdx = baseIdx;

      // Ensure all slots for this channel exist
      while (data2d.channels.length <= baseIdx + SLOTS_PER_CHANNEL - 1) {
        const nc = ctx.settings.nc;
        data2d.channels.push({ x: new Float32Array(nc), y: new Float32Array(nc), length: 0 });
      }

      if (!rt60Data?.decayCurve || !rt60Data?.timeAxis) {
        for (let slot = 0; slot < SLOTS_PER_CHANNEL; slot++) {
          data2d.channels[baseIdx + slot].length = 0;
        }
        continue;
      }

      // Decay curve
      const decayCh = data2d.channels[decayIdx];
      const decayLen = Math.min(rt60Data.timeAxis.length, decayCh.x.length);
      decayCh.length = decayLen;
      for (let i = 0; i < decayLen; i++) {
        decayCh.x[i] = rt60Data.timeAxis[i];
        decayCh.y[i] = rt60Data.decayCurve[i];
      }

      // Regression lines (one per metric slot)
      if ('edt' in rt60Data) {
        const fullData = rt60Data as RT60FullResult;
        for (let m = 0; m < METRIC_ORDER.length; m++) {
          const metric = METRIC_ORDER[m];
          const regCh = data2d.channels[baseIdx + 1 + m];

          if (!showRegression || !selectedMetrics.has(metric)) {
            regCh.length = 0;
            continue;
          }

          let measurement: DecayMeasurement | undefined;
          if (metric === 'edt') measurement = fullData.edt;
          else if (metric === 't20') measurement = fullData.t20;
          else if (metric === 't30') measurement = fullData.t30;
          else if (metric === 'topt') measurement = fullData.topt;

          if (measurement && measurement.value > 0) {
            const maxTime = rt60Data.timeAxis[rt60Data.timeAxis.length - 1];
            const startTime = measurement.startIdx / (rt60Data.timeAxis.length / maxTime);
            const endTime = measurement.endIdx / (rt60Data.timeAxis.length / maxTime);
            let writeIdx = 0;
            for (let t = startTime; t <= endTime && writeIdx < regCh.x.length; t += 0.01) {
              regCh.x[writeIdx] = t;
              regCh.y[writeIdx] = measurement.slope * t + measurement.intercept;
              writeIdx++;
            }
            regCh.length = writeIdx;
          } else {
            regCh.length = 0;
          }
        }
      } else {
        // Legacy result: only one regression line; place it in the first metric slot.
        const legacy = rt60Data as RT60Result;
        const firstRegIdx = baseIdx + 1;
        for (let m = 1; m < METRIC_ORDER.length; m++) {
          data2d.channels[baseIdx + 1 + m].length = 0;
        }
        const regCh = data2d.channels[firstRegIdx];
        if (!showRegression) {
          regCh.length = 0;
        } else if (legacy.coefficients && legacy.coefficients.length >= 2) {
          const [slope, intercept] = [legacy.coefficients[0], legacy.coefficients[1]];
          const len = Math.min(rt60Data.timeAxis.length, regCh.x.length);
          for (let i = 0; i < len; i++) {
            const t = rt60Data.timeAxis[i];
            regCh.x[i] = t;
            regCh.y[i] = slope * t + intercept;
          }
          regCh.length = len;
        } else {
          regCh.length = 0;
        }
      }
    }
  }

}
