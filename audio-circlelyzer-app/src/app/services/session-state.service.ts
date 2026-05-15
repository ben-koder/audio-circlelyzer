import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { CalculationManagerService } from './calculation-manager.service';
import { ContextPreset } from '../models/context-presets';
import {
  ALL_PRESET_SIGNAL_TYPES,
  PresetSignalType,
  ResolvedSourceConfig,
  resolvePresetSourceConfig,
} from '../models/source-config';

export type SyntheticType = 'white_noise' | 'pink_noise' | 'wave_file' | 'output_with_filter';

const FREQ_RANGE_DEFAULT_LOW_HZ = 20;
const FREQ_RANGE_DEFAULT_HIGH_HZ = 20000;
const FREQ_RANGE_MIN_HZ = 10;

/**
 * Single source of truth for session-level settings — the bits of UI state
 * that affect what the calculation worker analyses but that do not live inside
 * the worker's per-context settings map.
 *
 * Components must:
 *   - read signals via the public `*` accessors (signals or computed),
 *   - mutate via the dedicated setter methods (which both update the signal
 *     and propagate the change to the worker / audio engine).
 *
 * The service deliberately does NOT directly own the audio engine; live audio
 * lifecycle (record/play start/stop) stays in the components that own the user
 * gesture, but they consume `activeSourceConfig()` from here.
 */
@Injectable({ providedIn: 'root' })
export class SessionStateService {
  private readonly calculationManager = inject(CalculationManagerService);

  // ── Preset / context ────────────────────────────────────────────────
  readonly currentPreset = signal<ContextPreset | null>(null);
  readonly currentContextId = signal<string>('');

  // ── Source config (two-layer model) ─────────────────────────────────
  /**
   * Source the analysis is currently running on. Locked to the active
   * recording's resolvedSource while a recording is loaded.
   */
  readonly activeSourceConfig = signal<ResolvedSourceConfig | null>(null);
  /**
   * User-editable source config for the next live recording. Equal to the
   * active config in live mode; freely editable while a historical recording
   * is selected.
   */
  readonly pendingSourceConfig = signal<ResolvedSourceConfig | null>(null);
  /** True when active source is locked by a selected historical recording. */
  readonly activeSourceLocked = signal(false);

  // ── Other session-level settings ────────────────────────────────────
  readonly nAverage = signal<number>(1);
  readonly positionOffset = signal<number>(0);
  readonly freqRangeLow = signal<number>(FREQ_RANGE_DEFAULT_LOW_HZ);
  readonly freqRangeHigh = signal<number>(FREQ_RANGE_DEFAULT_HIGH_HZ);
  readonly syntheticType = signal<SyntheticType>('white_noise');
  readonly simulationMode = signal(false);
  readonly isMuted = signal(false);

  // ── Throttled offline cursor target ─────────────────────────────────
  /** Pending offline-cursor target ratio (latest user drag), null when idle. */
  private pendingOfflineRatio: number | null = null;
  private offlineFlushScheduled = false;
  /** Optional flusher: when set, we route the offline cursor through it. */
  private offlineFlusher: ((ratio: number) => void) | null = null;

  // ── Throttled slider targets ─────────────────────────────────────────
  /** Latest positionOffset requested by the slider; flushed when worker is idle. */
  private pendingPositionOffset: number | null = null;
  /** Latest freq-range requested by the sliders; flushed when worker is idle. */
  private pendingFreqRange: { low: number; high: number } | null = null;
  private sliderFlushScheduled = false;

  /**
   * Allowed signal types for the current preset, intersected with the
   * multiSource flag. Components should read this instead of going to the
   * preset directly.
   */
  readonly allowedSignalTypes = computed<readonly PresetSignalType[]>(() => {
    const preset = this.currentPreset();
    if (!preset) {
      return ALL_PRESET_SIGNAL_TYPES;
    }
    const allowed = preset.source.supportedSignalTypes ?? ALL_PRESET_SIGNAL_TYPES;
    if (preset.source.multiSource?.enabled) {
      return allowed;
    }
    return allowed.filter((s) => s !== 'MULTI_SOURCE_WHITE');
  });

  constructor() {
    // Push nAverage to the worker immediately on change (discrete choice, not a slider).
    effect(() => {
      const value = this.nAverage();
      const ctxId = this.currentContextId();
      if (ctxId) {
        this.calculationManager.updateNAverage(ctxId, value);
      }
    });
  }

  // ── Preset / source mutators ────────────────────────────────────────

  /**
   * Reset all session-level signals to the preset defaults. Called from the
   * App component immediately before/after building a new context.
   *
   * Notes:
   *   - `nAverage`, `positionOffset` are reset to neutral values.
   *   - `freqRangeLow/High` are reseeded from `defaultFrequencyRange` when set.
   *   - `syntheticType`, `simulationMode`, `isMuted` are persisted across
   *     preset switches (these reflect user preference, not preset state).
   */
  applyPresetReset(preset: ContextPreset, sourceOverride?: Partial<ResolvedSourceConfig>): ResolvedSourceConfig {
    const resolved = resolvePresetSourceConfig(preset.source, sourceOverride ?? preset.source.defaults);
    this.currentPreset.set(preset);
    this.activeSourceConfig.set(resolved);
    this.pendingSourceConfig.set(resolved);
    this.activeSourceLocked.set(false);
    this.nAverage.set(1);
    this.setPositionOffset(0);
    this.applyPresetFrequencyRange(preset);
    return resolved;
  }

  /** Lock the active source to a recording's resolved config. */
  lockActiveSource(resolved: ResolvedSourceConfig): void {
    this.activeSourceConfig.set(resolved);
    this.activeSourceLocked.set(true);
  }

  /** Unlock and adopt the pending config as active (e.g. when starting a live recording). */
  unlockAndPromotePending(): ResolvedSourceConfig | null {
    const pending = this.pendingSourceConfig();
    if (pending) {
      this.activeSourceConfig.set(pending);
    }
    this.activeSourceLocked.set(false);
    return pending ?? this.activeSourceConfig();
  }

  /** Update the pending source config (does not touch active). */
  setPendingSourceConfig(next: ResolvedSourceConfig): void {
    const preset = this.currentPreset();
    const resolved = preset ? resolvePresetSourceConfig(preset.source, next) : next;
    this.pendingSourceConfig.set(resolved);
    if (!this.activeSourceLocked()) {
      this.activeSourceConfig.set(resolved);
    }
  }

  // ── nAverage / positionOffset / freqRange ───────────────────────────

  setNAverage(value: number): void {
    const clean = Math.max(1, Math.floor(value));
    this.nAverage.set(clean);
  }

  /**
   * Request a new position-offset value from a slider. Coalesces rapid drag
   * events: only the latest value is pushed to the worker once it is idle.
   */
  requestPositionOffset(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.positionOffset.set(clamped);
    this.pendingPositionOffset = clamped;
    this.scheduleSliderFlush();
  }

  /** Set positionOffset immediately (e.g. on preset reset), bypassing throttle. */
  setPositionOffset(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this.positionOffset.set(clamped);
    this.pendingPositionOffset = null; // cancel any queued drag value
    const ctxId = this.currentContextId();
    if (ctxId) {
      this.calculationManager.updatePositionOffset(ctxId, clamped);
    }
  }

  /**
   * Request a new frequency range from a slider. Coalesces rapid drag events.
   */
  requestFrequencyRange(low: number, high: number): void {
    this.freqRangeLow.set(low);
    this.freqRangeHigh.set(high);
    this.pendingFreqRange = { low, high };
    this.scheduleSliderFlush();
  }

  /** Set frequency range immediately (e.g. on preset reset), bypassing throttle. */
  setFrequencyRange(low: number, high: number, maxHz: number): void {
    let lo = Math.max(FREQ_RANGE_MIN_HZ, low);
    let hi = Math.min(maxHz, Math.max(lo * 1.01, high));
    if (lo >= hi * 0.99) lo = hi * 0.99;
    this.freqRangeLow.set(lo);
    this.freqRangeHigh.set(hi);
    this.pendingFreqRange = null; // cancel any queued drag value
    const ctxId = this.currentContextId();
    if (ctxId) {
      this.calculationManager.updateActiveFrequencyRange(ctxId, { low: lo, high: hi });
    }
  }

  private scheduleSliderFlush(): void {
    if (this.sliderFlushScheduled) return;
    this.sliderFlushScheduled = true;

    const tick = (): void => {
      if (this.pendingPositionOffset === null && this.pendingFreqRange === null) {
        this.sliderFlushScheduled = false;
        return;
      }
      if (this.calculationManager.isCalculating()) {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(tick);
        } else {
          setTimeout(tick, 16);
        }
        return;
      }
      const ctxId = this.currentContextId();
      if (ctxId) {
        if (this.pendingPositionOffset !== null) {
          this.calculationManager.updatePositionOffset(ctxId, this.pendingPositionOffset);
          this.pendingPositionOffset = null;
        }
        if (this.pendingFreqRange !== null) {
          this.calculationManager.updateActiveFrequencyRange(ctxId, this.pendingFreqRange);
          this.pendingFreqRange = null;
        }
      }
      this.sliderFlushScheduled = false;
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(tick);
    } else {
      setTimeout(tick, 16);
    }
  }

  /** Re-seed the freq-range from a preset's defaultFrequencyRange (if any).
   *  Pushes immediately to the worker so the bandpass is in sync from the first frame. */
  applyPresetFrequencyRange(preset: ContextPreset | null): void {
    const max = 24000; // conservative upper bound; Nyquist at 48 kHz
    if (!preset?.defaultFrequencyRange) {
      this.freqRangeLow.set(FREQ_RANGE_DEFAULT_LOW_HZ);
      this.freqRangeHigh.set(FREQ_RANGE_DEFAULT_HIGH_HZ);
    } else {
      const range = preset.defaultFrequencyRange;
      const lo = Math.max(FREQ_RANGE_MIN_HZ, range.low);
      const hi = Math.min(max, Math.max(lo * 1.01, range.high));
      this.freqRangeLow.set(lo);
      this.freqRangeHigh.set(hi);
    }
    // Push immediately so the first analysis frame uses the correct range.
    const ctxId = this.currentContextId();
    if (ctxId) {
      this.calculationManager.updateActiveFrequencyRange(ctxId, {
        low: this.freqRangeLow(),
        high: this.freqRangeHigh(),
      });
    }
  }

  // ── Misc setters ────────────────────────────────────────────────────

  setSyntheticType(type: SyntheticType): void {
    this.syntheticType.set(type);
  }

  toggleSimulationMode(): void {
    this.simulationMode.update((value) => !value);
  }

  setMuted(muted: boolean): void {
    this.isMuted.set(muted);
  }

  // ── Throttled offline cursor ─────────────────────────────────────────

  /** Register a flusher that is invoked with the latest target ratio when the
   *  worker is idle. The App component wires this up to
   *  `recordingLibrary.setOfflinePositionRatio`. */
  registerOfflineFlusher(flusher: (ratio: number) => void): void {
    this.offlineFlusher = flusher;
  }

  /**
   * Request a new offline cursor position. Coalesces multiple requests during
   * a drag: only the most recent ratio is forwarded once the worker becomes
   * idle (`CalculationManager.isCalculating()` is false).
   */
  requestOfflinePositionRatio(ratio: number): void {
    this.pendingOfflineRatio = Math.max(0, Math.min(0.9999, ratio));
    this.scheduleOfflineFlush();
  }

  private scheduleOfflineFlush(): void {
    if (this.offlineFlushScheduled) return;
    this.offlineFlushScheduled = true;

    const tick = (): void => {
      if (this.pendingOfflineRatio === null) {
        this.offlineFlushScheduled = false;
        return;
      }
      // Wait for the worker to be idle before pushing the next position.
      if (this.calculationManager.isCalculating()) {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(tick);
        } else {
          setTimeout(tick, 16);
        }
        return;
      }
      const ratio = this.pendingOfflineRatio;
      this.pendingOfflineRatio = null;
      this.offlineFlushScheduled = false;
      if (this.offlineFlusher) {
        this.offlineFlusher(ratio);
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(tick);
    } else {
      setTimeout(tick, 16);
    }
  }
}
