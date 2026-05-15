export interface PhaseDelayExpectedDocument {
  version: 1;
  kind: 'phase-delay';
  sampleRate: number;
  expectedDelaysSamples: number[];
  minimumPhaseTaps?: Record<string, number[]>;
  toleranceSamples: number;
}

export interface RoomRt60ExpectedDocument {
  version: 1;
  kind: 'room-rt60';
  sampleRate: number;
  expectedRt60Seconds: number[];
  directDelaysSamples?: number[];
  toleranceSeconds: number;
  toleranceSamples?: number;
}

export interface MultiSourcePathExpectation {
  delaySamples: number;
  gain: number;
}

export interface MultiSourceMatrixExpectedDocument {
  version: 1;
  kind: 'multi-source-matrix';
  sampleRate: number;
  paths: Record<string, MultiSourcePathExpectation>;
  toleranceSamples: number;
  gainTolerance?: number;
}

export interface NonlinearChannelExpectation {
  H1Delay: number;
  H2Delay: number;
  H3Delay: number;
  relativeLevels: number[];
}

export interface NonlinearHarmonicsExpectedDocument {
  version: 1;
  kind: 'nonlinear-harmonics';
  sampleRate: number;
  channels: Record<string, NonlinearChannelExpectation>;
  toleranceSamples: number;
  relativeLevelTolerance?: number;
}

export interface PolyRegressionJointExpectedDocument {
  version: 1;
  kind: 'nonlinear-poly-regression-joint';
  sampleRate: number;
  model: {
    derivatives: number;
    degree: number;
  };
  expectedCoefficients: Record<string, number>;
  dominantMonomials: string[];
  coefficientRelativeTolerance: number;
  zeroCoefficientAbsTolerance?: number;
}

export interface PolyRegressionMatchedTapExpectation {
  delaySamples: number;
  gain: number;
}

export interface PolyRegressionMatchedExpectedDocument {
  version: 1;
  kind: 'nonlinear-poly-regression-matched';
  sampleRate: number;
  model: {
    derivatives: number;
    degree: number;
    root: number;
    orders: number[];
  };
  harmonicKernels: Record<string, { taps: PolyRegressionMatchedTapExpectation[] }>;
  expectedOrders: string[];
  toleranceSamples: number;
}

export type DemoExpectedDocument =
  | PhaseDelayExpectedDocument
  | RoomRt60ExpectedDocument
  | MultiSourceMatrixExpectedDocument
  | NonlinearHarmonicsExpectedDocument
  | PolyRegressionJointExpectedDocument
  | PolyRegressionMatchedExpectedDocument;

export interface DemoValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
}

export interface DemoValidationReport {
  demoId: string;
  expectedKind: DemoExpectedDocument['kind'];
  passed: boolean;
  summary: string;
  checks: DemoValidationCheck[];
}