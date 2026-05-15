import { Component, input, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RT60Result, RT60FullResult } from '../../../models/types';
import { PlotCanvasComponent } from '../plot-canvas/plot-canvas.component';
import { CalculationManagerService } from '../../../services/calculation-manager.service';
import { COMPUTATION_CONTEXT_ID, CONTEXT_KEY } from '../../../models/types';

@Component({
  selector: 'app-rt60-decay',
  imports: [CommonModule, PlotCanvasComponent],
  templateUrl: './rt60-decay.html',
  styleUrl: './rt60-decay.scss',
})
export class Rt60Decay {
  // Required inputs for worker-based rendering
  contextId = input<string>('');
  visKey = input<string>('');
  
  // Legacy inputs (kept for backwards compatibility)
  data = input<RT60Result | RT60FullResult | null>(null);
  title = input<string>('RT60 Decay Curve');
  showRegressionLines = input<boolean>(true);
  showDataTable = input<boolean>(true);
  selectedMetric = input<'edt' | 't20' | 't30' | 'topt'>('t30');
  
  private calculationManager = inject(CalculationManagerService);
  
  // Get RT60 data from calculation manager for table display (uses simple value mechanism)
  resultData = computed(() => {
    const ctxId = this.contextId() as COMPUTATION_CONTEXT_ID;
    const key = this.visKey() as CONTEXT_KEY;
    if (!ctxId || !key) return this.data();
    
    // Track simpleValuesVersion so this re-evaluates when new results arrive
    this.calculationManager.simpleValuesVersion();
    const simpleValue = this.calculationManager.getSimpleValue(ctxId, key);
    if (simpleValue) {
      return simpleValue as RT60Result | RT60FullResult;
    }
    
    return this.data();
  });

  // Read showDataTable from visualization settings when contextId/visKey are available,
  // falling back to the legacy input.
  private vizShowDataTable = computed(() => {
    const ctxId = this.contextId();
    const key = this.visKey();
    if (!ctxId || !key) return this.showDataTable();
    // Track vizSettingsVersion so this re-evaluates when settings change
    this.calculationManager.vizSettingsVersion();
    const settings = this.calculationManager.getContext(ctxId)?.visualizationSettings.get(key);
    return settings?.showDataTable ?? this.showDataTable();
  });
  
  // Computed signals for data type detection
  isFullResult = computed(() => {
    const d = this.resultData();
    return d !== null && d !== undefined && 'edt' in d;
  });
  
  fullData = computed(() => {
    const d = this.resultData();
    if (d && 'edt' in d) {
      return d as RT60FullResult;
    }
    return null;
  });
  
  legacyData = computed(() => {
    const d = this.resultData();
    if (d && !('edt' in d)) {
      return d as RT60Result;
    }
    return null;
  });
  
  showTable = computed(() => this.vizShowDataTable() && this.isFullResult());
  
  formatTime(seconds: number): string {
    if (seconds < 1) {
      return `${(seconds * 1000).toFixed(0)} ms`;
    }
    return `${seconds.toFixed(3)} s`;
  }
}
