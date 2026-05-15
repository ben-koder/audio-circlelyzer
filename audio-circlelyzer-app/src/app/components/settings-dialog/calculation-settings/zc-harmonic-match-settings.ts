import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ZCHarmonicMatchSettings } from '../../../models/calculation-types';

/**
 * Settings UI for `ZC_HARMONIC_MATCH(...)`.
 * See theory/CIRCULAR_NONLINEAR-SIGNAL_ANALYSIS.md.
 */
@Component({
  selector: 'app-zc-harmonic-match-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="form-control w-full">
        <label class="label">
          <span class="label-text font-bold">Zadoff–Chu Root</span>
        </label>
        <input type="number" class="input input-bordered w-full"
          [ngModel]="settings().root"
          (ngModelChange)="updateRoot($event)"
          min="1" step="1" />
        <label class="label">
          <span class="label-text-alt">Must match the upstream ZC stimulus root</span>
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
          <span class="label-text-alt">Comma-separated; one matched filter per order</span>
        </label>
      </div>
    </div>
  `,
  styles: []
})
export class ZcHarmonicMatchSettingsComponent {
  settings = input.required<ZCHarmonicMatchSettings>();
  settingsChange = output<ZCHarmonicMatchSettings>();

  protected readonly ordersText = computed(() => (this.settings().orders ?? []).join(','));

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
