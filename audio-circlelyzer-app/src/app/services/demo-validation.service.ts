import { Injectable, inject, signal } from '@angular/core';

import { DemoCatalogEntry } from '../models/demo-catalog';
import { DemoExpectedDocument, DemoValidationReport } from '../models/demo-validation';
import { CalculationManagerService } from './calculation-manager.service';
import {
  getRequiredResultKeys,
  parseDemoExpectedDocument,
  validateDemoExpected,
} from './demo-validation.logic';

@Injectable({
  providedIn: 'root'
})
export class DemoValidationService {
  private readonly calculationManager = inject(CalculationManagerService);
  private readonly expectedCache = new Map<string, DemoExpectedDocument>();

  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly report = signal<DemoValidationReport | null>(null);
  readonly error = signal<string | null>(null);

  reset(): void {
    this.state.set('idle');
    this.report.set(null);
    this.error.set(null);
  }

  async validateDemo(entry: DemoCatalogEntry, contextId: string): Promise<DemoValidationReport> {
    this.state.set('loading');
    this.report.set(null);
    this.error.set(null);

    try {
      const expected = await this.loadExpected(entry);
      const resultKeys = getRequiredResultKeys(expected);

      this.calculationManager.triggerCalculation(true);
      const snapshot = await this.calculationManager.requestCalculationResults(contextId, resultKeys);
      const report = validateDemoExpected(entry.id, expected, snapshot);

      this.report.set(report);
      this.state.set('ready');
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not validate demo';
      this.error.set(message);
      this.state.set('error');
      throw error;
    }
  }

  private async loadExpected(entry: DemoCatalogEntry): Promise<DemoExpectedDocument> {
    const cached = this.expectedCache.get(entry.id);
    if (cached) {
      return cached;
    }

    const response = await fetch(entry.expectedPath);
    if (!response.ok) {
      throw new Error(`Could not load expected results: ${response.status}`);
    }

    const expected = parseDemoExpectedDocument(await response.json());
    this.expectedCache.set(entry.id, expected);
    return expected;
  }
}