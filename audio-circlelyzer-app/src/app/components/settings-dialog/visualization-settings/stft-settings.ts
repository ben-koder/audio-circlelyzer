import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AxisSettingsComponent } from './axis-settings';
import { STFTVisualizationSettings, AxisSettings, AxisSettingsWithLog } from '../../../models/types';

@Component({
  selector: 'app-stft-settings',
  standalone: true,
  imports: [AxisSettingsComponent, FormsModule],
  template: `
    <div class="space-y-4">
      <!-- STFT Parameters -->
      <div class="card bg-base-200 p-4">
        <h3 class="font-semibold mb-3">STFT Parameters</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-control">
            <label class="label">
              <span class="label-text">FFT Size</span>
            </label>
            <select 
              class="select select-bordered select-sm" 
              [ngModel]="settings().fftSize"
              (ngModelChange)="updateFftSize($event)">
              <option [value]="64">64</option>
              <option [value]="128">128</option>
              <option [value]="256">256</option>
              <option [value]="512">512</option>
              <option [value]="1024">1024</option>
              <option [value]="2048">2048</option>
              <option [value]="4096">4096</option>
            </select>
          </div>
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">50% Overlap</span>
              <input 
                type="checkbox" 
                class="checkbox checkbox-sm" 
                [ngModel]="settings().overlap"
                (ngModelChange)="updateOverlap($event)" />
            </label>
          </div>
        </div>
      </div>

      <!-- Axis Settings -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <app-axis-settings 
          title="X Axis (Time)" 
          [settings]="settings().xAxisSettings" 
          (settingsChange)="updateX($event)">
        </app-axis-settings>
        <app-axis-settings 
          title="Y Axis (Frequency)" 
          [settings]="settings().yAxisSettings"
          (settingsChange)="updateY($event)">
        </app-axis-settings>
        <app-axis-settings 
          title="Z Axis (Magnitude dB)" 
          [settings]="settings().zAxisSettings" 
          (settingsChange)="updateZ($event)">
        </app-axis-settings>
      </div>
    </div>
  `,
  styles: []
})
export class StftSettingsComponent {
  settings = input.required<STFTVisualizationSettings>();
  settingsChange = output<STFTVisualizationSettings>();

  updateFftSize(val: number) {
    const s = { ...this.settings(), fftSize: Number(val) };
    this.settingsChange.emit(s);
  }

  updateOverlap(val: boolean) {
    const s = { ...this.settings(), overlap: val };
    this.settingsChange.emit(s);
  }

  updateX(val: AxisSettings | AxisSettingsWithLog) {
    const s = { ...this.settings(), xAxisSettings: val as AxisSettings };
    this.settingsChange.emit(s);
  }

  updateY(val: AxisSettings | AxisSettingsWithLog) {
    const s = { ...this.settings(), yAxisSettings: val as AxisSettingsWithLog };
    this.settingsChange.emit(s);
  }

  updateZ(val: AxisSettings | AxisSettingsWithLog) {
    const s = { ...this.settings(), zAxisSettings: val as AxisSettings };
    this.settingsChange.emit(s);
  }
}
