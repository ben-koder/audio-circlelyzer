# Contributing to Audio Circlelyzer

Thank you for your interest in contributing! This document covers the
essentials for getting a local build running and the conventions used in
the codebase.

---

## Repository layout

| Folder | Language | Purpose |
|--------|----------|---------|
| `audio-circlelyzer-lib/` | Rust | Core DSP algorithms (FFT, STFT, octave filtering, poly regression, …) |
| `audio-circlelyzer-wasm/` | Rust + wasm-bindgen | Thin WebAssembly wrapper around the library |
| `audio-circlelyzer-worklet/` | TypeScript | AudioWorklet processor (runs on the audio thread) |
| `audio-circlelyzer-app/` | Angular / TypeScript | Web UI shell; drives the Web Worker calculation pipeline |
| `testdata/` | Python | Deterministic demo recording and validation-fixture generator |
| `theory/` | Markdown | Mathematical background and design notes |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Rust + Cargo | stable (≥ 1.78) |
| wasm-pack | ≥ 0.13 |
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| Python | ≥ 3.11 (optional, for test-data generation) |

---

## Building from source

### 1 – WASM library

```bash
npm --prefix audio-circlelyzer-app run build:wasm
```

This runs `wasm-pack build` inside `audio-circlelyzer-wasm/` and copies the
generated JS/TS glue files into:
- `audio-circlelyzer-app/public/`
- `audio-circlelyzer-app/src/assets/wasm/`

### 2 – AudioWorklet

```bash
npm --prefix audio-circlelyzer-worklet run build
```

Compiles the worklet TypeScript and copies the output to
`audio-circlelyzer-app/public/recording-processor.worklet.js`.

### 3 – Angular application

```bash
npm --prefix audio-circlelyzer-app install
npm --prefix audio-circlelyzer-app exec ng build -- --project audio-circlelyzer-app
```

Or for development with hot-reload:

```bash
npm --prefix audio-circlelyzer-app run start
```

### 4 – Demo / test fixtures (optional)

```bash
python -m venv .venv
.venv/bin/pip install -e testdata/
cd testdata && ../.venv/bin/python -m audio_circlelyzer_testdata.generate
```

---

## Running the Rust tests

```bash
cargo test --manifest-path audio-circlelyzer-lib/Cargo.toml
```

---

## Code conventions

- **Rust**: standard `rustfmt` formatting (`cargo fmt`). Run `cargo clippy`
  before submitting a PR.
- **TypeScript**: the project uses ESLint via Angular CLI defaults. Run
  `npm --prefix audio-circlelyzer-app run lint`.
- **Commits**: use the [Conventional Commits](https://www.conventionalcommits.org/)
  format (`feat:`, `fix:`, `docs:`, `chore:`, …).

---

## License

By contributing you agree that your contributions will be licensed under
the [GNU General Public License v3.0](LICENSE).
