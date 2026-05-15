import { Type } from '@angular/core';
import { SpectrumSettingsComponent } from '../components/settings-dialog/visualization-settings/spectrum-settings';
import { TimeSigSettingsComponent } from '../components/settings-dialog/visualization-settings/time-sig-settings';
import { OctaveSettingsComponent } from '../components/settings-dialog/visualization-settings/octave-settings';
import { RT60SettingsComponent } from '../components/settings-dialog/visualization-settings/rt60-settings';
import { StftSettingsComponent } from '../components/settings-dialog/visualization-settings/stft-settings';
import { TraceVisSettingsComponent } from '../components/settings-dialog/visualization-settings/trace-vis-settings';
import { PolyfitVisSettingsComponent } from '../components/settings-dialog/visualization-settings/polyfit-vis-settings';

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
