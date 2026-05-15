import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TraceSettings } from '../../../models/types';

@Component({
  selector: 'app-trace-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="form-control w-full">
      <label class="label">
        <span class="label-text font-bold">Number of Traces (nTrace)</span>
      </label>
      <input type="number" class="input input-bordered w-full" 
        [ngModel]="settings().nTrace" 
        (ngModelChange)="updateNTrace($event)"
        min="2" max="200" step="1" />
      <label class="label">
        <span class="label-text-alt">
          Keeps a rolling history of {{ settings().nTrace }} input snapshots for 3D visualization
        </span>
      </label>
    </div>
  `,
  styles: []
})
export class TraceSettingsComponent {
  settings = input.required<TraceSettings>();
  settingsChange = output<TraceSettings>();

  updateNTrace(nTrace: number) {
    const validN = Math.max(2, Math.min(200, Math.floor(nTrace)));
    this.settingsChange.emit({ ...this.settings(), nTrace: validN });
  }
}
