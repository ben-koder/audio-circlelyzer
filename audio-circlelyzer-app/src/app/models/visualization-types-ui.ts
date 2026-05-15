import type { Type } from '@angular/core';
import { SpectrumSettingsComponent } from '../components/settings-dialog/visualization-settings/spectrum-settings';
import { TimeSigSettingsComponent } from '../components/settings-dialog/visualization-settings/time-sig-settings';
import { OctaveSettingsComponent } from '../components/settings-dialog/visualization-settings/octave-settings';
import { RT60SettingsComponent } from '../components/settings-dialog/visualization-settings/rt60-settings';
import { StftSettingsComponent } from '../components/settings-dialog/visualization-settings/stft-settings';
import { TraceVisSettingsComponent } from '../components/settings-dialog/visualization-settings/trace-vis-settings';
import { PolyfitVisSettingsComponent } from '../components/settings-dialog/visualization-settings/polyfit-vis-settings';

import { FrequencySpectrum } from '../components/visualizations/frequency-spectrum/frequency-spectrum';
import { OctaveBars } from '../components/visualizations/octave-bars/octave-bars';
import { PhaseSpectrum } from '../components/visualizations/phase-spectrum/phase-spectrum';
import { Rt60Decay } from '../components/visualizations/rt60-decay/rt60-decay';
import { StftHeatmap } from '../components/visualizations/stft-heatmap/stft-heatmap';
import { StftWaterfall } from '../components/visualizations/stft-waterfall/stft-waterfall';
import { TimeSignal } from '../components/visualizations/time-signal/time-signal';
import { TraceWaterfall } from '../components/visualizations/trace-waterfall/trace-waterfall';

export const VISUALIZATION_SETTINGS_UI: Record<string, Type<any>> = {
  'VIS_ABSSPEC': SpectrumSettingsComponent,
  'VIS_PHASE': SpectrumSettingsComponent,
  'VIS_GROUP_DELAY': SpectrumSettingsComponent,
  'VIS_PHASE_DELAY': SpectrumSettingsComponent,
  'VIS_TIMESIG': TimeSigSettingsComponent,
  'VIS_OCTBARS': OctaveSettingsComponent,
  'VIS_RT60': RT60SettingsComponent,
  'VIS_STFT_ABSSPEC': StftSettingsComponent,
  'VIS_STFT_ABSSPEC_HEATMAP': StftSettingsComponent,
  'VIS_TRACE': TraceVisSettingsComponent,
  'VIS_POLYFIT': PolyfitVisSettingsComponent,
  // Coefficient bar chart shares the SpectrumVisualizationSettings shape.
  'VIS_POLYFIT_COEFFS': SpectrumSettingsComponent,
};

/**
 * Display component lookup for visualization types.
 *
 * Kept on the main-thread side so the visualization-type model files
 * (consumed by the calculation web worker) stay free of Angular component
 * value imports. CalculationManagerService attaches `getVisualizationUI` at
 * runtime from this map.
 */
export const VISUALIZATION_DISPLAY_UI: Record<string, Type<any>> = {
  'VIS_ABSSPEC': FrequencySpectrum,
  'VIS_PHASE': PhaseSpectrum,
  'VIS_GROUP_DELAY': PhaseSpectrum,
  'VIS_PHASE_DELAY': PhaseSpectrum,
  'VIS_TIMESIG': TimeSignal,
  'VIS_OCTBARS': OctaveBars,
  'VIS_RT60': Rt60Decay,
  'VIS_STFT_ABSSPEC': StftWaterfall,
  'VIS_STFT_ABSSPEC_2D_CONTEXT': StftWaterfall,
  'VIS_STFT_ABSSPEC_HEATMAP': StftHeatmap,
  'VIS_TRACE': TraceWaterfall,
  'VIS_TRACE_2D_CONTEXT': TraceWaterfall,
  'VIS_POLYFIT': FrequencySpectrum,
  'VIS_POLYFIT_COEFFS': OctaveBars,
};
