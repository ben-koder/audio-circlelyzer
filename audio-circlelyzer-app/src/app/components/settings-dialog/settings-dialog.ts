import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalculationManagerService } from '../../services/calculation-manager.service';
import { GlobalSettingsComponent } from './global-settings/global-settings';
import { CalculationSettingsComponent } from './calculation-settings/calculation-settings';
import { VisualizationSettingsComponent } from './visualization-settings/visualization-settings';
import { PlotPreferencesSettingsComponent } from './plot-preferences-settings/plot-preferences-settings';
import { CalculationContextSettings } from '../../models/types';

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [CommonModule, GlobalSettingsComponent, CalculationSettingsComponent, VisualizationSettingsComponent, PlotPreferencesSettingsComponent],
  templateUrl: './settings-dialog.html',
  styleUrl: './settings-dialog.scss'
})
export class SettingsDialogComponent {
  calculationManager = inject(CalculationManagerService);
  
  activeTab = signal<'global' | 'plotting' | 'calculations' | 'visualizations'>('global');
  isOpen = signal(false);

  // Temporary state for settings
  tempSettings = signal<CalculationContextSettings | null>(null);
  tempCalcSettings = signal<Map<string, any>>(new Map());
  tempVisSettings = signal<Map<string, any>>(new Map());
  
  currentContext = signal<any>(null);

  open() {
    const contextId = this.calculationManager.activeContextId();
    if (!contextId) return;
    
    const context = this.calculationManager.getContext(contextId);
    if (!context) return;

    // Convert visualizations map from {type, isSimpleValue} to just the type string
    // as expected by VisualizationSettingsComponent
    const visualizationsMap = new Map<string, string>();
    context.visualizations.forEach((value, key) => {
      // The service stores {type, isSimpleValue}, we need just the type string
      const typeId = typeof value === 'string' ? value : value.type;
      visualizationsMap.set(key, typeId);
    });

    // Create a safe context object that satisfies the interface requirements
    // of the child components (which expect CalculationContext)
    const safeContext: any = {
      id: context.definition.id,
      settings: context.definition.settings,
      visualizations: visualizationsMap,
      calculationSettings: context.calculationSettings,
      visualizationSettings: context.visualizationSettings,
      calculationTypes: context.calculationTypes,
      // Mock other required properties if necessary
      x_c: [],
      channelCount: 0,
      calculationResults: new Map(),
      getVariable: () => [],
      getCircularBufferChannel: () => undefined
    };

    this.currentContext.set(safeContext);

    // Deep copy settings
    this.tempSettings.set({ ...context.definition.settings });
    this.tempCalcSettings.set(new Map(JSON.parse(JSON.stringify(Array.from(context.calculationSettings.entries())))));
    this.tempVisSettings.set(new Map(JSON.parse(JSON.stringify(Array.from(context.visualizationSettings.entries())))));

    this.isOpen.set(true);
  }

  close() {
    this.isOpen.set(false);
  }

  save() {
    const contextId = this.calculationManager.activeContextId();
    const settings = this.tempSettings();
    if (!contextId || !settings) return;

    // Apply changes
    this.calculationManager.updateContextSettings(contextId, settings);
    
    // Update calculation settings
    this.tempCalcSettings().forEach((value, key) => {
      this.calculationManager.updateCalculationSetting(contextId, key, value);
    });

    // Update visualization settings
    this.tempVisSettings().forEach((value, key) => {
      this.calculationManager.updateVisualizationSetting(contextId, key, value);
    });

    this.close();
  }

  updateGlobalSettings(settings: CalculationContextSettings) {
    this.tempSettings.set(settings);
  }

  updateCalculationSetting(key: string, value: any) {
    const newMap = new Map(this.tempCalcSettings());
    newMap.set(key, value);
    this.tempCalcSettings.set(newMap);
  }

  updateVisualizationSetting(key: string, value: any) {
    const newMap = new Map(this.tempVisSettings());
    newMap.set(key, value);
    this.tempVisSettings.set(newMap);
  }
}
