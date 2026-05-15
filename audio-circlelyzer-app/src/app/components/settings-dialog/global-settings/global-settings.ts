import { Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalculationContextSettings } from '../../../models/types';
import { CalculationManagerService } from '../../../services/calculation-manager.service';

@Component({
  selector: 'app-global-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex flex-col gap-4">
      <div class="form-control w-full">
        <label class="label" for="nc">
          <span class="label-text font-bold">Samples per Cycle (nc)</span>
        </label>
        <input type="number" id="nc" class="input input-bordered w-full" 
          [ngModel]="settings().nc" (ngModelChange)="updateSetting('nc', $event)">
      </div>
      <div class="form-control w-full">
        <label class="label" for="n_y">
          <span class="label-text font-bold">Cycles to Record (n_y)</span>
        </label>
        <input type="number" id="n_y" class="input input-bordered w-full" 
          [ngModel]="settings().n_y" (ngModelChange)="updateSetting('n_y', $event)">
      </div>
      <div class="form-control w-full">
        <label class="label" for="sampleRate">
          <span class="label-text font-bold">Sample Rate (Hz)</span>
        </label>
        <input type="number" id="sampleRate" class="input input-bordered w-full" 
          [ngModel]="settings().sampleRate" (ngModelChange)="updateSetting('sampleRate', $event)">
      </div>
      <div class="form-control w-full">
        <label class="label" for="renderer">
          <span class="label-text font-bold">Plot renderer</span>
        </label>
        <select id="renderer" class="select select-bordered w-full"
          [value]="selectedRenderer()"
          (change)="onRendererChange($event)">
          @for (option of rendererOptions(); track option.value) {
            <option [value]="option.value" [disabled]="option.disabled">{{ option.label }}</option>
          }
        </select>
        <span class="label-text-alt opacity-60">Applies immediately to all visualizations.</span>
      </div>
    </div>
  `,
  styles: []
})
export class GlobalSettingsComponent {
  private readonly calculationManager = inject(CalculationManagerService);

  settings = input.required<CalculationContextSettings>();
  settingsChange = output<CalculationContextSettings>();

  /** Active rendering backend, sourced live from the calculation manager so
   *  the dialog reflects fallbacks decided after support detection. */
  readonly selectedRenderer = computed<'webgpu' | 'webgl2' | '2d'>(() => {
    if (this.calculationManager.useWebGPU()) return 'webgpu';
    if (this.calculationManager.useWebGL2()) return 'webgl2';
    return '2d';
  });

  readonly rendererOptions = computed(() => [
    {
      value: 'webgpu' as const,
      label: 'WebGPU',
      disabled: this.calculationManager.webGPUSupported() !== true,
    },
    {
      value: 'webgl2' as const,
      label: 'WebGL2',
      disabled: this.calculationManager.webGL2Supported() !== true,
    },
    {
      value: '2d' as const,
      label: 'Canvas 2D',
      disabled: false,
    },
  ]);

  updateSetting(key: keyof CalculationContextSettings, value: number) {
    const newSettings = { ...this.settings(), [key]: value };
    this.settingsChange.emit(newSettings);
  }

  onRendererChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'webgpu' | 'webgl2' | '2d';
    this.calculationManager.setContextType(value);
  }
}

