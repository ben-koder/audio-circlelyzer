import { Component, input, output } from '@angular/core';
import { AxisSettingsComponent } from './axis-settings';
import { TimeSigVisualizationSettings, AxisSettings } from '../../../models/types';

@Component({
  selector: 'app-time-sig-settings',
  standalone: true,
  imports: [AxisSettingsComponent],
  template: `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <app-axis-settings 
        title="X Axis" 
        [settings]="settings().xAxisSettings" 
        (settingsChange)="updateX($event)">
      </app-axis-settings>
      <app-axis-settings 
        title="Y Axis" 
        [settings]="settings().yAxisSettings" 
        (settingsChange)="updateY($event)">
      </app-axis-settings>
    </div>
  `,
  styles: []
})
export class TimeSigSettingsComponent {
  settings = input.required<TimeSigVisualizationSettings>();
  settingsChange = output<TimeSigVisualizationSettings>();

  updateX(val: any) {
    const s = { ...this.settings(), xAxisSettings: val as AxisSettings };
    this.settingsChange.emit(s);
  }

  updateY(val: any) {
    const s = { ...this.settings(), yAxisSettings: val as AxisSettings };
    this.settingsChange.emit(s);
  }
}
