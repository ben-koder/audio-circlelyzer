# Circular Signal Phase Analysis (v2)

> Revised in response to the validation report
> ([../THEORY_VALIDATION_RESULT.md](../THEORY_VALIDATION_RESULT.md)).
> Substantive changes are summarised in [CHANGES.md](CHANGES.md). The
> mathematical core (group-delay formula, single-DFT packing, wrap-bias
> formula, centre-time / mean-group-delay duality, cepstral
> minimum-phase/all-pass decomposition) is unchanged from v1; this
> revision adds an explicit Nyquist-bin handling note for fractional
> shifts.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Core Concepts — Intuitive Overview](#2-core-concepts--intuitive-overview)
   - 2.1 [The Alignment Problem](#21-the-alignment-problem)
   - 2.2 [Phase, Group Delay, and Phase Delay](#22-phase-group-delay-and-phase-delay)
   - 2.3 [The Phase Unwrapping Problem](#23-the-phase-unwrapping-problem)
   - 2.4 [Computing Group Delay Directly — The Better Way](#24-computing-group-delay-directly--the-better-way)
   - 2.5 [From Group Delay to Unwrapped Phase](#25-from-group-delay-to-unwrapped-phase)
   - 2.6 [Estimating Delay and Aligning the Impulse Response](#26-estimating-delay-and-aligning-the-impulse-response)
   - 2.7 [Sub-Sample Alignment Precision](#27-sub-sample-alignment-precision)
   - 2.8 [Minimum-Phase and Excess-Phase Decomposition](#28-minimum-phase-and-excess-phase-decomposition)
   - 2.9 [Group Delay as Frequency-Dependent Energy Arrival Time](#29-group-delay-as-frequency-dependent-energy-arrival-time)
   - 2.10 [Detecting Circular Wrapping via Phase](#210-detecting-circular-wrapping-via-phase)
   - 2.11 [Phase Analysis in the Presence of Nonlinearity](#211-phase-analysis-in-the-presence-of-nonlinearity)
3. [Mathematical Formulation](#3-mathematical-formulation)
   - 3.1 [Notation and Preliminaries](#31-notation-and-preliminaries)
   - 3.2 [The Circular Shift Theorem and Phase](#32-the-circular-shift-theorem-and-phase)
   - 3.3 [Group Delay Computation Without Phase Unwrapping](#33-group-delay-computation-without-phase-unwrapping)
   - 3.4 [Efficient Single-DFT Group Delay Computation](#34-efficient-single-dft-group-delay-computation)
   - 3.5 [Phase Reconstruction from Group Delay](#35-phase-reconstruction-from-group-delay)
   - 3.6 [Bulk Delay Estimation](#36-bulk-delay-estimation)
   - 3.7 [Circular Impulse Response Alignment](#37-circular-impulse-response-alignment)
   - 3.8 [Sub-Sample Delay and Fractional Circular Shift](#38-sub-sample-delay-and-fractional-circular-shift)
   - 3.9 [Minimum-Phase / All-Pass Decomposition via Cepstrum](#39-minimum-phase--all-pass-decomposition-via-cepstrum)
   - 3.10 [Center Time and Mean Group Delay Duality](#310-center-time-and-mean-group-delay-duality)
   - 3.11 [Dispersive Analysis and Frequency-Dependent Delay](#311-dispersive-analysis-and-frequency-dependent-delay)
   - 3.12 [Group Delay Bias from Circular Wrapping](#312-group-delay-bias-from-circular-wrapping)
   - 3.13 [Phase-Based Harmonic Impulse Response Localization](#313-phase-based-harmonic-impulse-response-localization)
4. [References](#4-references)

---

## 1. Introduction

This document extends the circular signal analysis framework described in *Circular Signal Analysis* to cover **phase analysis** — the extraction, interpretation, and application of phase information from circular transfer functions and impulse responses.

The central motivating problem is **impulse response alignment**: a circular impulse response recovered from a looped measurement sits at an arbitrary position within the circular buffer, determined by the unknown propagation delay (source to receiver), system latency (DAC/ADC buffers), and recording offset. Many acoustic analyses — reverberation time (RT60), early decay time, clarity metrics ($C_{50}$, $C_{80}$), and the Schroeder backward integration — require the impulse response to begin at the start of the buffer. Simple peak detection finds the maximum of the impulse but misses the true onset, which precedes the peak. Phase-based methods offer a principled, robust solution.

Beyond alignment, phase analysis reveals the frequency-dependent delay structure of the measured system, enables sub-sample precision timing, and connects to minimum-phase decomposition — all within the exact, artifact-free framework of circular DFT analysis.

The document is organized in two parts: an **intuitive overview** and a **mathematical formulation**, following the structure of the companion document.

---

## 2. Core Concepts — Intuitive Overview

### 2.1 The Alignment Problem

In circular signal analysis, we recover the system's impulse response $h[n]$ by dividing the DFT of the recorded signal by the DFT of the stimulus. The result is a **circular** impulse response: a buffer of $N$ samples that wraps around seamlessly.

The problem is that this impulse response sits at some unknown position $d$ within the buffer. If the loudspeaker-to-microphone propagation takes 5 ms and the system has 2 ms of DAC/ADC latency, the impulse begins 7 ms into the buffer. This offset $d$ depends on the physical setup and is generally different for every measurement.

For frequency-domain analysis — magnitude response, spectral levels, octave-band energy — the offset doesn't matter. A circular shift in time corresponds to a linear phase change in frequency, which leaves magnitudes untouched.

But for **time-domain** analysis, the offset is critical:

- **Schroeder backward integration** (for RT60, EDT) integrates the squared impulse response from a time $t$ to the end. If the impulse isn't at position zero, "the end" is wrong.
- **Clarity metrics** ($C_{50}$, $C_{80}$) compare energy in early vs. late time windows. The window boundaries are measured from the impulse onset, which must be known.
- **Direct-to-reverberant ratio** relies on identifying the direct sound, which is the first arrival.
- **Impulse response truncation and export** requires knowing where the impulse starts.

The naive approach to finding the onset is **peak detection**: find the sample with the largest absolute value and call that the beginning. This works roughly, but the impulse starts *before* its peak — the initial rise takes some time, especially for bandlimited signals. Backing up by a fixed number of samples is an ad hoc workaround that depends on the signal bandwidth and room characteristics.

Phase analysis provides a principled alternative: the phase of the transfer function encodes the delay information at every frequency, and group delay analysis extracts this information without the pitfalls of peak detection.

### 2.2 Phase, Group Delay, and Phase Delay

When a signal passes through a system, each frequency component is delayed by some amount. This delay is encoded in the system's **phase response** $\Theta(\omega)$ — the angle of the complex transfer function $H(\omega)$ at frequency $\omega$.

Two related but distinct delay quantities are derived from the phase:

**Phase delay** at frequency $\omega$:
$$\tau_\phi(\omega) = -\frac{\Theta(\omega)}{\omega}$$

This is the delay experienced by a pure sinusoid at frequency $\omega$. It tells you how far the wave's crests are shifted in time.

**Group delay** at frequency $\omega$:
$$\tau_g(\omega) = -\frac{d\Theta(\omega)}{d\omega}$$

This is the delay experienced by the *envelope* (the amplitude modulation) of a narrowband signal centered at frequency $\omega$. It tells you when the "energy" at that frequency arrives.

For a system that introduces a pure delay of $d$ samples (no filtering, just a time shift), both quantities are equal and constant: $\tau_\phi(\omega) = \tau_g(\omega) = d$ for all $\omega$. The phase is a straight line with slope $-d$: $\Theta(\omega) = -d\omega$.

For a real system (a room, for instance), the group delay varies with frequency — different frequencies are delayed by different amounts due to reflections, resonances, and dispersion. The bulk trend, however, is set by the propagation delay $d$.

### 2.3 The Phase Unwrapping Problem

The conventional approach to computing group delay goes like this:

1. Compute the DFT $H[k]$.
2. Extract the phase: $\Theta[k] = \text{atan2}(\text{Im}(H[k]),\, \text{Re}(H[k]))$.
3. Unwrap the phase (add/subtract multiples of $2\pi$ to remove discontinuities).
4. Differentiate (finite difference) to get group delay.

Step 2 produces values in $(-\pi, \pi]$ — the "wrapped" phase. For systems with significant delay, the true phase changes by many multiples of $2\pi$ across the frequency range. Phase unwrapping (step 3) attempts to recover the true continuous phase by detecting jumps greater than $\pi$ and compensating them.

The problem is that phase unwrapping is **numerically fragile**. When the transfer function has low magnitude at some frequency (a null or near-null), the phase becomes dominated by noise and can jump erratically. The unwrapper cannot distinguish a genuine $2\pi$ jump from a noise-induced one, and a single error propagates to all higher frequencies due to the cumulative nature of unwrapping. For systems with large delays (many wavelengths of total phase accumulation) or deep spectral nulls, conventional unwrapping frequently fails.

Differentiating an incorrectly unwrapped phase then produces wild spikes in the group delay — artifacts that have no physical meaning.

### 2.4 Computing Group Delay Directly — The Better Way

A fundamentally better approach, described by Smith [1] and Taft [2], computes group delay **directly from the complex spectrum** without ever extracting or unwrapping the phase. The method is based on the logarithmic derivative of the transfer function:

The key insight is that the group delay can be expressed as:

$$\tau_g(\omega) = -\text{Im}\left\{\frac{H'(\omega)}{H(\omega)}\right\} = \text{Re}\left\{\frac{H_r(\omega)}{H(\omega)}\right\}$$

where $H_r(\omega)$ is the DFT of the "time-ramped" signal $n \cdot h[n]$ — each sample of the impulse response multiplied by its time index.

In practice, this means:
1. Compute the DFT of $h[n]$ → gives $H[k]$.
2. Compute the DFT of $n \cdot h[n]$ → gives $H_r[k]$.
3. Divide bin-by-bin and take the real part: $\tau_g[k] = \text{Re}\{H_r[k] / H[k]\}$.

No arctan, no unwrapping, no differentiation of a noisy phase sequence. The formula works directly with the complex-valued spectra and produces a smooth, well-behaved group delay even where the magnitude is small (though bins where $|H[k]| \approx 0$ still require care — setting the group delay to zero or interpolating at such bins is standard practice).

An additional computational optimization [2] combines the two DFTs into a single DFT by packing $h[n]$ into the real part and $n \cdot h[n]$ into the imaginary part of a complex input, then separating the two spectra using the conjugate-symmetry property. This halves the computation cost.

### 2.5 From Group Delay to Unwrapped Phase

In the conventional workflow, phase comes first and group delay is derived from it. The direct group delay method reverses this: we compute group delay first, and then **integrate** to recover the unwrapped phase.

Since group delay is the negative derivative of phase with respect to frequency:
$$\tau_g(\omega) = -\frac{d\Theta}{d\omega}$$

we can recover phase by integrating:
$$\Theta(\omega) = \Theta(0) - \int_0^{\omega} \tau_g(\omega')\, d\omega'$$

In the discrete DFT setting, this becomes a cumulative sum:
$$\Theta[k] = \Theta[0] - \frac{2\pi}{N} \sum_{m=0}^{k-1} \tau_g[m]$$

The initial value $\Theta[0] = \angle H[0]$ is the phase at DC, which is $0$ or $\pi$ for a real-valued impulse response (since $H[0]$ is real).

The resulting phase is automatically **unwrapped** — there are no $2\pi$ jumps because we never used arctan. The integration is stable because it accumulates smooth group delay values rather than trying to track and correct phase discontinuities.

From the unwrapped phase, we can compute the phase delay at each frequency:
$$\tau_\phi[k] = -\frac{\Theta[k]}{2\pi k / N}, \quad k > 0$$

This gives the delay of each frequency component's "carrier." For a system with a dominant bulk delay, $\tau_\phi[k]$ will hover near a constant value across frequency.

### 2.6 Estimating Delay and Aligning the Impulse Response

With group delay (and optionally unwrapped phase) in hand, we can estimate the bulk delay $d$ and align the impulse response. Several approaches exist, each with different trade-offs:

#### Approach 1: Energy-weighted mean group delay

The simplest robust estimator averages the group delay across all frequencies, weighting by the signal power at each bin:

$$\hat{d} = \frac{\sum_k |H[k]|^2 \, \tau_g[k]}{\sum_k |H[k]|^2}$$

This is the "center of gravity" of the impulse energy — it gives the center-time $T_s$ (see Section 3.10). It represents where the *bulk* of the energy sits, which is past the onset (because reverberant energy extends well beyond the direct sound). This is useful for centering but tends to **overshoot** the onset.

#### Approach 2: Low-percentile group delay

Rather than the mean, take a low percentile (e.g., 5th percentile) of the group delay values at bins with good SNR:

$$\hat{d}_{\text{onset}} \approx \text{percentile}\{\tau_g[k] : |H[k]| > \epsilon, \; p = 5\%\}$$

This targets the earliest-arriving energy rather than the average. The 5th percentile is more robust than the absolute minimum, which is sensitive to noise at individual bins.

#### Approach 3: Linear fit to unwrapped phase

Fit a line to the unwrapped phase $\Theta[k]$ as a function of $\omega_k = 2\pi k/N$:

$$\Theta[k] \approx a - d \cdot \omega_k$$

The slope $d$ of the best-fit line (weighted by $|H[k]|^2$ for robustness) is the bulk delay. This approach averages phase information across all frequencies and is very stable.

#### Approach 4: Minimum-phase excess delay

Decompose the transfer function into a minimum-phase component and an all-pass (excess-delay) component (see Section 2.8). The minimum-phase component has its impulse response starting at time zero by construction. The all-pass component captures the propagation delay plus any dispersive excess. The slope of the all-pass phase gives the onset delay directly.

**After finding $\hat{d}$**, the alignment is a circular shift. In the frequency domain: multiply $H[k]$ by $e^{+j2\pi k \hat{d}/N}$ to remove the delay, then inverse-DFT. In the time domain: circularly shift $h[n]$ by $-\hat{d}$ samples. If $\hat{d}$ is non-integer, a fractional circular shift is applied in the frequency domain (see Section 2.7).

#### Which approach to use?

- For **centering** the impulse (e.g., for display, or when precise onset isn't critical): use the weighted mean (Approach 1).
- For **onset detection** (e.g., for RT60, clarity metrics): use the low-percentile method (Approach 2) or the minimum-phase decomposition (Approach 4).
- For **maximum robustness** against noise: use the linear phase fit (Approach 3).
- For **sub-sample precision**: any approach, followed by the fractional shift in Section 2.7.

### 2.7 Sub-Sample Alignment Precision

Peak detection inherently has integer-sample resolution — you find the peak at sample $n_{\text{peak}}$, and the best you can do is shift by $n_{\text{peak}}$ samples. Any sub-sample offset remains.

Phase analysis, in contrast, naturally yields **fractional** (sub-sample) delay estimates. The group delay and unwrapped phase are continuous-valued quantities that resolve delays to arbitrary precision, limited only by the measurement SNR.

Once a fractional delay $\hat{d}$ is estimated, alignment is performed entirely in the frequency domain by multiplying each bin by a phase factor:

$$H_{\text{aligned}}[k] = H[k] \cdot e^{+j2\pi k \hat{d}/N}$$

This is the DFT equivalent of a fractional circular shift. The inverse DFT of $H_{\text{aligned}}[k]$ yields an impulse response aligned to sub-sample precision.

Fractional-sample alignment matters in applications like:
- Precise time-of-flight measurement (distance estimation from propagation delay).
- MIMO channel alignment where relative delays between paths must be resolved finely.
- Any interpolation of the impulse response for re-sampling or rendering.

### 2.8 Minimum-Phase and Excess-Phase Decomposition

Any causal impulse response can be decomposed into a **minimum-phase** component and an **all-pass** (excess-phase) component. This decomposition is particularly illuminating for the alignment problem.

**Minimum-phase systems** have a special property: for a given magnitude response $|H[k]|$, the minimum-phase system is the one whose impulse response has the most energy concentrated at the beginning. Its impulse response starts at time zero and decays as quickly as the magnitude spectrum allows. All causal systems with the same magnitude response have delayed or dispersed versions of this impulse.

**All-pass systems** have unit magnitude at all frequencies ($|A[k]| = 1$) and only affect the phase. A pure delay is the simplest all-pass system. More complex all-pass systems introduce frequency-dependent delay (dispersion).

The decomposition works like this:
1. From the magnitude $|H[k]|$, compute the minimum-phase response $H_{\min}[k]$ using the **cepstral method** (Section 3.9). This involves taking the log of the magnitude, inverse-DFT to get the "cepstrum," windowing to the causal half, and DFT back plus exponentiation.
2. The all-pass component is $A[k] = H[k] / H_{\min}[k]$, which satisfies $|A[k]| = 1$.
3. The all-pass phase $\angle A[k]$ captures all the "excess" phase not accounted for by the minimum-phase response.

For a room measurement:
- The minimum-phase component represents the room's spectral shaping (absorption, resonances) with the tightest possible impulse.
- The all-pass component captures the propagation delay plus any dispersive effects from reflections.
- The all-pass phase is approximately linear (a pure delay) at high frequencies where the direct sound dominates.

The slope of the all-pass phase gives the propagation delay $d$. This is conceptually the most principled alignment method because it separates "what the room does to the spectrum" from "how much time the sound takes to arrive."

### 2.9 Group Delay as Frequency-Dependent Energy Arrival Time

Beyond alignment, the group delay $\tau_g[k]$ has a direct physical interpretation: it tells you **when the energy at each frequency arrives**. This is a rich source of information about the system.

For a room impulse response:
- At frequencies near a room mode (resonance), the group delay shows a peak — energy at the resonant frequency "rings" and arrives over a longer time.
- At frequencies between modes, the group delay is closer to the direct-sound propagation delay.
- The spread (variance) of the group delay across frequency indicates how dispersive the system is — how differently it treats different frequencies in terms of delay.

The group delay spectrum can also reveal:
- **Frequency-dependent absorption**: Materials that absorb high frequencies more than low frequencies effectively shorten the group delay at high frequencies.
- **Early vs. late energy distribution**: A system with short group delay at all frequencies delivers energy quickly (clear, intelligible). Long group delay at certain frequencies indicates problematic resonances or late reflections.

An interesting duality connects the time and frequency perspectives: the **energy-weighted mean group delay** (averaging $\tau_g[k]$ weighted by $|H[k]|^2$) exactly equals the **center time** $T_s$ of the impulse response (the first moment of the squared impulse energy). This is not an approximation — it is an exact identity via Parseval's theorem (Section 3.10). The center time, a standard acoustic metric, is simultaneously a time-domain and a frequency-domain quantity.

### 2.10 Detecting Circular Wrapping via Phase

A subtle consequence of circular analysis: at the DFT bin frequencies, the circular transfer function $H_N[k]$ equals the true transfer function $H(e^{j\omega_k})$ **exactly** — both in magnitude and phase. Wrapping (time-domain aliasing) folds tail energy back into the buffer, but this folding is a periodization in time, which leaves the sampled frequency response untouched at the DFT grid points. (This is the Poisson summation formula applied in reverse: the DFT of a periodized impulse response equals the sampled DTFT of the original impulse response.)

So the magnitude spectrum and the phase at each bin are correct regardless of whether the impulse response fits in the buffer. This is good news for frequency-domain analysis — but it also means that simply inspecting $|H[k]|$ or $\angle H[k]$ cannot reveal wrapping.

However, the **group delay** computed via the ramped-DFT method (Section 2.4) is *not* immune to wrapping. The method computes $\text{DFT}\{n \cdot h_N[n]\}$, where $h_N[n]$ is the periodized (wrapped) impulse response. When a tail sample that truly belongs at time index $n + pN$ (for some $p \geq 1$) wraps back into position $n$, the ramp multiplies it by $n$ instead of the correct $n + pN$. This creates a systematic **downward bias** in the measured group delay at frequencies where significant energy wraps around (Section 3.12).

Intuitively: the wrapped tail energy "looks early" to the ramp, pulling the computed energy arrival time toward the beginning of the buffer at the affected frequencies.

This observation yields three practical strategies for detecting whether circular wrapping has occurred:

**Strategy A — Dual group delay comparison.** Compute the group delay two ways: (1) via the ramped-DFT from the measured $h_N[n]$, and (2) via the minimum-phase decomposition (Section 2.8) followed by all-pass slope fitting. The minimum-phase decomposition uses only the magnitude spectrum $|H_N[k]| = |H(e^{j\omega_k})|$ — which is exact regardless of wrapping — so its group delay contribution is correct. The all-pass slope captures the bulk delay, which is also derived from the correct phase values at bin frequencies. If the ramped-DFT group delay is systematically *lower* than the min-phase + all-pass reconstruction, wrapping is present.

**Strategy B — Minimum-phase impulse response length.** From the (exact) magnitude spectrum, construct the minimum-phase impulse response $h_{\min}[n]$ (Section 2.8). This is the *shortest possible* impulse response for its magnitude spectrum — all other causal systems with the same magnitude are longer. If $h_{\min}[n]$ has significant energy extending close to the end of the buffer (say, beyond 70–80% of $N$), then the true impulse response — which includes propagation delay and any excess-phase dispersion — almost certainly exceeds $N$ samples and wraps.

**Strategy C — Center time inconsistency.** The energy-weighted mean group delay equals the center time $T_s$ (Section 2.9). The low-percentile group delay estimates the onset time $d$. For a typical room impulse response, $T_s - d$ (the intrinsic center time after removing bulk delay) should be positive and physically reasonable — a few tens of milliseconds for a normal room. If $T_s$ is suspiciously small relative to $d$, or if $T_s < d$, then wrapping has pulled the mean group delay downward — another wrapping indicator.

#### Partial tail recovery

If wrapping is detected, can the wrapped tail be recovered? Partially, with additional information or assumptions:

- **Model-based extrapolation**: Reverberant tails decay approximately exponentially. If enough of the non-wrapped tail is visible to establish the decay rate, the tail can be extrapolated beyond the buffer boundary. This is an approximation, but it may suffice for RT60 or energy decay analysis.

- **Spectral expansion**: Measure the same system with buffer length $N$ and with buffer length $2N$ (double the stimulus period). The longer measurement reveals what was wrapped at the shorter length. The two magnitude spectra can be compared directly (they agree if no wrapping occurred at the longer length).

- **Multi-rate approach**: Measure at the same buffer length $N$ but at two different sample rates. The physical impulse response has a fixed duration in seconds but maps to different durations in samples. Wrapping occurs at different physical times for each rate, allowing the true tail to be disambiguated.

### 2.11 Phase Analysis in the Presence of Nonlinearity

Real systems are not perfectly linear. A loudspeaker in a room introduces harmonic distortion, intermodulation, and compression. How does nonlinearity interact with phase analysis?

#### Alignment robustness

The good news is that all four delay estimation methods (Section 2.6) are **robust to moderate nonlinearity**:

- **Energy-weighted mean group delay**: Nonlinear harmonics add energy at frequencies that may differ from the stimulus fundamentals, but the linear component typically dominates the spectrum. The energy centroid shifts slightly but remains a usable delay estimate.
- **Low-percentile group delay**: The onset of the impulse response is determined by the first arrival of the direct sound — a purely linear, propagation-limited event. Nonlinearity affects what happens *after* the onset, not the onset itself.
- **Phase slope fit**: Linear regression on the unwrapped phase averages out the localized phase perturbations that nonlinearity introduces. The overall slope (bulk delay) is barely affected.
- **Minimum-phase excess delay**: The magnitude spectrum changes marginally due to distortion, but the all-pass component — which carries the bulk delay — is nearly unchanged.

This robustness arises because nonlinearity is typically a *perturbation* on the linear response: distortion components are 20–40 dB below the linear transfer function in well-behaved systems. Phase-based methods, by aggregating information across the full spectrum, are inherently more robust than peak detection (which can be confused by a distortion product that happens to be large at one time sample).

#### Harmonic IR localization for circular sweeps

In circular swept-sine measurements (see *Circular Nonlinear-Signal Analysis*, Section 2.6), the Farina deconvolution [11] separates harmonic-order impulse responses $h_p[n]$ in time. For a logarithmic sweep of duration $T$ samples spanning frequencies $f_1$ to $f_2$, the $p$-th harmonic IR appears at a time offset:

$$\Delta t_p = \frac{T}{\ln(f_2/f_1)} \cdot \ln(p) \quad \text{samples before the linear IR}$$

After phase-based alignment places the linear IR ($p = 1$) at position $\hat{d}$, each harmonic IR sits at:

$$\hat{n}_p = (\hat{d} - \Delta t_p) \bmod N$$

This is a **deterministic, phase-derived localization** of each harmonic component — far more reliable than searching for harmonic peaks visually or by threshold. It enables automated extraction of harmonic transfer functions $H_p[k]$ by windowing around $\hat{n}_p$.

#### Per-harmonic group delay analysis

Once each harmonic IR is isolated, its group delay $\tau_{g,p}[k]$ reveals the **frequency-dependent temporal structure of each nonlinear order**:

- For the 2nd harmonic ($p = 2$), the group delay shows at which frequencies the 2nd-order distortion arrives early vs. late — reflecting, for instance, a loudspeaker's frequency-dependent compliance nonlinearity.
- For the 3rd harmonic ($p = 3$), the group delay structure may differ, revealing distinct physical mechanisms (e.g., magnetic saturation vs. suspension nonlinearity).
- The group delay spread $\sigma_{\tau,p}$ of each harmonic order is a compact descriptor of how dispersive the nonlinearity is at that order.

#### Overlap detection

A practical concern in circular sweep measurements is whether the linear impulse response's tail overlaps with the nearest harmonic IR. This happens when the reverberation time exceeds the harmonic spacing $\Delta t_1$. Phase analysis provides a frequency-dependent diagnostic: at each frequency bin $k$, compare $\tau_g[k]$ (the energy arrival time of the linear response) with $\Delta t_1$. Frequencies where $\tau_g[k]$ approaches or exceeds $\Delta t_1$ are likely to contaminate the harmonic separation. The minimum-phase group delay $\tau_{g,\min}[k]$ is an even better indicator, as it removes the bulk delay and isolates the intrinsic system decay.

#### Phase coherence across measurement cycles

In multi-cycle measurements, the linear response repeats identically across cycles (it is deterministic). Nonlinear components also repeat if the system's nonlinearity is time-invariant — but **stochastic distortion** (e.g., from turbulence, thermal drift, or loose mechanical parts) will vary between cycles. Comparing the phase of the transfer function across cycles separates deterministic (repeatable) nonlinearity from stochastic contributions, complementing the magnitude-based coherence analysis described in the companion document (*Circular Signal Analysis*, Section 3.7).

#### Looking ahead: stimulus phase as a design variable

The discussion so far treats the stimulus phase spectrum as given. But in the circular framework, the stimulus is a design degree of freedom. While the stimulus's *magnitude spectrum* determines which frequencies are excited and how signal-to-noise ratio is distributed, the stimulus's **phase spectrum** determines the temporal structure — including crest factor, instantaneous frequency trajectory, and how nonlinear mixing products redistribute in time after deconvolution. This opens a design space in which phase-optimized stimuli could achieve better separation of nonlinear orders, lower crest factor, or more favorable time-frequency concentration of harmonic components. This topic is developed further in a dedicated analysis.

---

## 3. Mathematical Formulation

### 3.1 Notation and Preliminaries

This section uses the notation established in *Circular Signal Analysis* (Section 3.1) and adds the following:

| Symbol | Meaning |
|--------|---------|
| $\Theta[k]$ | Phase response (unwrapped) at bin $k$: $\Theta[k] = \angle H[k]$ |
| $\tau_g[k]$ | Group delay at bin $k$ (in samples) |
| $\tau_\phi[k]$ | Phase delay at bin $k$ (in samples) |
| $H_r[k]$ | "Ramped" spectrum: $H_r[k] = \text{DFT}\{n \cdot h[n]\}$ |
| $d$ | Bulk propagation delay (in samples) |
| $H_{\min}[k]$ | Minimum-phase transfer function with same magnitude as $H$ |
| $A[k]$ | All-pass component: $A[k] = H[k] / H_{\min}[k]$ |
| $c[n]$ | Real cepstrum |
| $\omega_k$ | Angular frequency at bin $k$: $\omega_k = 2\pi k / N$ |
| $\Delta\omega$ | Frequency bin spacing: $\Delta\omega = 2\pi / N$ |

All signals are real-valued in the time domain unless stated otherwise. Group delay and phase delay are expressed in samples; divide by $f_s$ for seconds.

### 3.2 The Circular Shift Theorem and Phase

The DFT shift theorem states that a circular shift of $d$ samples in time produces a linear phase rotation in frequency:

$$h[(n - d) \bmod N] \;\longleftrightarrow\; H[k] \cdot e^{-j2\pi kd/N}$$

**Proof**: Let $g[n] = h[(n-d) \bmod N]$. Then:

$$G[k] = \sum_{n=0}^{N-1} h[(n-d) \bmod N]\, e^{-j2\pi kn/N}$$

Substituting $m = (n-d) \bmod N$, so $n = (m+d) \bmod N$:

$$G[k] = \sum_{m=0}^{N-1} h[m]\, e^{-j2\pi k(m+d)/N} = e^{-j2\pi kd/N} \sum_{m=0}^{N-1} h[m]\, e^{-j2\pi km/N} = e^{-j2\pi kd/N} H[k]$$

**Consequences for phase**:
- **Magnitude is shift-invariant**: $|G[k]| = |H[k]|$. The power spectrum is unaffected by circular shifts.
- **Phase acquires a linear component**: $\angle G[k] = \angle H[k] - 2\pi kd/N$. The added phase is linear in $k$ with slope $-2\pi d/N$ per bin.
- **Group delay shifts by $d$**: The derivative of the added linear phase is $-d \cdot \Delta\omega$, so the group delay increases by $d$.

This means: if the "true" aligned transfer function is $H_0[k]$ and the measured one has an unknown circular shift of $d$ samples:

$$H[k] = H_0[k] \cdot e^{-j2\pi kd/N}$$

then recovering $d$ from the phase structure of $H[k]$ recovers the alignment. The shift theorem also guarantees that alignment can be applied exactly in the frequency domain — including fractional (non-integer) $d$ — by multiplying by $e^{+j2\pi kd/N}$.

### 3.3 Group Delay Computation Without Phase Unwrapping

The group delay, defined as the negative frequency derivative of the phase response, can be computed without phase extraction using the **logarithmic derivative** approach [1], [2].

#### Derivation

Write the transfer function in polar form:

$$H(e^{j\omega}) = |H(e^{j\omega})| \cdot e^{j\Theta(\omega)}$$

Taking the logarithm:

$$\ln H(e^{j\omega}) = \ln |H(e^{j\omega})| + j\Theta(\omega)$$

Differentiating with respect to $\omega$:

$$\frac{d}{d\omega} \ln H(e^{j\omega}) = \frac{H'(e^{j\omega})}{H(e^{j\omega})} = \frac{d}{d\omega}\ln |H(e^{j\omega})| + j\Theta'(\omega)$$

The group delay is:

$$\tau_g(\omega) = -\Theta'(\omega) = -\text{Im}\left\{\frac{H'(e^{j\omega})}{H(e^{j\omega})}\right\}$$

#### Evaluating the derivative for FIR signals

For a finite impulse response $h[n]$, $n = 0, \ldots, N-1$:

$$H(e^{j\omega}) = \sum_{n=0}^{N-1} h[n]\, e^{-j\omega n}$$

The frequency derivative is:

$$H'(e^{j\omega}) = \frac{d}{d\omega} H(e^{j\omega}) = -j \sum_{n=0}^{N-1} n \cdot h[n]\, e^{-j\omega n} = -j\, H_r(e^{j\omega})$$

where $H_r(e^{j\omega})$ is the Fourier transform of the **time-ramped** signal $n \cdot h[n]$.

Substituting:

$$\tau_g(\omega) = -\text{Im}\left\{\frac{-j\, H_r(e^{j\omega})}{H(e^{j\omega})}\right\} = \text{Re}\left\{\frac{H_r(e^{j\omega})}{H(e^{j\omega})}\right\}$$

#### DFT implementation

Evaluating at the DFT frequencies $\omega_k = 2\pi k/N$:

$$\boxed{\tau_g[k] = \text{Re}\left\{\frac{H_r[k]}{H[k]}\right\}}$$

where:

$$H[k] = \sum_{n=0}^{N-1} h[n]\, e^{-j2\pi kn/N}, \qquad H_r[k] = \sum_{n=0}^{N-1} n \cdot h[n]\, e^{-j2\pi kn/N}$$

Both are standard $N$-point DFTs. The group delay $\tau_g[k]$ is in **samples**; to convert to seconds, divide by $f_s$.

**Division by zero**: At bins where $|H[k]| = 0$ (spectral nulls), the division is undefined. Practical implementations set $\tau_g[k] = 0$ at such bins, or interpolate from neighboring bins, or skip them in subsequent analysis [1]. In circular analysis with well-designed stimuli, spectral nulls are rare (the stimulus has controlled, non-zero energy at every bin), so this is seldom an issue for the *stimulus* — but the *system transfer function* may have nulls at certain frequencies due to room modes.

### 3.4 Efficient Single-DFT Group Delay Computation

The basic method requires two DFTs: one for $H[k]$ and one for $H_r[k]$. These can be combined into a **single DFT** using the linearity and conjugate-symmetry properties of the DFT [2].

#### Construction

Form the complex-valued signal:

$$c[n] = h[n] + j \cdot n \cdot h[n], \quad n = 0, \ldots, N-1$$

Compute a single DFT:

$$C[k] = \text{DFT}\{c[n]\} = H[k] + j\, H_r[k]$$

#### Separation via conjugate symmetry

Since $h[n]$ and $n \cdot h[n]$ are both real-valued, their DFTs satisfy Hermitian symmetry individually. From $C[k]$ and $C^*[N-k]$, we can separate:

$$H[k] = \frac{1}{2}\left(C[k] + C^*[N-k]\right)$$

$$H_r[k] = \frac{1}{2j}\left(C[k] - C^*[N-k]\right)$$

(with the convention $C^*[N-0] = C^*[0]$).

#### Group delay from the single DFT

$$\tau_g[k] = \text{Re}\left\{\frac{H_r[k]}{H[k]}\right\} = \text{Re}\left\{\frac{C[k] - C^*[N-k]}{j\left(C[k] + C^*[N-k]\right)}\right\}$$

This halves the computational cost compared to the two-DFT approach. For $N$-point signals, the cost is a single FFT of size $N$ plus $O(N)$ post-processing.

### 3.5 Phase Reconstruction from Group Delay

Given the group delay $\tau_g[k]$ at all DFT bins, the unwrapped phase is recovered by **integration** (cumulative summation) over frequency [2]:

$$\Theta[k] = \Theta[0] - \Delta\omega \sum_{m=0}^{k-1} \tau_g[m]$$

where $\Delta\omega = 2\pi / N$ is the spacing between adjacent DFT bins.

**Initial condition**: $\Theta[0] = \angle H[0]$. For real-valued $h[n]$, $H[0] = \sum_n h[n]$ is real, so $\Theta[0] \in \{0, \pi\}$ (i.e., $0$ if $H[0] > 0$, $\pi$ if $H[0] < 0$).

**Trapezoidal refinement**: For improved numerical accuracy, the trapezoidal rule can be used:

$$\Theta[k] = \Theta[k-1] - \frac{\Delta\omega}{2}\left(\tau_g[k-1] + \tau_g[k]\right), \quad k = 1, 2, \ldots$$

**Properties of the reconstructed phase**:
- **Automatically unwrapped**: No $2\pi$ jumps, because the phase is built up incrementally from smooth group delay values.
- **Numerically stable**: Integration is a smoothing operation; small errors in $\tau_g[k]$ at individual bins are averaged out rather than amplified.
- **Correct modulo constant**: The initial condition $\Theta[0]$ sets the overall phase reference. Any error in $\Theta[0]$ shifts all phases by a constant, which does not affect group delay or delay estimation.

**Phase delay** from the reconstructed phase:

$$\tau_\phi[k] = -\frac{\Theta[k]}{\omega_k} = -\frac{\Theta[k]}{2\pi k / N}, \quad k > 0$$

Phase delay is undefined at DC ($k = 0$) since $\omega_0 = 0$ would require division by zero.

### 3.6 Bulk Delay Estimation

Given $\tau_g[k]$ (and optionally the reconstructed $\Theta[k]$), the bulk propagation delay $d$ can be estimated by several methods.

#### Method 1: Energy-weighted mean group delay

$$\hat{d}_{\text{mean}} = \frac{\sum_{k=0}^{N/2} |H[k]|^2\, \tau_g[k]}{\sum_{k=0}^{N/2} |H[k]|^2}$$

This equals the center time $T_s$ of the impulse response (see Section 3.10). It represents the energy centroid, not the onset. It overestimates $d$ for systems with significant reverberation or dispersion. The summation is over the non-redundant half of the spectrum ($0$ to $N/2$) due to Hermitian symmetry.

#### Method 2: Robust onset estimate (low-percentile group delay)

Define the set of "reliable" bins as those with sufficient signal energy:

$$\mathcal{K} = \{k : |H[k]| > \epsilon \cdot \max_m |H[m]|\}$$

where $\epsilon$ is a relative threshold (e.g., $\epsilon = 0.01$, i.e., 40 dB below the peak). Then:

$$\hat{d}_{\text{onset}} = \text{percentile}\{\tau_g[k] : k \in \mathcal{K},\; p\}$$

with $p \approx 5\%$. This targets the earliest-arriving energy. Using a low percentile rather than the minimum guards against isolated noisy bins.

#### Method 3: Weighted linear regression on unwrapped phase

Fit the model $\Theta[k] = a - d \cdot \omega_k$ by weighted least squares:

$$\hat{d}_{\text{fit}} = -\frac{\sum_k w_k\, \omega_k\, \Theta[k] - \left(\sum_k w_k\, \omega_k\right)\left(\sum_k w_k\, \Theta[k]\right) / W}{\sum_k w_k\, \omega_k^2 - \left(\sum_k w_k\, \omega_k\right)^2 / W}$$

where $w_k = |H[k]|^2$ (or any other SNR-guided weight), $W = \sum_k w_k$, and the sums are over $k = 1, \ldots, N/2$ (excluding DC). This is a standard weighted linear regression of $\Theta$ on $\omega$.

This method is highly stable because it uses all frequency bins simultaneously and the linear fit averages out random fluctuations. However, it estimates the *average* slope of the phase, which again corresponds to something closer to the energy centroid than the onset.

#### Method 4: Minimum-phase excess delay (onset-optimal)

Compute the minimum-phase transfer function $H_{\min}[k]$ from $|H[k]|$ (Section 3.9). Define the all-pass phase:

$$\Phi_{\text{AP}}[k] = \angle H[k] - \angle H_{\min}[k]$$

Since $|H_{\min}[k]| = |H[k]|$, the all-pass component is $A[k] = H[k] / H_{\min}[k]$ with $|A[k]| = 1$.

For an impulse response that is a pure delay followed by a minimum-phase system: $\Phi_{\text{AP}}[k] = -2\pi k d / N$ (exactly linear). In practice, reflections and dispersion add a nonlinear component, but the linear trend dominates.

Estimate $d$ via linear regression on $\Phi_{\text{AP}}[k]$, or equivalently, compute the group delay of $A[k]$ (using the same ramped-DFT method) and take a weighted mean.

This method most directly targets the **onset**, because the minimum-phase component absorbs the spectral shaping while the all-pass component isolates the time offset.

#### Summary of methods

| Method | Estimates | Robust to noise? | Accounts for dispersion? |
|--------|-----------|:-:|:-:|
| Weighted mean $\tau_g$ | Energy centroid | Yes | No (gives centroid, not onset) |
| Low-percentile $\tau_g$ | Onset | Moderate | Partially |
| Linear fit to $\Theta$ | Average slope | Yes | No |
| Min-phase excess delay | Onset | Yes | Yes |

### 3.7 Circular Impulse Response Alignment

Given a delay estimate $\hat{d}$ (from any of the methods in Section 3.6), the alignment is performed as follows.

#### Integer-sample alignment

If $\hat{d}$ is rounded to the nearest integer $d_0 = \text{round}(\hat{d})$:

**Frequency-domain**: Multiply by a phase factor and inverse-DFT:

$$H_{\text{aligned}}[k] = H[k] \cdot e^{+j2\pi k d_0 / N}$$

$$h_{\text{aligned}}[n] = \text{IDFT}\{H_{\text{aligned}}[k]\}$$

**Time-domain equivalent**: Circular shift:

$$h_{\text{aligned}}[n] = h[(n + d_0) \bmod N]$$

Both produce identical results. The frequency-domain approach is preferred when $H[k]$ is already available.

#### Fractional-sample alignment

If $\hat{d}$ is non-integer (sub-sample precision, Section 3.8):

$$H_{\text{aligned}}[k] = H[k] \cdot e^{+j2\pi k \hat{d} / N}$$

$$h_{\text{aligned}}[n] = \text{IDFT}\{H_{\text{aligned}}[k]\}$$

There is no simple time-domain equivalent — fractional shifts require the frequency-domain phase multiplication or equivalent sinc interpolation.

#### Verification

After alignment, the group delay of $H_{\text{aligned}}[k]$ should be reduced by $\hat{d}$ at every bin:

$$\tau_{g,\text{aligned}}[k] = \tau_g[k] - \hat{d}$$

The energy-weighted mean group delay (center time) should be close to zero if $\hat{d} = T_s$, or close to the system's intrinsic center time if $\hat{d}$ was the onset delay.

### 3.8 Sub-Sample Delay and Fractional Circular Shift

The fractional circular shift is a direct consequence of the DFT shift theorem (Section 3.2), which holds for any real-valued $d$ — not just integers.

For fractional $d$:

$$h_d[n] = \text{IDFT}\left\{H[k] \cdot e^{-j2\pi kd/N}\right\}$$

The result $h_d[n]$ is a sinc-interpolated version of the original circular impulse response, shifted by exactly $d$ samples. Since the DFT represents the signal exactly at bin frequencies, the sinc interpolation is exact (no aliasing) within the circular framework.

**Hermitian symmetry preservation**: For real-valued $h[n]$, the shifted spectrum $H[k] \cdot e^{-j2\pi kd/N}$ does not have Hermitian symmetry when $d$ is non-integer (because the phase factor $e^{-j2\pi kd/N}$ breaks the conjugate relationship between bins $k$ and $N-k$). To ensure a real-valued output, one of the following constructions should be used:
- Use the full complex IDFT and take the real part (discarding the imaginary part, which is negligible in exact arithmetic).
- Use `irfft`: apply the phase factor $e^{-j2\pi kd/N}$ for $k = 1,\ldots,N/2-1$, leave $H[0]$ unchanged, and at the Nyquist bin (when $N$ is even) replace the complex factor by its real part $\cos(\pi d)$ — i.e. set the Nyquist coefficient to $\mathrm{Re}\{H[N/2]\,e^{-j\pi d}\} = H[N/2]\cos(\pi d)$. Skipping the Nyquist correction injects a small but real DC-style ripple whose amplitude grows with $|d|$.

**Precision**: The achievable precision of delay estimation depends on the signal-to-noise ratio. For a transfer function measured with SNR $= \gamma$ (in linear amplitude), the standard deviation of the delay estimate via the weighted phase-slope method scales as approximately [3]:

$$\sigma_d \sim \frac{1}{\gamma \cdot \sqrt{N} \cdot \overline{\omega}}$$

where $\overline{\omega}$ is the RMS frequency of the signal. Higher SNR and broader bandwidth yield more precise delay estimates.

### 3.9 Minimum-Phase / All-Pass Decomposition via Cepstrum

The **cepstral method** recovers the minimum-phase transfer function from the magnitude spectrum [4], [5]. In the circular DFT framework, this computation is exact.

#### Real cepstrum

The real cepstrum of $h[n]$ is defined as:

$$\hat{c}[n] = \text{IDFT}\left\{\ln |H[k]|\right\}$$

Note: at bins where $|H[k]| = 0$, $\ln |H[k]| = -\infty$. In practice, a small floor $\epsilon$ is applied: $\ln(\max(|H[k]|, \epsilon))$.

#### Minimum-phase cepstrum

The minimum-phase signal is obtained by retaining only the causal part of the cepstrum and doubling it (except at $n = 0$ and $n = N/2$):

$$\hat{c}_{\min}[n] = \begin{cases}
\hat{c}[0] & n = 0 \\
2\hat{c}[n] & 1 \leq n \leq N/2 - 1 \\
\hat{c}[N/2] & n = N/2 \quad (\text{if } N \text{ even}) \\
0 & N/2 + 1 \leq n \leq N - 1
\end{cases}$$

This windowing of the cepstrum doubles the causal part, zeros the anti-causal part, and preserves the DC and Nyquist terms. It implements the Hilbert transform relationship between log-magnitude and minimum phase [4].

#### Minimum-phase reconstruction

$$H_{\min}[k] = \exp\left(\text{DFT}\{\hat{c}_{\min}[n]\}\right)$$

By construction:
- $|H_{\min}[k]| = |H[k]|$ (same magnitude as the original).
- $\angle H_{\min}[k]$ is the minimum-phase corresponding to $|H[k]|$.
- $h_{\min}[n] = \text{IDFT}\{H_{\min}[k]\}$ is causal and starts at $n = 0$.

#### All-pass extraction

The all-pass (excess-phase) component is:

$$A[k] = \frac{H[k]}{H_{\min}[k]}$$

By construction, $|A[k]| = 1$ for all $k$. The all-pass phase is:

$$\Phi_{\text{AP}}[k] = \angle A[k] = \angle H[k] - \angle H_{\min}[k]$$

If the system is a pure delay of $d$ samples applied to a minimum-phase system:

$$H[k] = H_{\min}[k] \cdot e^{-j2\pi kd/N}$$

then $\Phi_{\text{AP}}[k] = -2\pi kd/N$ (perfectly linear), and the slope gives $d$.

#### Delay from all-pass group delay

The all-pass group delay can be computed using the ramped-DFT method (Section 3.3) applied to the impulse response of the all-pass component $a[n] = \text{IDFT}\{A[k]\}$:

$$\tau_{g,\text{AP}}[k] = \text{Re}\left\{\frac{A_r[k]}{A[k]}\right\}$$

where $A_r[k] = \text{DFT}\{n \cdot a[n]\}$.

Alternatively, since the all-pass group delay relates to the total and minimum-phase group delays simply as:

$$\tau_{g,\text{AP}}[k] = \tau_g[k] - \tau_{g,\min}[k]$$

it can be computed by subtracting the minimum-phase group delay from the measured group delay.

The bulk delay estimate is then:

$$\hat{d} = \frac{\sum_k |H[k]|^2\, \tau_{g,\text{AP}}[k]}{\sum_k |H[k]|^2}$$

or any of the other estimation methods from Section 3.6 applied to $\tau_{g,\text{AP}}$.

### 3.10 Center Time and Mean Group Delay Duality

**Theorem**: The energy-weighted mean group delay equals the center time (first moment of the squared impulse response):

$$\frac{\sum_{k=0}^{N-1} |H[k]|^2\, \tau_g[k]}{\sum_{k=0}^{N-1} |H[k]|^2} = \frac{\sum_{n=0}^{N-1} n \cdot h^2[n]}{\sum_{n=0}^{N-1} h^2[n]}$$

**Proof**:

Starting from the left side, expand $\tau_g[k]$:

$$\sum_{k=0}^{N-1} |H[k]|^2\, \tau_g[k] = \sum_{k=0}^{N-1} |H[k]|^2 \text{Re}\left\{\frac{H_r[k]}{H[k]}\right\} = \sum_{k=0}^{N-1} \text{Re}\{H^*[k]\, H_r[k]\}$$

$$= \text{Re}\left\{\sum_{k=0}^{N-1} H^*[k]\, H_r[k]\right\}$$

By **Parseval's theorem** for the DFT:

$$\sum_{k=0}^{N-1} A^*[k]\, B[k] = N \sum_{n=0}^{N-1} a^*[n]\, b[n]$$

With $a[n] = h[n]$ ($\leftrightarrow H[k]$) and $b[n] = n \cdot h[n]$ ($\leftrightarrow H_r[k]$):

$$\sum_{k=0}^{N-1} H^*[k]\, H_r[k] = N \sum_{n=0}^{N-1} h[n] \cdot n \cdot h[n] = N \sum_{n=0}^{N-1} n\, h^2[n]$$

(Since $h[n]$ is real, $h^*[n] = h[n]$.)

Similarly, the denominator:

$$\sum_{k=0}^{N-1} |H[k]|^2 = N \sum_{n=0}^{N-1} h^2[n]$$

Dividing:

$$\frac{\sum_k |H[k]|^2\, \tau_g[k]}{\sum_k |H[k]|^2} = \frac{N \sum_n n\, h^2[n]}{N \sum_n h^2[n]} = \frac{\sum_n n\, h^2[n]}{\sum_n h^2[n]} = T_s \qquad \blacksquare$$

This identity is exact at the DFT level (not a continuous-frequency approximation). It connects the time-domain center time $T_s$ — a standard room acoustic metric (see *Circular Signal Analysis*, Section 3.11) — to the frequency-domain group delay structure.

**Remark**: For aligned impulse responses (onset at $n = 0$), $T_s$ directly characterizes the "temporal center of gravity" of the room response. For unaligned impulse responses, $T_s$ includes the propagation delay $d$. After alignment by $\hat{d}$, the residual $T_s - \hat{d}$ is the intrinsic center time of the system.

### 3.11 Dispersive Analysis and Frequency-Dependent Delay

The group delay $\tau_g[k]$ characterizes the **dispersion** of the system — how differently each frequency is delayed.

#### Non-dispersive (pure delay) component

For a system with bulk delay $d$, the group delay can be decomposed as:

$$\tau_g[k] = d + \Delta\tau_g[k]$$

where $\Delta\tau_g[k]$ is the frequency-dependent deviation from the bulk delay. In a system with zero dispersion (pure delay), $\Delta\tau_g[k] = 0$ for all $k$.

#### Group delay spread

The spread of the group delay (a measure of dispersion severity) can be quantified by the energy-weighted variance:

$$\sigma_\tau^2 = \frac{\sum_{k} |H[k]|^2\, (\tau_g[k] - \bar{\tau})^2}{\sum_{k} |H[k]|^2}$$

where $\bar{\tau} = T_s$ is the mean group delay from Section 3.10. A large $\sigma_\tau$ indicates that different frequencies arrive at significantly different times — the system is highly dispersive.

#### Band-limited group delay

For acoustic analysis, it is often useful to compute the group delay within specific frequency bands (e.g., octave bands). The mean group delay in a band $\mathcal{B}$ is:

$$\bar{\tau}_{\mathcal{B}} = \frac{\sum_{k \in \mathcal{B}} |H[k]|^2\, \tau_g[k]}{\sum_{k \in \mathcal{B}} |H[k]|^2}$$

This gives a frequency-dependent picture of when energy arrives at different parts of the spectrum and can reveal:
- Room modes (large group delay at resonant frequencies).
- Frequency-dependent absorption (shorter group delay at well-damped frequencies).
- Structural resonances in loudspeakers or other transducers.

#### Relationship to coherence

In multi-cycle measurements (see *Circular Signal Analysis*, Section 3.7), the noise floor is directly observable in the "off-bins." The group delay computed from the de-noised transfer function (with noise bins zeroed) will be more stable than from the raw transfer function. At frequencies where the noise floor is high relative to the signal (low coherence), the group delay becomes unreliable. The per-bin SNR from multi-cycle analysis can serve as a confidence weight for the group delay:

$$w[k] = \frac{|H_{\text{signal}}[k]|^2}{|H_{\text{signal}}[k]|^2 + |N[k]|^2}$$

where $|H_{\text{signal}}[k]|^2$ is the signal power and $|N[k]|^2$ is the noise power estimated from the off-bins. This is the circular-analysis analogue of the coherence function $\gamma^2$ from cross-spectral methods.

### 3.12 Group Delay Bias from Circular Wrapping

This section formalizes the wrapping-induced bias observed in Section 2.10.

#### Setup: periodized impulse response

Let $h[m]$ be the true (possibly long) causal impulse response, $m = 0, 1, 2, \ldots$. The circular buffer of length $N$ contains the periodized version (see *Circular Signal Analysis*, Section 3.3):

$$h_N[n] = \sum_{p=0}^{\infty} h[n + pN], \quad n = 0, \ldots, N-1$$

At the DFT frequencies $\omega_k = 2\pi k/N$, the standard Poisson summation result gives:

$$H_N[k] = H(e^{j\omega_k})$$

where $H(e^{j\omega})$ is the DTFT of the original $h[m]$. Both magnitude and phase are **exact** at all DFT bins regardless of wrapping.

#### Ramped-DFT group delay under wrapping

The ramped-DFT group delay (Section 3.3) computes:

$$\tau_{g,N}[k] = \text{Re}\left\{\frac{H_{r,N}[k]}{H_N[k]}\right\}$$

where $H_{r,N}[k] = \text{DFT}\{n \cdot h_N[n]\}$.

Expanding $n \cdot h_N[n]$:

$$n \cdot h_N[n] = n \sum_{p=0}^{\infty} h[n + pN] = \sum_{p=0}^{\infty} n \cdot h[n + pN]$$

The *correct* time ramp for the true impulse response would assign index $(n + pN)$ to each copy:

$$\sum_{p=0}^{\infty} (n + pN) \cdot h[n + pN] = \sum_{p=0}^{\infty} n \cdot h[n + pN] + N \sum_{p=0}^{\infty} p \cdot h[n + pN]$$

Define the **wrap-count weighted signal**:

$$w[n] = \sum_{p=0}^{\infty} p \cdot h[n + pN], \quad n = 0, \ldots, N-1$$

Note that $w[n] = 0$ when there is no wrapping (i.e., $h[m] = 0$ for all $m \geq N$, so only the $p = 0$ term survives). When wrapping occurs, $w[n] > 0$ wherever tail energy from period $p \geq 1$ lands.

The correctly-ramped signal $r[n] = \sum_p (n+pN) \cdot h[n+pN]$ periodizes the true ramped sequence $m \cdot h[m]$, so its DFT at $\omega_k$ equals the DTFT of $m \cdot h[m]$ evaluated at $\omega_k$. Since the DTFT of $m \cdot h[m]$ is $j H'(e^{j\omega})$, we have:

$$R[k] = \text{DFT}\{r[n]\} = j H'(e^{j\omega_k})$$

Therefore:

$$H_{r,N}[k] = R[k] - N \cdot W[k]$$

where $W[k] = \text{DFT}\{w[n]\}$.

#### Bias formula

Substituting into the group delay expression:

$$\tau_{g,N}[k] = \text{Re}\left\{\frac{R[k] - N \cdot W[k]}{H_N[k]}\right\} = \text{Re}\left\{\frac{R[k]}{H_N[k]}\right\} - N \cdot \text{Re}\left\{\frac{W[k]}{H_N[k]}\right\}$$

The first term is the true group delay (since $\text{Re}\{R[k]/H_N[k]\} = \text{Re}\{jH'(\omega_k)/H(\omega_k)\} = \tau_g^{\text{true}}(\omega_k)$):

$$\boxed{\tau_{g,N}[k] = \tau_g^{\text{true}}(\omega_k) - N \cdot \text{Re}\left\{\frac{W[k]}{H_N[k]}\right\}}$$

The bias term $B[k] = N \cdot \text{Re}\{W[k]/H_N[k]\}$ has the following properties:

- **Zero when no wrapping**: If $h[m] = 0$ for $m \geq N$, then $w[n] = 0$ and $B[k] = 0$.
- **Non-negative in aggregate**: The energy-weighted mean of $B[k]$ is proportional to $\sum_n n \cdot w[n] \cdot h_N[n]$, which is non-negative for typical impulse responses (where wrap contributions $w[n]$ correlate positively with $h_N[n]$).
- **Frequency-dependent**: $B[k]$ is large at frequencies where significant wrap energy coincides with the transfer function phase.

#### Detection criterion (Strategy A)

The minimum-phase decomposition (Section 3.9) uses only $|H_N[k]| = |H(e^{j\omega_k})|$, which is exact. Therefore $\tau_{g,\min}[k]$ computed from $H_{\min}[k]$ is unbiased. The all-pass component $A[k] = H_N[k]/H_{\min}[k]$ has correct phase (since both numerator and denominator phases are correct at bin frequencies), so its group delay $\tau_{g,\text{AP}}[k]$ is also unbiased.

Define the discrepancy:

$$\Delta[k] = \left(\tau_{g,\min}[k] + \tau_{g,\text{AP}}[k]\right) - \tau_{g,N}[k] = B[k]$$

If $\Delta[k] > 0$ at a statistically significant number of bins, wrapping is present. A practical test statistic is the energy-weighted mean discrepancy:

$$\bar{\Delta} = \frac{\sum_k |H_N[k]|^2 \, \Delta[k]}{\sum_k |H_N[k]|^2}$$

Under the null hypothesis (no wrapping), $\bar{\Delta} = 0$. In practice, numerical precision and noise introduce small departures, so a threshold (calibrated against the noise floor) is needed.

#### Detection criterion (Strategy B)

The minimum-phase impulse response $h_{\min}[n]$ (Section 3.9) has the shortest possible support for its magnitude spectrum. Define the effective support as:

$$L_{\min} = \max\{n : |h_{\min}[n]| > \epsilon \cdot \max_m |h_{\min}[m]|\}$$

If $L_{\min} > \alpha N$ (for some threshold $\alpha$, typically $0.7$–$0.8$), then the true impulse response, which is at least as long as $h_{\min}$ plus the bulk delay $d$, almost certainly exceeds $N$ samples.

### 3.13 Phase-Based Harmonic Impulse Response Localization

For a circular logarithmic sweep of duration $T$ samples (see *Circular Nonlinear-Signal Analysis*, Section 2.6), the Farina deconvolution [11] produces harmonic-order impulse responses $h_p[n]$ that appear at predictable positions in the circular buffer. This section describes the log-sweep case in detail; for linear chirps and Zadoff–Chu sequences, a generalized matched-filter framework supersedes the windowing approach described here (see *Circular Signal Design*, Sections 2.13 and 3.15).

#### Harmonic time offsets (logarithmic sweep)

The $p$-th harmonic order, when deconvolved by the fundamental sweep, appears at a time offset before the linear ($p = 1$) IR:

$$\Delta t_p = \frac{T}{\ln(f_2/f_1)} \cdot \ln(p) \quad \text{(samples)}$$

This follows from the logarithmic sweep's instantaneous frequency trajectory: the sweep reaches frequency $f/p$ at time $\Delta t_p$ before it reaches frequency $f$, and the $p$-th harmonic of the input at $f/p$ aliases to frequency $f$ at the output.

The key property of the log sweep is that this offset is **frequency-independent** — the same $\Delta t_p$ applies at all output frequencies $f$. This makes the harmonic IRs compact (non-dispersed), enabling extraction by simple time-domain windowing. Other chirp types (linear chirp, ZC) produce frequency-dependent offsets $\Delta t_p(f)$, resulting in dispersed harmonic traces that require spectral-domain matched-filter extraction instead.

#### Circular harmonic positions

Let $\hat{d}$ be the phase-based delay estimate for the linear IR (Section 3.6). The linear IR sits at circular position $\hat{d}$. The $p$-th harmonic IR sits at:

$$\boxed{\hat{n}_p = (\hat{d} - \Delta t_p) \bmod N}$$

Since $\Delta t_p > 0$ for $p \geq 2$, harmonic IRs appear *before* the linear IR in the circular buffer (wrapping around to the end of the buffer if $\hat{d} < \Delta t_p$).

#### Extraction windows

Each harmonic IR $h_p[n]$ is extracted by applying a window centered at $\hat{n}_p$ with width determined by the spacing between adjacent harmonics:

$$W_p = \Delta t_p - \Delta t_{p+1} = \frac{T}{\ln(f_2/f_1)} \cdot \ln\left(\frac{p}{p+1}\right)$$

Note that $W_p$ decreases with $p$, so higher-order harmonics are more tightly packed and have shorter available windows. This limits the frequency resolution of higher-order harmonic transfer functions.

#### Overlap diagnostic

The linear IR's tail may overlap with the 2nd harmonic IR when the system's decay time exceeds $\Delta t_1$. A frequency-dependent diagnostic uses the minimum-phase group delay:

$$\text{Overlap risk at bin } k: \quad \tau_{g,\min}[k] > \Delta t_1 - \delta$$

where $\delta$ is a safety margin. At frequencies where this condition holds, the linear tail contaminates the 2nd-harmonic extraction window. This diagnostic guides either the choice of a longer buffer $N$ (to increase $\Delta t_1 \propto T$) or the flagging of unreliable frequency bands in the harmonic transfer functions.

#### Per-harmonic group delay

Once $H_p[k] = \text{DFT}\{h_p[n]\}$ is obtained by windowed extraction, the group delay of each harmonic order is computed via the ramped-DFT method:

$$\tau_{g,p}[k] = \text{Re}\left\{\frac{H_{r,p}[k]}{H_p[k]}\right\}$$

where $H_{r,p}[k] = \text{DFT}\{n \cdot h_p[n]\}$ (with $n$ relative to the extraction window origin $\hat{n}_p$).

The group delay spread of each harmonic order:

$$\sigma_{\tau,p}^2 = \frac{\sum_k |H_p[k]|^2 (\tau_{g,p}[k] - \bar{\tau}_p)^2}{\sum_k |H_p[k]|^2}$$

characterizes the dispersion of the $p$-th nonlinear mechanism. Comparing $\sigma_{\tau,p}$ across harmonic orders reveals whether nonlinearity is frequency-localized (small spread) or broadband (large spread).

---

## 4. References

1. Smith, J.O. III. "Numerical Computation of Group Delay," in *Introduction to Digital Filters with Audio Applications*. Available online: https://ccrma.stanford.edu/~jos/fp/Numerical_Computation_Group_Delay.html

2. Taft, J. (2024). "Better Way to Calculate Group Delay for Digital Signals." *Jeffrey's Substack: Beyond the Jagged Frontier*. Available online: https://jeffreytaft.substack.com/p/better-way-to-calculate-group-delay

3. Oppenheim, A.V. and Schafer, R.W. (2010). *Discrete-Time Signal Processing*, 3rd ed. Prentice Hall. (Chapters 5 and 12: group delay, cepstral analysis, and minimum-phase systems.)

4. Oppenheim, A.V. and Schafer, R.W. (2004). "From Frequency to Quefrency: A History of the Cepstrum." *IEEE Signal Processing Magazine*, 21(5), 95–106.

5. Childers, D.G., Skinner, D.P., and Kemerait, R.C. (1977). "The Cepstrum: A Guide to Processing." *Proceedings of the IEEE*, 65(10), 1428–1443.

6. Murthy, H.A. and Yegnanarayana, B. (1991). "Group delay functions and its application to speech processing." *Sadhana*, 36, 745–782.

7. Smith, J.O. III. *Mathematics of the Discrete Fourier Transform (DFT)*, with Audio Applications, 2nd ed. Available online: https://ccrma.stanford.edu/~jos/mdft/

8. Allen, J.B. and Rabiner, L.R. (1977). "A unified approach to short-time Fourier analysis and synthesis." *Proceedings of the IEEE*, 65(11), 1558–1564.

9. Grüner, E. and Huber, R. (1996). "Simple method for the estimation of the time of arrival." *Acustica united with Acta Acustica*, 82(4), 622–625.

10. Müller, S. and Massarani, P. (2001). "Transfer-function measurement with sweeps." *J. Audio Eng. Soc.*, 49(6), 443–471.

11. Farina, A. (2000). "Simultaneous measurement of impulse response and distortion with a swept-sine technique." *108th AES Convention*, Preprint 5093.
