import { describe, expect, it } from 'vitest';

import { validateDemoExpected } from './demo-validation.logic';

describe('validateDemoExpected', () => {
  it('validates phase-delay fixtures against constant-delay spectra', () => {
    const report = validateDemoExpected(
      'phase-delay-reference',
      {
        version: 1,
        kind: 'phase-delay',
        sampleRate: 48_000,
        expectedDelaysSamples: [48, 160],
        toleranceSamples: 8,
      },
      {
        H_c_gd: [
          new Array(256).fill(48),
          new Array(256).fill(160),
        ],
      },
    );

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(2);
  });

  it('validates room RT60 and direct-path timing', () => {
    const report = validateDemoExpected(
      'room-rt-reference',
      {
        version: 1,
        kind: 'room-rt60',
        sampleRate: 48_000,
        expectedRt60Seconds: [0.35, 0.62],
        directDelaysSamples: [28, 44],
        toleranceSeconds: 0.1,
        toleranceSamples: 6,
      },
      {
        rt60: [
          { t30: { value: 0.36 } },
          { t30: { value: 0.6 } },
        ],
        h_c: [
          impulseWithPeak(128, 28, 1),
          impulseWithPeak(128, 44, 0.8),
        ],
      },
    );

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(4);
  });

  it('prefers reliable RT60 fits and otherwise falls back to the strongest correlation', () => {
    const report = validateDemoExpected(
      'room-rt-reference',
      {
        version: 1,
        kind: 'room-rt60',
        sampleRate: 48_000,
        expectedRt60Seconds: [0.35, 0.62],
        directDelaysSamples: [28, 44],
        toleranceSeconds: 0.1,
        toleranceSamples: 6,
      },
      {
        rt60: [
          {
            t30: { value: 1.31, correlation: -0.58, isReliable: false },
            edt: { value: 0.366, correlation: -0.997, isReliable: false },
          },
          {
            t30: { value: 1.27, correlation: -0.76, isReliable: false },
            t20: { value: 0.61, correlation: -0.98, isReliable: true },
            edt: { value: 0.631, correlation: -0.999, isReliable: false },
          },
        ],
        h_c: [
          impulseWithPeak(128, 28, 1),
          impulseWithPeak(128, 44, 0.8),
        ],
      },
    );

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(4);
  });

  it('validates multi-source matrix delays and gains', () => {
    const report = validateDemoExpected(
      'multisource-2x2-reference',
      {
        version: 1,
        kind: 'multi-source-matrix',
        sampleRate: 48_000,
        paths: {
          source0_to_mic0: { delaySamples: 18, gain: 1 },
          source1_to_mic0: { delaySamples: 84, gain: 0.34 },
          source0_to_mic1: { delaySamples: 46, gain: 0.52 },
          source1_to_mic1: { delaySamples: 118, gain: 0.85 },
        },
        toleranceSamples: 10,
        gainTolerance: 0.05,
      },
      {
        h_src: [
          impulseWithPeak(256, 18, 1),
          impulseWithPeak(256, 84, 0.34),
          impulseWithPeak(256, 46, 0.52),
          impulseWithPeak(256, 118, 0.85),
        ],
      },
    );

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(8);
  });

  it('validates nonlinear harmonic delays and grouped levels', () => {
    const report = validateDemoExpected(
      'nonlinear-harmonic-reference',
      {
        version: 1,
        kind: 'nonlinear-harmonics',
        sampleRate: 48_000,
        channels: {
          channel0: { H1Delay: 24, H2Delay: 96, H3Delay: 168, relativeLevels: [1, 0.22, 0.08] },
          channel1: { H1Delay: 52, H2Delay: 132, H3Delay: 220, relativeLevels: [0.78, 0.33, 0.14] },
        },
        toleranceSamples: 12,
        relativeLevelTolerance: 0.02,
      },
      {
        h_harm: [
          impulseWithPeak(256, 24, 1),
          impulseWithPeak(256, 96, 0.22),
          impulseWithPeak(256, 168, 0.08),
          impulseWithPeak(256, 52, 0.78),
          impulseWithPeak(256, 132, 0.33),
          impulseWithPeak(256, 220, 0.14),
        ],
        harm_levels: [
          { rmsValues: [1, 0.22, 0.08] },
          { rmsValues: [0.78, 0.33, 0.14] },
        ],
      },
    );

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(12);
  });

  it('normalizes nonlinear harmonic level summaries against the reference path', () => {
    const report = validateDemoExpected(
      'nonlinear-harmonic-reference',
      {
        version: 1,
        kind: 'nonlinear-harmonics',
        sampleRate: 48_000,
        channels: {
          channel0: { H1Delay: 24, H2Delay: 96, H3Delay: 168, relativeLevels: [1, 0.22, 0.08] },
          channel1: { H1Delay: 52, H2Delay: 132, H3Delay: 220, relativeLevels: [0.78, 0.33, 0.14] },
        },
        toleranceSamples: 12,
        relativeLevelTolerance: 0.02,
      },
      {
        h_harm: [
          impulseWithPeak(256, 24, 8),
          impulseWithPeak(256, 96, 1.76),
          impulseWithPeak(256, 168, 0.64),
          impulseWithPeak(256, 52, 6.24),
          impulseWithPeak(256, 132, 2.64),
          impulseWithPeak(256, 220, 1.12),
        ],
        harm_levels: [
          { rmsValues: [8, 1.76, 0.64] },
          { rmsValues: [6.24, 2.64, 1.12] },
        ],
      },
    );

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(12);
  });

  it('validates joint polynomial regression coefficients', () => {
    const report = validateDemoExpected(
      'nonlinear-poly-regression-joint-reference',
      {
        version: 1,
        kind: 'nonlinear-poly-regression-joint',
        sampleRate: 48_000,
        model: { derivatives: 2, degree: 3 },
        expectedCoefficients: { y: 0.084, ydot: 0.000069, yddot: 0.0000038, 'y^3': 0.048 },
        dominantMonomials: ['y', 'ydot', 'yddot', 'y^3'],
        coefficientRelativeTolerance: 0.1,
        zeroCoefficientAbsTolerance: 1e-6,
      },
      {
        poly_fit: [
          {
            monomialLabels: ['y', 'ydot', 'yddot', 'y^2', 'y^3'],
            coeffs: [0.083, 0.00007, 0.0000039, 0, 0.047],
            residualNorm: 0.01,
            rhsNorm: 1,
          },
        ],
      },
    );

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(5);
  });

  it('validates matched polynomial regression order series', () => {
    const report = validateDemoExpected(
      'nonlinear-poly-regression-matched-reference',
      {
        version: 1,
        kind: 'nonlinear-poly-regression-matched',
        sampleRate: 48_000,
        model: { derivatives: 2, degree: 3, root: 1, orders: [1, 2, 3] },
        harmonicKernels: {
          H1: { taps: [{ delaySamples: 28, gain: 0.9 }] },
          H2: { taps: [{ delaySamples: 108, gain: 0.28 }] },
          H3: { taps: [{ delaySamples: 236, gain: 0.11 }] },
        },
        expectedOrders: ['H1', 'H2', 'H3'],
        toleranceSamples: 12,
      },
      {
        poly_fits: [
          { monomialLabels: ['y'], coeffs: [1] },
          { monomialLabels: ['y^2'], coeffs: [0.2] },
          { monomialLabels: ['y^3'], coeffs: [0.1] },
        ],
      },
    );

    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(3);
  });
});

function impulseWithPeak(length: number, peakIndex: number, peakValue: number): number[] {
  const result = new Array<number>(length).fill(0);
  result[peakIndex] = peakValue;
  return result;
}