import { Component, computed, effect, input, output, signal } from '@angular/core';
import { ContextPreset } from '../../models/context-presets';

@Component({
  selector: 'app-preset-management-panel',
  templateUrl: './preset-management-panel.html',
  styleUrl: './preset-management-panel.scss'
})
export class PresetManagementPanelComponent {
  currentPreset = input<ContextPreset | null>(null);
  builtInPresetCount = input(0);
  userPresetCount = input(0);

  saveRequested = output<string>();
  importRequested = output<void>();
  exportRequested = output<void>();
  deleteRequested = output<void>();

  protected readonly draftName = signal('');
  protected readonly isUserPreset = computed(() => this.currentPreset()?.origin === 'user');
  protected readonly saveButtonLabel = computed(() => this.isUserPreset() ? 'Update' : 'Save Copy');

  constructor() {
    effect(() => {
      this.draftName.set(this.getDefaultDraftName(this.currentPreset()));
    });
  }

  protected onDraftNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.draftName.set(input.value);
  }

  protected requestSave(): void {
    const fallbackName = this.getDefaultDraftName(this.currentPreset());
    this.saveRequested.emit(this.draftName().trim() || fallbackName);
  }

  private getDefaultDraftName(preset: ContextPreset | null): string {
    if (!preset) {
      return '';
    }

    return preset.origin === 'user' ? preset.name : `${preset.name} Copy`;
  }
}