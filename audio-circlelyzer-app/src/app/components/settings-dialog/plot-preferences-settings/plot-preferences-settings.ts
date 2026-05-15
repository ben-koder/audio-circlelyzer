import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlotPreferencesService, AutoscaleAlgorithm } from '../../../services/plot-preferences.service';

/**
 * UI for app-wide plot preferences. Currently exposes the autoscaling
 * algorithm and percentile parameters used for the *measured* axis (Y for
 * 2D plots, Z / colormap for 3D and heatmap plots).
 */
@Component({
  selector: 'app-plot-preferences-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex flex-col gap-4">
      <div class="form-control w-full">
        <label class="label" for="autoscale-algo">
          <span class="label-text font-bold">Autoscale algorithm</span>
        </label>
        <select id="autoscale-algo" class="select select-bordered w-full"
                [ngModel]="prefs().autoscaleAlgorithm"
                (ngModelChange)="setAlgorithm($event)">
          <option value="minmax">Min / Max (full range)</option>
          <option value="percentile">Percentile (robust)</option>
        </select>
        <div class="text-xs opacity-70 mt-1">
          Applies to the value axis only (Y for 2D plots, Z / colormap for 3D &amp; heatmap plots).
          Other axes always use full min / max.
        </div>
      </div>

      @if (prefs().autoscaleAlgorithm === 'percentile') {
        <div class="grid grid-cols-2 gap-4">
          <div class="form-control w-full">
            <label class="label" for="pct-low">
              <span class="label-text">Lower percentile</span>
            </label>
            <input type="number" id="pct-low" class="input input-bordered w-full"
                   min="0" max="49.9" step="0.5"
                   [ngModel]="prefs().percentileLow"
                   (ngModelChange)="setLow($event)">
          </div>
          <div class="form-control w-full">
            <label class="label" for="pct-high">
              <span class="label-text">Upper percentile</span>
            </label>
            <input type="number" id="pct-high" class="input input-bordered w-full"
                   min="50.1" max="100" step="0.5"
                   [ngModel]="prefs().percentileHigh"
                   (ngModelChange)="setHigh($event)">
          </div>
        </div>
        <div class="form-control w-full">
          <label class="label" for="pct-pad">
            <span class="label-text">Outward padding (fraction of percentile span)</span>
          </label>
          <input type="number" id="pct-pad" class="input input-bordered w-full"
                 min="0" max="1" step="0.01"
                 [ngModel]="prefs().percentilePadding"
                 (ngModelChange)="setPadding($event)">
          <div class="text-xs opacity-70 mt-1">
            E.g. 0.05 expands the range outward by 5 % of the percentile span on each end,
            clamped to the actual data extent. Gives a small visual margin while keeping the
            display stable when there are no outliers.
          </div>
        </div>
        <div>
          <button class="btn btn-sm" (click)="reset()">Reset to defaults</button>
        </div>
      }
    </div>
  `,
  styles: [],
})
export class PlotPreferencesSettingsComponent {
  private readonly service = inject(PlotPreferencesService);

  readonly prefs = this.service.preferences;

  setAlgorithm(value: AutoscaleAlgorithm) { this.service.setAlgorithm(value); }
  setLow(value: number) { this.service.setPercentileLow(Number(value)); }
  setHigh(value: number) { this.service.setPercentileHigh(Number(value)); }
  setPadding(value: number) { this.service.setPercentilePadding(Number(value)); }
  reset() { this.service.reset(); }
}
