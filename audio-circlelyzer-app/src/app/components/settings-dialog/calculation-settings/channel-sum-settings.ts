import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChannelSumSettings } from '../../../models/types';

@Component({
  selector: 'app-channel-sum-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="form-control w-full">
      <label class="label">
        <span class="label-text font-bold">Channel Sums (JSON format)</span>
      </label>
      <textarea class="textarea textarea-bordered h-24 font-mono" 
        [ngModel]="getJson()" (ngModelChange)="updateJson($event)" 
        placeholder="[[0, 1], [2, 3]]"></textarea>
      <label class="label">
        <span class="label-text-alt">Example: [[0, 1], [2, 3]] sums ch0+ch1 to out0, ch2+ch3 to out1</span>
      </label>
    </div>
  `,
  styles: []
})
export class ChannelSumSettingsComponent {
  settings = input.required<ChannelSumSettings>();
  settingsChange = output<ChannelSumSettings>();

  getJson(): string {
    return JSON.stringify(this.settings().channelSums);
  }

  updateJson(json: string) {
    try {
      const channelSums = JSON.parse(json);
      if (Array.isArray(channelSums) && channelSums.every(arr => Array.isArray(arr))) {
        this.settingsChange.emit({ channelSums });
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }
}
