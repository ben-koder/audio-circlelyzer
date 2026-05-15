import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AxisSettingsComponent } from './axis-settings';
import { TraceVisualizationSettings, AxisSettings, AxisSettingsWithLog } from '../../../models/types';

@Component({
  selector: 'app-trace-vis-settings',
  standalone: true,
  imports: [AxisSettingsComponent, FormsModule],
  template: `
    <div class="space-y-4">
      <!-- Axis Settings -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <app-axis-settings 
          title="X Axis (Input)" 
          [settings]="settings().xAxisSettings" 
          (settingsChange)="updateX($event)">
        </app-axis-settings>
        <app-axis-settings 
          title="Y Axis (Trace Index)" 
          [settings]="settings().yAxisSettings"
          (settingsChange)="updateY($event)">
        </app-axis-settings>
        <app-axis-settings 
          title="Z Axis (Value)" 
          [settings]="settings().zAxisSettings" 
          (settingsChange)="updateZ($event)">
        </app-axis-settings>
      </div>
    </div>
  `,
  styles: []
})
export class TraceVisSettingsComponent {
  settings = input.required<TraceVisualizationSettings>();
  settingsChange = output<TraceVisualizationSettings>();

  updateX(val: AxisSettings | AxisSettingsWithLog) {
    const s = { ...this.settings(), xAxisSettings: val as AxisSettingsWithLog };
    this.settingsChange.emit(s);
  }

  updateY(val: AxisSettings | AxisSettingsWithLog) {
    const s = { ...this.settings(), yAxisSettings: val as AxisSettings };
    this.settingsChange.emit(s);
  }

  updateZ(val: AxisSettings | AxisSettingsWithLog) {
    const s = { ...this.settings(), zAxisSettings: val as AxisSettings };
    this.settingsChange.emit(s);
  }
}
