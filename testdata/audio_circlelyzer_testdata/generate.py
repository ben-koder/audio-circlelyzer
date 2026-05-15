from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .archive import build_archive_document, write_archive, write_json
from .signals import frequency_division_perfect_white, perfect_pink, perfect_white, zadoff_chu_real
from .systems import circular_convolve, delayed_minimum_phase_ir, exponential_room_ir, impulse_kernel, polynomial_harmonic_response, repeat_cycles

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_TESTDATA_DIR = ROOT / 'audio-circlelyzer-app' / 'public' / 'testdata'
RECORDINGS_DIR = PUBLIC_TESTDATA_DIR / 'recordings'
EXPECTED_DIR = PUBLIC_TESTDATA_DIR / 'expected'
GENERATED_AT = '2026-04-26T00:00:00Z'
SAMPLE_RATE = 48_000.0


@dataclass(frozen=True)
class DemoFixture:
  manifest_entry: dict
  archive_document: dict
  expected_document: dict


def build_phase_delay_fixture() -> DemoFixture:
  nc = 8192
  cycles = 4
  excitation = perfect_white(nc, seed=101)
  h0 = delayed_minimum_phase_ir(nc, 48, [1.0, 0.42, 0.16])
  h1 = delayed_minimum_phase_ir(nc, 160, [1.0, 0.35, 0.11])
  y0 = circular_convolve(excitation, h0)
  y1 = circular_convolve(excitation, h1)

  archive = build_archive_document(
    archive_id='demo-phase-delay',
    name='Demo · Phase Delay Reference',
    created_at=GENERATED_AT,
    capture_mode='simulated',
    source_type='perfect_white',
    resolved_source={
      'sourceType': 'perfect_white',
      'groupId': 'noise-excitation',
      'signalType': 'PERFECT_WHITE',
      'circularLength': nc,
      'logicalSourceCount': 1,
      'outputChannelCount': 2,
      'routingMode': 'mirrored_mono',
    },
    sample_rate=SAMPLE_RATE,
    circular_length=nc,
    recording_position=0,
    source_channel_count=1,
    preset_id='phase-analysis',
    preset_name='Phase Analysis',
    excitation_channels=[excitation],
    recorded_channels=[repeat_cycles(y0, cycles), repeat_cycles(y1, cycles)],
    notes='Synthetic delayed minimum-phase FIR responses for group and phase-delay validation.',
  )

  expected = {
    'version': 1,
    'kind': 'phase-delay',
    'sampleRate': SAMPLE_RATE,
    'expectedDelaysSamples': [48, 160],
    'minimumPhaseTaps': {
      'channel0': [1.0, 0.42, 0.16],
      'channel1': [1.0, 0.35, 0.11],
    },
    'toleranceSamples': 8,
  }

  manifest = {
    'id': 'phase-delay-reference',
    'title': 'Phase Delay Reference',
    'description': 'Two delayed minimum-phase FIR channels for validating group delay, phase delay, and aligned impulse reconstruction.',
    'category': 'phase',
    'presetIds': ['phase-analysis'],
    'archivePath': '/testdata/recordings/phase-delay-reference.recording.yaml',
    'expectedPath': '/testdata/expected/phase-delay-reference.json',
    'tags': ['delay', 'minimum-phase', 'group-delay'],
    'recommendedCursorRatios': [1.0],
    'sourceSummary': 'Perfect white circular excitation mirrored to both outputs.',
    'systemSummary': 'Two channels with distinct delayed minimum-phase FIR responses.',
    'validationTargets': ['Delay alignment', 'Group delay shape', 'Phase delay consistency'],
    'notes': 'Channel 0 delay is 48 samples. Channel 1 delay is 160 samples.',
  }
  return DemoFixture(manifest, archive, expected)


def build_room_rt_fixture() -> DemoFixture:
  nc = 32768
  cycles = 8
  excitation = perfect_pink(nc, seed=202)
  h0 = exponential_room_ir(nc, SAMPLE_RATE, 0.35, 28, [(120, 0.45), (330, 0.2)])
  h1 = exponential_room_ir(nc, SAMPLE_RATE, 0.62, 44, [(140, 0.38), (410, 0.24)])
  y0 = circular_convolve(excitation, h0)
  y1 = circular_convolve(excitation, h1)

  archive = build_archive_document(
    archive_id='demo-room-rt',
    name='Demo · Room RT Reference',
    created_at=GENERATED_AT,
    capture_mode='simulated',
    source_type='perfect_pink',
    resolved_source={
      'sourceType': 'perfect_pink',
      'groupId': 'noise-excitation',
      'signalType': 'PERFECT_PINK',
      'circularLength': nc,
      'logicalSourceCount': 1,
      'outputChannelCount': 2,
      'routingMode': 'mirrored_mono',
    },
    sample_rate=SAMPLE_RATE,
    circular_length=nc,
    recording_position=0,
    source_channel_count=1,
    preset_id='room-analysis',
    preset_name='Room Analysis',
    excitation_channels=[excitation],
    recorded_channels=[repeat_cycles(y0, cycles), repeat_cycles(y1, cycles)],
    notes='Two deterministic exponentially decaying room responses with distinct RT60 values.',
  )

  expected = {
    'version': 1,
    'kind': 'room-rt60',
    'sampleRate': SAMPLE_RATE,
    'expectedRt60Seconds': [0.35, 0.62],
    'directDelaysSamples': [28, 44],
    'toleranceSeconds': 0.1,
    'toleranceSamples': 6,
  }

  manifest = {
    'id': 'room-rt-reference',
    'title': 'Room RT Reference',
    'description': 'Two synthetic room responses with known reverberation times for RT60 regression and decay-curve sanity checks.',
    'category': 'room',
    'presetIds': ['room-analysis'],
    'archivePath': '/testdata/recordings/room-rt-reference.recording.yaml',
    'expectedPath': '/testdata/expected/room-rt-reference.json',
    'tags': ['rt60', 'room', 'decay'],
    'recommendedCursorRatios': [1.0],
    'sourceSummary': 'Perfect pink excitation mirrored to two outputs.',
    'systemSummary': 'Channel-specific room impulse responses with RT60 = 0.35 s and 0.62 s.',
    'validationTargets': ['RT60 estimate', 'Impulse timing', 'Decay-curve shape'],
    'notes': 'The direct path arrives earlier on channel 0 and the longer decay appears on channel 1.',
  }
  return DemoFixture(manifest, archive, expected)


def build_multisource_fixture() -> DemoFixture:
  nc = 32768
  cycles = 8
  source0 = frequency_division_perfect_white(nc, 0, 2, seed=303)
  source1 = frequency_division_perfect_white(nc, 1, 2, seed=303)
  h00 = impulse_kernel(nc, [(18, 1.0), (42, 0.18)])
  h01 = impulse_kernel(nc, [(84, 0.34), (130, 0.1)])
  h10 = impulse_kernel(nc, [(46, 0.52), (92, 0.14)])
  h11 = impulse_kernel(nc, [(118, 0.85), (170, 0.22)])
  y0 = circular_convolve(source0, h00) + circular_convolve(source1, h01)
  y1 = circular_convolve(source0, h10) + circular_convolve(source1, h11)

  archive = build_archive_document(
    archive_id='demo-multisource-matrix',
    name='Demo · 2x2 Multi-Source Matrix',
    created_at=GENERATED_AT,
    capture_mode='simulated',
    source_type='multi_source_white',
    resolved_source={
      'sourceType': 'multi_source_white',
      'groupId': 'frequency-division-multi-source',
      'signalType': 'MULTI_SOURCE_WHITE',
      'circularLength': nc,
      'logicalSourceCount': 2,
      'outputChannelCount': 2,
      'routingMode': 'direct',
    },
    sample_rate=SAMPLE_RATE,
    circular_length=nc,
    recording_position=0,
    source_channel_count=2,
    preset_id='multi-source-octave-analysis',
    preset_name='Multi-Source Octave Analysis',
    excitation_channels=[source0, source1],
    recorded_channels=[repeat_cycles(y0.astype(np.float32), cycles), repeat_cycles(y1.astype(np.float32), cycles)],
    notes='Deterministic 2x2 transfer matrix for frequency-division source separation.',
  )

  expected = {
    'version': 1,
    'kind': 'multi-source-matrix',
    'sampleRate': SAMPLE_RATE,
    'paths': {
      'source0_to_mic0': {'delaySamples': 18, 'gain': 1.0},
      'source1_to_mic0': {'delaySamples': 84, 'gain': 0.34},
      'source0_to_mic1': {'delaySamples': 46, 'gain': 0.52},
      'source1_to_mic1': {'delaySamples': 118, 'gain': 0.85},
    },
    'toleranceSamples': 10,
    'gainTolerance': 0.08,
  }

  manifest = {
    'id': 'multisource-2x2-reference',
    'title': '2x2 Multi-Source Matrix',
    'description': 'Two interleaved excitation sources driving a 2x2 transfer matrix for source separation and cross-path validation.',
    'category': 'multi-source',
    'presetIds': ['multi-source-octave-analysis'],
    'archivePath': '/testdata/recordings/multisource-2x2-reference.recording.yaml',
    'expectedPath': '/testdata/expected/multisource-2x2-reference.json',
    'tags': ['mimo', 'cross-transfer', 'frequency-division'],
    'recommendedCursorRatios': [1.0],
    'sourceSummary': 'Two direct-output perfect-white sources with interleaved frequency bins.',
    'systemSummary': 'A deterministic 2x2 path matrix with unique delays and gains for each source-to-mic route.',
    'validationTargets': ['2x2 extraction', 'Cross-path separation', 'Impulse timing'],
    'notes': 'Designed to confirm that the extracted transfer matrix expands to four distinct paths.',
  }
  return DemoFixture(manifest, archive, expected)


def build_nonlinear_fixture() -> DemoFixture:
  nc = 16384
  cycles = 8
  excitation = zadoff_chu_real(nc, root=1)
  kernels_a = {
    1: impulse_kernel(nc, [(24, 1.0)]),
    2: impulse_kernel(nc, [(96, 0.22)]),
    3: impulse_kernel(nc, [(168, 0.08)]),
  }
  kernels_b = {
    1: impulse_kernel(nc, [(52, 0.78)]),
    2: impulse_kernel(nc, [(132, 0.33)]),
    3: impulse_kernel(nc, [(220, 0.14)]),
  }
  y0 = sum(
    circular_convolve(zadoff_chu_real(nc, root=order), kernels_a[order])
    for order in sorted(kernels_a.keys())
  ).astype(np.float32)
  y1 = sum(
    circular_convolve(zadoff_chu_real(nc, root=order), kernels_b[order])
    for order in sorted(kernels_b.keys())
  ).astype(np.float32)

  archive = build_archive_document(
    archive_id='demo-nonlinear-zc',
    name='Demo · Nonlinear Harmonic Separation',
    created_at=GENERATED_AT,
    capture_mode='simulated',
    source_type='zadoff_chu',
    resolved_source={
      'sourceType': 'zadoff_chu',
      'groupId': 'nonlinear-zadoff-chu',
      'signalType': 'ZADOFF_CHU',
      'circularLength': nc,
      'logicalSourceCount': 1,
      'outputChannelCount': 2,
      'routingMode': 'mirrored_mono',
      'zadoffChuRoot': 1,
    },
    sample_rate=SAMPLE_RATE,
    circular_length=nc,
    recording_position=0,
    source_channel_count=1,
    preset_id='nonlinear-zadoff-chu-analysis',
    preset_name='Nonlinear Zadoff-Chu Analysis',
    excitation_channels=[excitation],
    recorded_channels=[repeat_cycles(y0, cycles), repeat_cycles(y1, cycles)],
    notes='Matched harmonic fixture built from distinct Zadoff-Chu order references with known impulse locations per channel.',
  )

  expected = {
    'version': 1,
    'kind': 'nonlinear-harmonics',
    'sampleRate': SAMPLE_RATE,
    'channels': {
      'channel0': {'H1Delay': 24, 'H2Delay': 96, 'H3Delay': 168, 'relativeLevels': [1.0, 0.22, 0.08]},
      'channel1': {'H1Delay': 52, 'H2Delay': 132, 'H3Delay': 220, 'relativeLevels': [0.78, 0.33, 0.14]},
    },
    'toleranceSamples': 12,
    'relativeLevelTolerance': 0.05,
  }

  manifest = {
    'id': 'nonlinear-harmonic-reference',
    'title': 'Nonlinear Harmonic Separation',
    'description': 'A two-channel matched-harmonic reference with known impulse locations for Zadoff-Chu order filtering.',
    'category': 'nonlinear',
    'presetIds': ['nonlinear-zadoff-chu-analysis'],
    'archivePath': '/testdata/recordings/nonlinear-harmonic-reference.recording.yaml',
    'expectedPath': '/testdata/expected/nonlinear-harmonic-reference.json',
    'tags': ['harmonics', 'zadoff-chu', 'nonlinear'],
    'recommendedCursorRatios': [1.0],
    'sourceSummary': 'Single Zadoff-Chu excitation mirrored to two outputs.',
    'systemSummary': 'Two channels with distinct first-, second-, and third-order matched harmonic kernels.',
    'validationTargets': ['Harmonic separation', 'Impulse stability', 'Grouped summary bars'],
    'notes': 'Designed to validate harmonic extraction and the grouped harmonic summary plot for two channels using the app\'s matched-filter Zadoff-Chu model.',
  }
  return DemoFixture(manifest, archive, expected)


def build_poly_regression_joint_fixture() -> DemoFixture:
  nc = 16384
  cycles = 8
  n = np.arange(nc, dtype=np.float64)
  harmonic_bins = np.asarray([17, 23, 29, 37, 43, 53, 61, 73, 89, 107], dtype=np.float64)
  amplitudes = np.asarray([0.12, -0.09, 0.075, 0.06, -0.052, 0.043, -0.036, 0.03, -0.024, 0.018], dtype=np.float64)
  phases = np.asarray([0.15, 0.85, 1.2, 1.7, 2.1, 0.45, 0.7, 1.95, 2.8, 2.35], dtype=np.float64)

  y = np.zeros(nc, dtype=np.float64)
  ydot = np.zeros(nc, dtype=np.float64)
  yddot = np.zeros(nc, dtype=np.float64)
  for bin_index, amplitude, phase in zip(harmonic_bins, amplitudes, phases):
    angle = 2.0 * np.pi * bin_index * n / nc + phase
    omega = 2.0 * np.pi * bin_index * SAMPLE_RATE / nc
    y += amplitude * np.sin(angle)
    ydot += amplitude * omega * np.cos(angle)
    yddot += -amplitude * omega * omega * np.sin(angle)

  raw_coefficients = {
    'y': 22000.0,
    'ydot': 18.0,
    'yddot': 1.0,
    'y^3': 12500.0,
  }
  forcing_raw = (
    raw_coefficients['y'] * y
    + raw_coefficients['ydot'] * ydot
    + raw_coefficients['yddot'] * yddot
    + raw_coefficients['y^3'] * np.power(y, 3)
  )
  forcing_scale = float(np.max(np.abs(forcing_raw)))
  excitation = (forcing_raw / forcing_scale).astype(np.float32)
  response = y.astype(np.float32)
  expected_coefficients = {key: value / forcing_scale for key, value in raw_coefficients.items()}

  archive = build_archive_document(
    archive_id='demo-poly-regression-joint',
    name='Demo · Polynomial Regression Joint Reference',
    created_at=GENERATED_AT,
    capture_mode='simulated',
    source_type='custom',
    resolved_source={
      'sourceType': 'custom',
      'groupId': 'nonlinear-poly-regression-joint',
      'signalType': 'WHITE',
      'circularLength': nc,
      'logicalSourceCount': 1,
      'outputChannelCount': 1,
      'routingMode': 'mirrored_mono',
    },
    sample_rate=SAMPLE_RATE,
    circular_length=nc,
    recording_position=0,
    source_channel_count=1,
    preset_id='nonlinear-poly-regression-joint',
    preset_name='Nonlinear Polynomial Regression (Joint)',
    excitation_channels=[excitation],
    recorded_channels=[repeat_cycles(response, cycles)],
    notes='Band-limited response y(t) with excitation u(t)=a*y+b*ydot+c*yddot+d*y^3. Coefficients are scaled by the excitation normalization factor.',
  )

  expected = {
    'version': 1,
    'kind': 'nonlinear-poly-regression-joint',
    'sampleRate': SAMPLE_RATE,
    'model': {'derivatives': 2, 'degree': 3},
    'forcingScale': forcing_scale,
    'expectedCoefficients': expected_coefficients,
    'dominantMonomials': ['y', 'ydot', 'yddot', 'y^3'],
    'coefficientRelativeTolerance': 0.05,
    'zeroCoefficientAbsTolerance': 1e-3,
    'notes': 'Expected coefficients are for the normalized excitation stored in the archive.',
  }

  manifest = {
    'id': 'nonlinear-poly-regression-joint-reference',
    'title': 'Polynomial Regression Joint Reference',
    'description': 'A deterministic Duffing-style equation-error fixture with known y, ydot, yddot, and y^3 coefficients.',
    'category': 'nonlinear',
    'presetIds': ['nonlinear-poly-regression-joint'],
    'archivePath': '/testdata/recordings/nonlinear-poly-regression-joint-reference.recording.yaml',
    'expectedPath': '/testdata/expected/nonlinear-poly-regression-joint-reference.json',
    'tags': ['polynomial-regression', 'gray-box', 'duffing'],
    'recommendedCursorRatios': [1.0],
    'sourceSummary': 'Normalized synthetic forcing u(t) generated from a known polynomial ODE.',
    'systemSummary': 'Recorded y(t) is a multi-tone periodic state with analytic derivatives.',
    'validationTargets': ['Coefficient recovery', 'Derivative-axis monomials', 'Low equation-error residual'],
    'notes': 'Use the coefficient bars to confirm y, ydot, yddot, and y^3 dominate the fit.',
  }
  return DemoFixture(manifest, archive, expected)


def build_poly_regression_matched_fixture() -> DemoFixture:
  nc = 16384
  cycles = 8
  excitation = zadoff_chu_real(nc, root=1)
  kernels = {
    1: impulse_kernel(nc, [(28, 0.9), (76, 0.12)]),
    2: impulse_kernel(nc, [(108, 0.28), (164, -0.08)]),
    3: impulse_kernel(nc, [(236, 0.11), (316, 0.04)]),
  }
  response = polynomial_harmonic_response(excitation, kernels)

  archive = build_archive_document(
    archive_id='demo-poly-regression-matched',
    name='Demo · Polynomial Regression Matched Reference',
    created_at=GENERATED_AT,
    capture_mode='simulated',
    source_type='zadoff_chu',
    resolved_source={
      'sourceType': 'zadoff_chu',
      'groupId': 'nonlinear-poly-regression-matched',
      'signalType': 'ZADOFF_CHU',
      'circularLength': nc,
      'logicalSourceCount': 1,
      'outputChannelCount': 1,
      'routingMode': 'mirrored_mono',
      'zadoffChuRoot': 1,
    },
    sample_rate=SAMPLE_RATE,
    circular_length=nc,
    recording_position=0,
    source_channel_count=1,
    preset_id='nonlinear-poly-regression-matched',
    preset_name='Nonlinear Polynomial Regression (Matched Filter)',
    excitation_channels=[excitation],
    recorded_channels=[repeat_cycles(response, cycles)],
    notes='Zadoff-Chu polynomial harmonic response fixture for per-order matched regression validation.',
  )

  expected = {
    'version': 1,
    'kind': 'nonlinear-poly-regression-matched',
    'sampleRate': SAMPLE_RATE,
    'model': {'derivatives': 2, 'degree': 3, 'root': 1, 'orders': [1, 2, 3]},
    'harmonicKernels': {
      'H1': {'taps': [{'delaySamples': 28, 'gain': 0.9}, {'delaySamples': 76, 'gain': 0.12}]},
      'H2': {'taps': [{'delaySamples': 108, 'gain': 0.28}, {'delaySamples': 164, 'gain': -0.08}]},
      'H3': {'taps': [{'delaySamples': 236, 'gain': 0.11}, {'delaySamples': 316, 'gain': 0.04}]},
    },
    'expectedOrders': ['H1', 'H2', 'H3'],
    'toleranceSamples': 12,
    'notes': 'The matched-regression demo should render one coefficient series per harmonic order without worker runtime errors.',
  }

  manifest = {
    'id': 'nonlinear-poly-regression-matched-reference',
    'title': 'Polynomial Regression Matched Reference',
    'description': 'A Zadoff-Chu polynomial harmonic fixture for validating the per-order matched regression path.',
    'category': 'nonlinear',
    'presetIds': ['nonlinear-poly-regression-matched'],
    'archivePath': '/testdata/recordings/nonlinear-poly-regression-matched-reference.recording.yaml',
    'expectedPath': '/testdata/expected/nonlinear-poly-regression-matched-reference.json',
    'tags': ['polynomial-regression', 'matched-filter', 'zadoff-chu'],
    'recommendedCursorRatios': [1.0],
    'sourceSummary': 'Single Zadoff-Chu excitation with root 1.',
    'systemSummary': 'First-, second-, and third-order polynomial harmonic response generated with known circular kernels.',
    'validationTargets': ['Matched worker execution', 'Per-order coefficient series', 'Harmonic magnitude sanity check'],
    'notes': 'Use this demo to validate that POLYREGRESSION_MATCHED runs in the worker and updates VIS_POLYFIT for H1/H2/H3.',
  }
  return DemoFixture(manifest, archive, expected)


def build_demo_fixtures() -> list[DemoFixture]:
  return [
    build_phase_delay_fixture(),
    build_room_rt_fixture(),
    build_multisource_fixture(),
    build_nonlinear_fixture(),
    build_poly_regression_joint_fixture(),
    build_poly_regression_matched_fixture(),
  ]


def write_demo_catalog(fixtures: list[DemoFixture]) -> None:
  manifest = {
    'version': 1,
    'generatedAt': GENERATED_AT,
    'demos': [fixture.manifest_entry for fixture in fixtures],
  }
  PUBLIC_TESTDATA_DIR.mkdir(parents=True, exist_ok=True)
  write_json(PUBLIC_TESTDATA_DIR / 'index.json', manifest)

  for fixture in fixtures:
    archive_path = RECORDINGS_DIR / Path(fixture.manifest_entry['archivePath']).name
    expected_path = EXPECTED_DIR / Path(fixture.manifest_entry['expectedPath']).name
    write_archive(archive_path, fixture.archive_document)
    write_json(expected_path, fixture.expected_document)


def main() -> None:
  fixtures = build_demo_fixtures()
  write_demo_catalog(fixtures)
  print(json.dumps({
    'generatedAt': GENERATED_AT,
    'fixtures': [fixture.manifest_entry['id'] for fixture in fixtures],
    'outputDir': str(PUBLIC_TESTDATA_DIR),
  }, indent=2))


if __name__ == '__main__':
  main()