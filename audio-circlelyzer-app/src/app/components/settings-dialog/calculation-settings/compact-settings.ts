import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CompactSettings } from '../../../models/types';

@Component({
  selector: 'app-compact-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="form-control w-full">
      <label class="label">
        <span class="label-text font-bold">Compact Factor</span>
      </label>
      <input type="number" class="input input-bordered w-full" 
        [ngModel]="settings().compactFactor" 
        (ngModelChange)="updateCompactFactor($event)"
        min="1" max="16" step="1" />
      <label class="label">
        <span class="label-text-alt">
          Output length will be 1/{{ settings().compactFactor }} of input length (keeps every {{ getOrdinal(settings().compactFactor) }} sample)
        </span>
      </label>
    </div>
  `,
  styles: []
})
export class CompactSettingsComponent {
  settings = input.required<CompactSettings>();
  settingsChange = output<CompactSettings>();

  updateCompactFactor(factor: number) {
    const validFactor = Math.max(1, Math.min(16, Math.floor(factor)));
    this.settingsChange.emit({ ...this.settings(), compactFactor: validFactor });
  }

  getOrdinal(n: number): string {
    const suffix = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
  }
}
