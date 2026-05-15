import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OctaveFilterSettings } from '../../../models/calculation-types';

@Component({
  selector: 'app-octave-filter-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="form-control w-full">
      <label class="label">
        <span class="label-text font-bold">Octave Band Mode</span>
      </label>
      <select class="select select-bordered w-full" 
        [ngModel]="settings().mode" (ngModelChange)="updateMode($event)">
        <option value="full">Full Octave (10 bands)</option>
        <option value="third">Third Octave (30 bands)</option>
      </select>
      <label class="label">
        <span class="label-text-alt">
          @if (settings().mode === 'full') {
            Full octave: 31.5 Hz to 16 kHz (10 bands)
          } @else {
            Third octave: 25 Hz to 20 kHz (30 bands)
          }
        </span>
      </label>
    </div>
  `,
  styles: []
})
export class OctaveFilterSettingsComponent {
  settings = input.required<OctaveFilterSettings>();
  settingsChange = output<OctaveFilterSettings>();

  updateMode(mode: 'full' | 'third') {
    this.settingsChange.emit({ ...this.settings(), mode });
  }
}
