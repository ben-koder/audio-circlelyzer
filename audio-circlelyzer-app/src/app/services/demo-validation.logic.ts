import {
  DemoExpectedDocument,
  DemoValidationCheck,
  DemoValidationReport,
  MultiSourceMatrixExpectedDocument,
  NonlinearHarmonicsExpectedDocument,
  PhaseDelayExpectedDocument,
  PolyRegressionJointExpectedDocument,
  PolyRegressionMatchedExpectedDocument,
  RoomRt60ExpectedDocument,
} from '../models/demo-validation';

type SnapshotResults = Record<string, any>;

export function parseDemoExpectedDocument(value: unknown): DemoExpectedDocument {
  if (!isRecord(value) || value['version'] !== 1 || typeof value['kind'] !== 'string') {
    throw new Error('Expected validation document is invalid');
  }

  const kind = value['kind'];
  switch (kind) {
    case 'phase-delay':
      return {
        version: 1,
        kind,
        sampleRate: readRequiredNumber(value['sampleRate'], 'sampleRate'),
        expectedDelaysSamples: readNumberArray(value['expectedDelaysSamples'], 'expectedDelaysSamples'),
        minimumPhaseTaps: readOptionalNumberRecord(value['minimumPhaseTaps']),
        toleranceSamples: readRequiredNumber(value['toleranceSamples'], 'toleranceSamples'),
      };
    case 'room-rt60':
      return {
        version: 1,
        kind,
        sampleRate: readRequiredNumber(value['sampleRate'], 'sampleRate'),
        expectedRt60Seconds: readNumberArray(value['expectedRt60Seconds'], 'expectedRt60Seconds'),
        directDelaysSamples: readOptionalNumberArray(value['directDelaysSamples'], 'directDelaysSamples'),
        toleranceSeconds: readRequiredNumber(value['toleranceSeconds'], 'toleranceSeconds'),
        toleranceSamples: readOptionalNumber(value['toleranceSamples']),
      };
    case 'multi-source-matrix':
      return {
        version: 1,
        kind,
        sampleRate: readRequiredNumber(value['sampleRate'], 'sampleRate'),
        paths: readPathRecord(value['paths']),
        toleranceSamples: readRequiredNumber(value['toleranceSamples'], 'toleranceSamples'),
        gainTolerance: readOptionalNumber(value['gainTolerance']),
      };
    case 'nonlinear-harmonics':
      return {
        version: 1,
        kind,
        sampleRate: readRequiredNumber(value['sampleRate'], 'sampleRate'),
        channels: readNonlinearChannelRecord(value['channels']),
        toleranceSamples: readRequiredNumber(value['toleranceSamples'], 'toleranceSamples'),
        relativeLevelTolerance: readOptionalNumber(value['relativeLevelTolerance']),
      };
    case 'nonlinear-poly-regression-joint':
      return {
        version: 1,
        kind,
        sampleRate: readRequiredNumber(value['sampleRate'], 'sampleRate'),
        model: readPolyRegressionModel(value['model']),
        expectedCoefficients: readNumberRecord(value['expectedCoefficients'], 'expectedCoefficients'),
        dominantMonomials: readStringArray(value['dominantMonomials'], 'dominantMonomials'),
        coefficientRelativeTolerance: readRequiredNumber(value['coefficientRelativeTolerance'], 'coefficientRelativeTolerance'),
        zeroCoefficientAbsTolerance: readOptionalNumber(value['zeroCoefficientAbsTolerance']),
      };
    case 'nonlinear-poly-regression-matched':
      return {
        version: 1,
        kind,
        sampleRate: readRequiredNumber(value['sampleRate'], 'sampleRate'),
        model: readPolyRegressionMatchedModel(value['model']),
        harmonicKernels: readPolyRegressionHarmonicKernels(value['harmonicKernels']),
        expectedOrders: readStringArray(value['expectedOrders'], 'expectedOrders'),
        toleranceSamples: readRequiredNumber(value['toleranceSamples'], 'toleranceSamples'),
      };
    default:
      throw new Error(`Unsupported validation document kind: ${kind}`);
  }
}

export function getRequiredResultKeys(expected: DemoExpectedDocument): string[] {
  switch (expected.kind) {
    case 'phase-delay':
      return ['H_c_gd'];
    case 'room-rt60':
      return ['rt60', 'h_c'];
    case 'multi-source-matrix':
      return ['h_src'];
    case 'nonlinear-harmonics':
      return ['h_harm', 'harm_levels'];
    case 'nonlinear-poly-regression-joint':
      return ['poly_fit'];
    case 'nonlinear-poly-regression-matched':
      return ['poly_fits'];
  }
}

export function validateDemoExpected(
  demoId: string,
  expected: DemoExpectedDocument,
  snapshot: SnapshotResults,
): DemoValidationReport {
  let checks: DemoValidationCheck[];

  switch (expected.kind) {
    case 'phase-delay':
      checks = validatePhaseDelay(expected, snapshot);
      break;
    case 'room-rt60':
      checks = validateRoomRt60(expected, snapshot);
      break;
    case 'multi-source-matrix':
      checks = validateMultiSourceMatrix(expected, snapshot);
      break;
    case 'nonlinear-harmonics':
      checks = validateNonlinearHarmonics(expected, snapshot);
      break;
    case 'nonlinear-poly-regression-joint':
      checks = validatePolyRegressionJoint(expected, snapshot);
      break;
    case 'nonlinear-poly-regression-matched':
      checks = validatePolyRegressionMatched(expected, snapshot);
      break;
  }

  const passedCount = checks.filter((check) => check.passed).length;
  return {
    demoId,
    expectedKind: expected.kind,
    passed: passedCount === checks.length,
    summary: `${passedCount}/${checks.length} checks passed`,
    checks,
  };
}

function validatePhaseDelay(
  expected: PhaseDelayExpectedDocument,
  snapshot: SnapshotResults,
): DemoValidationCheck[] {
  const channels = readNestedNumberArrays(snapshot['H_c_gd'], 'H_c_gd');
  return expected.expectedDelaysSamples.map((expectedDelay, channelIndex) => {
    const actualDelay = estimateBoundedMedian(channels[channelIndex]);
    return createToleranceCheck(
      `phase-delay-${channelIndex}`,
      `Channel ${channelIndex + 1} phase delay`,
      actualDelay,
      expectedDelay,
      expected.toleranceSamples,
      'samples',
    );
  });
}

function validateRoomRt60(
  expected: RoomRt60ExpectedDocument,
  snapshot: SnapshotResults,
): DemoValidationCheck[] {
  const rt60Channels = readObjectArray(snapshot['rt60'], 'rt60');
  const impulseChannels = readNestedNumberArrays(snapshot['h_c'], 'h_c');
  const checks: DemoValidationCheck[] = [];

  expected.expectedRt60Seconds.forEach((expectedRt60, channelIndex) => {
    const actualRt60 = readPreferredRt60(rt60Channels[channelIndex]);
    checks.push(createToleranceCheck(
      `room-rt60-${channelIndex}`,
      `Channel ${channelIndex + 1} RT60`,
      actualRt60,
      expectedRt60,
      expected.toleranceSeconds,
      's',
    ));
  });

  if (expected.directDelaysSamples && expected.directDelaysSamples.length > 0) {
    const delayTolerance = expected.toleranceSamples ?? 8;
    expected.directDelaysSamples.forEach((expectedDelay, channelIndex) => {
      const peak = findPeak(impulseChannels[channelIndex]);
      checks.push(createToleranceCheck(
        `room-delay-${channelIndex}`,
        `Channel ${channelIndex + 1} direct-path delay`,
        peak.index,
        expectedDelay,
        delayTolerance,
        'samples',
      ));
    });
  }

  return checks;
}

function validateMultiSourceMatrix(
  expected: MultiSourceMatrixExpectedDocument,
  snapshot: SnapshotResults,
): DemoValidationCheck[] {
  const impulseChannels = readNestedNumberArrays(snapshot['h_src'], 'h_src');
  const checks: DemoValidationCheck[] = [];
  const gainTolerance = expected.gainTolerance ?? 0.1;
  const pathEntries = Object.entries(expected.paths);
  const pathPeaks = pathEntries.map(([, pathExpectation], channelIndex) => ({
    expectation: pathExpectation,
    peak: findPeak(impulseChannels[channelIndex]),
  }));
  const referenceActualGain = pathPeaks[0]?.peak.value || 1;
  const referenceExpectedGain = pathPeaks[0]?.expectation.gain || 1;

  pathEntries.forEach(([pathLabel, pathExpectation], channelIndex) => {
    const peak = pathPeaks[channelIndex].peak;
    checks.push(createToleranceCheck(
      `${pathLabel}-delay`,
      `${humanizeKey(pathLabel)} delay`,
      peak.index,
      pathExpectation.delaySamples,
      expected.toleranceSamples,
      'samples',
    ));

    const actualRelativeGain = referenceActualGain > 0 ? peak.value / referenceActualGain : peak.value;
    const expectedRelativeGain = referenceExpectedGain > 0
      ? pathExpectation.gain / referenceExpectedGain
      : pathExpectation.gain;
    checks.push(createToleranceCheck(
      `${pathLabel}-gain`,
      `${humanizeKey(pathLabel)} relative gain`,
      actualRelativeGain,
      expectedRelativeGain,
      gainTolerance,
      '',
    ));
  });

  return checks;
}

function validateNonlinearHarmonics(
  expected: NonlinearHarmonicsExpectedDocument,
  snapshot: SnapshotResults,
): DemoValidationCheck[] {
  const harmonicImpulses = readNestedNumberArrays(snapshot['h_harm'], 'h_harm');
  const harmonicSummaries = readObjectArray(snapshot['harm_levels'], 'harm_levels');
  const checks: DemoValidationCheck[] = [];
  const levelTolerance = expected.relativeLevelTolerance ?? 0.05;
  const channelEntries = Object.entries(expected.channels);
  const summaryLevelsByChannel = channelEntries.map(([, channelExpectation], channelIndex) =>
    readNumberArray(
      isRecord(harmonicSummaries[channelIndex]) ? harmonicSummaries[channelIndex]['rmsValues'] : null,
      `harm_levels[${channelIndex}].rmsValues`,
    )
  );
  const referenceActualLevel = summaryLevelsByChannel[0]?.[0] ?? 0;
  const referenceExpectedLevel = channelEntries[0]?.[1].relativeLevels[0] ?? 0;

  channelEntries.forEach(([channelLabel, channelExpectation], channelIndex) => {
    const expectedDelays = [channelExpectation.H1Delay, channelExpectation.H2Delay, channelExpectation.H3Delay];
    const summaryLevels = summaryLevelsByChannel[channelIndex];

    expectedDelays.forEach((expectedDelay, harmonicIndex) => {
      const peak = findPeak(harmonicImpulses[channelIndex * 3 + harmonicIndex]);
      checks.push(createToleranceCheck(
        `${channelLabel}-H${harmonicIndex + 1}-delay`,
        `${channelLabel} H${harmonicIndex + 1} delay`,
        peak.index,
        expectedDelay,
        expected.toleranceSamples,
        'samples',
      ));
    });

    channelExpectation.relativeLevels.forEach((expectedLevel, harmonicIndex) => {
      const actualRelativeLevel = referenceActualLevel > 0
        ? summaryLevels[harmonicIndex] / referenceActualLevel
        : summaryLevels[harmonicIndex];
      const expectedRelativeLevel = referenceExpectedLevel > 0
        ? expectedLevel / referenceExpectedLevel
        : expectedLevel;
      checks.push(createToleranceCheck(
        `${channelLabel}-H${harmonicIndex + 1}-level`,
        `${channelLabel} H${harmonicIndex + 1} level`,
        actualRelativeLevel,
        expectedRelativeLevel,
        levelTolerance,
        '',
      ));
    });
  });

  return checks;
}

function validatePolyRegressionJoint(
  expected: PolyRegressionJointExpectedDocument,
  snapshot: SnapshotResults,
): DemoValidationCheck[] {
  const fits = readObjectArray(snapshot['poly_fit'], 'poly_fit');
  const fit = fits[0] ?? {};
  const labels = readStringArray(fit['monomialLabels'], 'poly_fit[0].monomialLabels');
  const coeffs = readNumberArray(fit['coeffs'], 'poly_fit[0].coeffs');
  const checks: DemoValidationCheck[] = [];
  const zeroTolerance = expected.zeroCoefficientAbsTolerance ?? 0;

  Object.entries(expected.expectedCoefficients).forEach(([label, expectedCoefficient]) => {
    const index = labels.indexOf(label);
    const actualCoefficient = index >= 0 ? coeffs[index] : Number.NaN;
    const tolerance = Math.max(Math.abs(expectedCoefficient) * expected.coefficientRelativeTolerance, zeroTolerance);
    checks.push(createToleranceCheck(
      `poly-joint-${label}`,
      `Joint coefficient ${label}`,
      actualCoefficient,
      expectedCoefficient,
      tolerance,
      '',
    ));
  });

  const residualNorm = typeof fit['residualNorm'] === 'number' ? fit['residualNorm'] : Number.NaN;
  const rhsNorm = typeof fit['rhsNorm'] === 'number' ? fit['rhsNorm'] : Number.NaN;
  const relativeResidual = rhsNorm > 0 ? residualNorm / rhsNorm : Number.NaN;
  checks.push(createToleranceCheck(
    'poly-joint-relative-residual',
    'Joint relative residual',
    relativeResidual,
    0,
    0.1,
    '',
  ));

  return checks;
}

function validatePolyRegressionMatched(
  expected: PolyRegressionMatchedExpectedDocument,
  snapshot: SnapshotResults,
): DemoValidationCheck[] {
  const fits = readObjectArray(snapshot['poly_fits'], 'poly_fits');
  const checks: DemoValidationCheck[] = [];

  expected.expectedOrders.forEach((orderLabel, orderIndex) => {
    const fit = fits[orderIndex] ?? {};
    const labels = Array.isArray(fit['monomialLabels'])
      ? readStringArray(fit['monomialLabels'], `poly_fits[${orderIndex}].monomialLabels`)
      : [];
    const coeffs = Array.isArray(fit['coeffs'])
      ? readNumberArray(fit['coeffs'], `poly_fits[${orderIndex}].coeffs`)
      : [];
    checks.push(createBooleanCheck(
      `poly-matched-${orderLabel}-coefficients`,
      `${orderLabel} coefficient series`,
      labels.length > 0 && coeffs.length === labels.length,
      `${coeffs.length} coefficients`,
      'non-empty coefficient series',
    ));
  });

  return checks;
}

function createToleranceCheck(
  id: string,
  label: string,
  actual: number,
  expected: number,
  tolerance: number,
  unit: string,
): DemoValidationCheck {
  const unitSuffix = unit ? ` ${unit}` : '';
  return {
    id,
    label,
    passed: Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    actual: Number.isFinite(actual) ? `${formatNumber(actual)}${unitSuffix}` : 'Unavailable',
    expected: `${formatNumber(expected)} +/- ${formatNumber(tolerance)}${unitSuffix}`,
  };
}

function createBooleanCheck(
  id: string,
  label: string,
  passed: boolean,
  actual: string,
  expected: string,
): DemoValidationCheck {
  return { id, label, passed, actual, expected };
}

function findPeak(values: number[]): { index: number; value: number } {
  if (values.length === 0) {
    return { index: Number.NaN, value: Number.NaN };
  }

  let bestIndex = 0;
  let bestValue = Math.abs(values[0]);
  for (let index = 1; index < values.length; index += 1) {
    const magnitude = Math.abs(values[index]);
    if (magnitude > bestValue) {
      bestValue = magnitude;
      bestIndex = index;
    }
  }

  return {
    index: bestIndex,
    value: bestValue,
  };
}

function estimateBoundedMedian(values: number[]): number {
  const halfWindow = values.slice(1, Math.floor(values.length / 2));
  const finite = halfWindow.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return Number.NaN;
  }

  const bounded = finite.filter((value) => Math.abs(value) <= 512);
  return median(bounded.length > 0 ? bounded : finite);
}

function readPreferredRt60(value: unknown): number {
  if (!isRecord(value)) {
    return Number.NaN;
  }

  const candidates = [value['t30'], value['t20'], value['topt'], value['edt']]
    .map(readRt60Candidate)
    .filter((candidate): candidate is Rt60Candidate => candidate !== null);

  const reliableCandidate = candidates.find((candidate) => candidate.isReliable);
  if (reliableCandidate) {
    return reliableCandidate.value;
  }

  const bestCorrelatedCandidate = candidates.reduce<Rt60Candidate | null>((best, candidate) => {
    if (!best) {
      return candidate;
    }

    return Math.abs(candidate.correlation) > Math.abs(best.correlation) ? candidate : best;
  }, null);
  if (bestCorrelatedCandidate) {
    return bestCorrelatedCandidate.value;
  }

  return typeof value['rt60'] === 'number' ? value['rt60'] : Number.NaN;
}

interface Rt60Candidate {
  value: number;
  correlation: number;
  isReliable: boolean;
}

function readRt60Candidate(value: unknown): Rt60Candidate | null {
  if (!isRecord(value) || typeof value['value'] !== 'number') {
    return null;
  }

  return {
    value: value['value'],
    correlation: typeof value['correlation'] === 'number' ? value['correlation'] : 0,
    isReliable: value['isReliable'] === true,
  };
}

function median(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function readNestedNumberArrays(value: unknown, fieldName: string): number[][] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of channels`);
  }

  return value.map((entry, index) => readNumberArray(entry, `${fieldName}[${index}]`));
}

function readObjectArray(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${fieldName}[${index}] must be an object`);
    }
    return entry;
  });
}

function readNumberArray(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value.map((entry, index) => readRequiredNumber(entry, `${fieldName}[${index}]`));
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${fieldName}[${index}] must be a string`);
    }
    return entry;
  });
}

function readOptionalNumberArray(value: unknown, fieldName: string): number[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readNumberArray(value, fieldName);
}

function readOptionalNumberRecord(value: unknown): Record<string, number[]> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error('minimumPhaseTaps must be an object');
  }

  const record: Record<string, number[]> = {};
  Object.entries(value).forEach(([key, entry]) => {
    record[key] = readNumberArray(entry, `minimumPhaseTaps.${key}`);
  });
  return record;
}

function readNumberRecord(value: unknown, fieldName: string): Record<string, number> {
  if (!isRecord(value)) {
    throw new Error(`${fieldName} must be an object`);
  }

  const record: Record<string, number> = {};
  Object.entries(value).forEach(([key, entry]) => {
    record[key] = readRequiredNumber(entry, `${fieldName}.${key}`);
  });
  return record;
}

function readPathRecord(value: unknown): MultiSourceMatrixExpectedDocument['paths'] {
  if (!isRecord(value)) {
    throw new Error('paths must be an object');
  }

  const record: MultiSourceMatrixExpectedDocument['paths'] = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (!isRecord(entry)) {
      throw new Error(`paths.${key} must be an object`);
    }

    record[key] = {
      delaySamples: readRequiredNumber(entry['delaySamples'], `paths.${key}.delaySamples`),
      gain: readRequiredNumber(entry['gain'], `paths.${key}.gain`),
    };
  });
  return record;
}

function readNonlinearChannelRecord(value: unknown): NonlinearHarmonicsExpectedDocument['channels'] {
  if (!isRecord(value)) {
    throw new Error('channels must be an object');
  }

  const record: NonlinearHarmonicsExpectedDocument['channels'] = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (!isRecord(entry)) {
      throw new Error(`channels.${key} must be an object`);
    }

    record[key] = {
      H1Delay: readRequiredNumber(entry['H1Delay'], `channels.${key}.H1Delay`),
      H2Delay: readRequiredNumber(entry['H2Delay'], `channels.${key}.H2Delay`),
      H3Delay: readRequiredNumber(entry['H3Delay'], `channels.${key}.H3Delay`),
      relativeLevels: readNumberArray(entry['relativeLevels'], `channels.${key}.relativeLevels`),
    };
  });
  return record;
}

function readPolyRegressionModel(value: unknown): PolyRegressionJointExpectedDocument['model'] {
  if (!isRecord(value)) {
    throw new Error('model must be an object');
  }
  return {
    derivatives: readRequiredNumber(value['derivatives'], 'model.derivatives'),
    degree: readRequiredNumber(value['degree'], 'model.degree'),
  };
}

function readPolyRegressionMatchedModel(value: unknown): PolyRegressionMatchedExpectedDocument['model'] {
  if (!isRecord(value)) {
    throw new Error('model must be an object');
  }
  return {
    derivatives: readRequiredNumber(value['derivatives'], 'model.derivatives'),
    degree: readRequiredNumber(value['degree'], 'model.degree'),
    root: readRequiredNumber(value['root'], 'model.root'),
    orders: readNumberArray(value['orders'], 'model.orders'),
  };
}

function readPolyRegressionHarmonicKernels(value: unknown): PolyRegressionMatchedExpectedDocument['harmonicKernels'] {
  if (!isRecord(value)) {
    throw new Error('harmonicKernels must be an object');
  }

  const record: PolyRegressionMatchedExpectedDocument['harmonicKernels'] = {};
  Object.entries(value).forEach(([orderLabel, entry]) => {
    if (!isRecord(entry)) {
      throw new Error(`harmonicKernels.${orderLabel} must be an object`);
    }
    const tapsValue = entry['taps'];
    if (!Array.isArray(tapsValue)) {
      throw new Error(`harmonicKernels.${orderLabel}.taps must be an array`);
    }
    record[orderLabel] = {
      taps: tapsValue.map((tap, tapIndex) => {
        if (!isRecord(tap)) {
          throw new Error(`harmonicKernels.${orderLabel}.taps[${tapIndex}] must be an object`);
        }
        return {
          delaySamples: readRequiredNumber(tap['delaySamples'], `harmonicKernels.${orderLabel}.taps[${tapIndex}].delaySamples`),
          gain: readRequiredNumber(tap['gain'], `harmonicKernels.${orderLabel}.taps[${tapIndex}].gain`),
        };
      }),
    };
  });
  return record;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${fieldName} must be a number`);
  }
  return value;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error('Expected optional numeric field to be a number');
  }

  return value;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return 'NaN';
  }

  const absValue = Math.abs(value);
  if (absValue >= 100 || Number.isInteger(value)) {
    return value.toFixed(0);
  }

  if (absValue >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function humanizeKey(value: string): string {
  return value.replace(/_/g, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}