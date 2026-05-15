import type { Type } from '@angular/core';
import { ChannelSumSettingsComponent } from '../components/settings-dialog/calculation-settings/channel-sum-settings';
import { ExpandSettingsComponent } from '../components/settings-dialog/calculation-settings/expand-settings';
import { CompactSettingsComponent } from '../components/settings-dialog/calculation-settings/compact-settings';
import { InputNSettingsComponent } from '../components/settings-dialog/calculation-settings/inputn-settings';
import { OctaveFilterSettingsComponent } from '../components/settings-dialog/calculation-settings/octave-filter-settings';
import { PolyRegressionJointSettingsComponent } from '../components/settings-dialog/calculation-settings/poly-regression-joint-settings';
import { PolyRegressionMatchedSettingsComponent } from '../components/settings-dialog/calculation-settings/poly-regression-matched-settings';
import { TraceSettingsComponent } from '../components/settings-dialog/calculation-settings/trace-settings';
import { ZcHarmonicMatchSettingsComponent } from '../components/settings-dialog/calculation-settings/zc-harmonic-match-settings';

export const CALCULATION_SETTINGS_UI: Record<string, Type<any>> = {
  'CHANNELSUM': ChannelSumSettingsComponent,
  'EXPAND': ExpandSettingsComponent,
  'COMPACT': CompactSettingsComponent,
  'INPUTN': InputNSettingsComponent,
  'OCTFILTERRMS': OctaveFilterSettingsComponent,
  'POLYREGRESSION_JOINT': PolyRegressionJointSettingsComponent,
  'POLYREGRESSION_MATCHED': PolyRegressionMatchedSettingsComponent,
  'TRACE': TraceSettingsComponent,
  'ZC_HARMONIC_MATCH': ZcHarmonicMatchSettingsComponent,
};
