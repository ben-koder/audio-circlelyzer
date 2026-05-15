# Circular Signal Analysis

## Table of Contents

1. [Introduction](#1-introduction)
2. [Core Concepts — Intuitive Overview](#2-core-concepts--intuitive-overview)
   - 2.1 [The Circular Signal Idea](#21-the-circular-signal-idea)
   - 2.2 [Why the FFT Loves Circular Signals](#22-why-the-fft-loves-circular-signals)
   - 2.3 [Stimulus Signal Design](#23-stimulus-signal-design)
   - 2.4 [Transfer Function and Impulse Response Recovery](#24-transfer-function-and-impulse-response-recovery)
   - 2.5 [Steady-State Convergence](#25-steady-state-convergence)
   - 2.6 [Multi-Cycle Recording and Noise Reduction](#26-multi-cycle-recording-and-noise-reduction)
   - 2.7 [Multi-Source Multiplexing in Frequency](#27-multi-source-multiplexing-in-frequency)
   - 2.8 [Cross-Channel (MIMO) Analysis](#28-cross-channel-mimo-analysis)
   - 2.9 [Circular Impulse Response and the Aliasing Condition](#29-circular-impulse-response-and-the-aliasing-condition)
   - 2.10 [Spectral Expansion and Unrolling](#210-spectral-expansion-and-unrolling)
   - 2.11 [Nonlinearity and Stimulus Choice](#211-nonlinearity-and-stimulus-choice)
3. [Mathematical Formulation](#3-mathematical-formulation)
   - 3.1 [Notation and Preliminaries](#31-notation-and-preliminaries)
   - 3.2 [The Discrete Fourier Transform and Circularity](#32-the-discrete-fourier-transform-and-circularity)
   - 3.3 [Circular Convolution Theorem](#33-circular-convolution-theorem)
   - 3.4 [Stimulus Design in Frequency Domain](#34-stimulus-design-in-frequency-domain)
   - 3.5 [Transfer Function Estimation](#35-transfer-function-estimation)
   - 3.6 [Steady-State Analysis of Circular Playback](#36-steady-state-analysis-of-circular-playback)
   - 3.7 [Multi-Cycle Noise Reduction](#37-multi-cycle-noise-reduction)
   - 3.8 [Frequency-Division Multi-Source Multiplexing](#38-frequency-division-multi-source-multiplexing)
   - 3.9 [MIMO Extension](#39-mimo-extension)
   - 3.10 [Spectral Expansion (Unrolling)](#310-spectral-expansion-unrolling)
   - 3.11 [Derived Quantities: RT60, Octave Bands, Clarity Metrics](#311-derived-quantities-rt60-octave-bands-clarity-metrics)
4. [Comparison with Existing Methods and Literature](#4-comparison-with-existing-methods-and-literature)
   - 4.1 [Swept-Sine (Exponential Sine Sweep) Methods](#41-swept-sine-exponential-sine-sweep-methods)
   - 4.2 [Maximum Length Sequences (MLS)](#42-maximum-length-sequences-mls)
   - 4.3 [Periodic Random Noise Methods](#43-periodic-random-noise-methods)
   - 4.4 [Dual-FFT / Cross-Spectral Methods](#44-dual-fft--cross-spectral-methods)
   - 4.5 [OFDM and Frequency-Division Multiplexing in Telecommunications](#45-ofdm-and-frequency-division-multiplexing-in-telecommunications)
   - 4.6 [Hadamard / Interleaved Sequences for Multi-Source Measurement](#46-hadamard--interleaved-sequences-for-multi-source-measurement)
   - 4.7 [Golay Complementary Sequences](#47-golay-complementary-sequences)
   - 4.8 [Summary Comparison Table](#48-summary-comparison-table)
5. [References](#5-references)

---

## 1. Introduction

This document describes the theoretical foundations and practical design of **circular signal analysis** — a measurement methodology that exploits the inherent periodicity of looped signals to achieve exact, artifact-free frequency-domain analysis. The approach turns a well-known limitation of the Discrete Fourier Transform (the assumption of signal periodicity) into a deliberate advantage.

The method is applicable to electroacoustic measurements (room impulse responses, loudspeaker characterization, hearing aid evaluation) and more broadly to any linear time-invariant (LTI) system identification task where a controlled stimulus can be looped continuously.

The document is organized in three parts:

1. **Intuitive overview** — explains all key ideas in accessible, informal language.
2. **Mathematical formulation** — provides rigorous derivations for every claim.
3. **Literature comparison** — relates the approach to established measurement techniques.

---

## 2. Core Concepts — Intuitive Overview

### 2.1 The Circular Signal Idea

Imagine you have a loudspeaker playing a sound on repeat — the same waveform, over and over, in an endless loop. At some point the room "settles down": the echoes from each loop iteration perfectly overlap with the beginnings of the next, and the microphone signal becomes periodic with the same period as the loop. We call this the **steady state**.

At steady state, both the stimulus (what the speaker plays) and the response (what the microphone records) are **circular signals** of the same length. "Circular" means that if you take one period and glue the end to the beginning, it joins seamlessly — the signal is genuinely periodic.

This is the fundamental observation: **a continuously looped stimulus, once steady state is reached, produces a genuinely periodic response with the same period**. Everything that follows exploits this fact.

### 2.2 Why the FFT Loves Circular Signals

The Discrete Fourier Transform (DFT, computed efficiently via the FFT algorithm) has a well-known implicit assumption: it treats the input buffer as if it repeats forever. In ordinary signal processing, this is a *problem*. A recorded snippet of music doesn't repeat seamlessly — the start and end generally don't match, creating discontinuities. These discontinuities cause "spectral leakage," smearing energy across frequency bins. Engineers use window functions (Hann, Hamming, Blackman, etc.) to taper the signal edges toward zero, which reduces leakage but introduces its own distortions.

With circular signals, the FFT's assumption is *literally true*. The signal genuinely repeats, so there are no discontinuities and no leakage. We can apply the FFT directly — no windowing, no zero-padding, no tapering — and get an exact frequency-domain representation at each DFT bin frequency. Every bin captures exactly the energy that is there, with no smearing from neighboring frequencies.

This is not just a minor convenience; it eliminates an entire category of measurement error.

### 2.3 Stimulus Signal Design

The only requirement for a stimulus in circular analysis is that it can be **looped** — played back repeatedly so the system reaches a periodic steady state. Any signal of length $N$ can serve as a circular stimulus. However, different signal types bring different trade-offs in terms of spectral coverage, crest factor, SNR, and the ability to characterize nonlinearities. Below are several useful categories.

#### "Perfect" frequency-domain-designed signals

Since the stimulus is under our control, we can design it in the frequency domain and then transform it to a time-domain waveform via the inverse FFT. This lets us create signals with precisely controlled spectral properties:

- **Perfect white**: Every frequency bin gets the same amplitude (flat spectrum). The phase at each frequency is chosen randomly. The resulting time-domain signal sounds like noise but has *exactly* flat spectral content at every DFT frequency — unlike ordinary white noise, which is only statistically flat and fluctuates at individual bins.

- **Perfect pink**: The amplitude at each frequency bin follows a $1/\sqrt{f}$ law (so power falls as $1/f$), with random phases. This produces a signal that, when analyzed over one cycle, has *exactly* the desired pink spectral shape.

Because these signals are constructed from the IDFT, they are automatically circular — the last sample connects seamlessly to the first. Furthermore, to guarantee a real-valued time-domain signal, the spectrum is given Hermitian symmetry: the phase at bin $k$ is the negative of the phase at bin $N-k$, and the DC ($k=0$) and Nyquist ($k=N/2$) components are real.

The random-phase design yields a roughly Gaussian amplitude distribution with a crest factor of about 10–12 dB. This is a practical disadvantage compared to binary signals (crest factor 0 dB), since a higher crest factor means less average power can be delivered for a given peak level.

#### Circular frequency sweep

A **circular sweep** is the circular analogue of the exponential (logarithmic) sine sweep. Instead of sweeping from a start frequency to a stop frequency over a finite duration with abrupt start/stop, the instantaneous frequency sweeps continuously and wraps around, so that the last sample's phase connects seamlessly to the first sample's phase.

To generate a circular sweep of length $N$ at sample rate $f_s$:

1. Choose the sweep range $[f_1, f_2]$ (e.g., 20 Hz to 20 kHz).
2. Define the instantaneous frequency as a function that sweeps from $f_1$ to $f_2$ over $N$ samples and wraps such that the total accumulated phase over one period is an integer multiple of $2\pi$:
   $$f(n) = f_1 \cdot \left(\frac{f_2}{f_1}\right)^{n/N}, \quad n = 0, \ldots, N-1$$
3. Compute the instantaneous phase by integrating:
   $$\phi(n) = 2\pi \sum_{i=0}^{n-1} \frac{f(i)}{f_s}$$
4. Adjust the total phase to be an exact multiple of $2\pi$: scale $\phi(n)$ by the factor $2\pi \lfloor \phi(N)/(2\pi) \rceil / \phi(N)$ so that $\phi(N) = \phi(0) \pmod{2\pi}$, ensuring circularity.
5. The signal is $x[n] = \sin(\phi(n))$.

Note that the rescaling step (4) micro-warps the instantaneous frequency so that the seamless-wrap condition is met; the result is therefore a *near*-exponential sweep whose end frequency has been adjusted by less than one DFT bin. A mathematically cleaner alternative is to design the sweep directly in the DFT domain by assigning the appropriate quadratic-in-$\ln k$ phase to the excited bins (see *Circular Signal Design*, §2.5 for the analogous linear-chirp construction).

The resulting signal sounds like a sweep that loops seamlessly. Its DFT has energy at all frequencies in $[f_1, f_2]$, though the energy per bin is not uniform (it follows the $1/f$ distribution characteristic of exponential sweeps). Outside $[f_1, f_2]$, bins have zero or near-zero energy.

A circular sweep has a much lower crest factor than random-phase noise (~3 dB) since it is sinusoidal at each instant. It also opens the door to nonlinearity characterization in the circular framework (see Section 2.11).

#### Linear chirps and Zadoff–Chu sequences

Beyond the exponential sweep, two other chirp families are available for circular stimulus design:

- **Circular linear sweep**: The instantaneous frequency increases at a constant rate in Hz/s (rather than octaves/s). This produces a flat magnitude spectrum (equal energy per hertz) and is natural for systems with physically meaningful structure on a linear frequency axis. See *Circular Signal Design*, Section 2.4.

- **Zadoff–Chu (ZC) sequences**: Discrete constant-amplitude complex chirps with perfect cyclic autocorrelation and exactly flat DFT magnitude. ZC sequences are inherently circular — they require no design adjustment for periodicity. Their crest factor of 1 (complex) is the theoretical optimum. On the positive frequency axis, a real ZC chirp traces a forward-backward sweep (DC → Nyquist → DC), making it the **maximally circular** stimulus: the instantaneous frequency wraps smoothly at both the buffer boundary and the Nyquist turnaround. See *Circular Signal Design*, Sections 2.7 and 2.12.

All three chirp types (log sweep, linear chirp, ZC) support harmonic separation for nonlinear characterization via a unified matched-filter principle. They differ in spectral shape, crest factor, and extraction complexity (see *Circular Signal Design*, Section 2.13). The choice between them depends on the application's requirements for spectral shape, crest factor, and simplicity of harmonic extraction.

#### Looped MLS and other binary sequences

A Maximum Length Sequence (MLS) of period $2^n - 1$ is inherently periodic and can be looped directly as a circular stimulus. The same applies to Golay complementary sequences or any other pseudo-random binary sequence. These have the advantage of a 0 dB crest factor (binary, $\pm 1$ values), maximizing the average power delivered to the system. However, their spectral shape is fixed (approximately flat for MLS), and they are very sensitive to system nonlinearity — harmonic distortion products cannot be separated from the linear response.

#### Arbitrary and custom signals

Nothing prevents the use of any other signal — a recorded music clip, a chirp, a pulse train, speech-weighted noise, etc. — as long as it is looped. The only practical concern is that the stimulus must have non-zero energy at the frequencies of interest; bins where $|X[k]| \approx 0$ will produce noisy or undefined transfer function estimates at those frequencies. The "perfect" frequency-domain design simply guarantees controlled energy at every bin, but it is a design choice, not a fundamental requirement of the circular analysis framework.

### 2.4 Transfer Function and Impulse Response Recovery

Once we have the circular stimulus $x$ and the circular recording $y$ (one period each, both of length $N$), the transfer function of the room (or any LTI system under test) is obtained by simple spectral division:

$$H[k] = \frac{Y[k]}{X[k]}, \quad k = 0, 1, \ldots, N-1$$

where $X[k]$ and $Y[k]$ are the DFTs of $x$ and $y$ respectively. The division is well-conditioned at frequencies where the stimulus has significant energy. Stimuli designed with non-zero amplitude at every bin (e.g., perfect white, perfect pink, MLS) ensure this holds everywhere; stimuli with limited bandwidth (e.g., a circular sweep over a subrange) yield valid results only within their active frequency range.

The magnitude response $|H[k]|$ tells us how much the system amplifies or attenuates each frequency. The phase response $\angle H[k]$ tells us how much each frequency is delayed or shifted. The impulse response $h[n]$ is simply the inverse DFT of $H[k]$.

At frequencies where the stimulus has adequate energy, this is exact — not an estimate, not an approximation. There are no windowing artifacts, no leakage, no bias. The only imperfection comes from measurement noise, which is addressed next.

### 2.5 Steady-State Convergence

When playback first starts, the room response has not yet "filled up" with reflections. The microphone picks up the direct sound plus early reflections, but later reflections from the first loop haven't fully arrived yet. After several loop repetitions (how many depends on the room's reverberation time relative to the loop length), the response converges to the periodic steady state.

A useful rule of thumb: if the loop length is $T_{\text{loop}}$ seconds and the room's $\text{RT}_{60}$ is $T_{60}$ seconds, then after $P \approx T_{60}/T_{\text{loop}}$ loops the residual transient is at $-60$ dB; after $P \approx 2 T_{60}/T_{\text{loop}}$ it is at $-120$ dB. A conservative practical choice is therefore $P_{\text{warm-up}} \approx 2\,T_{60}/T_{\text{loop}}$ loops discarded before recording. (See §3.6 for the underlying $10^{-3PT/T_{60}}$ envelope; the v1 wording "3–5 $T_{60}/T_{\text{loop}}$ loops for $-60$ dB" was over-conservative by a factor of 3–5.)

### 2.6 Multi-Cycle Recording and Noise Reduction

Suppose the loop length is $N$ samples and we record $M$ complete cycles, giving us $M \cdot N$ samples. If we take an FFT of all $M \cdot N$ samples (a single large FFT of size $L = M \cdot N$), something interesting happens in the spectrum:

- The original signal's energy concentrates at bins $0, M, 2M, 3M, \ldots$ — i.e., every $M$-th bin. These bins correspond to the frequencies that are integer multiples of the fundamental looping frequency $1/T_{\text{loop}}$. Call them the **on-bins**.
- The in-between bins ($1, 2, \ldots, M-1, M+1, \ldots$) — the **off-bins** — contain *zero signal energy*, since the signal is exactly $N$-periodic.

In practice, the off-bins are not zero — they contain **measurement noise and interference**. Two distinct benefits follow.

#### Benefit 1 — Coherent SNR gain at the on-bins ($+10\log_{10}M$ dB, *not* $20\log_{10}M$)

For white noise with per-sample variance $\sigma^2$:

* The on-bin signal amplitude is $M\,\tilde X[m]$ (the $M$-fold time-domain repetition coherently sums to $M\times$ the single-period amplitude). Signal power at each on-bin is $M^2|\tilde X[m]|^2$.
* The on-bin noise variance is $E[|\mathcal N[k]|^2] = L\sigma^2 = MN\sigma^2$ (white noise gives the same expected noise power at *every* DFT bin, on- or off-bin).
* On-bin SNR therefore scales as

$$\mathrm{SNR}_{\text{on-bin}} \;=\; \frac{M^2|\tilde X[m]|^2}{MN\sigma^2} \;=\; M \cdot \mathrm{SNR}_{\text{single cycle}},$$

i.e. **$10\log_{10}M$ dB power gain** (or, equivalently, a $\sqrt M$ amplitude gain). This is the classical coherent-averaging result and equals exactly the gain obtained by averaging the $M$ cycles in the time domain. Zeroing off-bins and inverse-transforming is *mathematically identical* to that time-domain average; by Parseval, no operation on the same data can do better at the on-bins. (A common but incorrect intuition pictures an extra "$20\log_{10}M$" gain from off-bin zeroing on top of a $10\log_{10}M$ average — the $1/M$ figure is the fraction of *total spectral noise energy* that survives zeroing, not an SNR change at the bins where the signal actually lives.)

| $M$ | On-bin SNR gain |
|---:|---:|
| $2$  | $+3$ dB |
| $4$  | $+6$ dB |
| $10$ | $+10$ dB |
| $100$ | $+20$ dB |
| $1000$ | $+30$ dB |

The same gain is obtained by plain time-domain averaging — the FFT view does not add to it. An asynchronous tonal interferer at frequency $f_0$ is attenuated by the Dirichlet factor $|\sin(\pi M q)/(M\sin(\pi q))|$ with $q = f_0 N/f_s$, and this attenuation applies identically under both averaging and off-bin zeroing. Exact removal occurs only in the special case where $f_0$ lands exactly on an off-bin of the $L = MN$-point grid.

#### Benefit 2 — Direct, model-free noise spectrum

The off-bins are a *measured* noise floor. No assumption of Gaussianity, whiteness, or stationarity is needed: whatever lands at off-bins *is* the noise contribution at those frequencies. This is a diagnostic that plain time-domain averaging does not provide — averaging suppresses noise but does not separate it from signal. It is the framework's main qualitative advantage over a pure averaging approach.

> **What this procedure does *not* fix.**
> Periodic interference that *is* synchronous with the loop (e.g. a 60 Hz hum when $T_{\text{loop}}$ is an exact multiple of 1/60 s) lands on on-bins and is indistinguishable from the signal. Time-variance, sample-clock drift, or any departure from exact $N$-periodicity smears signal energy into off-bins, in which case the off-bin spectrum is no longer pure noise — and the on/off comparison itself becomes a *diagnostic* for those failure modes.

#### Bottom line

Multi-cycle FFT processing gives:

1. **$+10\log_{10}M$ dB** of on-bin SNR against random/white noise (same as time-domain averaging — the two procedures are mathematically equivalent on the same data).
2. A **measured** noise spectrum, model-free (this *is* unique to the FFT view).

### 2.7 Multi-Source Multiplexing in Frequency

Now consider measuring multiple sources (e.g., multiple loudspeakers) simultaneously. We assign each source its own set of frequency bins, with no overlap — a frequency-division multiplexing scheme.

> **Real-stimulus constraint (read this first).**
> A bin set $\mathcal S_s = \{k : k\equiv s\pmod S\}$ in the $SN$-point
> spectrum is closed under the conjugation $k\mapsto SN-k$ (and therefore
> compatible with a real-valued time-domain stimulus) only when
> $2s \equiv 0\pmod S$, i.e. when $s = 0$ or $s = S/2$ (the latter only
> for even $S$). For every other source the stimulus is necessarily
> complex-valued and **cannot be radiated from a single ordinary
> loudspeaker**. Practically this means:
>
> * $S = 2$ — both sources real. ✓ Canonical case.
> * $S = 4, 6, \ldots$ (even) — at most $S/2 + 1$ sources can be assigned
>   the bin sets $s \in \{0, S/2\}$ as real stimuli; the remaining sources
>   would require I/Q-channel transmission.
> * $S$ odd, $S \ge 3$ — only source 0 is real.
>
> For genuinely multi-source acoustic measurement with $S \ge 3$ on
> ordinary single-channel hardware, **ZC root-index code-division
> multiplexing** (see *Circular Signal Design*, §2.10/§3.12) is the
> recommended approach: every source uses every bin, separation comes
> from the orthogonality of ZC roots, and every stimulus remains real-
> valued (or near-real if the ZC's real part is used).
>
> The construction below is exact; the warning above governs *which*
> sources can actually be used as real audio stimuli.

**Two sources** (period = $2N$, using $2\times$ the basic loop length, or equivalently a 2-cycle FFT):
- Source 1 uses bins $0, 2, 4, 6, \ldots$ (even bins)
- Source 2 uses bins $1, 3, 5, 7, \ldots$ (odd bins)

**Three sources** (period = $3N$):
- Source 1 uses bins $0, 3, 6, 9, \ldots$
- Source 2 uses bins $1, 4, 7, 10, \ldots$
- Source 3 uses bins $2, 5, 8, 11, \ldots$

The general pattern: for $S$ sources, the total signal period is $S \cdot N$. Source $s$ ($s = 0, 1, \ldots, S-1$) uses bins $\{s, s+S, s+2S, \ldots\}$.

Since the sources occupy disjoint frequency bins, a single microphone recording contains all sources' contributions *without interference*. In the frequency domain, we simply pick out the bins belonging to each source to reconstruct each individual transfer function.

After extracting source $s$'s bins from the long FFT ($S \cdot N$ points), we can "compact" the result to an $N$-point spectrum by removing the zero-valued interleaved bins. However, there is a subtlety: for source $s > 0$, the extracted bins sit at frequencies $(m + s/S) \cdot f_s/N$ — offset by a fraction $s/S$ of a bin from the standard $N$-point DFT grid. This means a naive $N$-point inverse FFT of the compacted bins does not directly yield a real-valued impulse response. Instead, the inverse transform must account for this fractional-bin shift by applying a modulation (complex exponential multiplication) either before or after the IDFT. For source 0, no correction is needed since its bins fall exactly on the standard grid.

The trade-off is explicit: we convert frequency resolution (or equivalently, time duration of the loop) into source count. $S$ sources require $S\times$ the loop length but yield $S$ independent transfer functions from a single recording.

### 2.8 Cross-Channel (MIMO) Analysis

The multi-source idea extends naturally to multiple receivers (microphones). With $S$ sources and $R$ receivers, a single measurement yields $S \times R$ independent transfer functions — every source-to-receiver path is characterized simultaneously.

Each receiver records a sum of all sources (since sound propagates linearly), but the frequency-multiplexed source signals are separable. Each receiver's recording is processed independently to extract each source's contribution, giving the full $S \times R$ matrix of transfer functions.

This is valuable for spatial audio, multichannel loudspeaker calibration, beamforming array characterization, and similar applications where the full MIMO transfer matrix is needed.

### 2.9 Circular Impulse Response and the Aliasing Condition

The impulse response obtained from the inverse DFT of $H[k]$ is inherently **circular** (periodic) with period $N$ samples. Two cases arise:

1. **Loop length exceeds impulse response length** ($N > L_h$, where $L_h$ is the effective length of the true impulse response): The circular impulse response is an accurate representation of the true impulse response. The tail of the impulse fits within the $N$-sample window, and the circular "wrap-around" contains only negligible energy.

2. **Loop length is shorter than impulse response** ($N < L_h$): The tail of the impulse response wraps around and overlaps with the beginning — circular time-domain aliasing. The magnitude response $|H[k]|$ at the DFT frequencies is still accurate (it reflects the true system gain at those exact frequencies), but the time-domain impulse response is a distorted, aliased version of the true one.

In practice, one should choose the loop length to be at least 2–3 times the expected $\text{RT}_{60}$ to avoid time-aliasing of the impulse response.

### 2.10 Spectral Expansion and Unrolling

Sometimes we want a finer frequency resolution than the basic $f_s/N$ bin spacing provides, or equivalently, we want a longer time-domain impulse response. The **spectral expansion** (or "unrolling") operation extends an $N$-bin transfer function to $EN$ bins by zero-insertion followed by interpolation.

> **Fundamental limit (read this before relying on the result).**
> Zero-insertion in frequency followed by IDFT is *exactly equivalent* to
> $E$-fold periodic repetition of the original $N$-sample impulse response.
> No new information about the system is created. Recovering an actual
> $EN$-sample, non-aliased impulse response requires extrapolation
> assumptions: causality, exponential decay, a parametric tail model, or
> a longer measurement. The interpolation step below is *inference*, not
> measurement, and its quality is bounded by how well the assumptions
> hold for the specific system.

Given a transfer function $H[k]$ of length $N$, we create an expanded spectrum of length $E \cdot N$ (where $E$ is the expansion factor) by inserting $E-1$ zeros between each original bin: $H_{\text{exp}}[0] = H[0]$, zeros, $H_{\text{exp}}[E] = H[1]$, zeros, etc. After the insertion, interpolation fills in the zero-valued bins to reconstruct a smooth, higher-resolution spectrum.

The inverse DFT of the expanded spectrum yields an "unrolled" impulse response $E\times$ longer. This is useful for *visualising* long room decays when a parametric or causal-decay tail model is acceptable; it is not a substitute for a measurement that is itself long enough to capture the full decay.

### 2.11 Nonlinearity and Stimulus Choice

All of the above assumes the system under test is **linear** (or close enough). In practice, loudspeakers, microphones, and amplifiers exhibit nonlinear distortion. How this distortion affects the measurement depends critically on the choice of stimulus signal.

With **broadband noise-like stimuli** (perfect white, perfect pink, MLS), harmonic distortion products generated by the system fall at the same frequencies as the stimulus itself — there is no way to tell them apart from the linear response. The measured "transfer function" is actually an aggregate of the linear response plus all distortion products. This is the same limitation faced by MLS-based measurements.

With a **circular sweep**, the situation is more interesting. In an exponential sweep, the instantaneous frequency changes monotonically. Harmonic distortion of order $p$ at instantaneous frequency $f$ produces energy at frequency $pf$. In a conventional (non-looped) exponential sweep, this causes harmonic distortion products to appear as separate "pre-impulses" in the deconvolved impulse response — this is Farina's key insight. In a *circular* sweep, the same principle leads to a separation in the *circular* impulse response: the distortion products appear as distinct features at different circular delays, offset from the main (linear) impulse response. Whether this separation is clean depends on the sweep rate and the loop length, but the basic mechanism carries over from the non-circular case.

The multi-cycle recording technique (Section 2.6) also provides some insight into nonlinearity. If a system introduces harmonic distortion of order $p$, the distortion at stimulus frequency $f_k$ (bin $k$) creates energy at frequency $pf_k$ (bin $pk$). In a multi-cycle recording of $M$ cycles, the stimulus energy sits at every $M$-th bin. Distortion products of odd harmonics will land on different bins than the stimulus for certain combinations of $M$ and $p$, making them distinguishable from the linear response. However, this is incomplete — some harmonics will alias back onto stimulus bins — so it does not provide full nonlinear characterization.

In summary: the choice of stimulus determines the degree to which nonlinear effects can be observed or separated. The circular analysis framework does not inherently prevent nonlinear measurement, but the signal design must be chosen with nonlinearity in mind.

---

## 3. Mathematical Formulation

### 3.1 Notation and Preliminaries

| Symbol | Meaning |
|--------|---------|
| $N$ | Length of the circular signal (samples), also the DFT size |
| $f_s$ | Sampling rate (Hz) |
| $T = N/f_s$ | Period of the circular signal (seconds) |
| $x[n]$ | Circular stimulus signal, $n = 0, 1, \ldots, N-1$ |
| $y[n]$ | Circular recorded signal (steady-state), $n = 0, 1, \ldots, N-1$ |
| $h[n]$ | System impulse response |
| $X[k]$ | DFT of $x$ at bin $k$ |
| $Y[k]$ | DFT of $y$ at bin $k$ |
| $H[k]$ | Transfer function at bin $k$ |
| $\tilde{x}[n]$ | Periodic extension: $\tilde{x}[n] = x[n \bmod N]$ |

All signals are real-valued in the time domain. Frequency-domain quantities are complex-valued. Indices are taken modulo the appropriate period unless stated otherwise.

### 3.2 The Discrete Fourier Transform and Circularity

The DFT of a finite sequence $x[n]$ of length $N$ is defined as:

$$X[k] = \sum_{n=0}^{N-1} x[n]\, e^{-j2\pi k n / N}, \quad k = 0, 1, \ldots, N-1$$

The inverse DFT recovers the time-domain signal:

$$x[n] = \frac{1}{N} \sum_{k=0}^{N-1} X[k]\, e^{j2\pi k n / N}, \quad n = 0, 1, \ldots, N-1$$

**Key property**: The DFT pair implicitly treats $x[n]$ as periodic with period $N$. That is, the DFT analysis/synthesis is equivalent to Fourier series analysis of the periodic extension $\tilde{x}[n] = x[n \bmod N]$. For arbitrary finite-length signals, this periodicity assumption creates artifacts at the boundaries. For genuinely circular signals (where the signal is designed to be periodic with period $N$), the assumption is exact and introduces no artifacts.

**Hermitian symmetry**: For real-valued $x[n]$, the DFT satisfies $X[N-k] = X^*[k]$ (complex conjugate). This means the spectrum is fully determined by bins $k = 0, 1, \ldots, \lfloor N/2 \rfloor$.

### 3.3 Circular Convolution Theorem

The output of an LTI system with impulse response $h[n]$ to a periodic input $\tilde{x}[n]$ (period $N$), at steady state, is the **circular convolution**:

$$y[n] = (h \circledast x)[n] = \sum_{m=0}^{N-1} h_N[m]\, x[(n - m) \bmod N]$$

where $h_N[n]$ is the $N$-periodic alias of the true impulse response:

$$h_N[n] = \sum_{p=-\infty}^{\infty} h[n + pN], \quad n = 0, 1, \ldots, N-1$$

The DFT circular convolution theorem states:

$$\text{DFT}\{h \circledast x\} = H[k] \cdot X[k]$$

That is, circular convolution in time corresponds to pointwise multiplication in frequency.

**Proof sketch**: Substituting the IDFT representations of $h_N[n]$ and $x[n]$ into the circular convolution sum and exploiting the orthogonality of complex exponentials yields $Y[k] = H_N[k] \cdot X[k]$, where $H_N[k]$ is the DFT of $h_N[n]$.

**Important consequence**: When $h[n]$ has finite support within $[0, N-1]$ (i.e., the impulse response fits in one period), then $h_N[n] = h[n]$ and we have exact convolution. When the impulse response is longer, the periodically aliased version $h_N[n]$ is what is measured.

### 3.4 Stimulus Design in Frequency Domain

The circular analysis framework accepts any stimulus $x[n]$ of length $N$ that is looped. The only mathematical requirement is that $|X[k]| > 0$ at each frequency bin $k$ where the transfer function is to be estimated. Below we formalize several stimulus design approaches.

#### Frequency-domain-designed signals ("perfect" stimuli)

We design the stimulus by specifying its DFT directly:

$$X[k] = A[k]\, e^{j\phi[k]}, \quad k = 0, 1, \ldots, N-1$$

where $A[k] > 0$ is the desired amplitude and $\phi[k]$ is the phase at bin $k$.

**Perfect white stimulus**: $A[k] = 1$ for all $k$.

**Perfect pink stimulus**: $A[k] = 1/\sqrt{f_k}$ where $f_k = k \cdot f_s / N$ for $k > 0$, and $A[0] = 1$.

**Phase selection**: $\phi[k]$ is drawn independently and uniformly from $[0, 2\pi)$ for $k = 1, 2, \ldots, \lfloor N/2 \rfloor - 1$. For real-valued output, we enforce Hermitian symmetry:
- $\phi[0] = 0$ (DC is real)
- $\phi[N/2] = 0$ if $N$ is even (Nyquist is real)
- $\phi[N-k] = -\phi[k]$ for $k = 1, \ldots, \lfloor N/2 \rfloor - 1$

The time-domain stimulus is obtained by IDFT:

$$x[n] = \frac{1}{N} \sum_{k=0}^{N-1} A[k]\, e^{j\phi[k]}\, e^{j2\pi kn/N}$$

By construction, $x[n]$ is real, has exactly the specified amplitude spectrum when analyzed with an $N$-point DFT, and seamlessly wraps around (is circular with period $N$).

**Crest factor**: The random phase distribution tends to produce signals with a roughly Gaussian amplitude distribution, yielding a crest factor of approximately 3–4 (10–12 dB). This is similar to Gaussian noise but with perfectly controlled spectral content.

#### Circular frequency sweep

Define the instantaneous frequency as an exponential sweep that wraps circularly:

$$f_{\text{inst}}(t) = f_1 \cdot \left(\frac{f_2}{f_1}\right)^{t/T}, \quad t \in [0, T)$$

where $T = N/f_s$ is the period. The instantaneous phase is:

$$\phi(t) = 2\pi \int_0^t f_{\text{inst}}(\tau)\,d\tau = \frac{2\pi f_1 T}{\ln(f_2/f_1)} \left[\left(\frac{f_2}{f_1}\right)^{t/T} - 1\right]$$

For circularity, the total phase over one period must be an integer multiple of $2\pi$. Let $\Phi_T = \phi(T)$; we define the circular sweep as:

$$x[n] = \sin\!\left(\phi(n/f_s) \cdot \frac{2\pi \, \text{round}(\Phi_T / 2\pi)}{\Phi_T}\right)$$

This ensures $x[N] = x[0]$ (seamless wrap-around). The resulting DFT has energy concentrated in $[f_1, f_2]$ with an amplitude distribution that follows the characteristic $1/f$ shape of exponential sweeps. The crest factor is low (~3 dB, sinusoidal at each instant).

#### Linear chirps and Zadoff–Chu sequences

The same DFT-domain construction can produce other chirp families by choosing a structured (non-random) phase function $\phi[k]$:

**Linear chirp**: A quadratic phase $\phi[k] = -\pi(k - k_1)^2/(k_2 - k_1)$ over bins $[k_1, k_2]$ produces a constant-rate frequency sweep with approximately flat magnitude spectrum.

**Zadoff–Chu (ZC)**: A quadratic phase $\phi[k] = \pi\tilde{u}k^2/N$ over all bins produces a discrete circular chirp with exactly flat magnitude, perfect cyclic autocorrelation, and crest factor 1 (complex). On the folded positive-frequency axis, the real part of a ZC sequence traces a forward-backward sweep (DC → Nyquist → DC), making it the maximally circular chirp: the instantaneous frequency wraps smoothly at every boundary.

All chirp stimuli support nonlinear harmonic separation via a unified matched-filter framework (see *Circular Signal Design*, Sections 2.13 and 3.15).

#### Binary sequences

Any periodic binary sequence of length $N$ (MLS of period $2^n - 1$ padded to $N$, Golay sequences, etc.) can be looped directly. These have 0 dB crest factor and approximately flat power spectra, but their DFT amplitudes $|X[k]|$ are not exactly equal across bins (only statistically flat or flat in autocorrelation). The transfer function estimate $\hat{H}[k] = Y[k]/X[k]$ remains valid wherever $|X[k]|$ is sufficiently above zero.

#### General stimulus

For an arbitrary stimulus $x[n]$ the only formal requirement is that $|X[k]| > \epsilon$ at frequencies of interest, for some threshold $\epsilon$ related to the noise floor. The SNR of the transfer function estimate at bin $k$ scales as $|X[k]|/|N_\eta[k]|$, so bins with low stimulus energy yield noisy estimates. When $|X[k]| = 0$ at some bin, $\hat{H}[k]$ is undefined there — this is acceptable if those frequencies are not needed.

### 3.5 Transfer Function Estimation

Given the DFTs $X[k]$ and $Y[k]$, the transfer function estimate is:

$$\hat{H}[k] = \frac{Y[k]}{X[k]} = \frac{Y[k] \cdot X^*[k]}{|X[k]|^2}$$

This is implemented as bin-wise complex division. The division is well-conditioned at bins where $|X[k]|$ is sufficiently above zero. For stimuli designed with $|X[k]| > 0$ for all $k$ (perfect white/pink, MLS), this holds everywhere; for stimuli with limited bandwidth (e.g., a circular sweep) it holds within the active range.

The **magnitude response** is:

$$|\hat{H}[k]| = \frac{|Y[k]|}{|X[k]|}$$

The **phase response** is:

$$\angle \hat{H}[k] = \angle Y[k] - \angle X[k]$$

where $\angle$ denotes the argument (atan2). Phase unwrapping removes $2\pi$ discontinuities by tracking cumulative offsets.

The **circular impulse response** is:

$$\hat{h}[n] = \text{IDFT}\{\hat{H}[k]\}$$

In the noise-free case, $\hat{H}[k] = H_N[k]$ exactly. In the presence of additive recording noise $\eta[n]$ (so $y[n] = (h \circledast x)[n] + \eta[n]$):

$$\hat{H}[k] = H_N[k] + \frac{N_\eta[k]}{X[k]}$$

where $N_\eta[k] = \text{DFT}\{\eta[n]\}$. The estimation error at each bin is $N_\eta[k]/X[k]$, which has magnitude $|N_\eta[k]|/A[k]$. The SNR at each bin is therefore $|H_N[k]| \cdot A[k] / |N_\eta[k]|$. Using a flat stimulus ($A[k] = \text{const}$) ensures uniform SNR across frequency; using a pink stimulus weights the SNR toward low frequencies (matching perceptual importance in acoustic measurements).

### 3.6 Steady-State Analysis of Circular Playback

Let the playback signal consist of the stimulus $x[n]$ looped continuously. The output of an LTI system with impulse response $h[n]$ (possibly infinite or very long) to the looped input is:

$$y_\infty[n] = \sum_{m=0}^{\infty} h[m]\, \tilde{x}[n-m] = \sum_{m=0}^{\infty} h[m]\, x[(n - m) \bmod N]$$

At **finite time** (after $P$ complete playback periods), the output is:

$$y_P[n] = \sum_{m=0}^{PN-1} h[m]\, x[(n - m) \bmod N]$$

The **steady-state error** after $P$ periods is:

$$\epsilon_P[n] = y_\infty[n] - y_P[n] = \sum_{m=PN}^{\infty} h[m]\, x[(n-m) \bmod N]$$

If the impulse response decays exponentially ($|h[m]| \leq C \cdot e^{-\alpha m}$ for some $\alpha > 0$), then:

$$\|\epsilon_P\|_\infty \leq C \|x\|_\infty \sum_{m=PN}^{\infty} e^{-\alpha m} = C \|x\|_\infty \frac{e^{-\alpha PN}}{1 - e^{-\alpha}}$$

For a reverberant room with $\text{RT}_{60} = T_{60}$, the decay constant is $\alpha = \ln(10^3)/T_{60} \cdot (1/f_s) = 3\ln(10)/(T_{60} f_s)$. After $P$ loops of duration $T = N/f_s$ seconds, the residual is:

$$\|\epsilon_P\| \propto 10^{-3PT/T_{60}}$$

So after $P = T_{60}/T$ loops the error is at $-60$ dB, after $P = 2T_{60}/T$ loops it is at $-120$ dB, etc.

### 3.7 Multi-Cycle Noise Reduction

Record $M$ complete cycles, obtaining $y_M[n]$ for $n = 0, 1, \ldots, MN-1$. The $MN$-point DFT is:

$$Y_M[k] = \sum_{n=0}^{MN-1} y_M[n]\, e^{-j2\pi kn/(MN)}, \quad k = 0, 1, \ldots, MN-1$$

**Signal contribution**: Since the clean signal $y[n]$ is periodic with period $N$, its DFT concentrates at bins that are multiples of $M$:

$$Y_M^{(\text{signal})}[k] = \begin{cases} M \cdot Y[k/M] & \text{if } M \mid k \\ 0 & \text{otherwise} \end{cases}$$

where $Y[\cdot]$ is the single-cycle DFT.

**Proof**: Writing $y_M[n] = y[n \bmod N]$ for the noise-free steady-state signal:

$$Y_M^{(\text{signal})}[k] = \sum_{n=0}^{MN-1} y[n \bmod N]\, e^{-j2\pi kn/(MN)}$$

Splitting the sum into $M$ blocks of $N$ samples and substituting $n = pN + r$ ($p=0,\ldots,M-1$, $r=0,\ldots,N-1$):

$$= \sum_{p=0}^{M-1} e^{-j2\pi kpN/(MN)} \sum_{r=0}^{N-1} y[r]\, e^{-j2\pi kr/(MN)} = \left(\sum_{p=0}^{M-1} e^{-j2\pi kp/M}\right) \sum_{r=0}^{N-1} y[r]\, e^{-j2\pi kr/(MN)}$$

The geometric sum $\sum_{p=0}^{M-1} e^{-j2\pi kp/M}$ equals $M$ when $M | k$ and $0$ otherwise. This confirms that signal energy exists only at every $M$-th bin.

**Noise contribution**: Measurement noise $\eta[n]$ is not periodic with period $N$, so its DFT energy spreads across all $MN$ bins.

**De-noising procedure**:
1. Compute the $MN$-point DFT of the recording.
2. Zero out all bins where $M \nmid k$ (these contain only noise).
3. Inverse-DFT to get a cleaned $MN$-sample signal; extract one $N$-sample cycle.

In the frequency domain, this is equivalent to coherently averaging $M$ cycles of the signal. The noise power at the signal bins is reduced by a factor of $M$ ($10\log_{10}(M)$ dB SNR improvement).

#### Quantitative on-bin SNR (random noise)

Let measurement noise be zero-mean with per-sample variance $\sigma^2$ (no whiteness needed for the variance argument; whiteness is invoked only to claim *equal* expected variance per DFT bin). For the unnormalised $L = MN$-point DFT, $E[|\mathcal N[k]|^2] = L\sigma^2$ at every $k$. Combining with the on-bin signal power $|Y_M^{(\text{signal})}[mM]|^2 = M^2|Y[m]|^2$:

$$\mathrm{SNR}_{\text{on-bin}}^{(M)}\;=\;\frac{M^2|Y[m]|^2}{L\sigma^2}\;=\;\frac{M^2|Y[m]|^2}{MN\sigma^2}\;=\;M\cdot\mathrm{SNR}_{\text{single cycle}}.$$

Hence $+10\log_{10}M$ dB on a power scale, exactly. No additional gain accrues from the off-bin zeroing step beyond what is already captured by this on-bin calculation: by Parseval, zero-then-IDFT is bijective with time-domain averaging of the $M$ cycles, so the two operations are noise-equivalent at the on-bins.

#### Asynchronous tonal interference

A deterministic tone $A\cos(2\pi f_0 n/f_s + \varphi)$ with $q := f_0 N/f_s \notin \mathbb Z$ is attenuated by the Dirichlet factor

$$\frac{|\sin(\pi M q)|}{M\,|\sin(\pi q)|},$$

identically under time-domain averaging and under off-bin zeroing of the $L = MN$-point DFT (the two operations are bijective via Parseval). Exact removal occurs only when $f_0$ lands exactly on an off-bin of the $L$-point grid, i.e. when $L f_0/f_s$ is integer and not a multiple of $M$.

#### Failure modes

* **Synchronous interference** (tone at a multiple of $1/T_{\text{loop}}$): lands on an on-bin, indistinguishable from signal. *No* gain from this procedure.
* **Time variance / clock drift / nonstationary system**: signal energy leaks into off-bins, both reducing on-bin signal power and contaminating the off-bin noise estimate. The on/off power ratio is itself a built-in *diagnostic* for these violations.
* **Nonlinearity**: harmonic distortion of an exactly $N$-periodic stimulus is itself $N$-periodic and lands on on-bins. It contaminates $\hat H[k]$ but is invisible to off-bin noise diagnostics. (See *Circular Nonlinear-Signal Analysis* §3.4 for the BLA framing.)

### 3.8 Frequency-Division Multi-Source Multiplexing

To measure $S$ sources simultaneously, we design $S$ stimulus signals of length $SN$, each occupying a distinct subset of frequency bins.

**Design**: For source $s$ ($s = 0, 1, \ldots, S-1$), define the stimulus spectrum:

$$X_s[k] = \begin{cases} A_s[k] \, e^{j\phi_s[k]} & \text{if } k \equiv s \pmod{S} \\ 0 & \text{otherwise} \end{cases}$$

for $k = 0, 1, \ldots, SN - 1$.

Each source's spectrum is an interleaved comb of non-zero bins, and the combs for different sources are disjoint: source 0 uses bins $\{0, S, 2S, \ldots\}$, source 1 uses $\{1, S+1, 2S+1, \ldots\}$, etc.

**Time-domain signals**: Each $x_s[n] = \text{IDFT}\{X_s[k]\}$ has period $SN$. In practice, $x_s[n]$ can be thought of as a signal of the original resolution $N$ that, when analyzed at the finer resolution $SN$, occupies only its assigned bins.

**Recording model**: The microphone captures the linear superposition:

$$y[n] = \sum_{s=0}^{S-1} (h_s \circledast x_s)[n] + \eta[n]$$

where $h_s[n]$ is the impulse response from source $s$ to the receiver.

**Separation**: In the $SN$-point DFT of $y$:

$$Y[k] = \sum_{s=0}^{S-1} H_s[k] \cdot X_s[k] + N_\eta[k]$$

Since $X_s[k] = 0$ for $k \not\equiv s \pmod{S}$, the bin $k$ (with $k \equiv s \pmod{S}$) contains only source $s$'s contribution:

$$Y[k] = H_s[k] \cdot X_s[k] + N_\eta[k], \quad k \equiv s \pmod{S}$$

The transfer function for source $s$ is:

$$\hat{H}_s[k] = \frac{Y[k]}{X_s[k]}, \quad k \in \{s, s+S, s+2S, \ldots\}$$

**Compaction and fractional-bin correction**: Define the compact spectrum by re-indexing the $N$ non-zero bins:

$$G_s[m] = \hat{H}_s[mS + s], \quad m = 0, 1, \ldots, N-1$$

The frequency corresponding to compact bin $m$ is $f_m = (mS + s) \cdot f_s/(SN) = (m + s/S) \cdot f_s/N$. For $s = 0$ these are exactly the standard $N$-point DFT frequencies $m \cdot f_s/N$, but for $s > 0$ each bin is offset by a fraction $s/S$ of a bin spacing.

To recover the real-valued impulse response $h_s[n]$ of length $N$ from $G_s[m]$, we must account for this offset. Starting from the $SN$-point IDFT restricted to source $s$'s bins:

$$h_s[n] = \frac{1}{SN} \sum_{m=0}^{N-1} G_s[m]\, e^{j2\pi(mS+s)n/(SN)} = \frac{1}{S}\, e^{j2\pi sn/(SN)} \cdot \underbrace{\frac{1}{N}\sum_{m=0}^{N-1} G_s[m]\, e^{j2\pi mn/N}}_{g_s[n]\;=\;\text{IDFT}_N\{G_s\}[n]}$$

Thus:

$$h_s[n] = \frac{1}{S}\, e^{j2\pi sn/(SN)} \cdot g_s[n]$$

For **source 0** ($s = 0$): the modulation factor is 1, and $g_0[n]$ is real (the bins have standard Hermitian symmetry). The impulse response is simply $h_0[n] = g_0[n]/S$ — a plain $N$-point IDFT, no correction needed.

For **source $s > 0$**: $g_s[n]$ is complex (the Hermitian symmetry of $G_s$ is broken by the bin offset), and the modulation $e^{j2\pi sn/(SN)}$ is required. The real-valued impulse response is:

$$h_s[n] = \frac{1}{S}\, \text{Re}\!\left(e^{j2\pi sn/(SN)} \cdot g_s[n]\right)$$

Equivalently, this can be written as a single "fractional-bin-offset IDFT":

$$h_s[n] = \frac{1}{SN}\, \text{Re}\!\left(\sum_{m=0}^{N-1} G_s[m]\, e^{j2\pi(m + s/S)\,n/N}\right)$$

**Example**: For $S = 2$ sources, source 1's correction factor is $e^{j\pi n/N}$ — a half-bin frequency shift.

**Trade-off**: $S$ sources require $S\times$ the loop period but yield $S$ independent transfer functions from one recording. Frequency resolution per source is maintained.

> **Implementation warning — conjugate symmetry, real-valued FFTs, and the real-source constraint.**
> A natural implementation temptation is to construct each stimulus $X_s$ using only the positive-frequency half of the spectrum (bins $0$ through $SN/2$) and synthesise the time-domain signal with a real-valued inverse FFT (`irfft`). For $S = 2$ this works by coincidence: every source's bin $k$ has its conjugate partner $SN - k$ within the *same* source's bin set (even ↔ even, odd ↔ odd). For $S \geq 3$, however, the conjugate partner of a source-$s$ bin ($k \equiv s \pmod{S}$) falls in source $S - s$'s bin set ($SN - k \equiv S - s \pmod{S}$, which differs from $s$ when $s \neq 0$ and $S > 2$). Consequently:
>
> - An `irfft`-based stimulus for source $s > 0$ has **zero energy** at its upper-half bins ($k > SN/2$), because those bins belong to a different source's conjugate set.
> - During separation, dividing $Y[k]$ by the near-zero $X_s[k]$ at those bins amplifies floating-point noise by a factor of $\sim 10^{14}$, producing catastrophically wrong impulse responses for sources $s > 0$.
>
> The mathematically correct construction populates **all** $N$ bins per source in the full $SN$-point DFT and uses a complex IDFT (`ifft`) to synthesise the stimulus. For $s > 0$ (and $S \geq 3$) the resulting time-domain stimulus is **complex-valued**. This is mathematically necessary: source $s$'s frequency comb is not closed under conjugation when $s \neq 0$ and $S > 2$, so no real-valued signal can have energy exclusively at those bins.
>
> **Practical consequence (real-source constraint).** A complex stimulus cannot be radiated by an ordinary single-channel acoustic source. Frequency-division multi-source multiplexing as described therefore admits, on standard acoustic hardware:
>
> | $S$ | Real-stimulus sources |
> |---|---|
> | $2$ | $s\in\{0,1\}$ — both real |
> | $3$ | $s=0$ only |
> | $4$ | $s\in\{0,2\}$ |
> | $S$ even | $s\in\{0, S/2\}$ |
> | $S$ odd, $S\ge 3$ | $s = 0$ only |
>
> For $S\ge 3$ on real hardware, prefer ZC code-division multiplexing
> (*Circular Signal Design*, §2.10/§3.12), which uses real(-or-near-real)
> stimuli and supports arbitrarily many sources up to $\phi(N)$ coprime
> root indices.

### 3.9 MIMO Extension

With $S$ sources and $R$ receivers, each receiver $r$ ($r = 0, 1, \ldots, R-1$) records:

$$y_r[n] = \sum_{s=0}^{S-1} (h_{rs} \circledast x_s)[n] + \eta_r[n]$$

Since the sources are frequency-multiplexed, each receiver's recording can be independently demultiplexed to extract all $S$ source contributions. The result is the complete $R \times S$ transfer function matrix:

$$\hat{\mathbf{H}}[k] = \begin{pmatrix} \hat{H}_{00}[k] & \hat{H}_{01}[k] & \cdots & \hat{H}_{0,S-1}[k] \\ \hat{H}_{10}[k] & \hat{H}_{11}[k] & \cdots & \hat{H}_{1,S-1}[k] \\ \vdots & & \ddots & \vdots \\ \hat{H}_{R-1,0}[k] & \hat{H}_{R-1,1}[k] & \cdots & \hat{H}_{R-1,S-1}[k] \end{pmatrix}$$

This is the full MIMO characterization of the acoustic space or system under test.

### 3.10 Spectral Expansion (Unrolling)

Given a compact transfer function $\hat{H}[k]$ of length $N$, we can create a higher-resolution version of length $EN$ ($E$ = expansion factor):

**Step 1 — Zero insertion**:

$$\hat{H}_{\text{exp}}[k] = \begin{cases} \hat{H}[k/E] & \text{if } E \mid k \\ 0 & \text{otherwise} \end{cases}$$

for $k = 0, 1, \ldots, EN-1$.

**Step 2 — Interpolation**: The zero-valued bins are filled by spectral interpolation. Note that $\hat{H}_{\text{exp}}$ as constructed in step 1 corresponds (in the time domain, via IDFT) to an $E$-fold repetition of the original $N$-point impulse response — no new information has been added. The interpolation step is therefore an *inference* operation that requires explicit assumptions, e.g.:

* **Causality**: zero-pad the IDFT of $\hat{H}_{\text{exp}}$ in the second half of each $E$-fold block.
* **Exponential-decay tail**: fit a decaying exponential to the late part of one period and use it to extrapolate.
* **Parametric model**: fit a modal/pole–zero model and resynthesise.

Without such an assumption, no method can recover an $EN$-sample non-aliased impulse response from $N$ measured DFT bins; this is a fundamental information-theoretic limit, not a numerical issue.

The resulting $EN$-point IDFT yields an impulse response of length $EN$ samples whose first $N$ samples reproduce the measurement and whose remaining $(E-1)N$ samples reflect the chosen extrapolation rule.

**Expansion of multi-source compact spectra**: When the input $\hat{H}$ is a compact transfer function $G_s[m]$ from source $s > 0$ (see Section 3.8), the bins are offset by $s/S$ of a bin spacing. The expansion must preserve this offset. The expanded spectrum of length $EN$ has non-zero bins at positions $k = mE$ with values $G_s[m]$, representing frequencies $(m + s/S) \cdot f_s/N = (mE + sE/S) \cdot f_s/(EN)$. After interpolation and IDFT of the $EN$-point spectrum, the same fractional-bin modulation correction from Section 3.8 applies:

$$h_s^{(\text{exp})}[n] = \frac{1}{S}\, \text{Re}\!\left(e^{j2\pi sn/(SEN)} \cdot \text{IDFT}_{EN}\{\hat{H}_{\text{exp}}\}[n]\right)$$

For source 0 no correction is needed.

This is useful when the circular loop length $N$ was chosen for a particular measurement scenario (e.g., multi-source multiplexing) but a longer impulse response visualization is desired.

### 3.11 Derived Quantities: RT60, Octave Bands, Clarity Metrics

Once the impulse response $\hat{h}[n]$ and transfer function $\hat{H}[k]$ are obtained, standard acoustic parameters are computed.

#### Reverberation Time (ISO 3382)

The Schroeder backward-integrated energy decay curve is:

$$E(t) = \int_t^{\infty} h^2(\tau)\, d\tau \approx \sum_{m=n}^{N-1} \hat{h}^2[m]$$

In decibels: $L(t) = 10\log_{10}(E(t) / E(0))$.

Decay times are obtained by linear regression on $L(t)$ over specific ranges:

- **EDT** (Early Decay Time): Regression over $0$ to $-10$ dB, extrapolated to $-60$ dB.
- **$T_{20}$**: Regression over $-5$ to $-25$ dB, extrapolated to $-60$ dB.
- **$T_{30}$**: Regression over $-5$ to $-35$ dB, extrapolated to $-60$ dB.

The quality of fit is evaluated via the Pearson correlation coefficient $r$ of the linear regression. Values $|r| \geq 0.95$ indicate reliable estimates.

#### Clarity and Definition

These early-to-late energy ratios characterize intelligibility:

$$C_{t_0} = 10\log_{10}\left(\frac{\sum_{n=0}^{n_0 - 1} h^2[n]}{\sum_{n=n_0}^{N-1} h^2[n]}\right)$$

where $n_0 = \lfloor t_0 \cdot f_s \rfloor$. Standard values: $C_{50}$ (speech, $t_0 = 50$ ms) and $C_{80}$ (music, $t_0 = 80$ ms).

**Definition** ($D_{50}$): The fraction of energy arriving within 50 ms:

$$D_{50} = \frac{\sum_{n=0}^{n_{50}-1} h^2[n]}{\sum_{n=0}^{N-1} h^2[n]} \times 100\%$$

**Centre time** ($T_s$): The first moment of the squared impulse response:

$$T_s = \frac{\sum_n n \cdot h^2[n]}{\sum_n h^2[n]} \cdot \frac{1}{f_s}$$

#### Octave-Band Analysis

The magnitude spectrum $|\hat{H}[k]|$ is partitioned into octave or $\frac{1}{3}$-octave bands. For a band with center frequency $f_c$:

- Full octave bounds: $[f_c / \sqrt{2},\; f_c \cdot \sqrt{2}]$
- Third-octave bounds: $[f_c / 2^{1/6},\; f_c \cdot 2^{1/6}]$

The RMS level in each band is computed by summing squared magnitudes of the DFT bins falling within the band:

$$\text{RMS}_{\text{band}} = \sqrt{\frac{1}{K_{\text{band}}} \sum_{k \in \text{band}} |\hat{H}[k]|^2}$$

where $K_{\text{band}}$ is the number of bins in the band. Fractional-bin overlap at band edges is handled by proportional energy distribution.

---

## 4. Comparison with Existing Methods and Literature

The ideas presented in this document — circular stimulus signals, frequency-domain transfer function estimation, multi-cycle noise rejection, and frequency-division source multiplexing — relate to several well-established and some more recent measurement techniques. This section places the circular signal analysis approach in context.

### 4.1 Swept-Sine (Exponential Sine Sweep) Methods

**Background**: The exponential (logarithmic) swept-sine method, popularized by Farina (2000, 2007), is perhaps the most widely used impulse response measurement technique in acoustics today. A sine wave is swept from a low to a high frequency over a fixed duration. The system response is recorded and then deconvolved (in the frequency domain or by time-reversed convolution) to obtain the impulse response.

**Key references**:
- Farina, A. (2000). "Simultaneous measurement of impulse response and distortion with a swept-sine technique." *108th AES Convention*, paper 5093.
- Farina, A. (2007). "Advancements in impulse response measurements by sine sweeps." *122nd AES Convention*, paper 7121.
- Müller, S. and Massarani, P. (2001). "Transfer-function measurement with sweeps." *JAES*, 49(6), 443–471.

**Comparison**:

| Aspect | Swept Sine | Circular Signal Analysis |
|--------|-----------|------------------------|
| **Windowing artifacts** | Requires careful start/stop alignment; truncation can cause leakage. Window functions or zero-padding needed. | None — circularity guarantees artifact-free FFT. |
| **Synchronization** | Start of sweep must be precisely aligned with start of recording; any offset causes errors. | No synchronization needed — a temporal offset between playback and recording is simply a circular shift, manifesting only as a linear phase offset in the transfer function. |
| **Continuous measurement** | Each sweep is a one-shot event; a new sweep must be triggered for each measurement. | Continuous — the signal loops indefinitely, allowing real-time monitoring and live updates. |
| **Nonlinear distortion** | Harmonic distortion products from sweep can be separated in time (they appear as pre-echoes before the main impulse response) — a major advantage. | With random-phase stimuli, distortion products fall in the same bins as the stimulus and cannot be separated. With a circular sweep, partial separation may be possible (see Section 2.11). |
| **SNR improvement** | Average multiple sweeps (incoherent averaging). | Multi-cycle coherent averaging (all off-bins are noise — very efficient noise rejection). |
| **Multi-source** | Not directly supported; one sweep at a time per source. | Native frequency-multiplexed multi-source measurement. |
| **Real-time operation** | Not real-time; needs sweep start/stop control. | Inherently real-time due to continuous looping. |

**Summary**: Swept sines excel at separating harmonic distortion from the linear response and generally achieve higher SNR per unit time (because all energy is concentrated at one frequency at any instant). Circular analysis excels at continuous monitoring, synchronization-free operation, multi-source capability, and clean noise rejection.

### 4.2 Maximum Length Sequences (MLS)

**Background**: Maximum Length Sequences are pseudo-random binary sequences with a flat power spectrum and well-defined circular autocorrelation properties. The MLS method was widely used in the 1980s–2000s for room acoustic measurements, notably implemented in the MLSSA system.

**Key references**:
- Rife, D.D. and Vanderkooy, J. (1989). "Transfer-function measurement with maximum-length sequences." *JAES*, 37(6), 419–444.
- Vanderkooy, J. (2000). "Aspects of MLS measuring systems." *JAES*, 42(4), 219–231.
- Borish, J. and Angell, J.B. (1983). "An efficient algorithm for measuring the impulse response using pseudorandom noise." *JAES*, 31(7), 478–488.

**Comparison**:

| Aspect | MLS | Circular Signal Analysis |
|--------|-----|------------------------|
| **Spectrum** | Approximately flat (binary amplitude), exact flat autocorrelation for period = $2^n - 1$. | Arbitrary spectral shape by design (flat, pink, custom); MLS can also be used as a circular stimulus. |
| **Signal type** | Binary ($\pm 1$); limited to one specific spectral shape. | Arbitrary spectral shape (white, pink, custom); continuous amplitude. |
| **Crest factor** | 0 dB (binary) — excellent for maximizing SNR. | ~10–12 dB (Gaussian-like) — less efficient power delivery. |
| **Distortion sensitivity** | Very sensitive to nonlinearity — distortion products corrupt the measurement. | Also sensitive, but multi-cycle techniques provide some noise/distortion separation. |
| **Deconvolution** | Fast via Hadamard transform (exploiting MLS algebraic structure). | Standard FFT division. |
| **Multi-source** | Not natively supported (would need orthogonal MLS sequences). | Built-in frequency multiplexing. |
| **Continuous operation** | MLS is periodic; can be looped. Similar circular property conceptually. | Identical in this regard — both are periodic. |
| **Noise averaging** | Synchronous averaging of multiple MLS periods. | Multi-cycle DFT noise rejection (functionally equivalent but with additional noise floor characterization). |

**Relationship**: The circular signal analysis approach can be seen as a generalization that encompasses MLS as a special case — an MLS looped at its natural period is a valid circular stimulus. Both exploit periodicity, but the circular framework allows arbitrary spectral shaping, amplitude distributions, and stimulus types (sweeps, noise, binary, custom), while MLS is constrained to binary sequences of length $2^n - 1$. The multi-cycle noise characterization (identifying noise in the "off-bins") and frequency-domain source multiplexing have no direct MLS equivalents.

### 4.3 Periodic Random Noise Methods

**Background**: The use of periodic pseudo-random noise for transfer function measurement predates the specific approach described in this document. Periodic random noise has been used in structural dynamics, control systems, and electroacoustic measurements.

**Key references**:
- Aoshima, N. (1981). "Computer-generated pulse signal applied for sound measurement." *JASA*, 69(5), 1484–1488.
- Suzuki, Y., Asano, F., Kim, H.-Y., and Sone, T. (1995). "An optimum computer-generated pulse signal suitable for the measurement of very long impulse responses." *JASA*, 97(2), 1119–1123.
- Stan, G.-B., Embrechts, J.-J., and Archambeau, D. (2002). "Comparison of different impulse response measurement techniques." *JAES*, 50(4), 249–262.

**Comparison**: The "perfect white" and "perfect pink" stimulus signals described here are specific instances of periodic pseudo-random signals optimized for spectral flatness. The contribution of the circular analysis framework is the systematic exploitation of multi-cycle recording for noise characterization/rejection and the frequency-division multiplexing for multi-source measurement, which go beyond traditional periodic random noise usage.

### 4.4 Dual-FFT / Cross-Spectral Methods

**Background**: In classical signal processing, the transfer function is estimated using the cross-spectral density:

$$\hat{H}(f) = \frac{S_{xy}(f)}{S_{xx}(f)} = \frac{G_{xy}(f)}{G_{xx}(f)}$$

where $S_{xy}$ is the cross-power spectral density between input and output, and $S_{xx}$ is the auto-power spectral density of the input. This is often implemented using Welch's method (averaged, overlapping, windowed FFT segments). The coherence function $\gamma^2(f) = |S_{xy}|^2/(S_{xx} S_{yy})$ indicates measurement reliability.

**Key references**:
- Welch, P.D. (1967). "The use of fast Fourier transform for the estimation of power spectra." *IEEE Trans. Audio Electroacoustics*, AU-15(2), 70–73.
- Bendat, J.S. and Piersol, A.G. (2010). *Random Data: Analysis and Measurement Procedures*, 4th ed. Wiley.

**Comparison**:

| Aspect | Cross-Spectral (Welch) | Circular Signal Analysis |
|--------|----------------------|------------------------|
| **Signal assumption** | Stationary (not periodic); works with any wide-sense stationary input. | Periodic (circular); requires controlled stimulus. |
| **Windowing** | Required — introduces bias, frequency smearing. | Not needed — exact at DFT frequencies. |
| **Frequency resolution** | Determined by segment length; traded against variance via averaging. | Determined by loop length $N$; no trade-off with averaging (multi-cycle recording improves SNR without reducing resolution). |
| **Noise handling** | Coherence function identifies noisy frequencies; averaging reduces variance. | Multi-cycle DFT directly identifies and removes noise. |
| **Bias** | Windowing and segment overlap introduce spectral bias. | Zero bias at DFT frequencies (exact). |
| **Applicability** | Any stationary noise excitation; no synchronization needed; works with unknown inputs (output-only identification via operational modal analysis). | Requires controlled, looped stimulus. |

**Summary**: Cross-spectral methods are more general (they work with uncontrolled excitation), but circular analysis provides exact results when a controlled stimulus is available. The circular approach avoids the fundamental resolution–variance trade-off inherent in Welch's method.

### 4.5 OFDM and Frequency-Division Multiplexing in Telecommunications

**Background**: The multi-source frequency multiplexing described in Section 2.7 is structurally identical to Orthogonal Frequency-Division Multiplexing (OFDM), the modulation scheme used in Wi-Fi, LTE/5G, DVB-T, and DAB. In OFDM, data is carried on orthogonal subcarriers (DFT bins), and different users or data streams can be assigned different subsets of subcarriers.

**Key references**:
- Weinstein, S.B. and Ebert, P.M. (1971). "Data transmission by frequency-division multiplexing using the discrete Fourier transform." *IEEE Trans. Commun. Tech.*, COM-19(5), 628–634.
- van Nee, R. and Prasad, R. (2000). *OFDM for Wireless Multimedia Communications*. Artech House.
- Bingham, J.A.C. (1990). "Multicarrier modulation for data transmission: An idea whose time has come." *IEEE Commun. Mag.*, 28(5), 5–14.

**Comparison**: The frequency-division multi-source scheme in circular analysis is essentially OFDM applied to acoustic measurement rather than data communication. The key differences:

- In OFDM, data symbols change every symbol period; in circular analysis, the frequency-domain coefficients are fixed (the stimulus is a single, repeating symbol).
- OFDM uses a cyclic prefix to handle channel delay spread; circular analysis uses continuous looping to reach steady state instead.
- The "subcarrier assignment per source" in circular analysis is directly analogous to OFDMA (Orthogonal Frequency-Division Multiple Access).

This connection suggests that the rich body of OFDM theory (channel estimation, pilot-aided techniques, adaptive modulation) could be further leveraged for acoustic measurement applications.

### 4.6 Hadamard / Interleaved Sequences for Multi-Source Measurement

**Background**: Simultaneous measurement of multiple sources has been addressed using Hadamard matrices and orthogonal multiplexing. Each source plays a different stimulus, designed so that the set forms an orthogonal basis, enabling separation via matrix inversion.

**Key references**:
- Havelock, D.I. and Brammer, A.J. (2009). "Simultaneous measurement of loudspeaker impulse responses using Hadamard matrices." *Applied Acoustics*, 70(2), 310–316.
- Mommertz, E. (1996). "Angle-dependent in-situ measurements of reflection coefficients using a subtraction technique." *Applied Acoustics*, 46(3), 251–263.
- Cipriani, F. and Luczak, A. (2004). "Orthogonal sequences for simultaneous measurement of acoustic channels." *Acta Acustica united with Acustica*, 90(5), 971–979.

**Comparison**: The Hadamard approach multiplexes in the *time/code domain* (each source plays all frequencies but with different sign patterns), while the circular analysis approach multiplexes in the *frequency domain* (each source plays a subset of frequencies). Both achieve the same goal — $S$ simultaneous transfer functions — but with different trade-offs:

| Aspect | Hadamard Multiplexing | Frequency-Division (Circular) |
|--------|---------------------|------------------------------|
| **Signal bandwidth** | Each source uses full bandwidth. | Each source uses $1/S$ of the bins. |
| **Crest factor** | Can use binary sequences (low crest factor). | Noise-like (higher crest factor). |
| **Separation** | Requires $S$ measurement passes with different sign patterns (and $S \times S$ matrix inversion). | Single measurement pass; separation by frequency bin selection. |
| **Crosstalk** | Sensitive to system nonlinearity (cross-products between sources). | Sources are strictly disjoint in frequency; crosstalk is limited to noise in other bins. |
| **Continuous operation** | Typically batch (multiple passes). | Continuous (single pass, looped). |

### 4.7 Golay Complementary Sequences

**Background**: Golay complementary pairs are sequence pairs whose autocorrelation functions sum to a perfect impulse. They provide an alternative to MLS with the advantage of sidelobe-free autocorrelation.

**Key references**:
- Golay, M.J.E. (1961). "Complementary series." *IRE Trans. Inf. Theory*, 7(2), 82–87.
- Foster, S. (1986). "Impulse response measurement using Golay codes." *Proc. ICASSP*, 929–932.
- Zhou, B., Green, D.M., and Middlebrooks, J.C. (1992). "Characterization of external ear impulse responses using Golay codes." *JASA*, 92(2), 1169–1171.

**Comparison**: Like MLS, Golay sequences are binary (low crest factor), but they require two measurements (the complementary pair) that are summed to cancel autocorrelation sidelobes. Circular analysis offers zero spectral leakage inherently (no sidelobes to cancel) and does so in a single continuous measurement. However, Golay sequences have the advantage of very low crest factor and robustness against time-variance between the two measurements.

### 4.8 Summary Comparison Table

| Feature | Circular Signal | Swept Sine | MLS | Periodic Noise | Welch / Cross-Spectral | OFDM-style | Hadamard | Golay |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| No windowing needed | **Yes** | No | Partial | Partial | No | N/A | No | No |
| No start/stop sync | **Yes** | No | Yes | Yes | N/A | N/A | No | No |
| Continuous / real-time | **Yes** | No | Yes | Yes | Yes | N/A | No | No |
| Exact at DFT bins | **Yes** | No | Approx. | **Yes** | No | **Yes** | N/A | N/A |
| Custom spectral shape | **Yes** | N/A | No | **Yes** | N/A | **Yes** | No | No |
| Low crest factor | No (~12 dB) | Low | **0 dB** | No | N/A | No | **0 dB** | **0 dB** |
| Harmonic dist. separation | Depends on stimulus | **Yes** | No | No | No | No | No | No |
| Multi-source (1 pass) | **Yes** | No | No | No | No | **Yes** | No (S passes) | No |
| Multi-cycle noise rejection | **Yes** | Via avg. | Via avg. | **Yes** | Via avg. | N/A | Via avg. | Via 2-pass avg. |
| Noise floor estimation | **Yes** | No | No | **Yes** | Coherence | N/A | No | No |
| Works without controlled stimulus | No | No | No | No | **Yes** | No | No | No |

---

## 5. References

1. Farina, A. (2000). "Simultaneous measurement of impulse response and distortion with a swept-sine technique." *108th AES Convention*, paper 5093.

2. Farina, A. (2007). "Advancements in impulse response measurements by sine sweeps." *122nd AES Convention*, paper 7121.

3. Müller, S. and Massarani, P. (2001). "Transfer-function measurement with sweeps." *J. Audio Eng. Soc.*, 49(6), 443–471.

4. Rife, D.D. and Vanderkooy, J. (1989). "Transfer-function measurement with maximum-length sequences." *J. Audio Eng. Soc.*, 37(6), 419–444.

5. Vanderkooy, J. (2000). "Aspects of MLS measuring systems." *J. Audio Eng. Soc.*, 42(4), 219–231.

6. Borish, J. and Angell, J.B. (1983). "An efficient algorithm for measuring the impulse response using pseudorandom noise." *J. Audio Eng. Soc.*, 31(7), 478–488.

7. Aoshima, N. (1981). "Computer-generated pulse signal applied for sound measurement." *J. Acoust. Soc. Am.*, 69(5), 1484–1488.

8. Suzuki, Y., Asano, F., Kim, H.-Y., and Sone, T. (1995). "An optimum computer-generated pulse signal suitable for the measurement of very long impulse responses." *J. Acoust. Soc. Am.*, 97(2), 1119–1123.

9. Stan, G.-B., Embrechts, J.-J., and Archambeau, D. (2002). "Comparison of different impulse response measurement techniques." *J. Audio Eng. Soc.*, 50(4), 249–262.

10. Welch, P.D. (1967). "The use of fast Fourier transform for the estimation of power spectra." *IEEE Trans. Audio Electroacoustics*, AU-15(2), 70–73.

11. Bendat, J.S. and Piersol, A.G. (2010). *Random Data: Analysis and Measurement Procedures*, 4th ed. Wiley.

12. Weinstein, S.B. and Ebert, P.M. (1971). "Data transmission by frequency-division multiplexing using the discrete Fourier transform." *IEEE Trans. Commun. Tech.*, COM-19(5), 628–634.

13. van Nee, R. and Prasad, R. (2000). *OFDM for Wireless Multimedia Communications*. Artech House.

14. Bingham, J.A.C. (1990). "Multicarrier modulation for data transmission: An idea whose time has come." *IEEE Commun. Mag.*, 28(5), 5–14.

15. Havelock, D.I. and Brammer, A.J. (2009). "Simultaneous measurement of loudspeaker impulse responses using Hadamard matrices." *Applied Acoustics*, 70(2), 310–316.

16. Golay, M.J.E. (1961). "Complementary series." *IRE Trans. Inf. Theory*, 7(2), 82–87.

17. Foster, S. (1986). "Impulse response measurement using Golay codes." *Proc. IEEE ICASSP*, 929–932.

18. Zhou, B., Green, D.M., and Middlebrooks, J.C. (1992). "Characterization of external ear impulse responses using Golay codes." *J. Acoust. Soc. Am.*, 92(2), 1169–1171.

19. ISO 3382-1:2009. *Acoustics — Measurement of room acoustic parameters — Part 1: Performance spaces*.

20. Schroeder, M.R. (1965). "New method of measuring reverberation time." *J. Acoust. Soc. Am.*, 37(3), 409–412.

21. Mommertz, E. (1996). "Angle-dependent in-situ measurements of reflection coefficients using a subtraction technique." *Applied Acoustics*, 46(3), 251–263.

22. Oppenheim, A.V. and Schafer, R.W. (2010). *Discrete-Time Signal Processing*, 3rd ed. Prentice Hall.

23. Proakis, J.G. and Manolakis, D.G. (2007). *Digital Signal Processing: Principles, Algorithms, and Applications*, 4th ed. Pearson.

24. Cipriani, F. and Luczak, A. (2004). "Orthogonal sequences for simultaneous measurement of acoustic channels." *Acta Acustica united with Acustica*, 90(5), 971–979.
