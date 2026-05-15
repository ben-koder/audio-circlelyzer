# Nonlinear System Characterization in the Circular Signal Analysis Framework

> **Companion document to [CIRCULAR_SIGNAL_ANALYSIS.md](CIRCULAR_SIGNAL_ANALYSIS.md)**
> This document extends the circular signal analysis framework to weakly nonlinear systems. It explores how the framework's unique properties — exact periodicity, precise spectral control, multi-cycle noise separation — can be leveraged for nonlinear system identification.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Intuitive Overview](#2-intuitive-overview)
   - 2.1 [Linear vs. Nonlinear: What Changes?](#21-linear-vs-nonlinear-what-changes)
   - 2.2 [Periodicity Survives Nonlinearity](#22-periodicity-survives-nonlinearity)
   - 2.3 [What Does Spectral Division Actually Measure?](#23-what-does-spectral-division-actually-measure)
   - 2.4 [Level Dependence as a Nonlinearity Fingerprint](#24-level-dependence-as-a-nonlinearity-fingerprint)
   - 2.5 [Harmonic Distortion and Where It Hides](#25-harmonic-distortion-and-where-it-hides)
   - 2.6 [The Circular Sweep: Farina's Trick, Wrapped Around](#26-the-circular-sweep-farinas-trick-wrapped-around)
   - 2.7 [Sparse-Spectrum Stimuli: Listening for Intermodulation](#27-sparse-spectrum-stimuli-listening-for-intermodulation)
   - 2.8 [The Odd–Even Trick](#28-the-oddeven-trick)
   - 2.9 [Multi-Cycle Recording as a Nonlinearity Diagnostic](#29-multi-cycle-recording-as-a-nonlinearity-diagnostic)
   - 2.10 [Coherence Without Noise: Isolating Nonlinearity](#210-coherence-without-noise-isolating-nonlinearity)
   - 2.11 [Practical Implications and Stimulus Selection Guide](#211-practical-implications-and-stimulus-selection-guide)
3. [Mathematical Formulation](#3-mathematical-formulation)
   - 3.1 [The Volterra Series Model](#31-the-volterra-series-model)
   - 3.2 [Periodic Input to a Volterra System](#32-periodic-input-to-a-volterra-system)
   - 3.3 [Generalized Frequency Response Functions for Periodic Input](#33-generalized-frequency-response-functions-for-periodic-input)
   - 3.4 [The Best Linear Approximation (BLA)](#34-the-best-linear-approximation-bla)
   - 3.5 [Harmonic Distortion Products: Tonal and Broadband Cases](#35-harmonic-distortion-products-tonal-and-broadband-cases)
   - 3.6 [Circular Sweep: Harmonic Separation Analysis](#36-circular-sweep-harmonic-separation-analysis)
   - 3.7 [Sparse Multisine Design for Kernel Separation](#37-sparse-multisine-design-for-kernel-separation)
   - 3.8 [The Odd–Even Decomposition](#38-the-oddeven-decomposition)
   - 3.9 [Multi-Cycle Nonlinearity Detection](#39-multi-cycle-nonlinearity-detection)
   - 3.10 [Coherence-Based Nonlinearity Quantification](#310-coherence-based-nonlinearity-quantification)
4. [Connections to Literature](#4-connections-to-literature)
5. [Conclusions and Open Questions](#5-conclusions-and-open-questions)
6. [References](#6-references)

---

## 1. Introduction

The circular signal analysis framework (see companion document) provides exact, artifact-free frequency-domain measurements of linear time-invariant (LTI) systems by exploiting the periodicity of looped signals. The central equation — $\hat{H}[k] = Y[k] / X[k]$ — assumes linearity: the system's frequency response $H[k]$ is independent of the input and relates stimulus to response by pointwise multiplication.

Real electroacoustic systems are not perfectly linear. Loudspeakers exhibit harmonic and intermodulation distortion; amplifiers clip or compress at high levels; microphones have nonlinear capsule mechanics. The question this document addresses is:

> **What happens to the circular measurement framework when the system under test is nonlinear? Can the framework be extended — and can its unique properties be exploited — to *characterize* the nonlinearity, not merely suffer from it?**

The answer is surprisingly rich. The circular framework's core properties — exact periodicity, precise frequency-bin control, multi-cycle noise separation — remain valid for nonlinear systems and can be turned to advantage. This document develops these ideas in two parallel tracks: an intuitive overview (Section 2) and a rigorous mathematical formulation (Section 3).

Throughout, we use the Volterra series as the theoretical model for weakly nonlinear systems with memory. The treatment assumes familiarity with the circular analysis framework as described in the companion document, particularly the DFT, circular convolution theorem, multi-cycle noise reduction, and frequency-domain stimulus design.

---

## 2. Intuitive Overview

### 2.1 Linear vs. Nonlinear: What Changes?

In the linear case, we think of the system as a filter: each frequency in the input independently passes through the system, getting scaled and phase-shifted by the transfer function $H[k]$. Frequencies don't interact — the response at 1 kHz depends only on the stimulus at 1 kHz.

A nonlinear system breaks this independence. Feed in a pure tone at frequency $f$, and the output contains not just $f$ but also harmonics $2f$, $3f$, $4f$, etc. Feed in two tones at $f_1$ and $f_2$, and the output also contains intermodulation products at $f_1 \pm f_2$, $2f_1 \pm f_2$, $f_1 \pm 2f_2$, and so on. Frequencies *talk to each other* through the nonlinearity.

This means $Y[k] \neq H[k] \cdot X[k]$ — the simple pointwise relationship breaks down. The ratio $Y[k]/X[k]$ still produces *a number* at each bin, but that number is no longer an intrinsic property of the system alone; it depends on the input signal (its amplitude, its spectral shape, even its phase structure).

So is the circular measurement "wrong" for nonlinear systems? Not exactly — but it measures something different from what it measures for linear systems. Understanding *what* it measures, and how to extract more information, is the subject of this document.

### 2.2 Periodicity Survives Nonlinearity

Here is the first key insight: **a periodic input to a nonlinear system still produces a periodic output with the same period.**

Think about it physically. If the loudspeaker is driven with a looping signal, after transients die out, the air pressure pattern in the room repeats every loop period. It doesn't matter that the loudspeaker cone distorts the waveform — the *distorted* waveform still loops with the same period. The harmonics $2f$, $3f$, etc. all have periods that divide the fundamental period, so the combined output is periodic with the fundamental period.

This means:

- The FFT's circularity assumption remains exact, even for a nonlinear system in steady state.
- There is no spectral leakage, no windowing needed.
- Multi-cycle recording still cleanly separates signal (periodic component) from noise (non-periodic component).

Periodicity is a stronger property than linearity for the purposes of DFT-based analysis. The circular framework's foundation — exploit exact periodicity — holds for *any* time-invariant system, linear or not. What changes is the *interpretation* of the measured spectrum, not its *validity* as a periodic signal analysis.

### 2.3 What Does Spectral Division Actually Measure?

When we compute $\hat{H}[k] = Y[k] / X[k]$ and the system is nonlinear, the result is called the **Best Linear Approximation (BLA)** or, in classical nonlinear control theory, the **describing function**.

Intuitively: the BLA is the linear filter that, when applied to the stimulus $x$, produces the output $\hat{y}$ closest to the actual output $y$ in a least-squares sense. It's the best you can do if you insist on modeling the system as linear. The BLA captures the dominant linear behavior plus a "linearized" version of the nonlinearity at the operating point (signal level and spectral shape) used during the measurement.

Two important consequences:

1. **The BLA depends on the stimulus amplitude.** Increase the drive level, and the loudspeaker compresses — the BLA will show reduced gain at high frequencies where the driver is working harder. This is not a flaw; it's actually useful information about the system's operating-point-dependent behavior.

2. **The BLA depends on the stimulus spectrum.** A perfect-white stimulus and a perfect-pink stimulus will yield slightly different BLAs for the same nonlinear system, because the distribution of power across frequencies changes the nonlinear mixing products.

For a truly linear system, the BLA is independent of the stimulus (apart from noise effects) — it's just the transfer function $H[k]$. So the *dependence* of the measured "transfer function" on stimulus level or spectrum is itself a signature of nonlinearity.

### 2.4 Level Dependence as a Nonlinearity Fingerprint

This observation suggests a simple, powerful nonlinearity test that requires no special stimulus design:

1. Measure the circular "transfer function" at stimulus level $A_1$ (say, -20 dBFS).
2. Repeat at level $A_2$ (say, -6 dBFS).
3. Compare the two results.

For a linear system, $\hat{H}_1[k] = \hat{H}_2[k]$ at all frequencies (within noise). Any systematic difference is attributable to nonlinearity. The *pattern* of the difference is informative: if the magnitude decreases at certain frequencies when the level increases, that indicates compression; if it increases, that indicates expansion or a resonance shift.

This is trivial to implement in the circular framework. The only requirement is that the stimulus has the same spectral shape at both levels (scale it linearly). By using multi-cycle noise rejection, the noise floor can be pushed low enough to reveal small level-dependent changes.

### 2.5 Harmonic Distortion and Where It Hides

Consider what happens when different stimulus types excite a nonlinear system:

**Broadband flat-spectrum stimuli** (perfect white, MLS): The stimulus has energy at every bin. Second-order distortion of a tone at bin $k$ creates energy at bin $2k$; but bin $2k$ also has stimulus energy and its own linear response. The distortion product is buried indistinguishably within the total response. Third-order products similarly land on already-occupied bins. **Result**: distortion is invisible — it's folded into the BLA.

**Single-tone stimulus**: Feed in a pure sine at bin $k_0$ (only bin $k_0$ is nonzero). The output has energy at $k_0$ (linear) plus $2k_0, 3k_0, \ldots$ (harmonics). Since bins $2k_0, 3k_0, \ldots$ have zero stimulus energy, the harmonic distortion products are clearly visible and measurable in the output spectrum. This is essentially the classical THD (total harmonic distortion) measurement — and it works perfectly in the circular framework since the tone is exactly on-bin with no leakage.

**Sparse-spectrum stimuli**: Something in between. If the stimulus excites only selected bins (leaving "gaps"), then distortion products that fall in the gaps are detectable. This is the key to the more sophisticated approaches discussed in the following sections.

The fundamental principle: **distortion is detectable only where the stimulus has no energy.** The circular framework, with its precise bin-level control over the stimulus spectrum, is uniquely well-suited to engineering these "detection windows."

### 2.6 The Circular Sweep: Farina's Trick, Wrapped Around

Angelo Farina showed in 2000 that deconvolving the response to an exponential sine sweep separates harmonic distortion products into distinct impulse responses appearing as "pre-impulses" — short events that appear *before* the main impulse in the deconvolved output. This works because an exponential sweep has a group delay that increases logarithmically with frequency. A $p$-th harmonic at output frequency $f$ was generated when the sweep was at frequency $f/p$, which occurred $\Delta t = T \ln(p) / \ln(f_2/f_1)$ seconds earlier. After deconvolution, this time offset maps to a pre-impulse at delay $-\Delta t$.

In a **circular sweep** (see Section 2.3 of the companion document), the same mechanism operates, but with circular time. The pre-impulses don't appear at negative time; they wrap around and appear near the *end* of the circular impulse response, at circular delay $T - \Delta t$. The linear impulse response appears at the beginning (small positive delays). As long as the linear impulse response's duration doesn't extend far enough to overlap with the wrapped-around distortion impulses, the separation is clean.

How much room do we need? For typical electroacoustic measurements spanning 3 decades (20 Hz – 20 kHz), the 2nd harmonic is offset by about 10% of the loop length, and the 3rd by about 16%. So if the room's impulse response occupies less than about 80% of the loop length, the 2nd and 3rd harmonic impulse responses are cleanly separable. This is a mild constraint — we generally want the loop to be longer than the impulse response anyway, to avoid circular time-aliasing.

The key advantage over conventional (non-circular) swept-sine measurement is that the circular version can be combined with multi-cycle recording for noise reduction. Run the circular sweep for many loops, take a large FFT, zero the off-bins, then deconvolve. The result is a circular impulse response with greatly reduced noise, from which the harmonic-order impulse responses can be windowed out.

**Connection to the unified matched-filter framework.** Farina's windowing method is a *special case* of a more general matched-filter harmonic extraction principle (see *Circular Signal Design*, Sections 2.13 and 3.15). The log sweep is unique among chirp stimuli in that its matched filter for each harmonic order reduces to a pure time shift — which is why time-domain windowing works. For other chirp stimuli (linear sweeps, Zadoff–Chu sequences), the same principle applies but requires spectral-domain matched filtering rather than time-domain windowing. The log sweep's simplicity in this regard is a pleasant accident of its logarithmic frequency trajectory, not a fundamental requirement for harmonic separation.

### 2.7 Sparse-Spectrum Stimuli: Listening for Intermodulation

The most powerful approach to nonlinear characterization in the circular framework combines two of its strengths: exact frequency-bin control and circularity.

The idea: design a stimulus that excites only a *subset* of frequency bins, leaving other bins as empty "slots" where intermodulation distortion products can land and be detected.

**A simple example**: Excite only odd-numbered bins ($\{1, 3, 5, 7, \ldots\}$). The 2nd-order intermodulation between any two odd bins $k_1$ and $k_2$ produces products at $k_1 + k_2$ and $|k_1 - k_2|$ — both of which are even. So all 2nd-order products land on even bins, which are unexcited. We can measure the 2nd-order nonlinearity cleanly at all even bins! Meanwhile, the linear response at the odd bins gives us the BLA.

**A more sophisticated example**: Choose a "Sidon-like" set of excited bins — a set where all pairwise sums (and differences) are distinct. Then every 2nd-order intermodulation product $k_1 + k_2$ maps to a unique bin, allowing full reconstruction of the 2nd-order Volterra kernel's frequency-domain representation. This is a powerful method from the nonlinear system identification literature (Pintelon, Schoukens), and the circular framework is its natural habitat.

**The trade-off**: Sparser stimuli mean fewer excited bins and therefore lower total SNR per bin (since the energy is concentrated on fewer frequencies). Multi-cycle recording directly compensates: run more cycles to build up SNR. The noise-free "detection bins" can detect even very weak intermodulation products.

### 2.8 The Odd–Even Trick

A beautifully simple technique for separating even-order from odd-order nonlinearity requires only two measurements:

1. Measure with stimulus $x[n]$, obtaining response $y^+[n]$.
2. Measure with stimulus $-x[n]$ (polarity-inverted), obtaining response $y^-[n]$.

Then:

- **Even-order contribution**: $y_{\text{even}}[n] = \tfrac{1}{2}(y^+[n] + y^-[n])$
- **Odd-order contribution** (including linear): $y_{\text{odd}}[n] = \tfrac{1}{2}(y^+[n] - y^-[n])$

This works because even-order distortion terms ($y_2, y_4, \ldots$) are symmetric in the input sign — they produce the same output whether the input is $+x$ or $-x$. Odd-order terms ($y_1, y_3, y_5, \ldots$) flip sign with the input.

In the circular framework, this is easy to implement: design one stimulus waveform, negate it for the second measurement. Both are circular (negation preserves periodicity). Both benefit from multi-cycle noise reduction. The difference of the two recordings yields the odd-order response (dominated by the linear response $y_1$ plus small 3rd-order correction), while the sum yields the even-order distortion in isolation.

For systems dominated by 2nd-order nonlinearity (common in loudspeakers with asymmetric suspension), the even-order signal is principally the 2nd-order Volterra contribution — a direct measurement of this specific nonlinear mechanism.

### 2.9 Multi-Cycle Recording as a Nonlinearity Diagnostic

Multi-cycle recording (see companion document, Section 2.6) separates periodic signal components from non-periodic noise by examining "on-bin" versus "off-bin" energy in the large FFT. For a linear system, the on-bins contain both signal and noise, while the off-bins contain only noise.

What happens with a nonlinear system? The nonlinear distortion products are also periodic (same period as the stimulus), so they land on the on-bins — together with the linear response. The off-bins still contain only noise. So multi-cycle recording alone doesn't separate nonlinearity from linearity.

But multi-cycle recording does give us something valuable: a very clean noise estimate. Once we know the noise floor precisely (from the off-bins), any structure in the output that *exceeds* the noise floor is systematic — either linear or nonlinear. Combined with the odd–even trick or level-dependent measurements, the clean noise estimate lets us quantify small nonlinear effects that would otherwise be buried in noise.

There is also a subtle combined effect with sparse-spectrum stimuli. If the stimulus excites only certain on-bins, then intermodulation products at other on-bins are detectable. The off-bins remain a noise-only reference. This three-way separation (linear response at excited on-bins, nonlinear products at unexcited on-bins, noise at off-bins) is maximally informative.

### 2.10 Coherence Without Noise: Isolating Nonlinearity

In classical measurement, the coherence function $\gamma^2[k]$ tells us how much of the output power is linearly related to the input. A coherence below 1 indicates either noise or nonlinearity (or both) — and conventional methods cannot distinguish the two.

The circular framework, with multi-cycle noise separation, changes this. We can:

1. Estimate and remove noise (via off-bin interpolation or multiple measurements).
2. Compute coherence across multiple measurements with different random-phase realizations of the same amplitude spectrum.

If, after noise removal, the coherence is still below 1 at certain frequencies, the deficit is attributable solely to nonlinearity. The *amount* of coherence drop quantifies the nonlinear contribution at each frequency. This provides a frequency-dependent nonlinearity indicator that separates the two confounds (noise and nonlinearity) that plague conventional coherence analysis.

Concretely: make $P$ measurements with different random-phase stimuli, all having the same amplitude $A[k]$. For a linear system, all measurements yield the same $\hat{H}[k]$ (after noise removal). For a nonlinear system, each random-phase stimulus produces a different pattern of nonlinear mixing products, so $\hat{H}[k]$ varies across realizations. The variance of $\hat{H}[k]$ across realizations quantifies the nonlinear distortion level at each frequency.

### 2.11 Practical Implications and Stimulus Selection Guide

The choice of stimulus in the circular framework involves a three-way trade-off: **linear measurement quality**, **nonlinear characterization capability**, and **measurement time**. Here is a practical guide:

| Goal | Recommended Stimulus | Why |
|------|---------------------|-----|
| Best linear TF, nonlinearity irrelevant | Perfect white/pink, many cycles | Maximum SNR, noise averaging; nonlinearity folds into BLA |
| Detect *presence* of nonlinearity | Same stimulus at two levels | Level-dependent BLA change reveals nonlinearity |
| Separate even/odd-order distortion | Any stimulus + polarity inversion | Odd–even trick; two measurements needed |
| Separate harmonic orders (2nd, 3rd, …) | Circular log sweep (simplest) or any chirp stimulus (via matched filter) | Log sweep: Farina windowing; linear chirp/ZC: matched-filter extraction (see *Circular Signal Design*, §2.13) |
| Best crest factor + harmonic separation | Zadoff–Chu sequence | Crest factor 1 (complex), maximally circular, matched-filter extraction via root $pu$ |
| Measure 2nd-order kernel | Odd-only-bin stimulus | All 2nd-order products fall on even bins |
| Full Volterra kernel identification | Sparse multisine (Sidon set) | Intermodulation products at unique bins; combine with multi-cycle SNR boost |
| Maximum power / minimum crest factor | Looped MLS or Golay | 0 dB crest factor, but no nonlinear separation |
| Multi-source + harmonic separation | ZC with different root indices per source | Code-division multiplexing + matched-filter harmonic extraction |

For most practical loudspeaker measurements, the circular sweep combined with multi-cycle recording provides the best balance: it gives a clean linear impulse response, separates the first few harmonic-distortion orders, and achieves excellent SNR through averaging. For the strongest possible characterization, the unified matched-filter framework (see *Circular Signal Design*, Section 3.15) applies identically to log sweeps, linear chirps, and Zadoff–Chu sequences — the choice of stimulus affects spectral shape and crest factor, not the fundamental capability for harmonic separation.

---

## 3. Mathematical Formulation

### 3.1 The Volterra Series Model

A causal, time-invariant, weakly nonlinear system with fading memory can be modeled by the **Volterra series**:

$$y[n] = \sum_{p=1}^{P} y_p[n]$$

where the $p$-th order contribution is:

$$y_p[n] = \sum_{m_1=0}^{\infty} \sum_{m_2=0}^{\infty} \cdots \sum_{m_p=0}^{\infty} h_p(m_1, m_2, \ldots, m_p) \prod_{i=1}^{p} x[n - m_i]$$

Here $h_p(m_1, \ldots, m_p)$ is the **$p$-th order Volterra kernel** — a $p$-dimensional impulse response. The first-order kernel $h_1(m)$ is the usual linear impulse response. The second-order kernel $h_2(m_1, m_2)$ captures the leading nonlinear interaction, and so on.

Without loss of generality, the kernels can be taken to be **symmetric**: $h_p(m_{\sigma(1)}, \ldots, m_{\sigma(p)}) = h_p(m_1, \ldots, m_p)$ for any permutation $\sigma$, since the product of input samples is commutative.

The series is truncated at order $P$ for practical modeling. For most electroacoustic systems, $P = 3$ or $P = 5$ captures the dominant nonlinear behavior.

**Connection to memoryless nonlinearity**: If $h_p(m_1, \ldots, m_p) = a_p \cdot \delta(m_1) \cdot \delta(m_2) \cdots \delta(m_p)$, the Volterra series reduces to a power series $y[n] = \sum_p a_p \, x[n]^p$. The Volterra model generalizes this to include memory (frequency-dependent nonlinearity).

### 3.2 Periodic Input to a Volterra System

**Theorem**: *If $x[n]$ is periodic with period $N$ and the Volterra kernels have finite effective support, then at steady state each $y_p[n]$ is also periodic with period $N$, and hence $y[n]$ is periodic with period $N$.*

**Proof**: At steady state (after transients from loop onset have decayed), the input can be written as $x[n] = x[n \bmod N]$ for all $n$. Then:

$$y_p[n + N] = \sum_{m_1, \ldots, m_p} h_p(m_1, \ldots, m_p) \prod_{i=1}^{p} x[(n + N) - m_i]$$

Since $x[(n + N) - m_i] = x[n - m_i]$ (periodicity of $x$), we have $y_p[n + N] = y_p[n]$. Since this holds for each order $p$, the total output $y[n] = \sum_p y_p[n]$ is periodic with period $N$.  $\square$

**Consequence**: For a periodic stimulus, the DFT of the output $Y[k]$ is exact (no leakage) even when the system is nonlinear. The DFT captures the *true* steady-state frequency content, including all linear and nonlinear contributions.

### 3.3 Generalized Frequency Response Functions for Periodic Input

The **$p$-th order Generalized Frequency Response Function (GFRF)** is the multidimensional DFT of the Volterra kernel:

$$H_p(k_1, k_2, \ldots, k_p) = \sum_{m_1, \ldots, m_p} h_p(m_1, \ldots, m_p) \, e^{-j2\pi(k_1 m_1 + \cdots + k_p m_p)/N}$$

For a periodic input with DFT $X[k]$, the DFT of the $p$-th order output is:

$$Y_p[k] = \frac{1}{N^{p-1}} \sum_{\substack{k_1, k_2, \ldots, k_p \\ k_1 + k_2 + \cdots + k_p \;\equiv\; k \pmod{N}}} H_p(k_1, k_2, \ldots, k_p) \prod_{i=1}^{p} X[k_i]$$

The constraint $k_1 + k_2 + \cdots + k_p \equiv k \pmod{N}$ reflects the circular convolution structure: the $p$-th order contribution at output bin $k$ results from all combinations of $p$ input bins whose indices sum to $k$ modulo $N$.

For $p = 1$ (linear):

$$Y_1[k] = H_1(k) \cdot X[k]$$

which is the familiar circular convolution theorem.

For $p = 2$ (quadratic):

$$Y_2[k] = \frac{1}{N} \sum_{k_1 + k_2 \;\equiv\; k \pmod{N}} H_2(k_1, k_2) \, X[k_1] \, X[k_2]$$

This is a 2D circular convolution of $X$ with itself, weighted by $H_2$. The output at bin $k$ receives contributions from all pairs of input bins that sum to $k$.

The total output DFT is:

$$Y[k] = \sum_{p=1}^{P} Y_p[k] = H_1(k) X[k] + \frac{1}{N}\sum_{k_1+k_2 \equiv k} H_2(k_1,k_2) X[k_1] X[k_2] + \cdots$$

The spectral division $Y[k]/X[k]$ therefore yields:

$$\frac{Y[k]}{X[k]} = H_1(k) + \frac{1}{N}\sum_{k_1+k_2 \equiv k} H_2(k_1,k_2) \frac{X[k_1] X[k_2]}{X[k]} + \cdots$$

This is the transfer function estimate the circular framework produces. It equals the linear transfer function $H_1(k)$ **plus** input-dependent nonlinear corrections. This motivates the Best Linear Approximation formalism.

### 3.4 The Best Linear Approximation (BLA)

**Definition**: The BLA of a nonlinear system for a given class of periodic stimuli is the linear model $G_{\text{BLA}}[k]$ that minimizes the expected squared error between the model output and the actual output:

$$G_{\text{BLA}} = \arg\min_G \; E\left[\sum_{n=0}^{N-1} |y[n] - (g \circledast x)[n]|^2\right]$$

where the expectation is over the ensemble of stimuli (e.g., different random-phase realizations with the same amplitude spectrum $A[k]$).

**Result**: The BLA in the frequency domain is:

$$G_{\text{BLA}}[k] = \frac{E[Y[k] \, X^*[k]]}{E[|X[k]|^2]} = \frac{S_{yx}[k]}{S_{xx}[k]}$$

For a single realization of the stimulus, $\hat G_{\text{BLA}}[k] = Y[k]/X[k]$ is an *unbiased single-shot estimator* of $G_{\text{BLA}}[k]$ — exactly the spectral division we compute. (The estimator and the estimand coincide only in expectation; the realization-to-realization variance of $Y[k]/X[k]$ is precisely the stochastic nonlinear distortion that §3.10 quantifies. Treating the spectral division as if it were equal to $G_{\text{BLA}}$ in any single trial conflates the two.)

**Decomposition of the output**: Let $\hat{y}[n] = g_{\text{BLA}} \circledast x[n]$ be the BLA's output. The actual output can be decomposed as:

$$y[n] = \hat{y}[n] + y_s[n] + \eta[n]$$

where:
- $\hat{y}[n]$ is the linear model output (via BLA),
- $y_s[n]$ is the **stochastic nonlinear contribution** — the part of the nonlinear output that varies with the stimulus realization,
- $\eta[n]$ is measurement noise (non-periodic, zero-mean).

The stochastic nonlinear contribution $y_s[n]$ has the property that it is uncorrelated with $x[n]$ (by construction of the BLA), but it is periodic and hence appears on the signal bins in a multi-cycle recording.

**Practical estimation**: The BLA can be estimated from $P$ repeated measurements with different random-phase stimuli (same $A[k]$):

$$\hat{G}_{\text{BLA}}[k] = \frac{1}{P} \sum_{i=1}^{P} \frac{Y^{(i)}[k]}{X^{(i)}[k]}$$

The variance of $Y^{(i)}[k]/X^{(i)}[k]$ across realizations, after noise subtraction, estimates the **nonlinear distortion level** at each frequency:

$$\hat{\sigma}^2_{\text{NL}}[k] = \text{Var}\left[\frac{Y^{(i)}[k]}{X^{(i)}[k]}\right] - \frac{\hat{\sigma}^2_\eta[k]}{|A[k]|^2}$$

where $\hat{\sigma}^2_\eta[k]$ is estimated from off-bins in a multi-cycle recording.

### 3.5 Harmonic Distortion Products: Tonal and Broadband Cases

#### Single-tone input

Let $x[n]$ be a pure tone at bin $k_0$: $X[k] = C \cdot \delta[k - k_0]$ (plus conjugate at $N - k_0$ for a real signal; we omit this for notational clarity).

The $p$-th order output at bin $k$ is nonzero only when $k_1 + \cdots + k_p \equiv k \pmod{N}$ with each $k_i = k_0$. This gives $k = pk_0 \bmod N$. Thus:

$$Y_p[pk_0 \bmod N] = \frac{C^p}{N^{p-1}} \, H_p(\underbrace{k_0, k_0, \ldots, k_0}_{p})$$

The output has energy only at bins $k_0, 2k_0, 3k_0, \ldots$ (the harmonics), and each harmonic's amplitude depends on the corresponding diagonal element of the GFRF. Bins other than these $p k_0$ harmonics are zero (in the noise-free case), giving a clean THD measurement.

#### Broadband input

When $X[k] \neq 0$ for all $k$, the sum $\sum_{k_1 + \cdots + k_p \equiv k} H_p(\ldots) \prod X[k_i]$ is nonzero for *all* output bins $k$. The nonlinear contributions overlap with the linear response at every frequency. No separation is possible from a single measurement with a single broadband stimulus.

#### Key conclusion

Nonlinear products are detectable only at output bins where the linear contribution is absent or distinguishable. This requires the stimulus spectrum to have **spectral gaps** — bins with zero energy.

### 3.6 Circular Sweep: Harmonic Separation Analysis

Consider a circular exponential sweep with instantaneous frequency:

$$f_{\text{inst}}(t) = f_1 \left(\frac{f_2}{f_1}\right)^{t/T}, \quad t \in [0, T)$$

The **group delay** at frequency $f$ is the time when the sweep passes through $f$:

$$t_g(f) = T \cdot \frac{\ln(f/f_1)}{\ln(f_2/f_1)}$$

When a $p$-th order harmonic distortion product appears at output frequency $f$, it was generated when the sweep's instantaneous frequency was $f/p$. In a linear deconvolution (spectral division by $X[k]$), the linear impulse appears at delay $\tau_0$, while the $p$-th harmonic product appears at a delay offset by:

$$\Delta \tau_p = t_g(f/p) - t_g(f) = -T \cdot \frac{\ln p}{\ln(f_2/f_1)}$$

The negative sign indicates a **pre-impulse** in linear time. In the circular framework with a period-$T$ impulse response, this wraps to circular delay:

$$\tau_p = T - T \cdot \frac{\ln p}{\ln(f_2/f_1)} = T \left(1 - \frac{\ln p}{\ln(f_2/f_1)}\right)$$

For this to be separable from the linear impulse response (which occupies circular delays $[0, L_h]$ where $L_h$ is the impulse response duration), we need:

$$\tau_p > L_h \quad \Longleftrightarrow \quad T > \frac{L_h}{1 - \frac{\ln p}{\ln(f_2/f_1)}}$$

**Numerical examples** for $f_1 = 20$ Hz, $f_2 = 20{,}000$ Hz ($\ln(f_2/f_1) = \ln 1000 \approx 6.91$):

| Harmonic $p$ | $\ln(p)/\ln(f_2/f_1)$ | Offset as fraction of $T$ | Min $T/L_h$ |
|:---:|:---:|:---:|:---:|
| 2 | 0.100 | 10.0% from end | 1.11 |
| 3 | 0.159 | 15.9% from end | 1.19 |
| 5 | 0.233 | 23.3% from end | 1.30 |
| 7 | 0.281 | 28.1% from end | 1.39 |

These are remarkably mild constraints. A circular sweep loop only ~40% longer than the impulse response suffices to separate harmonics up to 7th order.

**Guard region**: Define the guard region as $[L_h, \tau_P]$ where $\tau_P$ is the location of the highest harmonic of interest. Within this region, neither the linear IR tail nor the harmonic distortion features should have significant energy. In practice, choosing $T \geq 1.5 \cdot L_h$ provides ample separation for the first 3–4 harmonic orders across the standard audio band.

**Extraction procedure**:

1. Compute the circular impulse response $\hat{h}[n] = \text{IDFT}\{Y[k]/X[k]\}$.
2. Window the region $[0, L_h]$ → linear impulse response $h_1[n]$.
3. Window the region around $\tau_2$ → 2nd-harmonic distortion impulse response.
4. Window around $\tau_3$ → 3rd-harmonic, etc.
5. FFT each windowed segment to obtain frequency-dependent distortion at each harmonic order.

Combining with multi-cycle recording: record $M$ cycles of the circular sweep, take the $MN$-point FFT, zero off-bins for noise reduction, then deconvolve and window. This yields harmonic-separated impulse responses with $10\log_{10}(M)$ dB better SNR than a single-cycle measurement.

**Relation to the unified matched-filter framework.** The windowing-based extraction above is specific to the log sweep, whose constant harmonic time offsets produce compact, well-separated impulse responses. For linear chirps and Zadoff–Chu stimuli, the harmonic offsets are frequency-dependent, producing dispersed harmonic traces in the time domain. In those cases, the extraction uses a spectral-domain matched filter specific to each harmonic order $p$ instead of time-domain windowing. The general extraction formula is $H_p[k] = Y[k] / X_p[k]$, where $X_p[k]$ is the matched filter for harmonic order $p$ (see *Circular Signal Design*, Sections 2.13 and 3.15). For the log sweep, this matched filter reduces to $X[k] \cdot e^{-j2\pi k\Delta\tau_p/N}$ — a linear phase shift equivalent to time-domain windowing at offset $\Delta\tau_p$.

### 3.7 Sparse Multisine Design for Kernel Separation

#### The support-set principle

Let the stimulus support set be $\mathcal{S} = \{k : X[k] \neq 0\}$. From Section 3.3, the $p$-th order output support is contained in the **$p$-fold sumset**:

$$\mathcal{S}^{(p)} = \underbrace{\mathcal{S} \oplus \mathcal{S} \oplus \cdots \oplus \mathcal{S}}_{p \text{ terms}} = \left\{\sum_{i=1}^{p} k_i \bmod N : k_i \in \mathcal{S}\right\}$$

where $\oplus$ denotes the sumset modulo $N$.

If we can design $\mathcal{S}$ such that the sumsets for different orders are disjoint:

$$\mathcal{S}^{(1)} \cap \mathcal{S}^{(2)} = \emptyset, \quad \mathcal{S}^{(2)} \cap \mathcal{S}^{(3)} = \emptyset, \quad \text{etc.}$$

then each Volterra order's contribution is concentrated at distinct output bins, enabling separation.

#### The odd-bin stimulus for 2nd-order separation

The simplest construction: $\mathcal{S} = \{1, 3, 5, \ldots, N-1\}$ (odd bins only, for even $N$).

- The linear output $\mathcal{S}^{(1)} = \mathcal{S}$ (odd bins).
- The 2nd-order sumset $\mathcal{S}^{(2)} = \{k_1 + k_2 \bmod N : k_1, k_2 \text{ odd}\}$. Since the sum of two odd numbers is even, $\mathcal{S}^{(2)} \subseteq \{0, 2, 4, \ldots, N-2\}$ (even bins).
- The 3rd-order sumset $\mathcal{S}^{(3)}$: sum of three odd numbers is odd, so $\mathcal{S}^{(3)} \subseteq$ odd bins.

Result: **Even bins contain only 2nd-order (and 4th, 6th, …) contributions. Odd bins contain the linear response plus 3rd, 5th, … order contributions.** This cleanly separates even-order from odd-order nonlinearity.

The stimulus is constructed as:

$$X[k] = \begin{cases} A[k] \, e^{j\phi[k]} & \text{if } k \text{ is odd} \\ 0 & \text{if } k \text{ is even} \end{cases}$$

with Hermitian symmetry enforced for real output.

#### Sidon sets for full 2nd-order kernel measurement

A **Sidon set** (or $B_2$ set) modulo $N$ is a set $\mathcal{S}$ such that all pairwise sums $k_1 + k_2$ (with $k_1 \leq k_2$, both in $\mathcal{S}$) are distinct modulo $N$.

If $\mathcal{S}$ is a Sidon set, then each 2nd-order intermodulation product at an output bin $k \in \mathcal{S}^{(2)}$ comes from a *unique* pair $(k_1, k_2)$. This means:

$$Y_2[k] = \frac{1}{N} H_2(k_1, k_2) \, X[k_1] \, X[k_2] \quad \text{(unique pair)}$$

and $H_2(k_1, k_2)$ can be recovered directly:

$$H_2(k_1, k_2) = \frac{N \cdot Y_2[k]}{X[k_1] \, X[k_2]}$$

This identifies the full 2nd-order GFRF at all pairs of excited frequencies. Combined with the BLA from the linear bins, this provides a complete 2nd-order Volterra model.

**Size constraints**: A Sidon set modulo $N$ has at most $\sim\sqrt{N}$ elements. For $N = 2^{16} = 65536$, this gives $|\mathcal{S}| \leq 256$ excited bins — a very sparse stimulus, which means low energy per bin, which means more cycles are needed for adequate SNR.

#### Practical multisine design

In practice, the optimal approach balances kernel separability against SNR:

1. **Choose the maximum nonlinear order** $P$ to characterize (typically 2 or 3).
2. **Select the excited bin set** $\mathcal{S}$ using techniques from the literature:
   - For $P = 2$: odd-bin excitation or a random sparse set with verification that $\mathcal{S}^{(1)} \cap \mathcal{S}^{(2)} = \emptyset$.
   - For $P = 3$: construct $\mathcal{S}$ via optimization or known combinatorial designs such that $\mathcal{S}^{(1)}, \mathcal{S}^{(2)}, \mathcal{S}^{(3)}$ are mutually disjoint.
3. **Assign amplitudes** $A[k]$ for $k \in \mathcal{S}$ according to the desired spectral weighting (flat, pink, etc.).
4. **Randomize phases** $\phi[k]$ (with Hermitian symmetry) to distribute energy uniformly in time.
5. **Choose the number of cycles** $M$ to achieve the target SNR at the sparsest bins.

The measurement then yields:
- **BLA**: from bins in $\mathcal{S}^{(1)}$.
- **2nd-order kernel**: from bins in $\mathcal{S}^{(2)} \setminus \mathcal{S}^{(1)}$.
- **3rd-order kernel** (if designed for): from bins in $\mathcal{S}^{(3)} \setminus (\mathcal{S}^{(1)} \cup \mathcal{S}^{(2)})$.
- **Noise floor**: from off-bins (non-multiple-of-$M$ bins) in the multi-cycle FFT.

### 3.8 The Odd–Even Decomposition

Let $x[n]$ be a circular stimulus and let $y^+[n]$ and $y^-[n]$ be the steady-state responses to $x[n]$ and $-x[n]$, respectively.

Under the Volterra model:

$$y^+[n] = \sum_{p=1}^{P} y_p[n], \qquad y^-[n] = \sum_{p=1}^{P} (-1)^p \, y_p[n]$$

The sign $(-1)^p$ arises because the $p$-th order term involves $p$ factors of the input, each negated.

**Even-order extraction**:

$$\frac{y^+[n] + y^-[n]}{2} = \sum_{\substack{p=2,4,6,\ldots}} y_p[n] = y_2[n] + y_4[n] + \cdots$$

**Odd-order extraction**:

$$\frac{y^+[n] - y^-[n]}{2} = \sum_{\substack{p=1,3,5,\ldots}} y_p[n] = y_1[n] + y_3[n] + \cdots$$

In the frequency domain:
- Even-order: $Y_{\text{even}}[k] = \tfrac{1}{2}(Y^+[k] + Y^-[k])$
- Odd-order: $Y_{\text{odd}}[k] = \tfrac{1}{2}(Y^+[k] - Y^-[k])$

For a system with weak nonlinearity ($|y_1| \gg |y_3| \gg |y_5| \gg \cdots$), the odd-order signal is dominated by the linear response, and the even-order signal is dominated by the 2nd-order distortion. Together with the BLA from spectral division of the odd-order signal, this gives a first-cut nonlinear characterization.

**Noise consideration**: If both $y^+$ and $y^-$ include independent noise $\eta^+$ and $\eta^-$, then:

$$y_{\text{even}}[n] = \sum_{p \text{ even}} y_p[n] + \tfrac{1}{2}(\eta^+[n] + \eta^-[n])$$

The noise term is not cancelled — it averages. Multi-cycle recording of each polarity reduces the noise floor further.

### 3.9 Multi-Cycle Nonlinearity Detection

Record $M$ cycles of a periodic stimulus with period $N$. The $MN$-point DFT of the recording has:

- **Signal bins** at indices $\{0, M, 2M, \ldots, (N-1)M\}$: these contain the linear response plus all nonlinear distortion products (by Theorem 3.2, all are periodic with period $N$).
- **Off-bins** (all other indices): these contain measurement noise only.

Now suppose the stimulus has support $\mathcal{S} \subset \{0, 1, \ldots, N-1\}$ (not necessarily all bins). The signal bins in the $MN$-point DFT corresponding to the "stimulus grid" are $\{kM : k \in \mathcal{S}\}$. The signal bins corresponding to *non-excited* frequencies are $\{kM : k \notin \mathcal{S}\}$.

For a **linear** system: $Y[kM] = H[k] X[k]$, so signal bins at non-excited frequencies ($k \notin \mathcal{S}$) have value $H[k] \cdot 0 = 0$. Only noise appears there.

For a **nonlinear** system: $Y[kM]$ at non-excited frequencies may be nonzero due to intermodulation from excited frequencies. The energy at these "intermodulation bins" quantifies the nonlinear distortion.

This gives a three-tier structure in the $MN$-point DFT:

| Bin type | Contents |
|----------|----------|
| Excited signal bins ($kM$, $k \in \mathcal{S}$) | Linear response + nonlinear self-products + noise |
| Non-excited signal bins ($kM$, $k \notin \mathcal{S}$) | Nonlinear intermodulation products + noise |
| Off-bins (non-multiple of $M$) | Noise only |

The noise floor estimated from off-bins can be subtracted from the non-excited signal bins to reveal the intermodulation level. This is a quantitative nonlinearity diagnostic that complements the BLA.

### 3.10 Coherence-Based Nonlinearity Quantification

Make $P$ measurements with stimuli $x^{(i)}[n]$, $i = 1, \ldots, P$, each having the same amplitude spectrum $A[k]$ but different random phases $\phi^{(i)}[k]$. Let $Y^{(i)}[k]$ be the response DFTs and define:

$$\hat{H}^{(i)}[k] = \frac{Y^{(i)}[k]}{X^{(i)}[k]}$$

**For a linear system**: $\hat{H}^{(i)}[k] = H[k] + N_\eta^{(i)}[k]/X^{(i)}[k]$ for all $i$. The variance of $\hat{H}^{(i)}[k]$ across $i$ is $\sigma_\eta^2[k]/A[k]^2$ — attributable entirely to noise.

**For a nonlinear system**: the nonlinear correction terms in Section 3.3 depend on the phases $\phi^{(i)}[k]$ (through the products $X^{(i)}[k_1] X^{(i)}[k_2] / X^{(i)}[k]$). Different phase realizations produce different nonlinear contributions, adding variance:

$$\text{Var}[\hat{H}^{(i)}[k]] = \frac{\sigma_\eta^2[k]}{A[k]^2} + \sigma_{\text{NL}}^2[k]$$

where $\sigma_{\text{NL}}^2[k]$ is the variance due to nonlinear stochastic contributions.

Using multi-cycle recording for each measurement, $\sigma_\eta^2[k]$ is estimated from off-bins and subtracted, yielding an estimate of $\sigma_{\text{NL}}^2[k]$.

The **nonlinear coherence** can then be defined:

$$\gamma_{\text{NL}}^2[k] = 1 - \frac{\sigma_{\text{NL}}^2[k]}{|\hat{G}_{\text{BLA}}[k]|^2 + \sigma_{\text{NL}}^2[k]}$$

When $\gamma_{\text{NL}}^2[k] = 1$, the system is linear at bin $k$. Departures from 1 quantify the relative importance of nonlinearity at each frequency.

---

## 4. Connections to Literature

### Farina's swept-sine method (Farina, 2000; 2007)

Angelo Farina's exponential sine sweep method [1, 2] is the most widely used technique for separating harmonic distortion in impulse response measurements. The key insight — that harmonic products appear as pre-impulses in the deconvolved output — carries directly into the circular framework (Section 3.6). The circular version adds:
- Seamless looping, eliminating start/stop transients.
- Multi-cycle noise reduction, which is not available in the conventional single-sweep approach.
- A well-defined "guard region" analysis for circular wrap-around.

### Multisine-based nonlinear identification (Pintelon & Schoukens, 2012)

Rik Pintelon and Johan Schoukens developed a comprehensive framework for nonlinear system identification using random-phase multisines [3, 4]. Their approach uses:
- The Best Linear Approximation concept (Section 3.4).
- Variance analysis across multiple random-phase realizations (Section 3.10).
- Specially designed frequency grids (odd, random odd, full multisine) to separate even/odd nonlinear contributions.

The circular signal analysis framework is essentially a physical realization of the multisine framework: the frequency-domain-designed stimulus is played through a real acoustic system, and the exact periodicity guaranteed by looping corresponds to the theoretical periodic signal assumed in the Pintelon–Schoukens framework. The circular approach adds the multi-cycle noise separation mechanism, which provides a cleaner noise estimate than the "neighboring bin" methods used in the classical multisine approach.

### Volterra kernel measurement (Boyd & Chua, 1985; Rugh, 1981)

Classical Volterra kernel identification methods [5, 6] use multi-tone probing signals with specific frequency relationships. The sparse multisine design of Section 3.7 is a circular-periodic realization of this idea. The advantage of the circular framework is that it provides exact periodicity (no truncation effects) and a natural noise separation mechanism via multi-cycle recording.

### Describing function analysis (Gelb & Vander Velde, 1968)

The describing function [7] — the complex gain of a nonlinear system at the fundamental frequency of a sinusoidal input — is the single-tone special case of the BLA (Section 3.4). The circular framework extends this concept to broadband stimuli.

### MLS-based measurements (Rife & Vanderkooy, 1989; Vanderkooy, 1994)

MLS methods [8, 9] are known to be sensitive to nonlinearity: harmonic distortion products alias across the full spectrum of the deconvolved impulse response. This is a direct consequence of MLS having energy at all bins (Section 3.5). The circular framework with sparse-spectrum or sweep stimuli overcomes this limitation.

### Coherence function for nonlinearity detection (Bendat & Piersol, 2010)

Bendat and Piersol [10] describe the use of the coherence function to detect noise and nonlinearity, noting that the two effects are confounded. The multi-realization + multi-cycle method of Section 3.10 resolves this confound by separately estimating noise (from off-bins) and nonlinear variance (from cross-realization variation).

---

## 5. Conclusions and Open Questions

The circular signal analysis framework, originally designed for exact linear system identification, offers substantial capabilities for nonlinear characterization. The key findings are:

1. **Periodicity is preserved** through any order of nonlinearity. The DFT remains exact and leakage-free.

2. **Spectral division of a single broadband measurement yields the Best Linear Approximation** — a well-defined quantity that equals the true transfer function for linear systems and provides the optimal linear model for nonlinear systems at a given operating point.

3. **Level-dependent BLA measurements** are the simplest nonlinearity test, requiring no special stimulus design.

4. **The odd–even polarity trick** separates even-order from odd-order distortion with just two measurements.

5. **Chirp-based stimuli enable harmonic separation** via a unified matched-filter principle. The $p$-th harmonic transfer function is extracted by $H_p[k] = Y[k] / X_p[k]$, where $X_p[k]$ is the matched filter for harmonic order $p$ — i.e. the DFT of $x[n]^p$. *This rule is exact for memoryless $p$-th order nonlinearity; for systems with memory it recovers a kernel-diagonal projection (a frequency-warped harmonic impulse response), not the full GFRF.* This framework applies to all chirp stimuli:
   - **Log sweep**: $X_p$ is a time-shifted version of $X$, so extraction simplifies to Farina-style time-domain windowing (the simplest special case).
   - **Linear chirp**: $X_p$ involves a quadratic phase correction — requires spectral-domain processing.
   - **Zadoff–Chu**: $X_p = X_{pu}$ (ZC with root $pu$) — the most algebraically clean form, with optimal spectral properties.

6. **Sparse-spectrum stimulus design** (odd-bin, Sidon set, optimized grids) enables direct observation of intermodulation products and, in the limit, full Volterra kernel identification.

7. **Multi-cycle recording** provides three-tier spectral separation: linear response at excited signal bins, nonlinear products at unexcited signal bins, noise at off-bins.

8. **Multi-realization coherence analysis** with noise estimation from off-bins separates the two confounds (noise vs. nonlinearity) that plague conventional coherence measurements.

9. **Stimulus circularity varies along a spectrum** (see *Circular Signal Design*, Section 2.12): from log sweeps (least circular, frequency jump at wrap boundary) through linear chirps (DFT-designed circularity) to Zadoff–Chu sequences (maximally circular, forward-backward sweep on the positive frequency axis). Greater circularity yields better spectral properties (flatter spectrum, lower crest factor, perfect autocorrelation) but requires the more general matched-filter extraction rather than simple windowing.

### Open questions

- **Optimal sparse set design for acoustic measurements**: What bin-selection strategy best balances SNR, kernel order separation, and practical measurement time for loudspeaker or room characterization?

- **Time-varying nonlinearity**: The framework assumes time-invariance. Thermal effects in loudspeakers (voice coil heating) can cause slow drift. Can the multi-cycle approach detect or compensate for this?

- **Interaction between circular-sweep harmonic separation and multi-source multiplexing**: Can multiple circular sweeps (at different sweep rates) be simultaneously multiplexed in the frequency-division scheme described in the companion document? ZC code-division multiplexing (see *Circular Signal Design*, Section 2.10) offers an alternative where all sources use the full bandwidth simultaneously.

- **Crest factor optimization for sparse stimuli**: Random-phase sparse stimuli have high crest factors. Can phase optimization (e.g., Schroeder phases, clipping-and-filtering) reduce the crest factor while preserving the intermodulation gap structure?

- **Higher-order Volterra kernel estimation**: Practical limits on identifying 3rd- and higher-order kernels via circular multisines. The combinatorial constraints on sparse set design become severe for $p \geq 3$.

- **Unified extraction implementation**: A single code path that accepts any stimulus $X[k]$, computes $X_p[k] = \text{DFT}\{x[n]^p\}$ numerically, and extracts $H_p[k] = Y[k]/X_p[k]$ would unify the log-sweep, linear-chirp, and ZC extraction procedures (see *Circular Signal Design*, Q7).

---

## 6. References

[1] A. Farina, "Simultaneous measurement of impulse response and distortion with a swept-sine technique," *108th AES Convention*, Paris, 2000.

[2] A. Farina, "Advancements in impulse response measurements by sine sweeps," *122nd AES Convention*, Vienna, 2007.

[3] R. Pintelon and J. Schoukens, *System Identification: A Frequency Domain Approach*, 2nd ed., IEEE Press / Wiley, 2012.

[4] J. Schoukens, R. Pintelon, and T. Dobrowiecki, "Linear modeling in the presence of nonlinear distortions," *Automatica*, vol. 41, no. 3, pp. 491–504, 2005.

[5] S. Boyd and L. O. Chua, "Fading memory and the problem of approximating nonlinear operators with Volterra series," *IEEE Trans. Circuits Syst.*, vol. CAS-32, no. 11, pp. 1150–1161, 1985.

[6] W. J. Rugh, *Nonlinear System Theory: The Volterra/Wiener Approach*, Johns Hopkins University Press, 1981.

[7] A. Gelb and W. E. Vander Velde, *Multiple-Input Describing Functions and Nonlinear System Design*, McGraw-Hill, 1968.

[8] D. D. Rife and J. Vanderkooy, "Transfer-function measurement with maximum-length sequences," *J. Audio Eng. Soc.*, vol. 37, no. 6, pp. 419–444, 1989.

[9] J. Vanderkooy, "Aspects of MLS measuring systems," *J. Audio Eng. Soc.*, vol. 42, no. 4, pp. 219–231, 1994.

[10] J. S. Bendat and A. G. Piersol, *Random Data: Analysis and Measurement Procedures*, 4th ed., Wiley, 2010.
