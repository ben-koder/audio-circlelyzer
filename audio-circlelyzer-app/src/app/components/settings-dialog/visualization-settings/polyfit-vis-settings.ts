import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AxisSettingsComponent } from './axis-settings';
import { SpectrumVisualizationSettings, AxisSettings, AxisSettingsWithLog } from '../../../models/types';

/**
 * Settings UI for `VIS_POLYFIT(...)` curves. Exposes the axis editors plus
 * the polyfit-specific tunables `derivative`, `xRangeFullScale`, `nPoints`,
 * `title` and the per-axis labels.
 */
interface PolyfitCurveSettings extends SpectrumVisualizationSettings {
  derivative?: number;
  xRangeFullScale?: number;
  nPoints?: number;
  title?: string;
  description?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}

@Component({
  selector: 'app-polyfit-vis-settings',
  standalone: true,
  imports: [FormsModule, AxisSettingsComponent],
  template: `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">Derivative Axis</span>
        </label>
        <input type="number" class="input input-bordered w-full"
          [ngModel]="settings().derivative ?? 0"
          (ngModelChange)="updateField('derivative', $event, 0, 0, 6)"
          min="0" max="6" step="1" />
        <label class="label">
          <span class="label-text-alt">0=y, 1=ẏ, 2=ÿ, …</span>
        </label>
      </div>
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">X Range (× Full Scale)</span>
        </label>
        <input type="number" class="input input-bordered w-full"
          [ngModel]="settings().xRangeFullScale ?? 1.5"
          (ngModelChange)="updateField('xRangeFullScale', $event, 1.5, 0.1, 10)"
          min="0.1" max="10" step="0.1" />
      </div>
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">Evaluation Points</span>
        </label>
        <input type="number" class="input input-bordered w-full"
          [ngModel]="settings().nPoints ?? 256"
          (ngModelChange)="updateField('nPoints', $event, 256, 8, 4096)"
          min="8" max="4096" step="1" />
      </div>
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">Title</span>
        </label>
        <input type="text" class="input input-bordered w-full"
          [ngModel]="settings().title ?? ''"
          (ngModelChange)="updateText('title', $event)" />
      </div>
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">X Axis Label</span>
        </label>
        <input type="text" class="input input-bordered w-full"
          [ngModel]="settings().xAxisLabel ?? ''"
          (ngModelChange)="updateText('xAxisLabel', $event)" />
      </div>
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">Y Axis Label</span>
        </label>
        <input type="text" class="input input-bordered w-full"
          [ngModel]="settings().yAxisLabel ?? ''"
          (ngModelChange)="updateText('yAxisLabel', $event)" />
      </div>
      <app-axis-settings title="X Axis"
        [settings]="settings().xAxisSettings"
        (settingsChange)="updateX($event)">
      </app-axis-settings>
      <app-axis-settings title="Y Axis"
        [settings]="settings().yAxisSettings"
        (settingsChange)="updateY($event)">
      </app-axis-settings>
    </div>
  `,
  styles: []
})
export class PolyfitVisSettingsComponent {
  settings = input.required<PolyfitCurveSettings>();
  settingsChange = output<PolyfitCurveSettings>();

  updateField(key: 'derivative' | 'xRangeFullScale' | 'nPoints', value: number, fallback: number, min: number, max: number): void {
    let v = Number(value);
    if (!Number.isFinite(v)) v = fallback;
    v = Math.max(min, Math.min(max, v));
    if (key !== 'xRangeFullScale') v = Math.floor(v);
    this.settingsChange.emit({ ...this.settings(), [key]: v });
  }

  updateText(key: 'title' | 'xAxisLabel' | 'yAxisLabel', value: string): void {
    this.settingsChange.emit({ ...this.settings(), [key]: value });
  }

  updateX(val: AxisSettings | AxisSettingsWithLog): void {
    this.settingsChange.emit({ ...this.settings(), xAxisSettings: val as AxisSettingsWithLog });
  }

  updateY(val: AxisSettings | AxisSettingsWithLog): void {
    this.settingsChange.emit({ ...this.settings(), yAxisSettings: val as AxisSettings });
  }
}
