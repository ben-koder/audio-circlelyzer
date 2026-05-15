import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PolyRegressionMatchedSettings } from '../../../models/calculation-types';

/**
 * Settings UI for `POLYREGRESSION_MATCHED(...)`.
 * See theory/CIRCULAR_NONLINEAR_REGRESSION.md §3.10.
 */
@Component({
  selector: 'app-poly-regression-matched-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">Derivatives</span>
        </label>
        <input type="number" class="input input-bordered w-full"
          [ngModel]="settings().derivatives"
          (ngModelChange)="updateDerivatives($event)"
          min="0" max="6" step="1" />
        <label class="label">
          <span class="label-text-alt">Highest derivative axis included (1=ẏ, 2=ÿ, …)</span>
        </label>
      </div>
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">Polynomial Degree</span>
        </label>
        <input type="number" class="input input-bordered w-full"
          [ngModel]="settings().degree"
          (ngModelChange)="updateDegree($event)"
          min="1" max="9" step="1" />
        <label class="label">
          <span class="label-text-alt">Total polynomial degree across all axes</span>
        </label>
      </div>
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">Zadoff–Chu Root</span>
        </label>
        <input type="number" class="input input-bordered w-full"
          [ngModel]="settings().root"
          (ngModelChange)="updateRoot($event)"
          min="1" step="1" />
        <label class="label">
          <span class="label-text-alt">Must match upstream ZC source root</span>
        </label>
      </div>
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">Harmonic Orders</span>
        </label>
        <input type="text" class="input input-bordered w-full"
          [ngModel]="ordersText()"
          (ngModelChange)="updateOrdersFromText($event)"
          placeholder="e.g. 1,2,3" />
        <label class="label">
          <span class="label-text-alt">Comma-separated; one regression per order</span>
        </label>
      </div>
    </div>
  `,
  styles: []
})
export class PolyRegressionMatchedSettingsComponent {
  settings = input.required<PolyRegressionMatchedSettings>();
  settingsChange = output<PolyRegressionMatchedSettings>();

  protected readonly ordersText = computed(() => (this.settings().orders ?? []).join(','));

  updateDerivatives(value: number): void {
    const clean = Math.max(0, Math.min(6, Math.floor(value)));
    this.settingsChange.emit({ ...this.settings(), derivatives: clean });
  }

  updateDegree(value: number): void {
    const clean = Math.max(1, Math.min(9, Math.floor(value)));
    this.settingsChange.emit({ ...this.settings(), degree: clean });
  }

  updateRoot(value: number): void {
    const clean = Math.max(1, Math.floor(value));
    this.settingsChange.emit({ ...this.settings(), root: clean });
  }

  updateOrdersFromText(text: string): void {
    const orders = text
      .split(/[,\s]+/)
      .map((part) => Number.parseInt(part, 10))
      .filter((n) => Number.isInteger(n) && n >= 1);
    this.settingsChange.emit({ ...this.settings(), orders });
  }
}
