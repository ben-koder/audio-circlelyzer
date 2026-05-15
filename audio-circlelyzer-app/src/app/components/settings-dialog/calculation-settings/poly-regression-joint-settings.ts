import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PolyRegressionSettings } from '../../../models/calculation-types';

/**
 * Settings UI for `POLYREGRESSION_JOINT(...)`.
 * See theory/CIRCULAR_NONLINEAR_REGRESSION.md §3.4.
 */
@Component({
  selector: 'app-poly-regression-joint-settings',
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
    </div>
  `,
  styles: []
})
export class PolyRegressionJointSettingsComponent {
  settings = input.required<PolyRegressionSettings>();
  settingsChange = output<PolyRegressionSettings>();

  updateDerivatives(value: number): void {
    const clean = Math.max(0, Math.min(6, Math.floor(value)));
    this.settingsChange.emit({ ...this.settings(), derivatives: clean });
  }

  updateDegree(value: number): void {
    const clean = Math.max(1, Math.min(9, Math.floor(value)));
    this.settingsChange.emit({ ...this.settings(), degree: clean });
  }
}
