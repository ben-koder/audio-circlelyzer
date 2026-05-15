# Audio Circlelyzer

Exploring the theory of circular signal analysis and demonstrating it in a
browser-based implementation.

## Circular analysis

The core idea explored in this project is the realization that the circular
property of the FFT — normally something that has to be worked around — can
be turned into a powerful benefit. Stimuli are designed and recorded as
period-`N` circular signals; transfer functions, impulse responses and
nonlinear behaviour are then recovered from a *single* DFT pair without any
windowing, zero-padding, or deconvolution kernel.

The full theoretical development lives in [`theory/`](theory/):
[`CIRCULAR_SIGNAL_ANALYSIS.md`](theory/CIRCULAR_SIGNAL_ANALYSIS.md),
[`CIRCULAR_SIGNAL_DESIGN.md`](theory/CIRCULAR_SIGNAL_DESIGN.md),
[`CIRCULAR_SIGNAL_PHASE_ANALYSIS.md`](theory/CIRCULAR_SIGNAL_PHASE_ANALYSIS.md),
[`CIRCULAR_NONLINEAR-SIGNAL_ANALYSIS.md`](theory/CIRCULAR_NONLINEAR-SIGNAL_ANALYSIS.md),
and
[`CIRCULAR_NONLINEAR_REGRESSION.md`](theory/CIRCULAR_NONLINEAR_REGRESSION.md).

### AI

This project has also been a test of AI's capabilities for both theory and
implementation. While most of the fundamental ideas (theory and architecture)
are the authors, most code, theory descriptions and derivations are AI generated.

## Key highlights of circular signal analysis compared to traditional methods

- **No deconvolution, no windowing.** A periodic stimulus turns
  convolution into circular multiplication: `H = Y / X` is exact across
  the whole spectrum in a single DFT pair, with no leakage and no
  windowing bias.
- **Coherent multi-cycle averaging.** Successive periods of the same
  stimulus add in phase, so noise drops as `1/√n` while distortion stays
  put — averaging itself becomes a noise / nonlinearity discriminator.
- **Stimulus phase as a design variable.** Random-phase white,
  Zadoff–Chu perfect chirps and sparse multisines share the same
  magnitude spectrum but expose very different aspects of nonlinearity
  through phase structure alone.
- **Frequency-multiplexed multi-source MIMO.** Several speakers can
  emit disjoint bin sets in the same period — exact source separation
  in one recording, no time-division and no orthogonal codes.
- **Phase analysis without unwrapping.** Group delay is computed
  directly from a single DFT pair via the circular shift theorem;
  unwrapped phase, sub-sample alignment and minimum-/excess-phase
  decomposition all follow from it.
- **Gray-box nonlinear identification.** Under steady-state circular
  excitation a polynomial ODE collapses to a single overdetermined
  *linear* least-squares problem in the unknown coefficients — fit
  Duffing-type loudspeaker models without iterative nonlinear solvers.
- **Built-in circular-aliasing diagnostics.** A wrapped impulse tail
  shows up as a phase signature, so the `period > RT60` condition can
  be visually verified.

## Key application features



- **Pure browser, zero install.** Angular SPA + Rust/WASM DSP core +
  AudioWorklet I/O; runs against the local microphone or a built-in
  simulator in any modern desktop browser.
- **Live circular recording engine.** Period-locked playback / capture
  into a shared circular buffer with on-the-fly multi-cycle averaging
  and a position-offset slider for manual impulse alignment.
- **Stimulus library.** Perfect white (random-phase), Zadoff–Chu chirps
  with selectable root, pink noise, sparse multisines for
  intermodulation work, and arbitrary uploaded WAV files.
- **Preset-driven analysis pipelines.** YAML presets describe a small
  scripting language wiring DSP nodes into visualisations: basic /
  unrolled impulse response, transfer function, phase & group delay,
  octave analysis, room analysis (RT60 / clarity), multi-source MIMO,
  Zadoff–Chu nonlinear analysis, and polynomial gray-box regression
  (matched and joint).
- **Recording library.** Captured runs are archived to IndexedDB
  together with the preset that produced them; settings panels lock to
  the recording's configuration while still letting you stage new
  settings for the next live take.
- **Validation fixtures.** A Python generator
  ([`testdata/`](testdata/)) ships deterministic synthetic recordings
  and reference outputs, so in-browser numerical results can be
  cross-checked against ground truth.
- **GPU-accelerated plotting.** WebGL2 / WebGPU line, heatmap and 3D
  plots with interactive zoom and percentile-based autoscale.

## Pre-release

The software is usable, but there are bugs and know issues.

## License

Released under the [GNU General Public License v3.0](LICENSE).
