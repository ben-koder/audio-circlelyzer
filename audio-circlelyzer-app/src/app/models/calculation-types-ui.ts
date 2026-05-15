import { Type } from '@angular/core';
import { ChannelSumSettingsComponent } from '../components/settings-dialog/calculation-settings/channel-sum-settings';
import { ExpandSettingsComponent } from '../components/settings-dialog/calculation-settings/expand-settings';
import { CompactSettingsComponent } from '../components/settings-dialog/calculation-settings/compact-settings';
import { InputNSettingsComponent } from '../components/settings-dialog/calculation-settings/inputn-settings';
import { PolyRegressionJointSettingsComponent } from '../components/settings-dialog/calculation-settings/poly-regression-joint-settings';
import { PolyRegressionMatchedSettingsComponent } from '../components/settings-dialog/calculation-settings/poly-regression-matched-settings';
import { ZcHarmonicMatchSettingsComponent } from '../components/settings-dialog/calculation-settings/zc-harmonic-match-settings';

export const CALCULATION_SETTINGS_UI: Record<string, Type<any>> = {
  'CHANNELSUM': ChannelSumSettingsComponent,
  'EXPAND': ExpandSettingsComponent,
  'COMPACT': CompactSettingsComponent,
  'INPUTN': InputNSettingsComponent,
  'POLYREGRESSION_JOINT': PolyRegressionJointSettingsComponent,
  'POLYREGRESSION_MATCHED': PolyRegressionMatchedSettingsComponent,
  'ZC_HARMONIC_MATCH': ZcHarmonicMatchSettingsComponent,
};
