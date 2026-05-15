# Circular Nonlinear Regression: Gray-Box Parametric Identification in the Circular Framework

> **Companion document to**
> [CIRCULAR_SIGNAL_ANALYSIS.md](CIRCULAR_SIGNAL_ANALYSIS.md),
> [CIRCULAR_NONLINEAR-SIGNAL_ANALYSIS.md](CIRCULAR_NONLINEAR-SIGNAL_ANALYSIS.md),
> [CIRCULAR_SIGNAL_DESIGN.md](CIRCULAR_SIGNAL_DESIGN.md), and
> [CIRCULAR_SIGNAL_PHASE_ANALYSIS.md](CIRCULAR_SIGNAL_PHASE_ANALYSIS.md).
>
> Motivated by the questions raised in
> [CIRCULAR_NONLINEAR_REGRESSION_MOTIVATION.md](CIRCULAR_NONLINEAR_REGRESSION_MOTIVATION.md):
> can the circular framework be used to fit a *physical* nonlinear model
> (polynomial coefficient functions of an underlying ODE), rather than
> only a black-box Volterra/GFRF description? This document develops an
> affirmative answer: under steady-state circular excitation, the
> nonlinear ODE collapses to a single overdetermined **linear** least-
> squares problem in the unknown polynomial coefficients, with all
> nonlinear and derivative operations carried out exactly in the
> frequency domain via DFT properties.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Intuitive Overview](#2-intuitive-overview)
   - 2.1 [The Gray-Box Question](#21-the-gray-box-question)
   - 2.2 [Why the Frequency Domain?](#22-why-the-frequency-domain)
   - 2.3 [Three Operations We Need: Derivative, Power, Product](#23-three-operations-we-need-derivative-power-product)
   - 2.4 [The Key Trick: Linearity in the Coefficients](#24-the-key-trick-linearity-in-the-coefficients)
   - 2.5 [A Worked Toy Example: The Duffing Oscillator](#25-a-worked-toy-example-the-duffing-oscillator)
   - 2.6 [The Loudspeaker as a Coupled System](#26-the-loudspeaker-as-a-coupled-system)
   - 2.7 [Stimulus Selection for Identifiability](#27-stimulus-selection-for-identifiability)
   - 2.8 [Noise, Bias, and the Errors-in-Variables Problem](#28-noise-bias-and-the-errors-in-variables-problem)
   - 2.9 [What This Method Is and Is Not](#29-what-this-method-is-and-is-not)
3. [Mathematical Formulation](#3-mathematical-formulation)
   - 3.1 [Notation and Model Class](#31-notation-and-model-class)
   - 3.2 [Spectral Differentiation in the Circular Framework](#32-spectral-differentiation-in-the-circular-framework)
   - 3.3 [Powers and Products: The Convolution Algebra](#33-powers-and-products-the-convolution-algebra)
   - 3.4 [The Equation-Error Linear Regression](#34-the-equation-error-linear-regression)
   - 3.5 [Multi-Level and Multi-Realization Stacking](#35-multi-level-and-multi-realization-stacking)
   - 3.6 [Identifiability and Conditioning](#36-identifiability-and-conditioning)
   - 3.7 [Multi-Cycle Noise Reduction and Bin Weighting](#37-multi-cycle-noise-reduction-and-bin-weighting)
   - 3.8 [Bias Correction for Errors-in-Variables](#38-bias-correction-for-errors-in-variables)
   - 3.9 [Coupled-State Systems and Multi-Equation Regression](#39-coupled-state-systems-and-multi-equation-regression)
   - 3.10 [Matched-Filter / Harmonic-IR Form of the Regression](#310-matched-filter--harmonic-ir-form-of-the-regression)
   - 3.11 [Algorithm Summary](#311-algorithm-summary)
4. [Connections to Literature](#4-connections-to-literature)
5. [Open Questions](#5-open-questions)
6. [References](#6-references)

---

## 1. Introduction

The circular signal analysis framework provides exact, leakage-free
DFT-domain measurements of looped, steady-state signals. Its companion
nonlinear document develops a *black-box* characterisation of nonlinear
systems via the Best Linear Approximation, Volterra GFRFs, and harmonic
extraction by sparse-bin or chirp stimuli.

In hardware design — loudspeaker engineering being the canonical
example — what one actually wants is rarely a Volterra kernel. It is a
**parametric physical model**: the force factor $\text{Bl}(x)$ as a
function of cone displacement, the suspension stiffness $K_{ms}(x)$,
the voice-coil inductance $L_e(x, i)$, the velocity-dependent damping
$R_{ms}(\dot x)$. These are scalar nonlinear functions of physical
state variables, and the design problem is to optimise their *shape*.
A Volterra kernel can in principle be inverted into such a model, but
the inversion is ill-posed and the kernel itself is far larger than
needed: a 3rd-order Volterra system on $N=4096$ samples has
$\binom{N+2}{3} \sim 10^{10}$ free parameters; the gray-box loudspeaker
model has perhaps a few dozen.

The motivation document poses four concrete questions:

1. Can the problem be cast in the frequency domain (so that the
   circular structure is naturally available)?
2. How are higher-order derivatives represented in that domain?
3. How are polynomials of the state represented?
4. Can the resulting system be reduced to a *linear* regression in the
   unknown coefficients, despite the underlying physics being nonlinear?

This document answers all four affirmatively. The construction is
nothing more exotic than the **equation-error method** of nonlinear
system identification, but the circular framework gives it teeth: the
DFT is exact, derivatives are exact (spectral differentiation on a
genuinely periodic signal has no boundary error), the steady-state
assumption is *enforced* by looped playback rather than argued about,
and the multi-cycle noise model gives a clean, physically meaningful
weighting for the regression.

The structure follows the companion documents: an intuitive overview
(Section 2) and a rigorous mathematical formulation (Section 3).

---

## 2. Intuitive Overview

### 2.1 The Gray-Box Question

The systems we care about are governed by ordinary differential
equations whose coefficients are **smooth functions of the state**.
For a single-degree-of-freedom mechanical example,

$$ m\,\ddot x \;+\; R_{ms}(\dot x)\,\dot x \;+\; K_{ms}(x)\,x \;=\; F(t), $$

with the nonlinear coefficient functions modelled as polynomials,

$$ K_{ms}(x) = k_0 + k_1 x + k_2 x^2 + \cdots,\qquad
   R_{ms}(\dot x) = r_0 + r_1\dot x + r_2\dot x^2 + \cdots. $$

We measure the response $x(t)$ to a known forcing $F(t)$, and we want
to recover the coefficients $\{k_m\}$, $\{r_m\}$, $m$.

A Volterra-style approach would estimate a 2- or 3-dimensional kernel
$H_p(\omega_1,\dots,\omega_p)$. That kernel implicitly contains
$\{k_m,r_m,m\}$, but extracting them is a nonlinear inverse problem.
We will avoid that detour and identify the polynomial coefficients
**directly**.

### 2.2 Why the Frequency Domain?

Three properties of the circular framework conspire in our favour:

* **Steady state is exact.** Looped playback drives the system to a
  genuine $N$-periodic response; the DFT then describes the response
  *exactly*, not approximately.
* **Differentiation is exact and stable.** On a circular signal,
  $d^d/dt^d$ becomes pointwise multiplication by $(j\omega_k)^d$ in the
  DFT domain. There is no boundary error and no finite-difference
  truncation.
* **Polynomials become convolutions.** The DFT of $x(t)^p$ is the
  $p$-fold *circular* self-convolution of $X[k]$. On a periodic
  signal this convolution is also exact — no aliasing in the sense of
  truncated sums.

Doing the algebra in time would force us to differentiate noisy
measured signals (highly ill-conditioned), to handle the fact that the
sample at $n=0$ has no predecessor (a "modulus" issue mentioned in the
motivation), and to sort out edge effects from finite recordings.
Doing the algebra in the frequency domain on a circular signal
sidesteps all of these.

### 2.3 Three Operations We Need: Derivative, Power, Product

Every term that appears on the left-hand side of a polynomial ODE is a
combination of three operations applied to the measured state $x(t)$:

| Time-domain operation | Frequency-domain operation |
|---|---|
| $d^d x/dt^d$ | multiply by $(j\omega_k)^d$ |
| $x(t)^m$ | $m$-fold circular self-convolution of $X[k]$ (scaled by $1/N^{m-1}$) |
| $a(t)\,b(t)$ | circular convolution $\tfrac{1}{N}(A\circledast B)[k]$ |

A monomial term in the ODE such as $x^m \cdot \dot x^q \cdot \ddot x^r$
is therefore represented in the frequency domain by the circular
convolution of $m$ copies of $X[k]$, $q$ copies of $j\omega_k X[k]$
and $r$ copies of $-\omega_k^2 X[k]$. Crucially, each of these is
something we can **compute** from the measured signal alone — they are
known numerical sequences indexed by $k$.

### 2.4 The Key Trick: Linearity in the Coefficients

Take any nonlinear ODE whose nonlinearity is *polynomial in the state*
(after expanding $K_{ms}(x)\,x$ etc. as a sum of monomials). Each
monomial term carries an unknown scalar coefficient $\theta_j$ and a
known "regressor" $\Phi_j(t)$ built from $x$ and its derivatives:

$$ \sum_{j} \theta_j\,\Phi_j(t) \;=\; F(t). $$

The unknown coefficients $\theta_j$ enter *linearly*. The
nonlinearity lives entirely inside the regressors $\Phi_j(t)$, which we
*compute from data* — they are not unknowns.

Take the DFT of both sides. Each regressor becomes a known
frequency-domain sequence $\Phi_j[k]$ obtained by the convolution
algebra of Section 2.3. The forcing becomes the known $F[k]$. The
result is a linear system

$$ \sum_j \theta_j\,\Phi_j[k] \;=\; F[k],\qquad k = 0,1,\dots,N-1, $$

with $N$ complex equations (or $N/2{+}1$ independent ones after
Hermitian symmetry) in a handful of unknowns. This is a textbook
overdetermined least-squares problem. **The nonlinear identification
problem has been reduced to linear regression** — this is the central
result and the answer to the motivation document's headline question.

### 2.5 A Worked Toy Example: The Duffing Oscillator

The Duffing oscillator,

$$ \ddot x + 2\zeta\omega_0\,\dot x + \omega_0^2\,x + \alpha\,x^3 = u(t), $$

is the simplest non-trivial test case. It has four scalar unknowns,
$\theta = (1, 2\zeta\omega_0, \omega_0^2, \alpha)$ — the leading $1$
fixes the scale; we could equally absorb a mass $m$ as a fifth
unknown. Drive the system with a circular pink-noise stimulus $u[n]$,
record $x[n]$ in steady state, and form

$$ \Phi_1[k] = -\omega_k^2\,X[k],\quad
   \Phi_2[k] =  j\omega_k\,X[k],\quad
   \Phi_3[k] =  X[k],\quad
   \Phi_4[k] = \tfrac{1}{N^2}(X\!\circledast\!X\!\circledast\!X)[k]. $$

The model equation at every bin is

$$ \theta_1\Phi_1[k] + \theta_2\Phi_2[k] + \theta_3\Phi_3[k] + \theta_4\Phi_4[k] \;=\; U[k]. $$

Stack these for $k = 1,\dots,N/2-1$ (skip DC and Nyquist, where the
imaginary part of $j\omega_k X[k]$ degenerates) and solve in the
least-squares sense. With a few thousand bins and four unknowns the
problem is dramatically overdetermined and well-conditioned, and the
recovered $\hat\theta$ matches the truth to within the noise-floor of
the multi-cycle measurement.

What is *not* obvious from the form is that the nonlinear cubic term
appears merely as another column in the regression matrix, no
different in algebraic status from the linear terms. The fact that
$x^3$ takes a nontrivial computation to evaluate (a 3-fold convolution)
does not change the structure of the regression.

### 2.6 The Loudspeaker as a Coupled System

The loudspeaker model from the motivation is more interesting because
two physical state variables are coupled:

$$ \begin{aligned}
u(t) &= R_e\,i(t) \;+\; L_e(x)\,\dot i(t) \;+\; \text{Bl}(x)\,\dot x(t),\\
\text{Bl}(x)\,i(t) &= m\,\ddot x(t) \;+\; R_{ms}(\dot x)\,\dot x(t) \;+\; K_{ms}(x)\,x(t).
\end{aligned} $$

Both equations are *linear in the polynomial coefficients* of the
nonlinear functions $\text{Bl}(x), L_e(x), R_{ms}(\dot x), K_{ms}(x)$.
The two equations share unknowns ($\text{Bl}$ appears in both), but
that is not a problem: we simply stack both into one regression. With
the voltage $u$ as known forcing and both the current $i(t)$ and the
displacement $x(t)$ measured (or one measured and the other recovered
from the electrical equation), the regression matrix has columns for
every polynomial monomial in every nonlinear coefficient, and the
right-hand side stacks the measured forcing of both equations.

This is structurally identical to a Klippel-style large-signal
identification, but performed in a *single* exact frequency-domain
regression instead of an iterative time-domain fit. The circular
stimulus determines the operating range over which the polynomial
coefficients are valid (you must drive $x$ over the displacement range
where you want $\text{Bl}(x)$ characterised).

### 2.7 Stimulus Selection for Identifiability

The polynomial coefficients are identifiable only if the regressor
columns $\Phi_j[k]$ are *linearly independent across the bins used in
the fit*. Two failure modes:

* **Insufficient amplitude diversity.** If $x(t)$ never visits large
  amplitudes, the column $X^{(3)} = X\circledast X\circledast X$ is
  small relative to $X$, and the cubic coefficient is poorly
  conditioned. Fix: drive at multiple levels and stack the regressions
  (Section 3.5). Higher-level measurements load the higher-order
  columns more strongly.
* **Single-tone stimulus.** A pure tone places all energy at a single
  bin, so all higher-order regressors land on harmonic bins exactly —
  the regression matrix collapses to one row per harmonic. The
  polynomial coefficients can still be recovered if enough harmonic
  bins are above the noise floor, but conditioning is poor compared to
  a broadband stimulus.

The circular framework's standard recommendations apply: a circular
linear chirp (flat-magnitude, low crest factor, broadband) or a
random-phase pink multisine over a wide bandwidth, repeated at
2–4 amplitudes spanning the operating range of interest, gives a
well-conditioned regression for typical loudspeaker-class systems. For
strongly nonlinear systems where the operating point itself drifts
with level (e.g. a soft-clipping amplifier), several measurements at
*finely* spaced levels are preferable to a few at coarse spacing,
because the polynomial fit is local in the amplitude range that was
actually visited.

### 2.8 Noise, Bias, and the Errors-in-Variables Problem

There is one honest difficulty. The forcing $u(t)$ is *known*
(generated by us); the response $x(t)$ is *measured* and therefore
noisy. Every regressor $\Phi_j[k]$ is built from $x$, so every
column of the regression matrix carries measurement noise. This is
the classical errors-in-variables (EIV) situation: ordinary least
squares is biased.

Two mitigations make this entirely tractable in the circular
framework:

* **Multi-cycle averaging brings the noise floor down by
  $10\log_{10}M$ dB**, exactly as in the linear case
  (*Circular Signal Analysis*, §2.6). For typical $M \in [10, 1000]$
  this puts the response noise far below any nonlinear distortion of
  interest, and the EIV bias becomes negligible relative to the model
  error.
* **The off-bins of the multi-cycle FFT give a model-free noise
  estimate at every frequency.** This is exactly the input the EIV
  bias correction needs: with a known noise covariance,
  total-least-squares (TLS) and instrumental-variable (IV) estimators
  remove the bias to first order. Section 3.8 formalises this.

For most practical hardware identification — where the signal-to-noise
ratio after multi-cycle averaging is 60–100 dB and the polynomial
nonlinearity is several percent of the linear response — ordinary
weighted least squares with the off-bin noise weighting is adequate;
the bias correction is a polish, not a necessity.

### 2.9 What This Method Is and Is Not

**It is** a gray-box parametric identifier for systems whose physics
is described by an ODE with polynomial coefficient functions of the
measured state. It produces estimates of those polynomial
coefficients directly from one (or a few) circular measurements, with
all nonlinearity handled in closed form by DFT-domain convolution.

**It is not** a black-box identifier. The equations of motion must be
known up to the unknown polynomial coefficients. A truly unknown
nonlinearity — a genuinely "any function" $f(x)$ — cannot be
identified by this method without first parametrising it (e.g. as a
polynomial of chosen order, or as a B-spline or radial-basis
expansion, all of which preserve linearity-in-coefficients). The
choice of basis is a modelling decision exterior to the framework.

**It is not** a substitute for the Volterra/GFRF treatment when the
*physics is unknown*. If you do not know that "this loudspeaker obeys
the Klippel model up to $L_e(x)$", do not use this method to verify
the model — use it to *fit* the model and then use the residual
spectrum (the difference between $\hat F[k]$ and $F[k]$ at every bin)
as a diagnostic for un-modelled physics.

**It does not require** a special stimulus. Any circular stimulus
that reaches the operating range of interest will work; broadband
chirps and multisines simply give the best conditioning.

---

## 3. Mathematical Formulation

### 3.1 Notation and Model Class

We adopt the notation of *Circular Signal Analysis* §3.1 (loop length
$N$, sample rate $f_s$, period $T = N/f_s$). The system under test
is described by an ODE

$$ \mathcal{N}\bigl(x(t),\dot x(t),\ddot x(t),\dots,x^{(D)}(t)\bigr) \;=\; u(t), \tag{3.1} $$

where $u(t)$ is a known circular stimulus, $x(t)$ is the measured
steady-state response, and $\mathcal N$ is a *polynomial* differential
operator of total degree $\Pi$ in the state and its derivatives up to
order $D$:

$$ \mathcal N(x,\dot x,\dots,x^{(D)}) \;=\; \sum_{\boldsymbol\alpha \in\mathcal A} \theta_{\boldsymbol\alpha}\,
   \prod_{d=0}^{D} \bigl(x^{(d)}(t)\bigr)^{\alpha_d}, \tag{3.2} $$

with multi-indices $\boldsymbol\alpha = (\alpha_0,\dots,\alpha_D) \in
\mathbb N_0^{D+1}$ drawn from a chosen finite set $\mathcal A$ of
included monomials (typically $|\boldsymbol\alpha|_1 = \sum_d\alpha_d
\le \Pi$). The $\theta_{\boldsymbol\alpha}$ are the unknown
coefficients to identify.

The model class is broad: it includes Duffing, Van der Pol,
loudspeaker large-signal models (after expanding $\text{Bl}(x)i$ and
$K_{ms}(x)x$ into monomials), Hammerstein and Wiener models with
polynomial static nonlinearities, and any ODE expressible as a
polynomial in the state. The identification reduces to choosing
$\mathcal A$ (the set of monomials we believe are present) and solving
for $\boldsymbol\theta = \{\theta_{\boldsymbol\alpha}\}_{\boldsymbol\alpha\in\mathcal A}$.

### 3.2 Spectral Differentiation in the Circular Framework

For an $N$-periodic continuous signal $x(t)$ that is bandlimited to
$|f| < f_s/2$, sampled at $x[n] = x(nT_s)$ with $T_s = 1/f_s$, the
DFT $X[k]$ contains the Fourier-series coefficients of $x(t)$ exactly.
The continuous-time derivative at the sample points is then

$$ \dot x[n] \;=\; \frac{1}{N}\sum_{k=-N/2}^{N/2-1} (j\omega_k)\,X[k]\,e^{j2\pi kn/N},
   \qquad \omega_k = \frac{2\pi k f_s}{N}. \tag{3.3} $$

Equivalently, in the standard DFT index range $k = 0,\dots,N-1$, we
identify $k > N/2$ with the negative-frequency aliases $k - N$, so the
spectral derivative operator $\mathcal D_d$ acts bin-wise as

$$ (\mathcal D_d X)[k] \;=\; (j\omega_k)^d \cdot X[k],\qquad
   \omega_k = \begin{cases} 2\pi k f_s/N & 0\le k\le N/2,\\ 2\pi(k-N)f_s/N & N/2 < k < N.\end{cases} \tag{3.4} $$

**Nyquist handling.** For even $N$ the bin $k = N/2$ has an
ambiguous sign for $\omega_k$; the standard remedy is to set
$(\mathcal D_d X)[N/2] = 0$ for *odd* $d$ (the imaginary part of an
even-symmetric Hermitian spectrum vanishes there anyway). For *even*
$d$ the natural value $(\pm j\omega_{N/2})^d = (-1)^{d/2}\omega_{N/2}^d$
is unambiguous and is used. Equivalently, we restrict the regression
to $k = 1,\dots,N/2-1$, which is the same bandwidth used in any
practical analysis.

**Why this is exact.** The proof is one line: the DFT/IDFT pair is an
exact change of basis for $N$-periodic sequences, and term-by-term
differentiation of a Fourier series is exact under the bandlimit
assumption. There is no truncation error and no boundary error,
because there are no boundaries on the circle. The numerical
amplification factor $\omega_k^d$ does inflate high-frequency noise —
that is a *measurement* limitation, not a method limitation, and is
precisely what the multi-cycle SNR gain (§2.6 of the linear analysis
document) compensates.

### 3.3 Powers and Products: The Convolution Algebra

The DFT of a product of two $N$-periodic signals is the circular
convolution of their DFTs, scaled by $1/N$:

$$ \mathrm{DFT}\{a\cdot b\}[k] \;=\; \frac{1}{N}(A\circledast B)[k]
   \;=\; \frac{1}{N}\sum_{\ell=0}^{N-1}A[\ell]\,B[(k-\ell)\bmod N]. \tag{3.5} $$

Iterating, for an $m$-fold product $x(t)^m$,

$$ X^{(m)}[k] \;\equiv\; \mathrm{DFT}\{x^m\}[k] \;=\; \frac{1}{N^{m-1}}\,
   \underbrace{(X\circledast X\circledast\cdots\circledast X)}_{m\text{ copies}}[k]. \tag{3.6} $$

For a mixed monomial with multi-index $\boldsymbol\alpha =
(\alpha_0,\dots,\alpha_D)$, define the **regressor sequence**

$$ \Phi_{\boldsymbol\alpha}[k] \;\equiv\; \mathrm{DFT}\!\left\{\prod_{d=0}^D \bigl(x^{(d)}(t)\bigr)^{\alpha_d}\right\}[k]
   \;=\; \frac{1}{N^{|\boldsymbol\alpha|_1-1}}\;\bigotimes_{d=0}^{D}\,
         \underbrace{(\mathcal D_d X)\circledast\cdots\circledast(\mathcal D_d X)}_{\alpha_d\text{ copies}}[k], \tag{3.7} $$

where $\bigotimes$ is the iterated circular convolution and
$|\boldsymbol\alpha|_1 = \sum_d\alpha_d$ is the total degree. Each
$\Phi_{\boldsymbol\alpha}[k]$ is *computed once* from the measured
$X[k]$ via $|\boldsymbol\alpha|_1 - 1$ length-$N$ FFT-based
convolutions (or, equivalently, by going to the time domain, taking
the pointwise product, and FFTing back — usually cheaper).

Equivalently, the time-domain identity

$$ \prod_d \bigl(x^{(d)}\bigr)^{\alpha_d}(t)
   \;\xleftrightarrow{\;\mathrm{DFT}\;}\;
   \Phi_{\boldsymbol\alpha}[k] \tag{3.8} $$

means we can build $\Phi_{\boldsymbol\alpha}$ in whichever domain is
cheaper: time-domain pointwise products on $N$-sample sequences
followed by one FFT cost $O(|\boldsymbol\alpha|_1 N + N\log N)$, while
direct convolution in the DFT domain costs $O(|\boldsymbol\alpha|_1
N\log N)$. For high-degree monomials, **the time-domain construction
followed by a single FFT is the recommended implementation**.

### 3.4 The Equation-Error Linear Regression

Substituting (3.2) into (3.1) and DFT-ing both sides, using (3.7),

$$ \boxed{\;\sum_{\boldsymbol\alpha\in\mathcal A} \theta_{\boldsymbol\alpha}\,
   \Phi_{\boldsymbol\alpha}[k] \;=\; U[k],\qquad k = 1,\dots,N/2-1.\;} \tag{3.9} $$

Equation (3.9) is the central result. Stacking it as a matrix
equation, with $K = N/2-1$ usable bins and $J = |\mathcal A|$ unknown
coefficients,

$$ \underbrace{\begin{bmatrix}\Phi_{\boldsymbol\alpha_1}[1] & \cdots & \Phi_{\boldsymbol\alpha_J}[1]\\
   \vdots & & \vdots\\ \Phi_{\boldsymbol\alpha_1}[K] & \cdots & \Phi_{\boldsymbol\alpha_J}[K]\end{bmatrix}}_{\mathbf\Phi\;\in\;\mathbb C^{K\times J}}
   \underbrace{\begin{bmatrix}\theta_{\boldsymbol\alpha_1}\\ \vdots\\ \theta_{\boldsymbol\alpha_J}\end{bmatrix}}_{\boldsymbol\theta\in\mathbb R^J}
   \;=\;\underbrace{\begin{bmatrix}U[1]\\ \vdots\\ U[K]\end{bmatrix}}_{\mathbf U\in\mathbb C^K}. \tag{3.10} $$

Because $\boldsymbol\theta$ is real-valued (physical coefficients), the
complex regression (3.10) is equivalent to the real regression

$$ \begin{bmatrix}\Re\,\mathbf\Phi\\ \Im\,\mathbf\Phi\end{bmatrix}\boldsymbol\theta
   \;=\;\begin{bmatrix}\Re\,\mathbf U\\ \Im\,\mathbf U\end{bmatrix}, \tag{3.11} $$

with $2K$ real equations in $J$ real unknowns. With $K = O(N)$ and
typically $J = O(10)$, the system is dramatically overdetermined, and
the ordinary least-squares solution

$$ \hat{\boldsymbol\theta}_{\text{LS}} \;=\; \bigl(\mathbf\Phi^{\!*}\mathbf\Phi\bigr)^{-1}\mathbf\Phi^{\!*}\mathbf U \tag{3.12} $$

(or the QR-decomposition equivalent for numerical stability) is the
estimate. This is the answer to the motivation document's question 5:
**yes, the nonlinear regression problem reduces to a single linear
least-squares problem in the unknown polynomial coefficients.**

### 3.5 Multi-Level and Multi-Realization Stacking

A single circular measurement at one drive level often under-excites
the higher-order columns of $\mathbf\Phi$. Repeating the measurement
at $L$ levels (or with $L$ different random-phase realisations of the
same amplitude spectrum) produces $L$ regression problems sharing the
same unknown $\boldsymbol\theta$:

$$ \mathbf\Phi^{(\ell)}\boldsymbol\theta = \mathbf U^{(\ell)},\quad
   \ell = 1,\dots,L. \tag{3.13} $$

Stack vertically into a $(LK)\times J$ regression. The stacked
problem inherits the SNR-weighted noise structure of each individual
measurement (Section 3.7) and inherits the conditioning improvement
of having the regressor columns evaluated at multiple operating
points.

For polynomial nonlinearities, **levels separated by 6–12 dB and
spaced to span the desired operating range** are typical. For
loudspeaker $\text{Bl}(x)$ identification, three levels (low,
moderate, large excursion) usually suffice for a degree-4 polynomial.

### 3.6 Identifiability and Conditioning

The regression (3.10) is identifiable iff $\mathbf\Phi$ has full
column rank $J$. Rank deficiency occurs when two regressor columns
are proportional or share a degenerate frequency support. Typical
sources:

* **Tonal or extremely sparse stimuli** — the regressor $X^{(m)}$ for
  a single-tone stimulus at bin $k_0$ has support only on
  $\{k_0, 2k_0,\dots,m k_0\}$ modulo $N$, so columns of different
  total degree become proportional on the few bins where they coexist.
* **Even/odd symmetry** — for a stimulus with no DC component and
  Hermitian symmetry, all even-power regressors $X^{(2m)}$ have a
  spectrum supported on even bins (cf. *Circular Nonlinear-Signal
  Analysis*, §3.7) and all odd-power regressors on odd bins. Cross
  terms (e.g. $X\cdot \dot X^2$) inherit a definite parity. This is
  not a defect — it splits the regression into independent even and
  odd subproblems, each with its own $\boldsymbol\theta$ subset.
* **Operator-induced collinearity** — for a *purely linear* sub-block
  (terms with $|\boldsymbol\alpha|_1 = 1$), the regressors are
  $X[k]$, $j\omega_k X[k]$, $-\omega_k^2 X[k]$, $\dots,(j\omega_k)^D
  X[k]$. These are linearly independent across $k$ as long as the
  stimulus spectrum is supported on more than $D$ bins.

Diagnose via the singular-value spectrum of $\mathbf\Phi$. A
condition number $\kappa(\mathbf\Phi) > 10^6$ should trigger either a
richer stimulus, more levels, or a smaller monomial set $\mathcal A$.

The **theoretical Cramér–Rao lower bound** on $\mathrm{Cov}\,
\hat{\boldsymbol\theta}$ in the presence of additive output noise of
covariance $\sigma_\eta^2[k]$ is

$$ \mathrm{CRLB}(\hat{\boldsymbol\theta}) \;=\; \bigl(\mathbf\Phi^{\!*}\mathbf W\,\mathbf\Phi\bigr)^{-1},\qquad
   \mathbf W = \mathrm{diag}\!\bigl(1/\sigma_\eta^2[k]\bigr), \tag{3.14} $$

attained by the weighted least-squares estimator under Gaussian noise
and negligible EIV bias.

### 3.7 Multi-Cycle Noise Reduction and Bin Weighting

Record $M$ consecutive cycles of length $N$ and compute the $MN$-point
DFT $\mathcal Y[\kappa]$ of the response (and similarly for the
forcing if it too is measured). Following *Circular Signal Analysis*
§2.6 / §3.7:

* **On-bins** $\kappa = mM$ ($m = 0,\dots,N-1$) carry signal; identify
  $X[m] \;=\; \mathcal Y[mM]/M$ with the per-cycle response spectrum.
* **Off-bins** ($\kappa\not\equiv 0\bmod M$) are pure noise and supply
  a model-free estimate $\hat\sigma_\eta^2[m]$ at every signal bin
  (e.g. by averaging the $M-1$ off-bins around each $mM$).

Use $\hat\sigma_\eta^2[m]$ as the diagonal weight in (3.11):

$$ \hat{\boldsymbol\theta}_{\mathrm{WLS}} \;=\; \arg\min_{\boldsymbol\theta} \sum_{k=1}^{N/2-1}
   \frac{|\,U[k] - \sum_j \theta_j\,\Phi_j[k]\,|^2}{\sigma_\eta^2[k]\,\,\rho_j[k]}, \tag{3.15} $$

where the per-bin "regressor noise factor" $\rho_j[k]$ accounts for
how strongly the response noise propagates through the convolution
chain that builds $\Phi_j[k]$. To leading order in the noise,

$$ \rho_j[k] \;\approx\; |\boldsymbol\alpha_j|_1 \cdot \omega_k^{2\langle d\rangle_j}, \tag{3.16} $$

where $\langle d\rangle_j = \sum_d d\alpha_d / |\boldsymbol\alpha|_1$
is the average derivative order in monomial $j$. The factor
$\omega_k^{2\langle d\rangle_j}$ is the noise amplification by
spectral differentiation; the prefactor $|\boldsymbol\alpha|_1$
counts the number of independent noisy copies of $X$ entering the
convolution. In practice, weighting by $1/\sigma_\eta^2[k]$ alone
recovers most of the available SNR; the per-column refinement (3.16)
is a second-order improvement that matters mainly for high-order
($d\ge 3$) derivative terms.

### 3.8 Bias Correction for Errors-in-Variables

Because the regressors are built from the noisy measured signal $x$,
ordinary LS is biased:

$$ \hat{\boldsymbol\theta}_{\text{LS}} \;\to\; \boldsymbol\theta_0 \,-\, (\boldsymbol\Phi_0^*\boldsymbol\Phi_0 + N\,\mathbf C_\eta)^{-1}N\,\mathbf C_\eta\,\boldsymbol\theta_0
   \quad \text{as } K\to\infty, \tag{3.17} $$

where $\boldsymbol\Phi_0$ is the noise-free regressor matrix and
$\mathbf C_\eta = \mathrm{Cov}\,(\boldsymbol\Phi - \boldsymbol\Phi_0)$
is the regressor noise covariance — explicitly computable from
$\hat\sigma_\eta^2[k]$ and the convolution structure (3.7) by
straightforward Gaussian moment algebra (each convolution adds an
extra factor of the input spectrum's noise variance, evaluated at the
relevant bin shift).

Two standard corrections:

* **Bias-eliminating LS (BELS)** subtracts the analytic bias
  $(\boldsymbol\Phi^*\boldsymbol\Phi)^{-1}N\,\hat{\mathbf C}_\eta\,
  \hat{\boldsymbol\theta}_{\text{LS}}$ from $\hat{\boldsymbol\theta}
  _{\text{LS}}$ and iterates to a fixed point.
* **Instrumental variables (IV)** uses a noise-free *generated*
  regressor matrix $\boldsymbol\Psi$, e.g. the regressors built from
  the *predicted* $\hat x$ from a preliminary model fit, and solves
  $(\boldsymbol\Psi^*\boldsymbol\Phi)\boldsymbol\theta = \boldsymbol
  \Psi^*\mathbf U$. Two or three iterations converge to a consistent
  estimator under mild conditions.

For SNRs above ~60 dB (routinely achievable with $M\ge 100$ cycles)
the BELS and IV corrections move $\hat{\boldsymbol\theta}$ by less
than the LS standard error and can be omitted in practice.

### 3.9 Coupled-State Systems and Multi-Equation Regression

For a coupled $S$-equation system (the loudspeaker case has $S=2$)

$$ \mathcal N_s\bigl(\mathbf x(t),\dot{\mathbf x}(t),\dots\bigr) \;=\; u_s(t),\qquad s = 1,\dots,S, $$

with shared unknown coefficient vector $\boldsymbol\theta$ (some
coefficients appear in multiple equations — e.g. $\text{Bl}$ in both
loudspeaker equations), the construction (3.7)–(3.10) generalises
trivially: form the regressor matrix $\mathbf\Phi^{(s)}$ for each
equation, stack vertically,

$$ \begin{bmatrix}\mathbf\Phi^{(1)}\\ \vdots\\ \mathbf\Phi^{(S)}\end{bmatrix}\boldsymbol\theta
   \;=\;\begin{bmatrix}\mathbf U^{(1)}\\ \vdots\\ \mathbf U^{(S)}\end{bmatrix}, \tag{3.18} $$

and solve in the WLS sense. Shared columns (a coefficient appearing
in equations $s_1$ and $s_2$) are simply represented by stacking the
relevant regressor entries from each equation into a single column.
Equation-specific weighting accommodates different noise levels in
different measured channels.

For the Klippel-style loudspeaker model from §2.6, with measured
$u(t),\,i(t),\,x(t)$ and chosen monomial bases for $\text{Bl}, L_e,
R_{ms}, K_{ms}$, the stacked regression has a few dozen unknowns and
$\sim N$ rows per equation per drive level — easily solved in
milliseconds by direct factorisation.

### 3.10 Matched-Filter / Harmonic-IR Form of the Regression

The equation-error regression (3.10) treats the measured response
$X[k]$ as a single broadband object. When the stimulus is a chirp
(log sweep, linear chirp, or ZC), the unified matched-filter framework
of *Circular Signal Design* §3.15 gives a *finer* decomposition: a
separate kernel-diagonal projection $H_p[k]$ for each harmonic order
$p = 1,\dots,P$. This section shows that the gray-box regression
(3.10) can be re-expressed *order by order* on the harmonic IRs,
yielding a smaller, better-conditioned, and physically interpretable
set of sub-regressions.

#### 3.10.1 Recap of the matched filter

For a chirp stimulus $u[n]$ with DFT $U[k]$, define the $p$-th
matched-filter spectrum

$$ U_p[k] \;\equiv\; \mathrm{DFT}\{u[n]^p\}[k]
   \;=\; \frac{1}{N^{p-1}}\,\underbrace{(U\circledast\cdots\circledast U)}_{p\text{ copies}}[k], \tag{3.19} $$

i.e. exactly the $p$-fold convolution of (3.6) applied to the *known*
stimulus rather than to the measured response. The $p$-th harmonic
transfer function extracted from the measured response $Y[k]$ is

$$ H_p[k] \;\equiv\; \frac{Y_p[k]}{U_p[k]},\qquad
   Y[k] = \sum_{p=1}^{P} Y_p[k], \tag{3.20} $$

where the per-order components $Y_p[k]$ are isolated by the chirp-
specific time-domain windowing (log sweep), spectral phase correction
(linear chirp), or root-rescaled deconvolution (ZC) — see *Circular
Signal Design* §3.15. As emphasised there, $H_p[k]$ is the kernel-
diagonal of the order-$p$ Volterra operator: it is the *exact*
transfer function for a memoryless $p$-th order nonlinearity, and
the correct kernel-diagonal projection otherwise.

#### 3.10.2 Per-order monomial decomposition of the regressors

For a polynomial ODE of the form (3.2), each monomial regressor
$\Phi_{\boldsymbol\alpha}[k]$ has total degree $|\boldsymbol\alpha|_1$
in the response — and therefore in the stimulus, since to leading
order a degree-$p$ monomial in the response is generated by the
degree-$p$ component of the response, which lives at the harmonic-$p$
output. Concretely, expand the response in the matched-filter basis,

$$ X[k] \;=\; \sum_{p=1}^{P} G_p[k]\,U_p[k], \tag{3.21} $$

where $G_p[k]$ is the kernel-diagonal projection of the *response-side*
linear filter that takes the order-$p$ stimulus through the system
(for the loudspeaker, this is the linear cone-velocity transfer function
times the order-$p$ excitation gain). Substituting (3.21) into the
convolution algebra (3.7) and grouping by total degree gives, for any
monomial $\boldsymbol\alpha$ of total degree $\pi = |\boldsymbol\alpha|_1$,

$$ \Phi_{\boldsymbol\alpha}[k] \;=\; \Psi_{\boldsymbol\alpha}[k]\,U_\pi[k]
   \;+\; \text{(cross terms of the same total degree from lower harmonics)}, \tag{3.22} $$

where $\Psi_{\boldsymbol\alpha}[k]$ is built from the linear-response
kernel $G_1[k]$ and the per-derivative spectral factors
$(j\omega_k)^d$, and is *known* once the linear FRF $G_1[k]$ is
estimated (e.g. from the small-signal portion of the same
measurement). The cross terms vanish identically for log-sweep and
ZC stimuli on a memoryless polynomial system — the matched-filter
separation is exact — and are second-order small for the linear chirp
and for short-memory systems.

#### 3.10.3 Per-order regression

Dividing both sides of the equation-error identity (3.9) by $U_p[k]$
and restricting attention to the bins where $|U_p[k]|$ is well
conditioned gives one regression *per harmonic order*:

$$ \boxed{\;\sum_{\boldsymbol\alpha\in\mathcal A_p}
   \theta_{\boldsymbol\alpha}\,\Psi_{\boldsymbol\alpha}[k]
   \;=\; H_p[k],\qquad p = 1,\dots,P,\;} \tag{3.23} $$

where $\mathcal A_p = \{\boldsymbol\alpha\in\mathcal A : |\boldsymbol\alpha|_1 = p\}$
is the subset of monomials of total degree $p$. Equation (3.23) is the
**matched-filter form** of the gray-box regression. It is
structurally equivalent to (3.9) (stacking the $P$ blocks vertically
recovers a regression equivalent to (3.10) up to a diagonal
reweighting), but it has three operational advantages:

1. **Block decoupling.** Coefficients of different total degree appear
   in different rows. Linear coefficients ($p=1$) are estimated from
   $H_1[k]$ alone — i.e. from the small-signal FRF — without any
   contamination from higher-order terms. Quadratic coefficients are
   estimated from $H_2[k]$ once the linear ones are fixed, and so on.
   The full regression is block-triangular by harmonic order.
2. **Conditioning by construction.** Each $H_p[k]$ has the noise
   floor of the matched-filter extraction at order $p$, which is
   *much* lower than the broadband response noise on the bins where
   the $p$-th harmonic dominates. Per-order weighting by the matched-
   filter SNR (Section 3.7 generalised to per-order off-bins) is
   straightforward and gives a tight CRLB.
3. **Physical interpretability.** $H_1[k]$ is the linear FRF;
   $H_2[k]$ is the $\text{Bl}(x)$-times-second-power transfer function;
   $H_3[k]$ is the cubic stiffness/cubic $\text{Bl}$ contribution; etc.
   The user reads off which physical mechanism dominates at which
   frequency *before* solving any regression.

#### 3.10.4 Order-by-order solution

The block-triangular structure suggests a **sequential** estimator:

1. **Linear stage ($p=1$).** Fit the linear-coefficient subset
   $\boldsymbol\theta^{(1)}$ to $H_1[k]$ by ordinary or weighted LS.
   For the Duffing example this fixes $(m,2\zeta\omega_0,\omega_0^2)$;
   for the loudspeaker it fixes the small-signal $\text{Bl}_0,L_{e,0},
   R_{ms,0},K_{ms,0}$.
2. **Order-$p$ stage** for $p = 2,3,\dots,P$. With
   $\boldsymbol\theta^{(1)},\dots,\boldsymbol\theta^{(p-1)}$ fixed,
   move any *cross-degree* contributions to the right-hand side and
   solve

   $$ \sum_{\boldsymbol\alpha\in\mathcal A_p}\theta_{\boldsymbol\alpha}\,
      \Psi_{\boldsymbol\alpha}[k] \;=\; H_p[k] - r_p[k;\,\hat{\boldsymbol\theta}^{(<p)}], \tag{3.24} $$

   where $r_p$ is the (known, computable) lower-order residual.
3. **Optional joint refinement.** Use the sequential estimate as a
   starting point for one pass of the joint regression (3.10) to
   account for cross-degree terms exactly. In practice, for log-
   sweep and ZC stimuli the cross-residual $r_p$ is below the noise
   floor and the sequential estimate is already optimal.

#### 3.10.5 Cost, conditioning, and when to use which form

| Form | Rows used | Conditioning | Best when |
|---|---|---|---|
| Joint (3.10) | $K \sim N/2$ per (level, equation) | Depends on stimulus richness | Broadband multisine; coupled equations with shared coefficients |
| Matched-filter (3.23) | $\sim K/P$ per harmonic order | Block-triangular; near-optimal | Chirp stimulus; loudspeaker-class systems with $P \le 5$ |

The matched-filter form is preferred whenever a chirp stimulus is
used. It exposes one harmonic order at a time, which is exactly what
the loudspeaker designer wants to inspect ("how strong is the
$\text{Bl}(x)$ asymmetry vs. the suspension softening?"), and it
makes the polynomial fit visually verifiable: plotting $H_p[k]$
against the $\Psi_{\boldsymbol\alpha}[k]\hat\theta_{\boldsymbol\alpha}$
overlay gives a per-order goodness-of-fit indicator that the joint
form (3.10) hides inside the global residual.

#### 3.10.6 Implementation note

In the *Circular Signal Design* §3.15 implementation, $U_p[k]$ is
produced as a by-product of the harmonic extraction (it is the matched
filter itself). The regressor sequences $\Psi_{\boldsymbol\alpha}[k]$
for degree-$p$ monomials reduce to a small fixed set of derivative
factors $(j\omega_k)^d$ multiplied by powers of $G_1[k]$, all of which
are $O(N)$ to evaluate. The whole per-order regression is therefore
asymptotically *cheaper* than the joint form by a factor of $P$, and
is a strictly real improvement in practice.

### 3.11 Algorithm Summary

Putting the pieces together:

1. **Choose** the model: state variables, ODE structure (3.2), monomial set $\mathcal A$.
2. **Design** a circular stimulus $u[n]$ with broadband, low-crest-factor coverage of the desired operating range. Linear chirp or random-phase pink multisine are good defaults; a log sweep or ZC enables the matched-filter form (Section 3.10).
3. **Acquire** $M$ cycles of $u(t),\,\mathbf x(t)$ at $L$ drive levels, after a warm-up of $\sim 2T_{60}/T$ loops to reach steady state (*Circular Signal Analysis* §2.5).
4. **Reduce** each multi-cycle recording to a single per-cycle spectrum by extracting on-bins of the $MN$-point FFT, and estimate $\hat\sigma_\eta^2[k]$ from off-bins.
5. **Construct** the regressor matrix $\mathbf\Phi^{(\ell,s)}$ for each level $\ell$ and equation $s$ via (3.7), preferably by time-domain pointwise products followed by one FFT per column. *For chirp stimuli, alternatively extract the harmonic IRs $H_p[k]$ via Section 3.10 and form the per-order regressors $\Psi_{\boldsymbol\alpha}[k]$.*
6. **Stack** all levels and equations as in (3.13)/(3.18); set up (3.11). *Or*, in the matched-filter form, solve the per-order regressions (3.23) sequentially by ascending $p$.
7. **Solve** (3.15) by weighted QR, returning $\hat{\boldsymbol\theta}$ and the covariance from (3.14).
8. **Diagnose** via (a) the singular-value spectrum of $\mathbf\Phi$ (conditioning), (b) the residual spectrum $\mathbf U - \mathbf\Phi\hat{\boldsymbol\theta}$ vs. the off-bin noise floor (model adequacy), (c) per-order overlays of $H_p[k]$ vs. $\Psi\hat\theta$ (matched-filter form), and (d) optionally apply BELS/IV (Section 3.8) if EIV bias is suspected.
9. **Report** the recovered polynomial coefficient functions $K_{ms}(x), \text{Bl}(x), \dots$ together with their covariance and the operating range over which they are valid.

The whole pipeline is non-iterative — a single linear solve, or in the
matched-filter form a sequence of $P$ small linear solves — except
optionally for the EIV correction, which is a few additional linear
solves.

---

## 4. Connections to Literature

### Equation-error and prediction-error methods (Ljung, 1999)

The construction (3.10) is the frequency-domain equation-error method
from classical system identification [1]. Its main virtue — linearity
in unknown parameters when the model is polynomial in the state — is
known; what the circular framework adds is **exact** evaluation of the
derivatives and convolutions on a periodic signal, with steady-state
guaranteed by looped playback rather than asymptotic argument, and
with a directly measured noise model from the off-bins of the multi-
cycle DFT.

### Restoring-force surface methods (Masri & Caughey, 1979)

The time-domain restoring-force surface method [2] reconstructs
$f(x,\dot x) = u - m\ddot x$ as a function of the (possibly nonlinear)
state from a measurement of $u(t)$ and $x(t)$. Polynomial fits in
$(x,\dot x)$ to that surface yield exactly the coefficients of (3.2).
The circular-frequency-domain regression of Section 3.4 is the same
problem performed in a domain where the differentiations are exact
and the noise weighting is naturally available.

### Klippel large-signal loudspeaker identification (Klippel, 1992; 2006)

Wolfgang Klippel's commercial large-signal identification system [3]
fits the same physical model as Section 2.6, in the time domain with
adaptive identification. The circular-framework formulation gives a
single non-iterative least-squares solution at the cost of requiring a
looped, steady-state measurement (rather than arbitrary excitation).
The two are mathematically equivalent in the limit of long
measurement; the circular form is computationally simpler and gives a
clean uncertainty estimate via (3.14).

### Volterra kernel inversion (Schetzen, 1980)

Section 4 of *Circular Nonlinear-Signal Analysis* reviews Volterra
identification. The gray-box method here can be viewed as imposing
strong structural priors on the Volterra kernels (they must factor
through a polynomial ODE in a small number of state variables). Where
those priors hold, the parameter count shrinks from $O(N^p)$ to
$O(\text{constant})$, and the conditioning improves correspondingly.
Where they do not hold, the residual of the gray-box fit identifies
where the model is wrong, and a Volterra approach takes over.

### Polynomial NARX/NARMAX models (Billings & Chen, 1989)

The discrete-time analogue of (3.2) is the polynomial NARX model [4].
The frequency-domain reformulation here is the continuous-time, exact-
periodic-steady-state counterpart, suited to physically motivated ODEs
rather than discrete-time difference equations.

### Frequency-domain subspace identification (McKelvey et al., 1996)

The frequency-domain subspace methods of [5] identify *linear*
state-space models from frequency-response measurements. The circular
framework provides an ideal substrate (exact $H[k]$ at every bin); the
present document extends the approach to the nonlinear-polynomial
case with the same DFT exactness.

---

## 5. Open Questions

* **Optimal monomial-basis design.** Polynomials are convenient but
  not always best. B-splines, radial basis functions, or domain-
  specific bases (e.g. odd Legendre polynomials for symmetric
  suspensions) all preserve linearity-in-coefficients. Which basis
  best balances expressiveness, identifiability, and physical
  interpretability for typical loudspeaker, microphone, and amplifier
  nonlinearities?

* **Adaptive monomial selection.** With a large candidate set
  $\mathcal A$, how should we automatically prune to a parsimonious
  subset? Standard sparse-regression tools (LASSO, OMP) apply
  directly to (3.11), but the noise-weighted complex-valued setting
  may admit sharper schemes.

* **Joint stimulus-design and identification.** The matrix
  $\mathbf\Phi$ depends on the response, which depends on the
  stimulus. Designing $u[n]$ to *minimise* $\kappa(\mathbf\Phi)$ or
  the trace of (3.14) is a coupled, nonlinear stimulus-design
  problem. Iterative refinement (measure → fit → predict optimal
  next stimulus → re-measure) is one route; closed-form solutions for
  small monomial sets may exist.

* **Time-varying coefficients.** Voice-coil heating slowly drifts
  $R_e(T)$ and $\text{Bl}(T)$. The circular framework is intrinsically
  time-invariant; can a sequence of short circular measurements (each
  long enough for a fit, short enough that the parameters are
  approximately constant) track parameter drift? How does the
  identifiability change as the per-fit cycle count $M$ shrinks?

* **Coupled identification with state-observer for unmeasured
  states.** The loudspeaker model assumes both $i(t)$ and $x(t)$ are
  measured. In hand-held electroacoustic devices, $x(t)$ may not be
  directly accessible. Can the missing state be reconstructed from
  the electrical equation as part of the regression, in a
  joint-state-and-parameter circular identification?

* **Matched-filter form of the regression — *resolved in §3.10*.**
  The unified matched-filter framework of *Circular Signal Design*
  §3.15 extracts $H_p[k]$ for each harmonic order from a chirp
  stimulus. Section 3.10 develops the resulting block-triangular
  per-order regression (3.23) and the sequential order-by-order
  estimator (3.24). Open sub-questions remain: (i) the size of the
  cross-degree residual $r_p$ for linear-chirp stimuli on systems
  with non-negligible memory; (ii) optimal per-order bin selection
  when $|U_p[k]|$ varies strongly across $k$; (iii) whether the
  block-triangular structure can be exploited to give a closed-form
  expression for the joint covariance without forming the full
  $\mathbf\Phi^{\!*}\mathbf W\mathbf\Phi$ matrix.

* **Bias of EIV correction at extreme excursion.** The BELS/IV
  corrections of Section 3.8 are first-order in the noise. At very
  low SNR or very high polynomial order, higher-order EIV terms may
  dominate. Quantifying when they start to matter, and when full
  total-least-squares (TLS) is required, is open.

* **Comparison to direct measurement (Klippel-LSI).** A like-for-
  like benchmark on the same loudspeaker, comparing circular gray-box
  identification against Klippel's direct large-signal measurement,
  would calibrate the practical accuracy of the method.

---

## 6. References

[1] L. Ljung, *System Identification: Theory for the User*, 2nd ed.
Prentice Hall, 1999.

[2] S. F. Masri and T. K. Caughey, "A Nonparametric Identification
Technique for Nonlinear Dynamic Problems," *J. Appl. Mech.*, vol. 46,
no. 2, pp. 433–447, 1979.

[3] W. Klippel, "Tutorial: Loudspeaker Nonlinearities — Causes,
Parameters, Symptoms," *J. Audio Eng. Soc.*, vol. 54, no. 10,
pp. 907–939, 2006.

[4] S. A. Billings and S. Chen, "Identification of Nonlinear Systems
Using the NARMAX Model," in *Nonlinear System Design*, IEE Control
Engineering Series, 1989.

[5] T. McKelvey, H. Akçay, and L. Ljung, "Subspace-based
multivariable system identification from frequency response data,"
*IEEE Trans. Automatic Control*, vol. 41, no. 7, pp. 960–979, 1996.

[6] R. Pintelon and J. Schoukens, *System Identification: A Frequency
Domain Approach*, 2nd ed. Wiley-IEEE Press, 2012.

[7] M. Schetzen, *The Volterra and Wiener Theories of Nonlinear
Systems*. Wiley, 1980.

[8] A. Farina, "Simultaneous measurement of impulse response and
distortion with a swept-sine technique," in *108th AES Convention*,
Paris, 2000.
