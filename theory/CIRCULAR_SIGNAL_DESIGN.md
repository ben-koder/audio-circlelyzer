# Circular Signal Design: Phase Spectrum Optimization for Linear and Nonlinear Analysis (v2)

> Revised in response to the validation report
> ([../THEORY_VALIDATION_RESULT.md](../THEORY_VALIDATION_RESULT.md)).
> Substantive changes are summarised in [CHANGES.md](CHANGES.md). Key
> revisions: linear-vs-log sweep is now framed as a genuine trade-off,
> the matched-filter rule is explicitly restricted to the kernel diagonal
> for systems with memory, the degenerate boxed formula in §3.11 is
> removed, and the ZC "real-part" crest factor is clarified.

> **Companion document to [CIRCULAR_SIGNAL_ANALYSIS.md](CIRCULAR_SIGNAL_ANALYSIS.md), [CIRCULAR_NONLINEAR-SIGNAL_ANALYSIS.md](CIRCULAR_NONLINEAR-SIGNAL_ANALYSIS.md), and [CIRCULAR_SIGNAL_PHASE_ANALYSIS.md](CIRCULAR_SIGNAL_PHASE_ANALYSIS.md)**
>
> This document explores the role of the stimulus phase spectrum as a design variable in circular signal analysis. For a given magnitude spectrum (which determines SNR distribution and frequency coverage), the phase spectrum controls the temporal structure — crest factor, instantaneous frequency trajectory, and critically, how nonlinear distortion products redistribute in time and frequency after deconvolution. The central question is: can we design stimuli with phase spectra that improve nonlinear characterization beyond what conventional swept sines and random-phase signals achieve?

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Intuitive Overview](#2-intuitive-overview)
   - 2.1 [Magnitude Determines What; Phase Determines When](#21-magnitude-determines-what-phase-determines-when)
   - 2.2 [A Gallery of Phase Structures](#22-a-gallery-of-phase-structures)
   - 2.3 [Why Swept Sines Work for Nonlinear Analysis: The Time-Frequency Bijection](#23-why-swept-sines-work-for-nonlinear-analysis-the-time-frequency-bijection)
   - 2.4 [The Linear Swept Sine — A More Natural Chirp](#24-the-linear-swept-sine--a-more-natural-chirp)
   - 2.5 [Circular Linear Sweep Design](#25-circular-linear-sweep-design)
   - 2.6 [Harmonic Separation with a Linear Sweep](#26-harmonic-separation-with-a-linear-sweep)
   - 2.7 [The Zadoff–Chu Sequence — A Perfect Discrete Circular Chirp](#27-the-zadoffchu-sequence--a-perfect-discrete-circular-chirp)
   - 2.8 [Zadoff–Chu for Nonlinear Analysis: Why It Should Work](#28-zadoffchu-for-nonlinear-analysis-why-it-should-work)
   - 2.9 [Harmonic Separation with Zadoff–Chu](#29-harmonic-separation-with-zadoffchu)
   - 2.10 [Multiplexing with Zadoff–Chu Root Indices](#210-multiplexing-with-zadoffchu-root-indices)
   - 2.11 [Comparison and Design Guidance](#211-comparison-and-design-guidance)
   - 2.12 [The Circularity Spectrum: Why ZC Sweeps Forward and Backward](#212-the-circularity-spectrum-why-zc-sweeps-forward-and-backward)
   - 2.13 [Unified Matched-Filter Harmonic Extraction](#213-unified-matched-filter-harmonic-extraction)
3. [Mathematical Formulation](#3-mathematical-formulation)
   - 3.1 [Notation and Phase Design Framework](#31-notation-and-phase-design-framework)
   - 3.2 [Crest Factor and Phase Structure](#32-crest-factor-and-phase-structure)
   - 3.3 [The Time-Frequency Bijection Principle](#33-the-time-frequency-bijection-principle)
   - 3.4 [Continuous Logarithmic Sweep — Circular Formulation](#34-continuous-logarithmic-sweep--circular-formulation)
   - 3.5 [Continuous Linear Sweep — Circular Formulation](#35-continuous-linear-sweep--circular-formulation)
   - 3.6 [Linear Sweep Harmonic Separation](#36-linear-sweep-harmonic-separation)
   - 3.7 [The Zadoff–Chu Sequence: Definition and Properties](#37-the-zadoffchu-sequence-definition-and-properties)
   - 3.8 [Zadoff–Chu as Discrete Circular Chirp](#38-zadoffchu-as-discrete-circular-chirp)
   - 3.9 [DFT of Zadoff–Chu: Magnitude Flatness and Phase Structure](#39-dft-of-zadoffchu-magnitude-flatness-and-phase-structure)
   - 3.10 [Nonlinear Response to Zadoff–Chu Stimuli](#310-nonlinear-response-to-zadoffchu-stimuli)
   - 3.11 [Harmonic Separation with Zadoff–Chu Deconvolution](#311-harmonic-separation-with-zadoffchu-deconvolution)
   - 3.12 [Multiplexing via Orthogonal Root Indices](#312-multiplexing-via-orthogonal-root-indices)
   - 3.13 [Schroeder-Phase Multitone as Discrete Chirp Limit](#313-schroeder-phase-multitone-as-discrete-chirp-limit)
   - 3.14 [Bandwidth-Limited Zadoff–Chu Design](#314-bandwidth-limited-zadoffchu-design)
   - 3.15 [Unified Matched-Filter Harmonic Extraction](#315-unified-matched-filter-harmonic-extraction)
4. [Open Questions and Future Directions](#4-open-questions-and-future-directions)
5. [References](#5-references)

---

## 1. Introduction

In the circular signal analysis framework, the stimulus is fully defined by its DFT spectrum: an amplitude $A[k]$ and phase $\phi[k]$ at each frequency bin $k$. Previous documents have focused primarily on the magnitude spectrum: which bins to excite, how to shape the spectral envelope (flat, pink, custom), and how sparse or dense the excitation should be for linear versus nonlinear characterization.

The phase spectrum $\phi[k]$ has been treated as secondary — set randomly for broadband stimuli, or implicitly determined by the choice of waveform (swept sine, MLS). Yet the phase spectrum controls essentially everything about the signal's temporal structure: its peak-to-RMS ratio (crest factor), its instantaneous frequency trajectory, how energy is distributed in time, and — crucially for nonlinear analysis — how harmonic distortion products separate after deconvolution.

This document develops the theory of phase-aware stimulus design, with particular focus on two classes of signals that are promising for circular nonlinear analysis:

1. **Linear (constant-rate) swept sines** — which have a uniform sweep rate that better matches the physics of mechanical systems and offers different harmonic separation tradeoffs compared to the conventional logarithmic sweep.

2. **Zadoff–Chu (ZC) sequences** — which are discrete, inherently circular, constant-amplitude signals with ideal cyclic autocorrelation. They are essentially the "perfect" discrete-domain analog of the continuous swept sine, and they fit the circular DFT framework exactly.

The document follows the dual-track structure of the companion documents: an intuitive overview (Section 2) and a full mathematical formulation (Section 3).

---

## 2. Intuitive Overview

### 2.1 Magnitude Determines What; Phase Determines When

Consider two signals with identical flat magnitude spectra:

- **Random-phase white noise**: phases $\phi[k]$ drawn independently from $[0, 2\pi)$. The time-domain signal looks like noise — energy is spread randomly over all time, no structure.
- **Dirac impulse (zero phase)**: all phases $\phi[k] = 0$. All frequency components add constructively at $n = 0$, producing a single spike. Maximum crest factor — all energy in one sample.

Both have exactly the same magnitude spectrum $|X[k]| = \text{const}$. They deliver the same total energy, excite the same frequencies, and for a *linear* system produce transfer function estimates of identical quality (same SNR per bin). But feed them into a nonlinear system, and the responses are entirely different, because the system's nonlinearity responds to the instantaneous amplitude, which is determined by phase.

Between these extremes lie signals with *structured* phase spectra — swept sines, chirps, Schroeder-phase multitones, Zadoff–Chu sequences — that achieve interesting compromises: low crest factor, structured time-frequency distribution, and (in some cases) the ability to separate nonlinear distortion orders.

### 2.2 A Gallery of Phase Structures

For a flat-spectrum signal $X[k] = A \cdot e^{j\phi[k]}$, the phase function $\phi[k]$ versus bin index $k$ determines the signal class:

| Phase function $\phi[k]$ | Signal class | Crest factor | Time-frequency structure |
|---|---|---|---|
| $0$ for all $k$ | Dirac impulse | $\sqrt{N}$ (worst) | All energy at $n=0$ |
| Random uniform $[0,2\pi)$ | White noise | $\sim\sqrt{2\ln N}$ | No structure |
| $-\alpha k^2$ (quadratic) | Linear chirp | $\sqrt{2}$ | Linear freq. sweep |
| $-\beta k \ln k$ (quasi-log) | Log chirp / ESS | $\sqrt{2}$ | Log freq. sweep |
| $-\pi k(k-1)/K$ | Schroeder multitone | $\approx\sqrt{2}$ | Near-optimal crest factor |
| $-\pi u n^2/N$ on DFT | Zadoff–Chu | $1$ (best possible) | Discrete circular chirp |

The key observation: all low-crest-factor signals have **smooth, slowly-varying phase functions**. Rapidly varying or random phases lead to constructive interference at isolated time instants (high peaks). Smooth quadratic or quasi-linear phases spread the energy uniformly over time. The Zadoff–Chu sequence achieves the theoretical minimum crest factor of 1 (constant envelope in discrete time) — something no continuous-time signal bandlimited to $[0, f_s/2]$ can achieve.

### 2.3 Why Swept Sines Work for Nonlinear Analysis: The Time-Frequency Bijection

A swept sine visits each frequency exactly once during the stimulus period. At any instant, the signal is approximately a single sinusoid at a well-defined frequency. This creates a **bijection between time and instantaneous frequency**: each frequency is associated with a unique time.

When this signal passes through a $p$-th order nonlinearity, the output at frequency $f$ is generated at the instant when the sweep was at frequency $f/p$. This instant occurred *before* the sweep reached $f$, by a time offset that depends on the sweep law. After deconvolution (matched filtering against the stimulus), these different arrival times manifest as separated impulses in the time domain — one for each harmonic order.

**This mechanism is entirely a consequence of the phase spectrum.** Two signals with the same magnitude spectrum but different phase spectra — one a swept sine, the other random-phase noise — behave identically for a linear system but completely differently for a nonlinear one. The swept sine separates harmonics; the noise cannot.

The critical property is not that the signal is a "swept sine" per se — it is that the phase spectrum creates a monotonic, bijective mapping between time and frequency. Any signal with this property can separate nonlinear harmonics.

### 2.4 The Linear Swept Sine — A More Natural Chirp

The logarithmic (exponential) swept sine (ESS/Farina) sweeps from $f_1$ to $f_2$ with a constant rate in *octaves per second* — it spends equal time per octave. This is natural from a perceptual or musical standpoint.

The **linear swept sine** (constant-rate chirp) sweeps from $f_1$ to $f_2$ with a constant rate in *hertz per second* — it spends equal time per hertz. This has different properties that make it attractive for physical system measurement:

**More uniform excitation of mechanical modes.** Physical resonances of loudspeakers, rooms, and structures are often distributed more uniformly on a linear frequency axis (especially mechanical resonances of panels, structural modes, and low-frequency room modes below the Schroeder frequency). A linear sweep excites each hertz-wide band for the same duration, providing more uniform temporal interaction with the system's memory at each frequency.

**Better high-frequency harmonic separation — at a cost.** In a linear sweep of duration $T$ over bandwidth $B = f_2 - f_1$, the $p$-th harmonic at output frequency $f$ was generated when the sweep was at $f/p$, which occurred at time:

$$t(f/p) = \frac{(f/p - f_1) T}{B}$$

while the linear response at $f$ was generated at time:

$$t(f) = \frac{(f - f_1) T}{B}$$

The time separation between harmonic order $p$ and the linear response at frequency $f$ is:

$$\Delta t_p(f) = t(f) - t(f/p) = \frac{f(1 - 1/p) T}{B}$$

This separation **increases linearly with frequency** $f$ — higher frequencies have more room between harmonic orders. Compare the log sweep, where the separation $\Delta t_p = T \ln(p) / \ln(f_2/f_1)$ is *constant* across frequency. The linear sweep's frequency-dependent separation means:
- At low frequencies (where rooms have long decay times *and* distortion is typically strongest), the separation is **smaller** than for the log sweep — a real disadvantage where it matters most.
- At high frequencies (where higher harmonic orders are of interest), the separation is larger — useful for ultrasonic and high-order distortion studies.

> **Caveat — dispersion.** For the log sweep, deconvolution against the
> stimulus produces *compact* harmonic impulse responses that can be
> separated by simple time-domain windowing. For the linear sweep the
> harmonic IR is itself a chirp (it disperses in time), so simple
> windowing no longer works — a matched-filter / GFRF treatment as in
> §2.13/§3.15 is required. Choose the linear sweep when its high-
> frequency advantage or its uniform per-hertz energy density is genuinely
> needed; otherwise the log sweep remains the convenient default.

**Constant energy per hertz.** The power spectral density of a linear sweep is approximately flat: equal energy per hertz. The log sweep has approximately $1/f$ energy distribution (more energy at low frequencies). For systems where the noise floor is frequency-independent (e.g., electronic noise), the linear sweep provides more uniform SNR. For acoustic measurements where ambient noise is concentrated at low frequencies, the log sweep's concentration of energy at low frequencies is beneficial.

### 2.5 Circular Linear Sweep Design

To use a linear sweep in the circular framework, we need a signal that:
1. Sweeps linearly from some starting frequency to an ending frequency over $N$ samples.
2. Is exactly periodic — the waveform wraps seamlessly.

There are two approaches:

**Full-band circular chirp.** Sweep from 0 Hz to $f_s/2$ (DC to Nyquist). The instantaneous frequency at time $n$ is:

$$f_{\text{inst}}[n] = \frac{f_s}{2} \cdot \frac{n}{N}$$

The phase is the integral of the instantaneous frequency:

$$\phi[n] = 2\pi \sum_{m=0}^{n-1} \frac{f_{\text{inst}}[m]}{f_s} = \frac{\pi n^2}{2N}$$

After $N$ samples, the phase has advanced by $\pi N / 2$. For this to wrap seamlessly, we need the phase at $n = N$ to be a multiple of $2\pi$, which gives a quantization condition: $N/4 \in \mathbb{Z}$, i.e., $N$ divisible by 4.

**Band-limited circular chirp.** Sweep only over the band $[f_1, f_2]$ by exciting only the corresponding DFT bins. Assign a quadratic phase to the excited bins:

$$\phi[k] = -\frac{\pi (k - k_1)^2}{k_2 - k_1}$$

where $k_1, k_2$ are the bins corresponding to $f_1, f_2$. Set $X[k] = 0$ outside $[k_1, k_2]$. The resulting time-domain signal is a band-limited chirp that wraps circularly. This approach is more flexible and avoids the periodic boundary issues entirely — the DFT-domain design guarantees circularity by construction.

### 2.6 Harmonic Separation with a Linear Sweep

For a circular linear sweep, the deconvolution mechanism (spectral division by $X[k]$) produces harmonic impulse responses at predictable positions, just as with the log sweep — but with different spacing.

The key difference: for a linear sweep, the harmonic time offset is **frequency-dependent**. This means the harmonic impulse responses are not compact impulses but rather *dispersed* — they are spread in time, with the amount of spread depending on the bandwidth. After deconvolution:

- The linear IR ($p=1$) appears as a normal impulse response at the propagation delay.
- The 2nd harmonic response ($p=2$) appears as a dispersed, chirp-like signal whose arrival time varies with frequency. At output frequency $f$, the 2nd harmonic arrives $f T / (2B)$ before the linear response.
- Higher harmonics are similarly dispersed.

This is both a challenge and an opportunity:
- **Challenge**: The harmonic IRs are not compact, so they cannot be extracted by simple time-domain windowing as with the log sweep.
- **Opportunity**: The dispersed harmonic responses can be extracted by a **matched filter** specific to each harmonic order. Because the dispersion pattern is deterministic and known (it depends on the sweep law and harmonic order), each harmonic can be compressed into a compact IR by applying the appropriate time-frequency filter.

In practice, this means harmonic extraction with a linear sweep requires a slightly more sophisticated signal processing chain than the log sweep's simple windowing — but the frequency-dependent separation can provide better isolation at high frequencies, where multiple harmonic orders overlap in the log sweep's fixed-width windows.

### 2.7 The Zadoff–Chu Sequence — A Perfect Discrete Circular Chirp

The Zadoff–Chu (ZC) sequence is defined for length $N$ and root index $u$ (with $\gcd(u, N) = 1$) as:

$$x_u[n] = e^{-j\pi u n(n + c_f) / N}, \quad n = 0, 1, \ldots, N-1$$

where $c_f = N \bmod 2$ (0 for even $N$, 1 for odd $N$). This is a complex-valued sequence with three remarkable properties:

1. **Constant amplitude**: $|x_u[n]| = 1$ for all $n$. Every sample has identical magnitude. The crest factor is exactly 1 — the theoretical minimum. No sample is wasted on a peak; all samples carry equal energy.

2. **Flat magnitude spectrum**: $|X_u[k]| = \sqrt{N}$ for all $k$ (when $N$ is prime). Every frequency bin is excited with equal energy. The signal has a perfectly white amplitude spectrum.

3. **Ideal cyclic autocorrelation**: The cyclic autocorrelation with any non-zero shift is zero:
$$\sum_{n=0}^{N-1} x_u[n] \cdot x_u^*[(n+m) \bmod N] = \begin{cases} N & m = 0 \\ 0 & m \neq 0 \end{cases}$$

Property 3 means the ZC sequence is a **perfect** matched-filter stimulus: deconvolution (cyclic correlation with $x_u$) produces a perfect Dirac delta for a trivial (identity) system. There is zero self-interference from circular shifts.

The ZC sequence is *inherently circular* — its definition uses only the indices $0, \ldots, N-1$, and all its properties (autocorrelation, flat spectrum) are cyclic properties. It doesn't need to be "made circular" by design; it already lives on the circle.

The phase of the ZC sequence is **quadratic** in $n$: $\phi[n] = -\pi u n(n + c_f) / N$. This makes it a discrete-time **linear chirp**: the instantaneous frequency (the derivative of the phase with respect to discrete time) increases linearly with $n$. The root index $u$ controls the chirp rate — larger $u$ means a faster sweep.

**Connection to continuous chirps**: A continuous-time linear chirp sampled at $N$ points over one period, with the chirp rate chosen to sweep exactly from 0 to $f_s$, produces a phase structure that closely approximates the ZC quadratic phase. The ZC sequence is the exact discrete realization that achieves the ideal properties (constant envelope, flat spectrum, perfect autocorrelation) that any sampled continuous chirp can only approximate.

### 2.8 Zadoff–Chu for Nonlinear Analysis: Why It Should Work

The ZC sequence has the same fundamental property that makes the swept sine work for nonlinear analysis: a **bijective mapping between time and instantaneous frequency**. At each discrete-time index $n$, the ZC signal is a complex exponential at a well-defined instantaneous frequency that depends linearly on $n$. When this signal excites a nonlinear system, the same Farina-like separation mechanism should apply.

Here is the intuitive argument:

1. The ZC stimulus at time $n$ has instantaneous frequency $f[n] = u n / N$ (in normalized units). The system's $p$-th order nonlinearity generates a component at frequency $p \cdot f[n]$.

2. After deconvolution (correlation with the ZC matched filter), the linear response at output frequency $f$ is attributed to time $n(f) = fN/u$. But the $p$-th harmonic component at output frequency $f$ was generated at time $n(f/p) = fN/(pu)$.

3. The time offset between harmonic order $p$ and the linear response is:
$$\Delta n_p(f) = n(f) - n(f/p) = \frac{fN}{u}\left(1 - \frac{1}{p}\right)$$

This is the same frequency-dependent separation as the continuous linear chirp (Section 2.4) — and it is expected, because the ZC sequence *is* a discrete linear chirp.

4. Critically, the modular arithmetic of the DFT means that the ZC deconvolution wraps around perfectly: if $\Delta n_p(f) > N$, it wraps to $\Delta n_p(f) \bmod N$, and the circular autocorrelation properties ensure no self-interference from this wrapping.

However, the ZC sequence as defined is **complex-valued**, while acoustic stimuli must be real. This introduces a practical consideration that doesn't arise for real-valued swept sines. There are several approaches to handle this:

**Approach A — Use the real part.** Take $\text{Re}\{x_u[n]\} = \cos(\pi u n(n + c_f)/N)$. This produces a real chirp with a slight fluctuation in envelope (the amplitude is no longer perfectly constant). The magnitude spectrum is no longer perfectly flat — it is the sum of two ZC spectra at mirrored frequencies. But it retains the chirp structure and hence the harmonic separation property.

**Approach B — Analytic signal processing.** If the measurement system can handle complex baseband (e.g., using I/Q modulation with two DAC channels and two ADC channels), the ZC sequence can be used directly. This is standard in communication systems but less common in acoustic measurement.

**Approach C — Frequency-domain design.** Define the stimulus spectrum directly: assign the ZC-like quadratic phase to the desired frequency bins and take the inverse DFT. The real-valued constraint is enforced via Hermitian symmetry: $X[N-k] = X^*[k]$. This constructs a real signal whose positive-frequency phase follows the ZC quadratic structure. The resulting time-domain signal is a real chirp that approximates the ZC properties within the constraints of a real signal.

**Approach D — Odd-length N for prime ZC.** When $N$ is chosen prime, the ZC sequence has the strongest properties (exact flat DFT magnitude, ideal cross-correlation between different roots). The Hermitian-symmetric construction for a real signal uses $N/2$ independent frequency bins — so one can choose $N$ such that $N/2$ is prime and apply ZC design to the positive-frequency half.

### 2.9 Harmonic Separation with Zadoff–Chu

The harmonic separation mechanism for ZC stimuli parallels the linear sweep but with some distinctive features:

**Discrete, exact arithmetic.** The continuous sweep's harmonic separation involves real-valued time offsets that may not land on integer sample positions. The ZC sequence operates entirely in the discrete domain with modular arithmetic. The harmonic offsets are determined by the root index $u$ and the sequence length $N$, and the cyclic structure means wrapping is handled naturally.

**Root-index control of separation.** The root index $u$ controls the chirp rate: larger $u$ means faster frequency progression, which changes the harmonic time offsets. By choosing $u$, one can trade off between:
- Small $u$: slow chirp, large harmonic separation at high frequencies, small at low frequencies.
- Large $u$: fast chirp, more uniform (but potentially wrapping) harmonic separation.

Different root indices give different harmonic separation patterns. One can choose $u$ to optimize separation for a specific harmonic order of interest.

**Matched filter compression of harmonic IRs.** Unlike the log sweep, where harmonic IRs are naturally compact in time (because the log sweep's harmonic offsets are frequency-independent), the ZC/linear chirp produces dispersed harmonic IRs. Each harmonic has a deterministic dispersion pattern: the $p$-th harmonic's impulse is "spread" across time according to the frequency-dependent offset $\Delta n_p(f)$.

To extract the $p$-th harmonic IR:
1. Apply the inverse filter for the *$p$-th harmonic version of the stimulus* — not the original stimulus, but the stimulus frequency-scaled by factor $p$.
2. The deconvolution against this $p$-scaled matched filter compresses the $p$-th harmonic into a clean impulse response.

The $p$-th harmonic matched filter is itself a ZC-like sequence: if the stimulus has root $u$, the $p$-th harmonic filter has an effective "root" $pu$ — it is a faster chirp that matches the $p$-times-faster frequency trajectory of the $p$-th harmonic.

### 2.10 Multiplexing with Zadoff–Chu Root Indices

One of the ZC sequence's most powerful properties is that sequences with different root indices are **cyclically orthogonal** — their cyclic cross-correlation is flat (constant magnitude $1/\sqrt{N}$ for prime $N$).

In the circular measurement framework, this enables **simultaneous multi-source measurement**: assign ZC sequence with root $u_1$ to loudspeaker 1, root $u_2$ to loudspeaker 2, etc. All sources play simultaneously. At the receiver, deconvolving with each root's matched filter separates the individual transfer functions, because the cross-correlation between different roots is negligibly small.

This is the same multiplexing principle used in LTE/5G cellular networks, where different base stations use different ZC roots for channel estimation. The circular analysis framework is the acoustic analog.

**Comparison with frequency-division multiplexing.** The existing circular framework supports multi-source measurement via frequency interleaving (see *Circular Signal Analysis*, Section 2.7): each source excites different frequency bins. ZC root-index multiplexing is a **code-division** alternative: all sources excite **all** frequencies simultaneously, and separation is achieved by the orthogonality of the codes.

Advantages of ZC code-division multiplexing:
- Every source has the full bandwidth — no loss of frequency resolution per source.
- The separation is robust to slight timing offsets between sources.
- Adding more sources doesn't fragment the spectrum.

Disadvantages:
- The cross-correlation is not exactly zero for non-prime $N$ or when the difference $u_1 - u_2$ is not coprime to $N$. Practical ZC lengths and root choices must be selected carefully.
- For nonlinear analysis, the superposition of multiple ZC sequences increases the instantaneous amplitude, raising the crest factor above 1 and potentially driving the system more nonlinearly than a single-source measurement.

### 2.11 Comparison and Design Guidance

| Property | Log Sweep (Farina) | Linear Sweep | Zadoff–Chu |
|---|---|---|---|
| Domain | Continuous → sampled | Continuous → sampled | Discrete (native) |
| Circularity | Least (freq. jump at wrap) | Intermediate (DFT-designed) | **Maximal** (full-circle sweep) |
| Crest factor | $\sqrt{2}$ | $\sqrt{2}$ | $1$ (complex) / $\sqrt{2}$ (real part)† |
| Magnitude spectrum | $\sim 1/\sqrt{f}$ (pink-ish) | $\sim \text{flat}$ | Exactly flat |
| Cyclic autocorrelation | Approximate Dirac | Approximate Dirac | **Exact** Dirac |
| Inherently circular | No (must be designed) | No (must be designed) | **Yes** |
| Harmonic separation | Constant time offsets | Frequency-dependent | Frequency-dependent |
| Harmonic IR extraction | Windowing (matched-filter special case) | Matched filter per order | Matched filter per order (root $pu$) |
| Multi-source multiplexing | Frequency division | Frequency division | **Code division (root index)** |
| Real-valued | Yes | Yes | No (needs adaptation) |
| Best for | Standard acoustic meas. | Mechanical systems, wide BW | Circular framework, CDMA |

† The complex ZC sequence has unit modulus, hence crest factor $1$. The
real part used for ordinary acoustic playback has crest factor $\sqrt 2$
(same as a sinusoid), not $1$.

**When to use each:**

- **Log sweep**: When compatibility with existing practice matters, when simple time-domain windowing of harmonic IRs is preferred, and when low-frequency SNR is important (the pink-ish spectrum concentrates energy where ambient noise is highest).

- **Linear sweep**: When the system has physically meaningful structure on a linear frequency axis (mechanical resonances, structural modes), when high-frequency harmonic separation is more important than low-frequency separation, and when flat-spectrum SNR is desired.

- **Zadoff–Chu**: When working purely within the circular DFT framework, when the best possible crest factor is needed (power-limited measurement), when code-division multi-source multiplexing is desired, and when the exact discrete properties (perfect autocorrelation, flat DFT) are worth the added complexity of handling a complex-valued stimulus.

### 2.12 The Circularity Spectrum: Why ZC Sweeps Forward and Backward

A key insight connects the three chirp-based stimulus types: they differ in **how completely they cover the full frequency circle**, and this determines both their circularity properties and their relationship to forward-backward sweeps.

#### The ZC sequence on the folded frequency axis

Consider a ZC sequence with $u=1$ and even $N$. The instantaneous frequency (in the complex baseband) sweeps linearly from $0$ to $f_s$ — a single pass through the full DFT frequency circle. But for a **real-valued signal** (which we must produce for acoustic playback), the Hermitian symmetry requirement folds the frequency axis at Nyquist. On the physical (positive) frequency axis $[0, f_s/2]$, the ZC's real part $\cos(\pi n^2/N)$ traces:

| Time index $n$ | Instantaneous frequency (folded) |
|:---:|:---:|
| $0$ | $\approx 0$ (DC) |
| $N/4$ | $\approx f_s/4$ |
| $N/2$ | $\approx f_s/2$ (Nyquist) — **turnaround point** |
| $3N/4$ | $\approx f_s/4$ |
| $N-1$ | $\approx 0$ (DC) |

The real ZC chirp is a **forward-backward sweep**: DC → Nyquist → DC. Each positive frequency is visited *twice* — once ascending, once descending. The signal starts and ends at the same frequency, making the circular wrap perfectly smooth in instantaneous frequency.

This is the natural "circular shape" for a chirp: a signal that departs from a starting frequency and returns to it, closing the circle seamlessly.

#### Why the forward-backward structure emerges

The forward-backward shape is not a design choice — it is an **inevitable consequence of full-circle coverage combined with real-valued output**. A complex ZC sequence sweeps the full circle $[0, f_s)$ once. The Hermitian constraint $X[N-k] = X^*[k]$ means the negative-frequency half is the mirror of the positive half. When this full-circle sweep is rendered as a real signal, the "backward" half (frequencies $f_s/2$ to $f_s$, equivalently $-f_s/2$ to $0$) folds onto the positive axis, creating the return sweep.

#### The circularity spectrum

The three stimulus types can be ranked by how completely they embrace the frequency circle:

| Stimulus | Frequency coverage | Boundary behavior | Circularity |
|---|---|---|---|
| **Log sweep** ($f_1 \to f_2$) | Band-limited, one direction | Frequency jumps from $f_2$ back to $f_1$ at wrap point | Least circular |
| **Linear chirp** (DFT-designed, band-limited) | Band-limited, one direction | Phase is exactly periodic (DFT construction), but inst. freq. has implicit discontinuity | Intermediate |
| **ZC sequence** (full-band) | Full circle, forward-backward on positive axis | Frequency continuous everywhere, including at wrap | **Maximally circular** (see precise definition below) |

**The log sweep** makes no attempt to close the frequency trajectory — it relies on the DFT-domain design (phase adjustment) to enforce periodicity despite the frequency jump at the boundary. This works for the spectral-domain analysis but creates edge effects in the time-domain envelope.

**The band-limited linear chirp** has exact periodicity by DFT construction, but the instantaneous frequency still jumps from $f_2$ to $f_1$ at the wrap point. The Fresnel-ripple envelope is a symptom of this discontinuity.

**The ZC sequence** sweeps the entire frequency circle, so the wrap point is just another point on the smooth trajectory. The result: constant envelope (complex) or near-constant envelope (real part), perfect autocorrelation, and flat spectrum. These "ideal" properties are direct consequences of maximal circularity.

> **Precise definition.** Call a periodic stimulus *fully circular* if its
> instantaneous angular frequency $\omega_{\text{inst}}(t)$, viewed as a
> function on the time circle $\mathbb R/N\mathbb Z$, is itself continuous
> (no jumps at the wrap). The ZC sequence (full-band, real or complex) is
> fully circular: its instantaneous frequency runs continuously through
> the circle. The DFT-designed band-limited linear chirp has continuous
> phase but its instantaneous frequency is discontinuous at the wrap
> (jumping from $f_2$ back to $f_1$). The conventional log sweep is
> discontinuous in both phase and frequency at the wrap unless the
> Farina end-point quantisation is applied. The "circularity spectrum"
> ranking is thus a precise statement about $\omega_{\text{inst}}$, not a
> rhetorical one.

#### Should we design forward-backward log/linear sweeps?

One might ask: could we improve the log or linear sweep by making them sweep forward *and* backward within the measurement band? For example, a log sweep from $f_1 \to f_2 \to f_1$?

This is possible but **offers no practical benefit**:
- It does not improve SNR (total energy per frequency is unchanged).
- It does not improve crest factor (still $\sqrt{2}$ for real sinusoidal signals).
- It **breaks the time-frequency bijection** on the positive-frequency axis — each frequency is now visited twice, destroying the simple harmonic-offset structure that enables Farina-style windowing.
- It requires matched-filter harmonic extraction (the general method), gaining the complexity of the ZC approach without its benefits (perfect autocorrelation, flat spectrum, code-division multiplexing).

**The forward-backward structure is beneficial only when combined with full-circle coverage** — which is precisely what the ZC sequence provides. A band-limited forward-backward sweep is strictly dominated: it has the complexity of matched-filter extraction without the unique advantages of the ZC.

The practical recommendation is clear: if direct harmonic extraction via windowing is desired, use a one-directional (log or linear) sweep. If maximal circularity and matched-filter extraction are acceptable, use a ZC sequence.

### 2.13 Unified Matched-Filter Harmonic Extraction

The three chirp-based stimuli — log sweep, linear chirp, and ZC — all support nonlinear harmonic separation. A unified perspective reveals that **all three use the same underlying mechanism** (matched-filter deconvolution), with different implementations:

#### The general principle

For any stimulus $X[k]$ with a chirp-like phase structure, the $p$-th order nonlinear response has a predictable spectral signature $X_p[k]$ — the spectrum of the signal that a *memoryless* $p$-th order nonlinearity (i.e., $y_p[n] = a_p\,x[n]^p$) would produce. The $p$-th harmonic transfer function is extracted by:

$$\boxed{H_p[k] = \frac{Y[k]}{X_p[k]}}$$

where $X_p[k]$ is the **$p$-th harmonic matched filter** — stimulus-dependent but deterministic.

> **Scope of the rule.** The equality $Y_p[k] = H_p[k]\cdot X_p[k]$ is
> exact only for a *memoryless* $p$-th order nonlinearity. For a Volterra
> system with memory, the $p$-th order output
> $Y_p[k] = N^{1-p}\sum_{k_1+\cdots+k_p\equiv k} H_p(k_1,\ldots,k_p)\,X[k_1]\cdots X[k_p]$
> contains contributions from the entire Generalised Frequency Response
> Function (GFRF) $H_p(k_1,\ldots,k_p)$. The matched-filter rule then
> recovers a *kernel-diagonal* / *harmonic impulse response* — a frequency-
> warped projection along $k_1\approx k_2\approx\cdots\approx k_p$ — not the
> full GFRF. This is exactly Farina's well-known harmonic-IR interpretation
> for log sweeps, generalised. For loudspeakers (where the dominant
> nonlinearity is approximately memoryless or short-memory) the diagonal
> reading is practically the right object; for systems with strong
> post-nonlinearity filtering, full GFRF identification requires multiple
> stimuli or the dedicated machinery in *Circular Nonlinear Signal
> Analysis*, §3.3.

#### How each stimulus realizes the matched filter

| Stimulus | $p$-th harmonic matched filter $X_p[k]$ | Implementation |
|---|---|---|
| **Log sweep** | $X[k] \cdot e^{-j2\pi k \Delta\tau_p / N}$ (linear phase shift) | Time-domain windowing at offset $\Delta\tau_p$ — the Farina method |
| **Linear chirp** | $X[k] \cdot e^{j\pi\beta_p k^2/N}$ (quadratic phase correction) | Spectral-domain matched filter per harmonic order |
| **ZC (root $u$)** | $X_{pu}[k]$ (ZC spectrum with root $pu$) | Deconvolve by ZC with root $pu$ — the cleanest algebraic form |

The log sweep is the special case where the matched filter reduces to a **pure time shift** — a linear phase in the DFT domain. This is why Farina's method works with simple time-domain windowing: shifting the extraction window is equivalent to applying the linear-phase matched filter. No other chirp structure has this simplification.

For the linear chirp and ZC, the matched filter involves a **quadratic (or higher) phase correction**. This means harmonic extraction requires explicit spectral-domain processing — but is otherwise just as rigorous as the log sweep approach.

#### The unifying abstraction

All stimulus design in the circular framework reduces to choosing a phase function $\phi[k]$. Harmonic extraction depends on how $\phi[k]$ transforms under frequency scaling ($k \to pk$). The "sweep direction" (forward, backward, or forward-backward) is a time-domain interpretation of $\phi[k]$ — it is not a fundamental design variable. What matters is the algebraic structure of $\phi[k]$ and whether the matched filter $X_p[k]$ is well-defined and well-conditioned.

This perspective unifies the three stimulus families and clarifies their trade-offs: the log sweep trades spectral flatness for extraction simplicity; the linear chirp trades extraction simplicity for spectral flatness; the ZC achieves optimal spectral properties at the cost of complex-valued output (or near-optimal when using the real part).

---

## 3. Mathematical Formulation

### 3.1 Notation and Phase Design Framework

We use the notation from *Circular Signal Analysis* (Section 3.1) and *Circular Signal Phase Analysis* (Section 3.1). Additional notation:

| Symbol | Meaning |
|--------|---------|
| $\phi[k]$ | Phase spectrum of the stimulus at bin $k$ |
| $f_{\text{inst}}[n]$ | Instantaneous frequency at sample $n$ (in Hz) |
| $\omega_{\text{inst}}[n]$ | Instantaneous angular frequency: $\omega_{\text{inst}}[n] = 2\pi f_{\text{inst}}[n] / f_s$ |
| $\text{CF}$ | Crest factor: $\max_n |x[n]| / \sqrt{(1/N)\sum_n |x[n]|^2}$ |
| $u$ | Zadoff–Chu root index |
| $x_u[n]$ | Zadoff–Chu sequence of length $N$, root $u$ |
| $R_{xx}[m]$ | Cyclic autocorrelation: $R_{xx}[m] = \sum_n x[n] x^*[(n+m) \bmod N]$ |
| $\mu$ | Chirp rate (Hz/s for linear chirp, octaves/s for log chirp) |

A stimulus in the circular framework is fully determined by:

$$X[k] = A[k] \cdot e^{j\phi[k]}, \quad k = 0, 1, \ldots, N-1$$

with the constraint $X[N-k] = X^*[k]$ for real-valued $x[n]$. The magnitude spectrum $A[k] \geq 0$ determines the energy distribution and SNR per frequency. The phase spectrum $\phi[k]$ determines the temporal structure. This document focuses on the choice of $\phi[k]$.

### 3.2 Crest Factor and Phase Structure

The **crest factor** of a discrete signal $x[n]$ of length $N$ is:

$$\text{CF} = \frac{\max_{0 \leq n < N} |x[n]|}{\sqrt{\frac{1}{N}\sum_{n=0}^{N-1} |x[n]|^2}}$$

By Parseval's theorem, the RMS value depends only on the magnitude spectrum:

$$\frac{1}{N}\sum_{n=0}^{N-1} |x[n]|^2 = \frac{1}{N^2}\sum_{k=0}^{N-1} |X[k]|^2$$

while the peak value depends on both magnitude and phase. This means: **for a given $A[k]$, minimizing the crest factor is a pure phase-design problem.**

#### Lower bound

For any signal with $|X[k]| = A$ for all $k$ (flat spectrum):

$$x[n] = \frac{A}{N} \sum_{k=0}^{N-1} e^{j(\phi[k] + 2\pi kn/N)}$$

The RMS is $A/\sqrt{N}$. The peak is at most $A\sqrt{N}/N = A/\sqrt{N} \cdot \sqrt{N} = A$ (when all phases align), giving $\text{CF} = \sqrt{N}$ — the worst case (Dirac). The best case for a complex signal is $|x[n]| = A/\sqrt{N}$ for all $n$, giving $\text{CF} = 1$. 

For a **real-valued** signal with flat spectrum, the minimum crest factor is $\sqrt{2}$ (not 1), because the Hermitian symmetry constraint means the signal oscillates and its envelope cannot be perfectly constant.

#### Schroeder-phase crest factor

The Schroeder phase for $K$ tones at bins $k_1 < k_2 < \cdots < k_K$:

$$\phi[k_m] = -\frac{\pi m(m-1)}{K}$$

achieves crest factor approaching $\sqrt{2}$ as $K \to \infty$ for real-valued signals. This is asymptotically optimal under the Hermitian constraint.

#### Zadoff–Chu achieves CF = 1

The ZC sequence $x_u[n] = e^{-j\pi un(n+c_f)/N}$ has $|x_u[n]| = 1$ for all $n$, so $\max|x[n]| = 1$ and $\text{RMS} = 1$, giving $\text{CF} = 1$. This is optimal among complex signals. The price is that the signal is complex-valued, requiring I/Q processing for physical realization.

### 3.3 The Time-Frequency Bijection Principle

**Definition**: A signal $x[n]$ of length $N$ has a **time-frequency bijection** if there exists a smooth, invertible function $f: [0, N) \to [0, f_s/2)$ such that the instantaneous frequency at time $n$ is $f_{\text{inst}}[n] = f(n)$.

**Theorem (Harmonic Separation Principle)**: *Let $x[n]$ have a time-frequency bijection $f(n)$, and let $y[n]$ be the response of a memoryless $p$-th power nonlinearity $y = x^p$. After deconvolution of $y$ by $x$ (i.e., computing $\text{IDFT}\{Y[k]/X[k]\}$), the $p$-th order contribution appears at a time offset:*

$$\Delta n_p(k) = f^{-1}(\omega_k) - f^{-1}(\omega_k / p)$$

*relative to a Dirac at $n = 0$, where $\omega_k$ is the frequency at bin $k$.*

**Proof sketch**: The output of the $p$-th power nonlinearity at time $n$ has energy at frequency $p \cdot f(n)$. At output frequency $\omega_k$, the nonlinear contribution was generated at time $n_p = f^{-1}(\omega_k/p)$. The deconvolution (matched filter against $x$) attributes frequency $\omega_k$ to time $n_1 = f^{-1}(\omega_k)$. The apparent time offset is $\Delta n_p = n_1 - n_p$.

For the harmonic IRs to be separable, $\Delta n_p$ must be sufficiently large and distinguishable from zero at all relevant frequencies.

**Remark**: For a system with memory (convolution after the nonlinearity, or Volterra kernels), the harmonic IRs are convolutions of the pointwise offsets $\Delta n_p(k)$ with the kernel's impulse response at each harmonic order — they are *smeared* in time by the system's memory, but centered at $\Delta n_p$.

### 3.4 Continuous Logarithmic Sweep — Circular Formulation

For completeness and comparison, the standard log sweep in circular form.

The instantaneous frequency:

$$f_{\text{inst}}(t) = f_1 \left(\frac{f_2}{f_1}\right)^{t/T}, \quad t \in [0, T)$$

Phase:

$$\psi(t) = 2\pi \int_0^t f_{\text{inst}}(\tau)\, d\tau = \frac{2\pi f_1 T}{\ln(f_2/f_1)}\left[\left(\frac{f_2}{f_1}\right)^{t/T} - 1\right]$$

The inverse time-frequency map:

$$t(f) = T \cdot \frac{\ln(f/f_1)}{\ln(f_2/f_1)}$$

Harmonic time offset (frequency-independent):

$$\Delta t_p = t(f) - t(f/p) = T \cdot \frac{\ln(p)}{\ln(f_2/f_1)} = \text{const}$$

In the circular framework ($T = N/f_s$), the $p$-th harmonic IR wraps to circular position:

$$n_p = \left(\hat{d} - \frac{N \ln(p)}{\ln(f_2/f_1)}\right) \bmod N$$

where $\hat{d}$ is the linear IR position (see *Circular Signal Phase Analysis*, Section 3.13).

**Key property**: The constant harmonic offset means each harmonic IR is a compact impulse response (no dispersion from the separation mechanism), extractable by simple time-domain windowing.

### 3.5 Continuous Linear Sweep — Circular Formulation

#### Instantaneous frequency and phase

A circular linear sweep of $N$ samples from frequency $f_1$ to $f_2$:

$$f_{\text{inst}}[n] = f_1 + (f_2 - f_1) \cdot \frac{n}{N}, \quad n = 0, \ldots, N-1$$

The discrete-time phase (cumulative sum):

$$\psi[n] = \frac{2\pi}{f_s}\sum_{m=0}^{n-1} f_{\text{inst}}[m] = \frac{2\pi}{f_s}\left[f_1 n + \frac{(f_2 - f_1)n(n-1)}{2N}\right]$$

$$= \frac{2\pi n}{N}\left[k_1 + \frac{(k_2 - k_1)(n-1)}{2N}\right]$$

where $k_1 = f_1 N / f_s$ and $k_2 = f_2 N / f_s$ are the bin indices of the start and end frequencies.

The stimulus is:

$$x[n] = \cos(\psi[n])$$

#### Circularity condition (seamless wrap)

For the sweep to wrap seamlessly (no discontinuity at $n = N$), the total phase advance over $N$ samples must be an integer multiple of $2\pi$:

$$\psi[N] = 2\pi \left(k_1 + \frac{k_2 - k_1}{2} \cdot \frac{N-1}{N}\right) \approx \pi(k_1 + k_2)$$

For exact periodicity, choose $k_1$ and $k_2$ such that $k_1 + k_2$ is even (their sum is an even integer). In practice, very small start/end frequency adjustments suffice.

Alternatively, define the stimulus in the frequency domain: assign phase $\phi[k] = -\alpha(k - k_0)^2$ to the desired bins, enforce Hermitian symmetry, and inverse-DFT. This guarantees exact circularity regardless of parameter choices.

#### DFT-domain construction

The more robust approach: define the spectrum directly:

$$X[k] = \begin{cases} A[k] \cdot e^{-j\alpha(k - k_c)^2} & k_1 \leq k \leq k_2 \\ 0 & \text{otherwise} \end{cases}$$

where $k_c = (k_1 + k_2)/2$ is the center bin and $\alpha = \pi / (k_2 - k_1)$ is the quadratic phase coefficient chosen so the "sweep" spans the full bandwidth once. Hermitian symmetry: $X[N-k] = X^*[k]$.

The resulting time-domain signal $x[n] = \text{IDFT}\{X[k]\}$ is a real-valued, exactly circular, band-limited linear chirp. The amplitude envelope is approximately constant (Fresnel-integral-shaped edges) with crest factor near $\sqrt{2}$.

### 3.6 Linear Sweep Harmonic Separation

#### Inverse time-frequency map

For the linear sweep, the bijection $f(n) = f_1 + (f_2 - f_1)n/N$ has inverse:

$$n(f) = \frac{(f - f_1)N}{f_2 - f_1} = \frac{(f - f_1)N}{B}$$

where $B = f_2 - f_1$ is the bandwidth.

#### Harmonic time offset

The $p$-th harmonic at output frequency $f$ was generated when the sweep was at $f/p$:

$$\Delta n_p(f) = n(f) - n(f/p) = \frac{N}{B}\left(f - \frac{f}{p}\right) = \frac{Nf(1 - 1/p)}{B}$$

This is **linear in $f$**: zero at DC, maximum at the Nyquist frequency. In terms of DFT bin index $k$ (where $f = k f_s / N$):

$$\boxed{\Delta n_p[k] = \frac{k f_s (1 - 1/p)}{B} = \frac{k(1 - 1/p)}{B/f_s}}$$

#### Frequency-dependent separation: quantitative examples

For $f_1 = 20$ Hz, $f_2 = 20{,}000$ Hz, $f_s = 48{,}000$ Hz, $N = 48{,}000$ (1 second):

| Harmonic $p$ | $\Delta n_2$ at 1 kHz | $\Delta n_2$ at 10 kHz | $\Delta n_2$ at 20 kHz |
|:---:|:---:|:---:|:---:|
| 2 | 500 samples (10.4 ms) | 5,000 (104 ms) | 10,000 (208 ms) |
| 3 | 667 (13.9 ms) | 6,667 (139 ms) | 13,333 (278 ms) |
| 5 | 800 (16.7 ms) | 8,000 (167 ms) | 16,000 (333 ms) |

Compare the log sweep for the same parameters: $\Delta n_p = N \ln(p)/\ln(f_2/f_1) \approx$ 10,047 samples (209 ms) for $p=2$, constant at all frequencies.

The linear sweep gives *less* separation than the log sweep below about 10 kHz and *more* above. For typical room measurements where the impulse response is 200–500 ms, the linear sweep provides adequate separation for the 2nd harmonic at frequencies above a few kHz but insufficient separation at very low frequencies.

#### Harmonic extraction via matched filtering

The dispersed $p$-th harmonic IR can be compressed by correlating with a reference signal whose frequency is scaled by factor $p$. Define the $p$-th harmonic reference:

$$X_p[k] = X[k/p] \quad \text{(with appropriate interpolation for non-integer } k/p\text{)}$$

This is the spectrum of a chirp that sweeps $p$ times faster. Deconvolving the measurement by $X_p$ instead of $X$ compresses the $p$-th harmonic:

$$H_p[k] = \frac{Y[k]}{X_p[k]}$$

In practice, this is implemented as: construct the "expected output spectrum of the $p$-th harmonic" for the given sweep, and use it as the matched filter. This extracts $H_p[k]$ — the $p$-th order harmonic transfer function — across the full bandwidth.

#### Overlap analysis

At each frequency $f$, the available "window" between the linear IR and the $p$-th harmonic is $\Delta n_p(f)$ samples. If the linear IR's group delay at frequency $f$ exceeds this window, overlap occurs. The overlap diagnostic from *Circular Signal Phase Analysis* (Section 3.13) applies with the modification that $\Delta t_1$ is replaced by the frequency-dependent $\Delta n_2(f)$:

$$\text{Overlap risk at bin } k: \quad \tau_{g,\min}[k] > \Delta n_2[k] - \delta$$

This gives a **per-frequency** overlap map rather than a single number, which is richer diagnostic information than the log sweep provides.

### 3.7 The Zadoff–Chu Sequence: Definition and Properties

#### Definition

For positive integer $N$ and root index $u$ with $\gcd(u, N) = 1$:

$$x_u[n] = e^{-j\pi u n(n + c_f)/N}, \quad n = 0, 1, \ldots, N-1$$

where $c_f = N \bmod 2$.

For even $N$ (common in DSP), $c_f = 0$:

$$x_u[n] = e^{-j\pi u n^2/N}$$

For odd $N$, $c_f = 1$:

$$x_u[n] = e^{-j\pi u n(n+1)/N}$$

#### Fundamental properties

**P1. Constant amplitude**:

$$|x_u[n]| = |e^{-j\pi u n(n+c_f)/N}| = 1 \quad \forall\, n$$

**P2. Periodicity** (with period $N$ for even $N$, period $N$ for odd $N$ when $u$ is even, period $2N$ otherwise — standard convention restricts to period $N$):

$$x_u[n + N] = e^{-j\pi u(n+N)(n+N+c_f)/N} = x_u[n] \cdot e^{-j\pi u(2n + N + c_f)} = x_u[n] \cdot (-1)^{u(N+c_f)} \cdot e^{-j2\pi un}$$

For even $N$ (so $c_f = 0$): $x_u[n+N] = x_u[n] \cdot (-1)^{uN}$. If $uN$ is even (e.g., $N$ even), then $x_u[n+N] = x_u[n]$. Period is exactly $N$.

**P3. Ideal cyclic autocorrelation** (CAZAC property):

$$R_{x_u x_u}[m] = \sum_{n=0}^{N-1} x_u[n] \, x_u^*[(n+m) \bmod N] = N \cdot \delta[m]$$

**Proof**: For $m \neq 0$:

$$R[m] = \sum_{n=0}^{N-1} e^{-j\pi u n^2/N} \cdot e^{j\pi u(n+m)^2/N} = \sum_{n=0}^{N-1} e^{j\pi u(2nm + m^2)/N} = e^{j\pi um^2/N} \sum_{n=0}^{N-1} e^{j2\pi u m n/N}$$

The sum $\sum_{n=0}^{N-1} e^{j2\pi umn/N}$ is a geometric series. Since $\gcd(u,N) = 1$ and $m \not\equiv 0 \pmod{N}$, we have $um \not\equiv 0 \pmod{N}$, so the sum is zero. Thus $R[m] = 0$ for $m \neq 0$. For $m = 0$: $R[0] = \sum |x_u[n]|^2 = N$. $\square$

**P4. DFT is a scaled, conjugated ZC sequence** (for prime $N$):

$$X_u[k] = \text{DFT}\{x_u[n]\} = x_u^*(\tilde{u}k) \cdot X_u[0]$$

where $\tilde{u}$ is the multiplicative inverse of $u$ modulo $N$ (i.e., $u\tilde{u} \equiv 1 \pmod{N}$). This means $|X_u[k]| = |X_u[0]| = \sqrt{N}$ — perfectly flat magnitude spectrum.

**P5. Cross-correlation between different roots** (for prime $N$, $u_1 \neq u_2$, $\gcd(u_1 - u_2, N) = 1$):

$$|R_{x_{u_1} x_{u_2}}[m]| = \frac{1}{\sqrt{N}} \quad \forall\, m$$

The cross-correlation has constant magnitude $1/\sqrt{N}$ — the lowest possible for any pair of unit-energy sequences. This is the foundation for multi-source multiplexing.

### 3.8 Zadoff–Chu as Discrete Circular Chirp

The instantaneous frequency of $x_u[n]$ is obtained from the phase derivative:

$$\phi[n] = -\frac{\pi u n^2}{N} \quad (\text{even } N)$$

$$\omega_{\text{inst}}[n] = \phi[n+1] - \phi[n] = -\frac{\pi u(2n+1)}{N} \approx -\frac{2\pi un}{N}$$

The instantaneous (normalized) frequency is:

$$f_{\text{norm}}[n] = \frac{\omega_{\text{inst}}[n]}{2\pi} \approx -\frac{un}{N}$$

This is linear in $n$ with slope (chirp rate) $-u/N$. For $n = 0$ to $N-1$, the frequency sweeps through $u$ complete cycles of the frequency axis (modulo $N$). When $u = 1$, it is a single sweep from frequency 0 to frequency $N-1$ (in bin units) — the slowest possible chirp. When $u = N-1$, it sweeps in the opposite direction at the same rate.

**Connection to continuous linear chirp**: A continuous linear chirp of duration $T = N/f_s$ sweeping from 0 to $f_s$ has instantaneous frequency $f(t) = f_s t / T$. Sampling at $t = n/f_s$: $f[n] = n f_s^2 / (Nf_s) = n f_s / N$. The phase is:

$$\psi[n] = 2\pi \sum_{m=0}^{n-1} \frac{m}{N} = \frac{\pi n(n-1)}{N} \approx \frac{\pi n^2}{N}$$

This is exactly the ZC phase with $u = -1$ (modulo sign conventions). The ZC sequence is a sampled full-band linear chirp with the chirp rate quantized to integer multiples of the fundamental rate $1/N$.

### 3.9 DFT of Zadoff–Chu: Magnitude Flatness and Phase Structure

#### Gauss sum evaluation (prime N)

The DFT of $x_u[n]$ is:

$$X_u[k] = \sum_{n=0}^{N-1} e^{-j\pi u n^2/N} \cdot e^{-j2\pi kn/N} = \sum_{n=0}^{N-1} e^{-j\pi(un^2 + 2kn)/N}$$

Completing the square: $un^2 + 2kn = u(n + k\tilde{u})^2 - k^2\tilde{u}$, where $\tilde{u} = u^{-1} \bmod N$:

$$X_u[k] = e^{j\pi k^2 \tilde{u}/N} \sum_{n=0}^{N-1} e^{-j\pi u(n + k\tilde{u})^2/N}$$

The sum $\sum_{n=0}^{N-1} e^{-j\pi u n^2/N}$ is a **Gauss sum** with known magnitude $\sqrt{N}$ (for prime $N$ with $\gcd(u,N) = 1$). Substituting $n' = n + k\tilde{u} \bmod N$ (a cyclic permutation) leaves the sum unchanged. Therefore:

$$|X_u[k]| = \sqrt{N} \quad \forall\, k$$

The **phase** of the DFT is:

$$\angle X_u[k] = \frac{\pi k^2 \tilde{u}}{N} + \angle G(u, N)$$

where $G(u,N)$ is the Gauss sum (a constant independent of $k$). The DFT phase is again quadratic in $k$ — the frequency-domain signal is itself a ZC-like chirp. This self-similar property (a chirp in time transforms to a chirp in frequency) is characteristic of quadratic-phase signals.

#### Non-prime N

For composite $N$, the magnitude is not exactly flat but has small ripples. If $\gcd(u, N) = 1$, the autocorrelation is still ideal (property P3 holds regardless of primality), so the matched-filter deconvolution still produces a perfect Dirac. The magnitude spectrum has deviations of order $O(1)$ from $\sqrt{N}$ at certain bins, which means slightly non-uniform SNR distribution — but the deconvolution performance is unaffected.

For practical acoustic measurement, one can choose $N$ to be prime (or have $N/2$ prime for real-signal design) to achieve exact flatness, or accept the small ripple for a convenient power-of-2 $N$ (which enables efficient FFT computation).

### 3.10 Nonlinear Response to Zadoff–Chu Stimuli

Consider the Volterra model (see *Circular Nonlinear-Signal Analysis*, Section 3.1) with a ZC stimulus $x_u[n]$.

#### Second-order output

The 2nd-order output in frequency domain (from Section 3.3 of the nonlinear companion):

$$Y_2[k] = \frac{1}{N} \sum_{k_1 + k_2 \equiv k \pmod{N}} H_2(k_1, k_2) \, X_u[k_1] \, X_u[k_2]$$

Since $|X_u[k]| = \sqrt{N}$ for all $k$:

$$Y_2[k] = \frac{1}{N} \sum_{k_1 + k_2 \equiv k} H_2(k_1, k_2) \cdot N \cdot e^{j(\angle X_u[k_1] + \angle X_u[k_2])}$$

$$= \sum_{k_1 + k_2 \equiv k} H_2(k_1, k_2) \cdot e^{j\pi\tilde{u}(k_1^2 + k_2^2)/N + 2j\angle G}$$

The phase of each term is $\pi\tilde{u}(k_1^2 + k_2^2)/N$. Using $k_2 = k - k_1$:

$$k_1^2 + k_2^2 = k_1^2 + (k-k_1)^2 = 2k_1^2 - 2kk_1 + k^2$$

$$= 2(k_1 - k/2)^2 + k^2/2$$

The phase rotates quadratically in $k_1$. This means successive terms in the sum (different $k_1$ values) have rapidly varying phases, causing destructive interference — *unless* the kernel $H_2(k_1, k_2)$ is concentrated along certain structures (e.g., the diagonal $k_1 \approx k_2$ for memoryless nonlinearity).

#### Memoryless nonlinearity: $y = ax^2$

For a memoryless squarer, $H_2(k_1, k_2) = a$ for all $(k_1, k_2)$:

$$Y_2[k] = a \sum_{k_1=0}^{N-1} e^{j\pi\tilde{u}(2k_1^2 - 2kk_1 + k^2)/N} = a \cdot e^{j\pi\tilde{u}k^2/N} \sum_{k_1=0}^{N-1} e^{j2\pi\tilde{u}(k_1^2 - kk_1)/N}$$

Completing the square in $k_1$: $k_1^2 - kk_1 = (k_1 - k/2)^2 - k^2/4$.

$$Y_2[k] = a \cdot e^{j\pi\tilde{u}k^2/(2N)} \sum_{k_1=0}^{N-1} e^{j2\pi\tilde{u}(k_1 - k/2)^2/N}$$

The sum is again a Gauss sum (shifted), with magnitude $\sqrt{N}$ (for appropriate $N$). Therefore:

$$|Y_2[k]| = |a| \sqrt{N} = \text{const}$$

The 2nd-order output of a memoryless nonlinearity driven by a ZC stimulus has **flat magnitude spectrum** — coherent with the flat stimulus. The phase is a modified quadratic function.

#### Deconvolution of the 2nd-order component

The standard deconvolution divides by $X_u[k]$:

$$\frac{Y_2[k]}{X_u[k]} = \frac{Y_2[k]}{\sqrt{N} \cdot e^{j\pi\tilde{u}k^2/N + j\angle G}}$$

The result has a phase that depends linearly on $k$ (the quadratic terms partially cancel). In the time domain, this corresponds to a spike at a specific time offset — the 2nd harmonic IR separated from the linear response. The exact location depends on the root index $u$ and the deconvolution algebra.

This confirms the fundamental claim: **ZC stimuli support Farina-like harmonic separation** via the same mechanism as continuous swept sines — the quadratic chirp structure ensures that $p$-th order products are redirected to distinct time positions upon deconvolution.

### 3.11 Harmonic Separation with Zadoff–Chu Deconvolution

#### Setup: memoryless $p$-th power on a ZC stimulus

For a memoryless $p$-th power nonlinearity $y_p[n] = a_p \, x_u[n]^p$:

$$y_p[n] = a_p \, e^{-jp\pi un^2/N}.$$

This is itself a ZC-like sequence with effective root $pu$. Its DFT is

$$Y_p[k] = a_p \cdot \sqrt{N} \cdot e^{j\pi(pu)^{-1}k^2/N + j\angle G_p}$$

where $(pu)^{-1}$ is the modular inverse of $pu$ modulo $N$ (assuming $\gcd(pu, N) = 1$, which requires $\gcd(p, N) = 1$, automatic for prime $N$).

#### Wrong path: linear-phase deconvolution

Dividing $Y_p$ by $X_u$ does *not* yield a Dirac. Setting
$\beta_p = (pu)^{-1} - \tilde u = \tilde u(p^{-1} - 1) \bmod N$, we get

$$\frac{Y_p[k]}{X_u[k]} = a_p\, e^{j\pi\beta_p k^2/N + j\Delta G},$$

which is a **chirp**, not a delta. (A naive shift formula
$n_p \stackrel{?}{=} N\tilde u(p^{-1}-1)/2 \bmod N$ is identically $0\pmod N$
because $N$ enters as a multiplicative factor; this confirms that the
residual is genuinely a chirp, not a shifted impulse.)

This is the fundamental difference from the log sweep, where a *frequency-
independent* offset produces compact harmonic IRs. For ZC — and for any
stimulus with a quadratic phase — the deconvolved harmonics are *chirps in
time*, not pulses. They must be collapsed by a second matched filter.

#### Right path: matched-filter deconvolution against root $pu$

To collapse the $p$-th harmonic chirp into a compact impulse, deconvolve
directly by a ZC of root $pu$:

$$\boxed{\,H_p[k] = \frac{Y[k]}{X_{pu}[k]}\,}$$

where $X_{pu}[k] = \mathrm{DFT}\{x_{pu}[n]\}$. Equivalently this equals
$Y[k]/(X_u[k]\,e^{j\pi\beta_p k^2/N})$ — dividing by the original ZC and
then applying the second-stage chirp correction — but the boxed form is
cleaner.

For a *memoryless* $p$-th-order term $y_p[n] = a_p x_u[n]^p$, $H_p[k] =
a_p$ exactly: a flat transfer function whose IDFT is a Dirac at $n = 0$.
For a Volterra kernel of order $p$ with memory, $H_p[k]$ recovers the
*kernel diagonal* $H_p(k/p, \ldots, k/p)$ — a frequency-warped harmonic
impulse response, exactly analogous to Farina's harmonic IRs for log
sweeps. See §3.15 and *Circular Nonlinear-Signal Analysis*, §3.6 for the
general statement.

**Requirement.** $\gcd(p, N) = 1$ for every harmonic order $p$ of
interest. For prime $N$ this is automatic for all $p < N$.

### 3.12 Multiplexing via Orthogonal Root Indices

#### Multi-source scenario

Suppose $S$ sources emit simultaneously, each with a ZC stimulus of root index $u_s$ ($s = 1, \ldots, S$). The received signal at a microphone is:

$$y[n] = \sum_{s=1}^{S} (h_s \circledast x_{u_s})[n] + \eta[n]$$

where $h_s[n]$ is the impulse response from source $s$, $\circledast$ denotes circular convolution, and $\eta$ is noise.

In the frequency domain: $Y[k] = \sum_{s} H_s[k] X_{u_s}[k] + \mathcal{N}[k]$.

#### Deconvolution by source

To estimate $H_s[k]$, deconvolve by $X_{u_s}[k]$:

$$\hat{H}_s[k] = \frac{Y[k]}{X_{u_s}[k]} = H_s[k] + \sum_{s' \neq s} H_{s'}[k] \frac{X_{u_{s'}}[k]}{X_{u_s}[k]} + \frac{\mathcal{N}[k]}{X_{u_s}[k]}$$

The cross-talk term involves the ratio $X_{u_{s'}}[k] / X_{u_s}[k]$. For prime $N$:

$$\frac{X_{u_{s'}}[k]}{X_{u_s}[k]} = \frac{|X_{u_{s'}}[k]|}{|X_{u_s}[k]|} \cdot e^{j(\angle X_{u_{s'}}[k] - \angle X_{u_s}[k])} = e^{j\pi(\tilde{u}_{s'} - \tilde{u}_s)k^2/N + j\Delta G}$$

This ratio has **flat magnitude** (= 1) and **quadratic phase**. Its IDFT is a chirp-like spread signal with peak amplitude $1/\sqrt{N}$ at each time position (by property P5).

In the time domain, the cross-talk from source $s'$ in the deconvolved output for source $s$ is the convolution of $h_{s'}$ with this spread signal:

$$\text{cross-talk}_{s' \to s}[n] = (h_{s'} \circledast r_{s',s})[n]$$

where $|r_{s',s}[n]| = 1/\sqrt{N}$ for all $n$.

The cross-talk energy is:

$$\sum_{n} |\text{cross-talk}_{s' \to s}[n]|^2 = \frac{1}{N} \sum_n |h_{s'}[n]|^2 \cdot N = \sum_n |h_{s'}[n]|^2$$

Wait — that's not a reduction. The total cross-talk energy equals the source energy? Not quite. The cross-talk is *spread uniformly* over all $N$ samples, so the cross-talk *per sample* is reduced by factor $N$ relative to the signal peak. The cross-talk acts as a raised noise floor:

$$\text{cross-talk SNR} \approx \frac{|h_s[n_{\text{peak}}]|^2}{\sum_{s' \neq s} \|h_{s'}\|^2 / N}$$

For $S$ sources with similar impulse response energy $E$:

$$\text{SNR}_{\text{cross}} \approx \frac{N \cdot |h_{\text{peak}}|^2}{(S-1) E}$$

This grows linearly with $N$ — longer sequences provide better separation. For $N = 48{,}000$ (1 second at 48 kHz) and typical room IRs, the cross-talk is 40–50 dB below the main impulse, which is adequate for many applications.

#### Comparison with frequency-division multiplexing

| Property | Frequency division | ZC code division |
|---|---|---|
| Frequency resolution per source | $f_s / (N/S)$ | $f_s / N$ (full) |
| Cross-talk mechanism | Zero (orthogonal bins) | Spread noise floor ($\sim 1/\sqrt{N}$) |
| Cross-talk level | Exact zero | $\sim -10\log_{10}(N)$ dB |
| Nonlinear cross-coupling | Different frequency bands → limited | Same frequencies → coupled |
| Multi-cycle noise reduction | Yes | Yes |
| Source count limit | $N/2$ (practical: $\sim 10$) | $\phi(N)$ roots (many) |

The choice depends on priorities: frequency division gives exact orthogonality but fragments the spectrum; code division preserves full bandwidth but introduces a low cross-talk floor.

### 3.13 Schroeder-Phase Multitone as Discrete Chirp Limit

The Schroeder phase $\phi_m = -\pi m(m-1)/K$ for a multitone exciting $K$ consecutive bins starting at bin $k_1$ can be rewritten as:

$$\phi_m = -\frac{\pi m^2}{K} + \frac{\pi m}{K}$$

For large $K$, the $\pi m / K$ term is a slowly varying linear correction, and the dominant term is quadratic: $\phi_m \approx -\pi m^2 / K$.

This is precisely the ZC phase structure with "root" $u = N/K$ (in a heuristic sense — $u$ must be integer for a true ZC). The Schroeder multitone is therefore a **discrete, bandlimited approximation to a ZC chirp** restricted to $K$ bins.

The connection explains why Schroeder-phase signals have near-minimum crest factor: they approximate the ZC structure (which achieves exact minimum crest factor) within the constraints of a real signal exciting a subset of bins.

For nonlinear analysis, the Schroeder multitone has a limitation the ZC chirp does not: since all $K$ excited bins are occupied by the stimulus, harmonic distortion products at those bins are masked. The ZC chirp, being broadband, faces the same issue — but its perfect matched-filter property means the deconvolution produces harmonic separation in *time* rather than requiring spectral gaps.

### 3.14 Bandwidth-Limited Zadoff–Chu Design

For acoustic measurement, we typically need a stimulus that excites only the band $[f_1, f_2]$, not the full $[0, f_s/2]$. A pure ZC sequence is inherently full-band. Several approaches adapt it to a band-limited context:

#### Approach 1: Frequency-domain windowing

Define the stimulus DFT as a ZC sequence restricted to the desired bins:

$$X[k] = \begin{cases} \sqrt{N} \cdot e^{j\pi\tilde{u}k^2/N} & k_1 \leq k \leq k_2 \\ 0 & \text{otherwise} \end{cases}$$

with Hermitian symmetry enforced: $X[N-k] = X^*[k]$.

The resulting time-domain signal is real-valued and band-limited. Its envelope is no longer constant (it has Fresnel-ripple edges from the sharp spectral truncation), but it retains the chirp structure and approximate flat spectrum within the passband.

**Crest factor**: approximately $\sqrt{2}$ to $\sqrt{3}$, depending on the bandwidth fraction $k_2 - k_1$ relative to $N$. Wider bandwidth gives lower crest factor.

**Autocorrelation**: no longer ideal — the cyclic autocorrelation has sidelobes due to the bandwidth restriction. However, for deconvolution purposes, the autocorrelation is irrelevant: the deconvolution divides by $X[k]$ at the excited bins and ignores (or zeros) the unexcited bins, so the inversion is exact at each excited bin.

#### Approach 2: Spectral tapering

Apply a smooth window to the DFT magnitude to reduce Fresnel ripple:

$$X[k] = A_{\text{taper}}[k] \cdot e^{j\pi\tilde{u}k^2/N}$$

where $A_{\text{taper}}[k]$ is a smooth function that transitions from 0 to 1 at the band edges (e.g., raised cosine rolloff). This improves the time-domain envelope at the cost of slightly non-flat excitation.

#### Approach 3: Full-band ZC with post-filtering

Use the full-band ZC stimulus (all bins excited) and apply a bandpass filter to the *deconvolved transfer function* rather than the stimulus. This uses all the ZC-generated energy for deconvolution and restricts the output to the band of interest afterward. The crest factor remains 1 (for complex) or near-$\sqrt{2}$ (for real part), and the deconvolution fidelity is optimal.

This approach is viable when the measurement hardware (DACs, amplifiers, loudspeakers) can handle the full-band signal without problems. The out-of-band energy is "wasted" but does not harm the in-band result.

#### Approach 4: Primed subsequence

Choose $N$ such that $k_2 - k_1$ (the number of excited bins) is prime. Apply a ZC sequence of length $K = k_2 - k_1$ with root $u'$ to define the phases of those bins:

$$X[k_1 + m] = A[k_1 + m] \cdot e^{-j\pi u' m^2/K}, \quad m = 0, \ldots, K-1$$

This gives ideal ZC properties *within the excited band* (flat magnitude, perfect within-band autocorrelation) while maintaining zero energy outside the band. The deconvolution within the band is exact; the out-of-band bins contribute nothing.

### 3.15 Unified Matched-Filter Harmonic Extraction

This section formalizes the unified harmonic extraction framework introduced intuitively in Section 2.13.

#### General formulation

Let $x[n]$ be a circular stimulus with DFT $X[k]$. Let $y[n]$ be the response of a system with polynomial nonlinearity up to order $P$:

$$y[n] = \sum_{p=1}^{P} y_p[n]$$

where $y_p[n]$ is the $p$-th order contribution. In the frequency domain:

$$Y[k] = \sum_{p=1}^{P} Y_p[k]$$

For each harmonic order $p$, define the **$p$-th harmonic matched filter** $X_p[k]$ as the expected DFT of the $p$-th order output for a *memoryless* $p$-th power nonlinearity $y_p[n] = x[n]^p$:

$$X_p[k] = \text{DFT}\{x[n]^p\}$$

The $p$-th order harmonic transfer function is extracted by:

$$H_p[k] = \frac{Y[k]}{X_p[k]}$$

> **Scope (important).** The equality $Y_p[k] = H_p[k]\cdot X_p[k]$ is
> *exact* when the $p$-th order nonlinearity is memoryless. For a Volterra
> system with memory, the $p$-th order output is
>
> $$Y_p[k] = N^{1-p}\sum_{k_1+\cdots+k_p\equiv k} H_p(k_1,\ldots,k_p)\,X[k_1]\cdots X[k_p],$$
>
> and the matched-filter ratio recovers a *kernel-diagonal projection* —
> a frequency-warped harmonic impulse response analogous to Farina's
> harmonic IRs for log sweeps — not the full GFRF $H_p(k_1,\ldots,k_p)$.
> For loudspeakers and similar systems where the dominant nonlinearity is
> memoryless or short-memory, the diagonal reading is the practically
> correct object. For systems with significant post-nonlinearity filtering,
> full GFRF identification requires the multi-stimulus / multisine machinery
> in *Circular Nonlinear-Signal Analysis*, §3.3.

#### Log sweep: matched filter is a time shift

For a logarithmic sweep with phase $\psi[k] \sim -\beta k \ln k$, the $p$-th power $x^p$ has instantaneous frequency at each time shifted by the constant offset $\Delta\tau_p = T \ln(p) / \ln(f_2/f_1)$. Therefore:

$$X_p[k] \approx X[k] \cdot e^{-j2\pi k \Delta\tau_p / N}$$

The matched filter is $X[k]$ with a linear phase shift — equivalent to a time-domain shift by $\Delta\tau_p$ samples. Deconvolution by $X_p[k]$ is therefore equivalent to:

1. Deconvolve by $X[k]$ (standard spectral division).
2. Extract the region around $\Delta\tau_p$ in the time domain.

This is Farina's windowing method — a **special case** of matched-filter extraction where the matched filter simplifies to a pure shift.

#### Linear chirp: matched filter is a quadratic phase correction

For a linear chirp with phase $\phi[k] = -\alpha(k - k_1)^2$, the $p$-th power shifts the chirp rate by factor $p$. The matched filter involves a quadratic phase correction:

$$X_p[k] = X[k] \cdot e^{j\pi\beta_p k^2/N}$$

where $\beta_p = \tilde{\alpha}(p^{-1} - 1)$ captures the difference in chirp rate between orders 1 and $p$. The IDFT of $Y[k]/X_p[k]$ compresses the (otherwise dispersed) $p$-th harmonic into a compact impulse response.

#### ZC: matched filter is a root-scaled ZC

For a ZC stimulus with root $u$, the $p$-th power is:

$$x_u[n]^p = e^{-jp\pi un^2/N} = x_{pu}[n]$$

This is itself a ZC sequence with root $pu$. Therefore:

$$X_p[k] = X_{pu}[k] = \sqrt{N} \cdot e^{j\pi(pu)^{-1}k^2/N + j\angle G_{pu}}$$

The extraction rule is:

$$H_p[k] = \frac{Y[k]}{X_{pu}[k]}$$

This is the cleanest algebraic form: no approximations, exact for all $k$, and well-conditioned (since $|X_{pu}[k]| = \sqrt{N}$ for all $k$ when $N$ is prime and $\gcd(pu, N) = 1$).

#### Summary of matched-filter structures

| Stimulus | Phase $\phi[k]$ | $X_p[k]$ structure | Extraction complexity |
|---|---|---|---|
| Log sweep | $\sim -\beta k \ln k$ | $X[k] \cdot e^{-j\omega \Delta\tau_p}$ (linear phase) | Simplest: time-domain windowing |
| Linear chirp | $-\alpha(k-k_1)^2$ | $X[k] \cdot e^{j\pi\beta_p k^2/N}$ (quadratic phase) | Moderate: spectral phase correction |
| ZC (root $u$) | $-\pi\tilde{u}k^2/N$ | $X_{pu}[k]$ (ZC with root $pu$) | Moderate: division by known ZC DFT |

The matched-filter framework makes the three stimulus types **interchangeable** for nonlinear analysis. The choice between them is driven by practical considerations (real-valued output, spectral shape, crest factor, multiplexing) rather than fundamental limitations in harmonic extraction capability.

---

## 4. Open Questions and Future Directions

**Q1. Optimal ZC root index for nonlinear separation.** The harmonic extraction rule (Section 3.11) requires $\gcd(p, N) = 1$ and uses root $pu$ for the $p$-th harmonic. How should $u$ be chosen to maximize the minimum time-domain separation between harmonic orders? This is an optimization over integer $u$ with constraints from the modular arithmetic — likely tractable for given $N$ and maximum harmonic order $P$.

**Q2. Real-valued ZC approximations.** The practical constraint of real-valued output (single DAC channel) limits the usable ZC properties. What is the best real-valued approximation to a ZC stimulus that preserves: (a) near-constant envelope (low crest factor), (b) near-flat spectrum, and (c) harmonic separability? Is $\text{Re}\{x_u[n]\}$ optimal, or can a phase-adjusted construction do better?

**Q3. ZC stimulus for Volterra kernel identification.** The ZC sequence excites all frequencies simultaneously — can it be combined with sparse-spectrum techniques (exciting only selected bins with ZC phases) to achieve both frequency-domain kernel separation (via spectral gaps) and time-domain harmonic separation (via chirp structure)? A hybrid "sparse ZC" stimulus could offer the best of both worlds.

**Q4. Nonlinear cross-coupling in multi-source ZC.** When multiple ZC sources excite a nonlinear system simultaneously, the intermodulation between sources creates cross-coupling that the linear cross-correlation model does not predict. How severe is this coupling, and can it be characterized or compensated?

**Q5. Adaptive chirp rate.** The linear chirp (ZC) has constant frequency-rate. The log chirp has rate proportional to frequency. Could a **system-adapted** chirp rate — faster through frequency regions with short decay times, slower through resonant regions — improve both linear and nonlinear characterization? This would be a phase-optimized stimulus tailored to a specific measurement scenario.

**Q6. Experimental validation.** The harmonic separation mechanism for ZC stimuli (Section 3.11) is derived from the memoryless nonlinearity model. How well does it work for real electroacoustic systems with memory-dependent nonlinearity (Volterra kernels with nonzero extent)? Simulation and measurement studies are needed to characterize the residual harmonic leakage and the practical dynamic range of harmonic separation.

**Q7. Unified matched-filter implementation library.** The matched-filter framework (Section 3.15) shows that all chirp stimuli support the same extraction algebra. A practical implementation that accepts any stimulus $X[k]$ and automatically computes $X_p[k]$ (via numerical $p$-th power and DFT) would unify the code path for all stimulus types — eliminating the need for separate log-sweep-windowing and ZC-root-division code paths.

**Q8. Circularity-optimized band-limited design.** The ZC achieves maximal circularity by covering the full frequency circle, but practical measurements need band-limited stimuli ($[f_1, f_2] \subset [0, f_s/2]$). Can a band-limited stimulus achieve near-ZC circularity (smooth instantaneous-frequency wrap) without the energy waste of exciting out-of-band frequencies? One candidate: a band-limited chirp with a smooth frequency trajectory that asymptotically approaches the band edges rather than reaching them abruptly.

---

## 5. References

1. Farina, A. (2000). "Simultaneous measurement of impulse response and distortion with a swept-sine technique." *108th AES Convention*, Preprint 5093.

2. Müller, S. and Massarani, P. (2001). "Transfer-function measurement with sweeps." *J. Audio Eng. Soc.*, 49(6), 443–471.

3. Novák, A., Simon, L., Kadlec, F., and Lotton, P. (2010). "Nonlinear system identification using exponential swept-sine signal." *IEEE Trans. Instrumentation and Measurement*, 59(8), 2220–2229.

4. Chu, D.C. (1972). "Polyphase codes with good periodic correlation properties." *IEEE Trans. Information Theory*, 18(4), 531–532.

5. Frank, R.L. (1963). "Polyphase codes with good nonperiodic correlation properties." *IEEE Trans. Information Theory*, 9(1), 43–45.

6. Popovic, B.M. (1992). "Generalized chirp-like polyphase sequences with optimum correlation properties." *IEEE Trans. Information Theory*, 38(4), 1406–1409.

7. Schroeder, M.R. (1970). "Synthesis of low-peak-factor signals and binary sequences with low autocorrelation." *IEEE Trans. Information Theory*, 16(1), 85–89.

8. Pintelon, R. and Schoukens, J. (2012). *System Identification: A Frequency Domain Approach*, 2nd ed. Wiley-IEEE Press.

9. Rébillat, M., Hajraoui, R., Mechbal, N., and Vergé, M. (2011). "Identification of nonlinear systems using exponential swept-sine signal." *Mechanical Systems and Signal Processing*, 25(7), 2626–2640.

10. Boyd, S. (1986). "Multitone signals with low crest factor." *IEEE Trans. Circuits and Systems*, 33(10), 1018–1022.

11. Oppenheim, A.V. and Schafer, R.W. (2010). *Discrete-Time Signal Processing*, 3rd ed. Prentice Hall.

12. 3GPP TS 36.211. "Physical channels and modulation." (LTE specification defining ZC usage for reference signals.)

13. Golay, M.J.E. (1961). "Complementary series." *IRE Transactions on Information Theory*, 7(2), 82–87.
