import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { HARMONICLEVELSCalculation } from './calculation-types';

describe('HARMONICLEVELSCalculation', () => {
  it('groups harmonic summaries by input channel label', () => {
    const calculation = new HARMONICLEVELSCalculation();
    const input = [
      new Float32Array([1, 1]),
      new Float32Array([2, 2]),
      new Float32Array([3, 3]),
      new Float32Array([4, 4]),
      new Float32Array([5, 5]),
      new Float32Array([6, 6]),
    ] as Float32Array[] & { channelLabels?: string[] };
    input.channelLabels = [
      'Ch 1 · H1',
      'Ch 1 · H2',
      'Ch 1 · H3',
      'Ch 2 · H1',
      'Ch 2 · H2',
      'Ch 2 · H3',
    ];

    const variables = new Map<string, unknown>([['H_harm_abs', input]]);
    const results = new Map<string, unknown>();
    const ctx = {
      calculationSettings: new Map<string, unknown>(),
      calculationResults: results,
      getVariable: (key: string) => variables.get(key),
      getDependencies: () => ['H_harm_abs'],
    } as any;

    results.set('harm_levels', calculation.initResult('harm_levels', ctx));
    calculation.updateResult('harm_levels', ctx);

    const summary = results.get('harm_levels') as Array<{
      rmsValues: Float32Array;
      labels?: string[];
    }> & { channelLabels?: string[] };

    expect(summary.channelLabels).toEqual(['Ch 1', 'Ch 2']);
    expect(summary).toHaveLength(2);
    expect(summary[0].labels).toEqual(['H1', 'H2', 'H3']);
    expect(summary[1].labels).toEqual(['H1', 'H2', 'H3']);
    expect(Array.from(summary[0].rmsValues)).toEqual([1, 2, 3]);
    expect(Array.from(summary[1].rmsValues)).toEqual([4, 5, 6]);
  });
});