import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputNSettings } from '../../../models/types';

@Component({
  selector: 'app-inputn-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="form-control w-full">
      <label class="label">
        <span class="label-text font-bold">Buffer Length Multiplier (n)</span>
      </label>
      <input type="number" class="input input-bordered w-full" 
        [ngModel]="settings().n" 
        (ngModelChange)="updateN($event)"
        min="1" max="16" step="1" />
      <label class="label">
        <span class="label-text-alt">
          @if (settings().n === 1) {
            Output equals standard y_c buffer (nc samples)
          } @else {
            Output will be {{ settings().n }} × nc samples (includes historic data)
          }
        </span>
      </label>
    </div>
  `,
  styles: []
})
export class InputNSettingsComponent {
  settings = input.required<InputNSettings>();
  settingsChange = output<InputNSettings>();

  updateN(n: number) {
    const validN = Math.max(1, Math.min(16, Math.floor(n)));
    this.settingsChange.emit({ ...this.settings(), n: validN });
  }
}
