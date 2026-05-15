import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AxisSettings, AxisSettingsWithLog } from '../../../models/types';

@Component({
  selector: 'app-axis-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="border border-base-300 rounded-lg p-3 bg-base-50">
      <h4 class="font-bold text-sm mb-2">{{ title() }}</h4>
      <div class="grid grid-cols-2 gap-2">
        <div class="form-control">
          <label class="label py-1">
            <span class="label-text text-xs">Min</span>
          </label>
          <input type="number" class="input input-bordered input-sm w-full" 
            [ngModel]="settings().range.min" (ngModelChange)="updateMin($event)" placeholder="Auto">
        </div>
        <div class="form-control">
          <label class="label py-1">
            <span class="label-text text-xs">Max</span>
          </label>
          <input type="number" class="input input-bordered input-sm w-full" 
            [ngModel]="settings().range.max" (ngModelChange)="updateMax($event)" placeholder="Auto">
        </div>
      </div>
      
      <div class="flex gap-4 mt-2">
        <div class="form-control">
          <label class="label cursor-pointer gap-2 py-1">
            <span class="label-text text-xs">Show Grid</span>
            <input type="checkbox" class="checkbox checkbox-xs checkbox-primary" 
              [ngModel]="settings().showGridLines" (ngModelChange)="updateGrid($event)">
          </label>
        </div>
        @if (isLog()) {
          <div class="form-control">
            <label class="label cursor-pointer gap-2 py-1">
              <span class="label-text text-xs">Logarithmic</span>
              <input type="checkbox" class="checkbox checkbox-xs checkbox-primary" 
                [ngModel]="asLog(settings()).logarithmic" (ngModelChange)="updateLog($event)">
            </label>
          </div>
        }
      </div>
    </div>
  `,
  styles: []
})
export class AxisSettingsComponent {
  title = input.required<string>();
  settings = input.required<AxisSettings | AxisSettingsWithLog>();
  settingsChange = output<AxisSettings | AxisSettingsWithLog>();

  isLog(): boolean {
    return 'logarithmic' in this.settings();
  }

  asLog(s: AxisSettings): AxisSettingsWithLog {
    return s as AxisSettingsWithLog;
  }

  updateMin(val: number | null) {
    const s = { ...this.settings() };
    s.range = { ...(s.range || {}), min: val === null ? undefined : val };
    this.settingsChange.emit(s);
  }

  updateMax(val: number | null) {
    const s = { ...this.settings() };
    s.range = { ...(s.range || {}), max: val === null ? undefined : val };
    this.settingsChange.emit(s);
  }

  updateGrid(val: boolean) {
    const s = { ...this.settings(), showGridLines: val };
    this.settingsChange.emit(s);
  }

  updateLog(val: boolean) {
    if (this.isLog()) {
      const s = { ...this.settings() } as AxisSettingsWithLog;
      s.logarithmic = val;
      this.settingsChange.emit(s);
    }
  }
}
