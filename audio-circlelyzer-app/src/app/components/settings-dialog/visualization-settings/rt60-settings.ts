import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AxisSettingsComponent } from './axis-settings';
import { RT60VisualizationSettings, AxisSettings, RT60Metric } from '../../../models/types';

@Component({
  selector: 'app-rt60-settings',
  standalone: true,
  imports: [AxisSettingsComponent, FormsModule],
  template: `
    <div class="space-y-4">
      <!-- RT60-specific options -->
      <div class="card bg-base-200 p-4">
        <h3 class="font-semibold mb-3">RT60 Options</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="form-control md:col-span-3">
            <label class="label">
              <span class="label-text">Regression metrics (any combination)</span>
            </label>
            <div class="flex flex-wrap gap-2">
              @for (metric of metricOptions; track metric.value) {
                <button type="button"
                  class="btn btn-xs"
                  [class.btn-primary]="isMetricSelected(metric.value)"
                  [class.btn-ghost]="!isMetricSelected(metric.value)"
                  (click)="toggleMetric(metric.value)">
                  {{ metric.label }}
                </button>
              }
            </div>
          </div>
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Show Regression Lines</span>
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                [ngModel]="settings().showRegressionLines"
                (ngModelChange)="updateShowRegressionLines($event)" />
            </label>
          </div>
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Show Data Table</span>
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                [ngModel]="settings().showDataTable"
                (ngModelChange)="updateShowDataTable($event)" />
            </label>
          </div>
        </div>
      </div>

      <!-- Axis settings -->
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
    </div>
  `,
  styles: []
})
export class RT60SettingsComponent {
  settings = input.required<RT60VisualizationSettings>();
  settingsChange = output<RT60VisualizationSettings>();

  readonly metricOptions: { value: RT60Metric; label: string }[] = [
    { value: 'edt', label: 'EDT' },
    { value: 't20', label: 'T20' },
    { value: 't30', label: 'T30' },
    { value: 'topt', label: 'T-opt' },
  ];

  isMetricSelected(metric: RT60Metric): boolean {
    return (this.settings().showMetrics ?? []).includes(metric);
  }

  toggleMetric(metric: RT60Metric) {
    const current = new Set(this.settings().showMetrics ?? []);
    if (current.has(metric)) {
      current.delete(metric);
    } else {
      current.add(metric);
    }
    // Preserve a stable canonical ordering
    const ordered = this.metricOptions
      .map((opt) => opt.value)
      .filter((value) => current.has(value));
    this.settingsChange.emit({ ...this.settings(), showMetrics: ordered });
  }

  updateShowRegressionLines(val: boolean) {
    this.settingsChange.emit({ ...this.settings(), showRegressionLines: val });
  }

  updateShowDataTable(val: boolean) {
    this.settingsChange.emit({ ...this.settings(), showDataTable: val });
  }

  updateX(val: AxisSettings) {
    this.settingsChange.emit({ ...this.settings(), xAxisSettings: val });
  }

  updateY(val: AxisSettings) {
    this.settingsChange.emit({ ...this.settings(), yAxisSettings: val });
  }
}
