import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ExpandSettings } from '../../../models/types';

@Component({
  selector: 'app-expand-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="form-control w-full">
      <label class="label">
        <span class="label-text font-bold">Expand Factor</span>
      </label>
      <input type="number" class="input input-bordered w-full" 
        [ngModel]="settings().expandFactor" 
        (ngModelChange)="updateExpandFactor($event)"
        min="1" max="16" step="1" />
      <label class="label">
        <span class="label-text-alt">
          Output length will be {{ settings().expandFactor }}x input length (interpolated samples)
        </span>
      </label>
    </div>
  `,
  styles: []
})
export class ExpandSettingsComponent {
  settings = input.required<ExpandSettings>();
  settingsChange = output<ExpandSettings>();

  updateExpandFactor(factor: number) {
    const validFactor = Math.max(1, Math.min(16, Math.floor(factor)));
    this.settingsChange.emit({ ...this.settings(), expandFactor: validFactor });
  }
}
