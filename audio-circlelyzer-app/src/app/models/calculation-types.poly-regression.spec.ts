import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';

import {
  POLYREGRESSION_JOINTCalculation,
  POLYREGRESSION_MATCHEDCalculation,
  type PolyFitData,
} from './calculation-types';
import type { ComplexSpectrum } from './types';

function makeFit(label: string): PolyFitData {
  return {
    coeffs: new Float32Array([1, 2, 3]),
    stdErrors: new Float32Array([0.1, 0.2, 0.3]),
    monomialLabels: ['y', 'ydot', 'y^2'],
    monomialPowers: [[1, 0], [0, 1], [2, 0]],
    conditionNumber: 10,
    residualNorm: 0.01,
    rhsNorm: 1,
    residualRe: new Float32Array([0]),
    residualIm: new Float32Array([0]),
    stateTime: [],
    forcingTime: new Float32Array([]),
  };
}

function makeSpectrum(n = 16): ComplexSpectrum {
  return { re: new Float32Array(n), im: new Float32Array(n) };
}

describe('POLYREGRESSION_JOINTCalculation', () => {
  it('runs the regression once per channel and labels the output', () => {
    const polyRegressionJoint = vi.fn(() => makeFit('joint'));
    const wasm = { polyRegressionJoint } as any;
    const calc = new POLYREGRESSION_JOINTCalculation(wasm);

    const Y = [makeSpectrum(), makeSpectrum()];
    const X = [makeSpectrum(), makeSpectrum()];
    const variables = new Map<string, unknown>([['Y', Y], ['X', X]]);
    const results = new Map<string, unknown>();
    const ctx = {
      settings: { sampleRate: 48000, nc: 16 },
      calculationSettings: new Map<string, unknown>([['fit', { derivatives: 2, degree: 3 }]]),
      calculationResults: results,
      visualizationSettings: new Map(),
      getVariable: (key: string) => variables.get(key),
      getDependencies: () => ['Y', 'X'],
      channelCount: 2,
    } as any;

    results.set('fit', calc.initResult('fit', ctx));
    calc.updateResult('fit', ctx);

    const out = results.get('fit') as PolyFitData[] & { channelLabels?: string[] };
    expect(out).toHaveLength(2);
    expect(polyRegressionJoint).toHaveBeenCalledTimes(2);
    expect(polyRegressionJoint).toHaveBeenCalledWith(Y[0], X[0], 2, 3, 48000);
    expect(out.channelLabels).toEqual(['Ch 1', 'Ch 2']);
    expect(Array.from(out[0].coeffs)).toEqual([1, 2, 3]);
  });

  it('uses default settings when none are provided', () => {
    const polyRegressionJoint = vi.fn(() => makeFit('joint'));
    const wasm = { polyRegressionJoint } as any;
    const calc = new POLYREGRESSION_JOINTCalculation(wasm);

    const variables = new Map<string, unknown>([
      ['Y', [makeSpectrum()]],
      ['X', [makeSpectrum()]],
    ]);
    const ctx = {
      settings: { sampleRate: 48000, nc: 16 },
      calculationSettings: new Map(),
      calculationResults: new Map(),
      visualizationSettings: new Map(),
      getVariable: (key: string) => variables.get(key),
      getDependencies: () => ['Y', 'X'],
      channelCount: 1,
    } as any;

    const settings = calc.initSettings('fit', ctx);
    expect(settings).toEqual({ derivatives: 2, degree: 3 });

    ctx.calculationResults.set('fit', calc.initResult('fit', ctx));
    calc.updateResult('fit', ctx);
    expect(polyRegressionJoint).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 2, 3, 48000,
    );
  });
});

describe('POLYREGRESSION_MATCHEDCalculation', () => {
  it('rebuilds per-order harmonics, calls polyRegressionMatched, and emits one row per order', () => {
    const n = 16;
    const polyRegressionMatched = vi.fn(() => [makeFit('p1'), makeFit('p2'), makeFit('p3')]);
    const generateZadoffChu = vi.fn(() => new Float32Array(n));
    const createFFTContext = vi.fn(() => ({}));
    const fft = vi.fn(() => makeSpectrum(n));
    const complexDivide = vi.fn(() => makeSpectrum(n));

    const wasm = {
      polyRegressionMatched,
      generateZadoffChu,
      createFFTContext,
      fft,
      complexDivide,
    } as any;
    const calc = new POLYREGRESSION_MATCHEDCalculation(wasm);

    const Y = [makeSpectrum(n)];
    const xTime = [new Float32Array(n)];
    const variables = new Map<string, unknown>([['Y', Y], ['x', xTime]]);
    const results = new Map<string, unknown>();
    const ctx = {
      settings: { sampleRate: 48000, nc: n },
      calculationSettings: new Map<string, unknown>([
        ['fit', { derivatives: 2, degree: 3, root: 1, orders: [1, 2, 3] }],
      ]),
      calculationResults: results,
      visualizationSettings: new Map(),
      getVariable: (key: string) => variables.get(key),
      getDependencies: () => ['Y', 'x'],
      channelCount: 1,
    } as any;

    results.set('fit', calc.initResult('fit', ctx));
    calc.updateResult('fit', ctx);

    const out = results.get('fit') as PolyFitData[] & { channelLabels?: string[] };
    expect(out).toHaveLength(3);
    expect(out.channelLabels).toEqual(['H1', 'H2', 'H3']);
    expect(polyRegressionMatched).toHaveBeenCalledTimes(1);
    // Generate one ZC reference per order p ∈ {1,2,3}.
    expect(generateZadoffChu).toHaveBeenCalledTimes(3);
    expect(generateZadoffChu).toHaveBeenNthCalledWith(1, n, 1);
    expect(generateZadoffChu).toHaveBeenNthCalledWith(2, n, 2);
    expect(generateZadoffChu).toHaveBeenNthCalledWith(3, n, 3);
  });

  it('normalizes negative or duplicate orders and falls back to defaults when empty', () => {
    const wasm = {
      polyRegressionMatched: vi.fn(() => [makeFit('a'), makeFit('b')]),
      generateZadoffChu: vi.fn(() => new Float32Array(8)),
      createFFTContext: vi.fn(() => ({})),
      fft: vi.fn(() => makeSpectrum(8)),
      complexDivide: vi.fn(() => makeSpectrum(8)),
    } as any;
    const calc = new POLYREGRESSION_MATCHEDCalculation(wasm);

    const ctx = {
      settings: { sampleRate: 48000, nc: 8 },
      calculationSettings: new Map<string, unknown>([
        ['fit', { derivatives: 1, degree: 2, root: 3, orders: [2, 1, 2, -5, 0] }],
      ]),
      calculationResults: new Map(),
      visualizationSettings: new Map(),
      getVariable: (key: string) =>
        key === 'Y' ? [makeSpectrum(8)] :
        key === 'x' ? [new Float32Array(8)] : undefined,
      getDependencies: () => ['Y', 'x'],
      channelCount: 1,
    } as any;

    ctx.calculationResults.set('fit', calc.initResult('fit', ctx));
    calc.updateResult('fit', ctx);

    const out = ctx.calculationResults.get('fit') as PolyFitData[] & { channelLabels?: string[] };
    expect(out.channelLabels).toEqual(['H1', 'H2']);
  });
});
