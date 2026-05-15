import { Injectable, computed, signal } from '@angular/core';

/**
 * Algorithm used to derive the data-driven min/max for the *measured*
 * dimension of a plot when the user has not configured an explicit range:
 *  - 'minmax'     : true min/max over the data window (legacy behavior).
 *  - 'percentile' : robust low/high percentiles, padded outward by
 *                   `percentilePadding` (in fraction of the percentile span).
 *
 * The "measured" dimension is:
 *  - Y axis for 2D plots
 *  - Z axis for heatmaps (colormap range)
 *  - Y and Z axes for 3D vertex plots
 * Other axes (X / time / frequency / categorical) keep min/max because they
 * are typically deterministic and bounded by the input grid.
 */
export type AutoscaleAlgorithm = 'minmax' | 'percentile';

export interface PlotPreferences {
  autoscaleAlgorithm: AutoscaleAlgorithm;
  /** Lower percentile in [0, 50). Default 2.5. */
  percentileLow: number;
  /** Upper percentile in (50, 100]. Default 97.5. */
  percentileHigh: number;
  /**
   * Outward padding applied to the percentile range, expressed as a fraction
   * of the percentile span. e.g. 0.05 means the visible range is
   * [pLow - 0.05*(pHigh-pLow), pHigh + 0.05*(pHigh-pLow)], clamped to the
   * actual data extent.
   */
  percentilePadding: number;
}

const STORAGE_KEY = 'plot-preferences';

const DEFAULTS: PlotPreferences = {
  autoscaleAlgorithm: 'minmax',
  percentileLow: 2.5,
  percentileHigh: 97.5,
  percentilePadding: 0.05,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function sanitize(p: Partial<PlotPreferences>): PlotPreferences {
  const algo: AutoscaleAlgorithm = p.autoscaleAlgorithm === 'percentile' ? 'percentile' : 'minmax';
  let low = Number.isFinite(p.percentileLow as number) ? (p.percentileLow as number) : DEFAULTS.percentileLow;
  let high = Number.isFinite(p.percentileHigh as number) ? (p.percentileHigh as number) : DEFAULTS.percentileHigh;
  low = clamp(low, 0, 49.9);
  high = clamp(high, 50.1, 100);
  if (high <= low) high = Math.min(100, low + 1);
  const padding = clamp(
    Number.isFinite(p.percentilePadding as number) ? (p.percentilePadding as number) : DEFAULTS.percentilePadding,
    0,
    1,
  );
  return { autoscaleAlgorithm: algo, percentileLow: low, percentileHigh: high, percentilePadding: padding };
}

@Injectable({ providedIn: 'root' })
export class PlotPreferencesService {
  private readonly _prefs = signal<PlotPreferences>(this.load());

  readonly preferences = this._prefs.asReadonly();
  readonly autoscaleAlgorithm = computed(() => this._prefs().autoscaleAlgorithm);

  setAlgorithm(algo: AutoscaleAlgorithm): void {
    this.update({ autoscaleAlgorithm: algo });
  }

  setPercentileLow(value: number): void {
    this.update({ percentileLow: value });
  }

  setPercentileHigh(value: number): void {
    this.update({ percentileHigh: value });
  }

  setPercentilePadding(value: number): void {
    this.update({ percentilePadding: value });
  }

  reset(): void {
    this._prefs.set({ ...DEFAULTS });
    this.persist();
  }

  update(patch: Partial<PlotPreferences>): void {
    this._prefs.set(sanitize({ ...this._prefs(), ...patch }));
    this.persist();
  }

  private load(): PlotPreferences {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        return sanitize(JSON.parse(raw));
      }
    } catch {
      /* ignore */
    }
    return { ...DEFAULTS };
  }

  private persist(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._prefs()));
      }
    } catch {
      /* ignore */
    }
  }
}
