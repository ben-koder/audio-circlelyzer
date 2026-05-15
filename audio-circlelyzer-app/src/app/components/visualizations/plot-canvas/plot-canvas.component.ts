/**
 * Plot Canvas Component
 *
 * A unified component for 2D and 3D plot rendering.
 * Adapted from REALTIME-VISUALIZER-CLEAN's PlotCanvasComponent to work with
 * audio-circlelyzer-app's CalculationManagerService.
 * 
 * Handles canvas setup, mouse/touch interactions, and resizing.
 * The actual rendering is done by the calculation worker using the new
 * plot engine rendering modules.
 */

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CalculationManagerService } from '../../../services/calculation-manager.service';
import { VISUALIZATION_SETTINGS_UI } from '../../../models/visualization-types-ui';
import { PlotSettingsDialogComponent } from '../plot-settings-dialog/plot-settings-dialog';
import {
  Plot2DDynamicOptions,
  Plot3DDynamicOptions,
  PlotDynamicOptions,
} from '../../../plotting/types';
import { VisualizationPresentationSettings } from '../../../models/types';
import {
  VisualizationInfoEntry,
  getVisualizationDescription,
  normalizeVisualizationInfoEntries,
} from '../../../models/visualization-types/presentation';

export type PlotMode = '2d' | '3d';

@Component({
  selector: 'app-plot-canvas',
  standalone: true,
  imports: [PlotSettingsDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'plot-canvas',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerUp($event)',
    '(wheel)': 'onWheel($event)',
    '(keydown)': 'onKeyDown($event)',
    '[class.touch-selected]': 'isTouchSelected()',
  },
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
      cursor: crosshair;
    }

    canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: block;
      touch-action: none; /* Required for pointer events on touch devices */
    }

    canvas:focus {
      outline: 2px solid #4a90d9;
      outline-offset: 2px;
    }

    .scrollbar {
      position: absolute;
      z-index: 10;
    }

    .scrollbar-horizontal {
      bottom: 0;
      left: 0;
      right: 0;
      height: 12px;
    }

    .scrollbar-vertical {
      top: 0;
      right: 0;
      bottom: 0;
      width: 12px;
    }

    .scrollbar-track {
      width: 100%;
      height: 100%;
      background: rgba(128, 128, 128, 0.2);
      border-radius: 6px;
      position: relative;
    }

    .scrollbar-thumb {
      position: absolute;
      background: rgba(64, 64, 64, 0.6);
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .scrollbar-horizontal .scrollbar-thumb {
      height: 100%;
      min-width: 20px;
    }

    .scrollbar-vertical .scrollbar-thumb {
      width: 100%;
      min-height: 20px;
    }

    .scrollbar-thumb:hover {
      background: rgba(64, 64, 64, 0.8);
    }

    .plot-actions {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 6px;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 20;
    }

    :host:hover .plot-actions,
    :host(.touch-selected) .plot-actions {
      opacity: 1;
    }

    .plot-action-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      margin: 0;
      border: none;
      background: rgba(75, 85, 99, 0.8);
      color: #e5e7eb;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .plot-action-btn:hover {
      background: rgba(107, 114, 128, 0.9);
    }

    .plot-action-btn svg {
      width: 16px;
      height: 16px;
    }

    .plot-action-btn--info {
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1;
    }

    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog {
      background: var(--b1, #1d232a);
      color: var(--bc, #a6adbb);
      border-radius: 10px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
      min-width: 340px;
      max-width: min(34rem, calc(100vw - 2rem));
      max-height: min(80vh, 42rem);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.9rem 1rem;
      border-bottom: 1px solid color-mix(in oklab, var(--color-base-content) 10%, transparent);
    }

    .dialog-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }

    .dialog-close {
      background: none;
      border: none;
      color: inherit;
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
      opacity: 0.7;
    }

    .dialog-close:hover {
      opacity: 1;
    }

    .dialog-content {
      padding: 1rem;
      overflow: auto;
      display: grid;
      gap: 0.9rem;
    }

    .info-copy {
      margin: 0;
      line-height: 1.45;
      color: color-mix(in oklab, var(--color-base-content) 82%, transparent);
    }

    .info-section {
      display: grid;
      gap: 0.55rem;
    }

    .info-section h3 {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: color-mix(in oklab, var(--color-base-content) 62%, transparent);
    }

    .info-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.45rem;
    }

    .info-list li {
      display: grid;
      gap: 0.15rem;
      padding: 0.65rem 0.75rem;
      border-radius: 0.7rem;
      background: color-mix(in oklab, var(--color-base-200) 75%, transparent);
      border: 1px solid color-mix(in oklab, var(--color-base-content) 8%, transparent);
    }

    .info-list__label {
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
    }

    .info-list__value {
      line-height: 1.4;
      color: color-mix(in oklab, var(--color-base-content) 86%, transparent);
    }

    .rotation-info {
      position: absolute;
      bottom: 8px;
      left: 8px;
      background: rgba(31, 41, 55, 0.8);
      color: #9ca3af;
      font-size: 10px;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      gap: 12px;
      z-index: 10;
    }
  `,
  template: `
    <canvas #canvas tabindex="0" [attr.aria-label]="'Plot'" role="img"></canvas>

    @if (hasInfo() || isZoomed() || hasSettings()) {
      <div class="plot-actions">
        @if (hasInfo()) {
          <button class="plot-action-btn plot-action-btn--info" (click)="openInfo()" title="Plot info" aria-label="Plot info">i</button>
        }
        @if (isZoomed()) {
          <button class="plot-action-btn" (click)="resetView()" title="Reset view" aria-label="Reset view">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 10h4V6M21 14h-4v4M3.51 19a9 9 0 0 0 14.85-3.36M20.49 5a9 9 0 0 0-14.85 3.36"/>
            </svg>
          </button>
        }
        @if (hasSettings()) {
          <button class="plot-action-btn" (click)="openSettings()" title="Plot settings" aria-label="Plot settings">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94 0 .31.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
        }
      </div>
    }
    @if (showSettingsDialog()) {
      <app-plot-settings-dialog
        [contextId]="contextId()"
        [visKey]="visKey()"
        (closed)="showSettingsDialog.set(false)"
      />
    }
    @if (showInfoDialog()) {
      <div class="dialog-overlay"
           (click)="closeInfoOnOverlay($event)"
           (pointerdown)="$event.stopPropagation()"
           (pointermove)="$event.stopPropagation()"
           (pointerup)="$event.stopPropagation()"
           (wheel)="onDialogWheel($event)"
           (keydown)="$event.stopPropagation()">
        <div class="dialog"
             (click)="$event.stopPropagation()"
             (pointerdown)="$event.stopPropagation()"
             (pointermove)="$event.stopPropagation()"
             (pointerup)="$event.stopPropagation()"
             (wheel)="$event.stopPropagation()"
             (keydown)="$event.stopPropagation()">
          <div class="dialog-header">
            <h2 class="dialog-title">{{ infoTitle() }}</h2>
            <button class="dialog-close" (click)="closeInfo()" aria-label="Close">&times;</button>
          </div>
          <div class="dialog-content">
            @if (infoDescription()) {
              <p class="info-copy">{{ infoDescription() }}</p>
            }
            @if (infoEntries().length > 0) {
              <section class="info-section">
                <h3>Channels</h3>
                <ul class="info-list">
                  @for (entry of infoEntries(); track $index) {
                    <li>
                      @if (entry.label) {
                        <span class="info-list__label">{{ entry.label }}</span>
                      }
                      <span class="info-list__value">{{ entry.value }}</span>
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
        </div>
      </div>
    }

    @if (mode() === '2d' && dynamicOptions2D.zoomX > 1) {
      <div class="scrollbar scrollbar-horizontal">
        <div class="scrollbar-track">
          <div
            class="scrollbar-thumb"
            [style.width.%]="100 / dynamicOptions2D.zoomX"
            [style.left.%]="((dynamicOptions2D.panX / 2 + 0.5) * (1 - 1 / dynamicOptions2D.zoomX)) * 100"
            (pointerdown)="onScrollbarPointerDown($event, 'horizontal')"
            (dblclick)="onScrollbarDoubleClick('horizontal')"
          ></div>
        </div>
      </div>
    }
    @if (mode() === '2d' && dynamicOptions2D.zoomY > 1) {
      <div class="scrollbar scrollbar-vertical">
        <div class="scrollbar-track">
          <div
            class="scrollbar-thumb"
            [style.height.%]="100 / dynamicOptions2D.zoomY"
            [style.top.%]="((1 - dynamicOptions2D.panY / 2 - 0.5) * (1 - 1 / dynamicOptions2D.zoomY)) * 100"
            (pointerdown)="onScrollbarPointerDown($event, 'vertical')"
            (dblclick)="onScrollbarDoubleClick('vertical')"
          ></div>
        </div>
      </div>
    }

    @if (mode() === '3d') {
      <div class="rotation-info">
        <span>X: {{ Math.round(dynamicOptions3D.rotationX * 180 / Math.PI) }}°</span>
        <span>Y: {{ Math.round(dynamicOptions3D.rotationY * 180 / Math.PI) }}°</span>
        <span>Zoom: {{ dynamicOptions3D.zoomX.toFixed(1) }}x</span>
      </div>
    }
  `,
})
export class PlotCanvasComponent implements AfterViewInit, OnDestroy {
  private readonly calculationManager = inject(CalculationManagerService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  // Inputs - these identify which visualization to control
  readonly contextId = input.required<string>();
  readonly visKey = input.required<string>();
  readonly mode = input<PlotMode>('2d');

  // Outputs
  readonly initialized = signal(false);
  readonly dynamicOptionsChanged = output<PlotDynamicOptions>();

  // Reference for Math in template
  Math = Math;

  // Touch selection state (shows .plot-actions on touch devices)
  isTouchSelected = signal(false);
  private touchSelectTimer: ReturnType<typeof setTimeout> | null = null;

  // Settings dialog
  showSettingsDialog = signal(false);
  showInfoDialog = signal(false);
  hasSettings = computed(() => {
    const ctxId = this.contextId();
    const vKey = this.visKey();
    if (!ctxId || !vKey) return false;
    const visTypeId = this.calculationManager.getVisualizationType(ctxId, vKey);
    if (!visTypeId) return false;
    return !!VISUALIZATION_SETTINGS_UI[visTypeId];
  });
  readonly visualizationSettings = computed(() => {
    this.calculationManager.vizSettingsVersion();
    const ctxId = this.contextId();
    const vKey = this.visKey();
    if (!ctxId || !vKey) {
      return null;
    }

    const context = this.calculationManager.getContext(ctxId);
    return (context?.visualizationSettings.get(vKey) ?? null) as VisualizationPresentationSettings | null;
  });
  readonly visualizationTypeInfo = computed(() => {
    const ctxId = this.contextId();
    const vKey = this.visKey();
    if (!ctxId || !vKey) {
      return null;
    }

    const visTypeId = this.calculationManager.getVisualizationType(ctxId, vKey);
    return visTypeId ? this.calculationManager.visualizationTypes.get(visTypeId) ?? null : null;
  });
  readonly infoDescription = computed(() => getVisualizationDescription(
    this.visualizationSettings() ?? undefined,
    this.visualizationTypeInfo()?.description,
  ));
  readonly infoEntries = computed<VisualizationInfoEntry[]>(() => normalizeVisualizationInfoEntries(
    this.visualizationSettings()?.channelInfo,
  ));
  readonly hasInfo = computed(() => Boolean(this.infoDescription() || this.infoEntries().length > 0));
  readonly infoTitle = computed(() =>
    this.visualizationSettings()?.title?.trim()
    || this.visualizationTypeInfo()?.name
    || 'Plot Info'
  );

  openSettings(): void {
    this.showSettingsDialog.set(true);
  }

  openInfo(): void {
    this.showInfoDialog.set(true);
  }

  closeInfo(): void {
    this.showInfoDialog.set(false);
  }

  closeInfoOnOverlay(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeInfo();
    }
  }

  /**
   * Stop wheel events inside the plot-info dialog from reaching the host
   * `onWheel` handler (which would zoom/pan the underlying plot) and from
   * scrolling the page.
   */
  onDialogWheel(event: WheelEvent): void {
    event.stopPropagation();
    event.preventDefault();
  }

  /**
   * Returns true when an event originated inside an in-canvas dialog
   * overlay or one of the action buttons. Host gesture handlers should
   * bail in that case so keyboard / wheel / pointer input goes to the
   * dialog, not the underlying plot.
   */
  private isInUiOverlay(event: Event): boolean {
    const target = event.target as HTMLElement | null;
    if (!target || typeof target.closest !== 'function') return false;
    return !!(target.closest('.dialog-overlay') || target.closest('.plot-actions'));
  }

  // Internal state
  private resizeObserver: ResizeObserver | null = null;
  private canvasTransferred = false;
  private viewInitialized = false;
  private lastWidth = 0;
  private lastHeight = 0;
  private resizeRAF: number | null = null;

  constructor() {
    // Retry canvas transfer when inputs become available (handles dynamic component creation
    // where inputs may not be set before ngAfterViewInit fires)
    effect(() => {
      const ctxId = this.contextId();
      const vKey = this.visKey();
      if (ctxId && vKey && this.viewInitialized && !this.canvasTransferred) {
        this.transferCanvasToWorker();
      }
    });
  }

  // Interaction state
  private isDragging = false;
  private isScrollbarDragging = false;
  private scrollbarDirection: 'horizontal' | 'vertical' | null = null;
  private isRotating = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private lastTouchDistance = 0;
  private activePointers = new Map<number, { x: number; y: number }>();

  // Dynamic options (public for template binding)
  dynamicOptions2D: Plot2DDynamicOptions = {
    zoomX: 1,
    zoomY: 1,
    panX: 0,
    panY: 0,
  };

  dynamicOptions3D: Plot3DDynamicOptions = {
    zoomX: 1,
    zoomY: 1,
    zoomZ: 1,
    panX: 0,
    panY: 0,
    panZ: 0,
    rotationX: -0.5,
    rotationY: 0.5,
    rotationZ: 0,
  };

  isZoomed(): boolean {
    if (this.mode() === '2d') {
      return this.dynamicOptions2D.zoomX > 1 || this.dynamicOptions2D.zoomY > 1;
    } else {
      return (
        this.dynamicOptions3D.zoomX !== 1 ||
        this.dynamicOptions3D.rotationX !== -0.5 ||
        this.dynamicOptions3D.rotationY !== 0.5
      );
    }
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.setupResizeObserver();
    this.transferCanvasToWorker();
    // Send initial dynamic settings
    this.sendDynamicSettings();
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.resizeRAF !== null) {
      cancelAnimationFrame(this.resizeRAF);
    }
    if (this.touchSelectTimer !== null) {
      clearTimeout(this.touchSelectTimer);
    }
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.resizeRAF !== null) {
        cancelAnimationFrame(this.resizeRAF);
      }

      this.resizeRAF = requestAnimationFrame(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          const roundedWidth = Math.round(width);
          const roundedHeight = Math.round(height);

          if (roundedWidth !== this.lastWidth || roundedHeight !== this.lastHeight) {
            this.lastWidth = roundedWidth;
            this.lastHeight = roundedHeight;

            if (this.canvasTransferred) {
              const ctxId = this.contextId();
              const vKey = this.visKey();
              if (ctxId && vKey) {
                this.calculationManager.resizeCanvas(ctxId, vKey, roundedWidth, roundedHeight);
              }
            }
          }
        }
        this.resizeRAF = null;
      });
    });
    this.resizeObserver.observe(this.elementRef.nativeElement);
  }

  private transferCanvasToWorker(): void {
    if (this.canvasTransferred) return;

    const canvasEl = this.canvas().nativeElement;
    const parent = canvasEl.parentElement ?? this.elementRef.nativeElement;
    const rect = parent.getBoundingClientRect();
    const roundedWidth = Math.round(rect.width);
    const roundedHeight = Math.round(rect.height);
    canvasEl.width = roundedWidth;
    canvasEl.height = roundedHeight;
    this.lastWidth = roundedWidth;
    this.lastHeight = roundedHeight;

    const ctxId = this.contextId();
    const vKey = this.visKey();
    if (ctxId && vKey) {
      try {
        this.calculationManager.transferCanvas(ctxId, vKey, canvasEl);
        this.canvasTransferred = true;
        this.initialized.set(true);
      } catch (err) {
        console.error('Failed to transfer canvas:', err);
      }
    }
  }

  /**
   * Send current dynamic option state to the worker via CalculationManagerService
   */
  private sendDynamicSettings(): void {
    const ctxId = this.contextId();
    const vKey = this.visKey();
    if (!ctxId || !vKey) return;

    const settings = this.mode() === '3d' ? this.dynamicOptions3D : this.dynamicOptions2D;
    this.calculationManager.updateVisualizationDynamicSettings(ctxId, vKey, settings);
    this.dynamicOptionsChanged.emit(settings);
  }

  // ============================================================
  // Interaction helpers
  // ============================================================

  private clampPan(value: number): number {
    return Math.max(-1, Math.min(1, value));
  }

  private getPanDeltaFromPointerDelta(deltaNorm: number, zoom: number): number {
    return (deltaNorm * 2) / Math.max(zoom, 0.1);
  }

  private getNormalizedDataPosition(pointerNorm: number, pan: number, zoom: number): number {
    return 0.5 - pan / 2 + (pointerNorm - 0.5) / Math.max(zoom, 0.1);
  }

  private getPanForPointerAnchoredZoom(pointerNorm: number, normalizedDataPosition: number, zoom: number): number {
    return 1 - 2 * normalizedDataPosition + (2 * (pointerNorm - 0.5)) / Math.max(zoom, 0.1);
  }

  // ============================================================
  // Pointer event handlers (unified mouse + touch + pen)
  // ============================================================

  onPointerDown(event: PointerEvent): void {
    // Don't start drag when interacting with UI overlays (action buttons, dialogs).
    if (this.isInUiOverlay(event)) {
      return;
    }

    // Touch selection overlay
    if (event.pointerType === 'touch') {
      if (this.touchSelectTimer !== null) {
        clearTimeout(this.touchSelectTimer);
        this.touchSelectTimer = null;
      }
      this.isTouchSelected.set(true);
    }

    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 1) {
      // Single pointer — drag or rotate
      if (this.mode() === '3d') {
        if (event.button === 0) {
          this.isRotating = true;
        } else if (event.button === 2) {
          this.isDragging = true;
        }
      } else {
        this.isDragging = true;
      }
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
    } else if (this.activePointers.size === 2) {
      // Two pointers — start pinch-to-zoom; cancel single-pointer drag
      this.isDragging = false;
      this.isRotating = false;
      const pointers = [...this.activePointers.values()];
      const dx = pointers[0].x - pointers[1].x;
      const dy = pointers[0].y - pointers[1].y;
      this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    }

    // Capture pointer so we receive pointermove/pointerup outside the element
    const el = this.elementRef.nativeElement as HTMLElement;
    try { el.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  }

  onPointerMove(event: PointerEvent): void {
    if (this.isInUiOverlay(event)) {
      return;
    }
    // Handle scrollbar drag (pointer was captured on host by onScrollbarPointerDown)
    if (this.isScrollbarDragging && this.scrollbarDirection) {
      const canvasEl = this.canvas().nativeElement;
      const rect = canvasEl.getBoundingClientRect();
      if (this.scrollbarDirection === 'horizontal') {
        const deltaX = (event.clientX - this.lastMouseX) / rect.width;
        const panDelta = deltaX * 2 / (1 - 1 / this.dynamicOptions2D.zoomX);
        this.dynamicOptions2D = {
          ...this.dynamicOptions2D,
          panX: Math.max(-1, Math.min(1, this.dynamicOptions2D.panX + panDelta)),
        };
      } else {
        const deltaY = (event.clientY - this.lastMouseY) / rect.height;
        const panDelta = -deltaY * 2 / (1 - 1 / this.dynamicOptions2D.zoomY);
        this.dynamicOptions2D = {
          ...this.dynamicOptions2D,
          panY: Math.max(-1, Math.min(1, this.dynamicOptions2D.panY + panDelta)),
        };
      }
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.sendDynamicSettings();
      return;
    }

    // Update active pointer position
    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 1) {
      if (this.mode() === '2d') {
        if (this.isDragging) {
          const canvasEl = this.canvas().nativeElement;
          const rect = canvasEl.getBoundingClientRect();
          const deltaX = (event.clientX - this.lastMouseX) / rect.width;
          const deltaY = (event.clientY - this.lastMouseY) / rect.height;
          const panDeltaX = this.getPanDeltaFromPointerDelta(deltaX, this.dynamicOptions2D.zoomX);
          const panDeltaY = this.getPanDeltaFromPointerDelta(-deltaY, this.dynamicOptions2D.zoomY);
          this.dynamicOptions2D = {
            ...this.dynamicOptions2D,
            panX: this.clampPan(this.dynamicOptions2D.panX + panDeltaX),
            panY: this.clampPan(this.dynamicOptions2D.panY + panDeltaY),
          };
          this.lastMouseX = event.clientX;
          this.lastMouseY = event.clientY;
          this.sendDynamicSettings();
        }
      } else {
        // 3D mode
        const canvasEl = this.canvas().nativeElement;
        const rect = canvasEl.getBoundingClientRect();
        const deltaX = (event.clientX - this.lastMouseX) / rect.width;
        const deltaY = (event.clientY - this.lastMouseY) / rect.height;

        if (this.isRotating) {
          this.dynamicOptions3D = {
            ...this.dynamicOptions3D,
            rotationY: this.dynamicOptions3D.rotationY - deltaX * 2,
            rotationX: Math.max(
              -Math.PI / 2,
              Math.min(Math.PI / 2, this.dynamicOptions3D.rotationX + deltaY * 2)
            ),
          };
          this.lastMouseX = event.clientX;
          this.lastMouseY = event.clientY;
          this.sendDynamicSettings();
        } else if (this.isDragging) {
          this.dynamicOptions3D = {
            ...this.dynamicOptions3D,
            panX: Math.max(-2, Math.min(2, this.dynamicOptions3D.panX + deltaX * 2)),
            panY: Math.max(-2, Math.min(2, this.dynamicOptions3D.panY - deltaY * 2)),
          };
          this.lastMouseX = event.clientX;
          this.lastMouseY = event.clientY;
          this.sendDynamicSettings();
        }
      }
    } else if (this.activePointers.size === 2) {
      // Pinch-to-zoom
      const pointers = [...this.activePointers.values()];
      const dx = pointers[0].x - pointers[1].x;
      const dy = pointers[0].y - pointers[1].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const zf = distance / Math.max(this.lastTouchDistance, 1);
      this.lastTouchDistance = distance;

      if (this.mode() === '2d') {
        this.dynamicOptions2D = {
          ...this.dynamicOptions2D,
          zoomX: Math.max(0.1, Math.min(10, this.dynamicOptions2D.zoomX * zf)),
          zoomY: Math.max(0.1, Math.min(10, this.dynamicOptions2D.zoomY * zf)),
        };
      } else {
        this.dynamicOptions3D = {
          ...this.dynamicOptions3D,
          zoomX: Math.max(0.1, Math.min(10, this.dynamicOptions3D.zoomX * zf)),
          zoomY: Math.max(0.1, Math.min(10, this.dynamicOptions3D.zoomY * zf)),
          zoomZ: Math.max(0.1, Math.min(10, this.dynamicOptions3D.zoomZ * zf)),
        };
      }
      this.sendDynamicSettings();
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (this.isInUiOverlay(event)) {
      return;
    }
    // Clear scrollbar drag state (pointer was captured on host element)
    if (this.isScrollbarDragging) {
      this.isScrollbarDragging = false;
      this.scrollbarDirection = null;
      return;
    }

    this.activePointers.delete(event.pointerId);

    if (this.activePointers.size === 0) {
      this.isDragging = false;
      this.isRotating = false;

      // Auto-dismiss touch selection overlay 3 s after last touch ends
      if (event.pointerType === 'touch') {
        if (this.touchSelectTimer !== null) {
          clearTimeout(this.touchSelectTimer);
        }
        this.touchSelectTimer = setTimeout(() => {
          this.isTouchSelected.set(false);
          this.touchSelectTimer = null;
        }, 3000);
      }
    } else if (this.activePointers.size === 1) {
      // Returned to single pointer after pinch — resume drag
      const [pos] = [...this.activePointers.values()];
      this.lastMouseX = pos.x;
      this.lastMouseY = pos.y;
      this.isDragging = true;
    }
  }

  onWheel(event: WheelEvent): void {
    if (this.isInUiOverlay(event)) {
      return;
    }
    event.preventDefault();

    const zoomFactor = 0.1;

    if (this.mode() === '2d') {
      const canvasEl = this.canvas().nativeElement;
      const rect = canvasEl.getBoundingClientRect();

      // Use theme margins (default values)
      const marginLeft = 60, marginTop = 40, marginRight = 20, marginBottom = 50;
      const plotArea = {
        left: marginLeft,
        top: marginTop,
        width: rect.width - marginLeft - marginRight,
        height: rect.height - marginTop - marginBottom,
      };

      const mouseX = event.clientX - rect.left - plotArea.left;
      const mouseY = event.clientY - rect.top - plotArea.top;
      const mouseXNorm = mouseX / plotArea.width;
      const mouseYNorm = mouseY / plotArea.height;

      if (mouseXNorm < 0 || mouseXNorm > 1 || mouseYNorm < 0 || mouseYNorm > 1) {
        // Center zoom if outside plot area
        if (event.shiftKey || event.ctrlKey) {
          const newZoomX = Math.max(0.1, Math.min(10, this.dynamicOptions2D.zoomX - event.deltaY * zoomFactor * 0.01));
          this.dynamicOptions2D = { ...this.dynamicOptions2D, zoomX: newZoomX };
        } else {
          const newZoomY = Math.max(0.1, Math.min(10, this.dynamicOptions2D.zoomY - event.deltaY * zoomFactor * 0.01));
          this.dynamicOptions2D = { ...this.dynamicOptions2D, zoomY: newZoomY };
        }
      } else {
        if (event.shiftKey || event.ctrlKey) {
          // Zoom X relative to mouse position
          const oldZoomX = this.dynamicOptions2D.zoomX;
          const newZoomX = Math.max(0.1, Math.min(10, oldZoomX - event.deltaY * zoomFactor * 0.01));
          const mouseDataX = this.getNormalizedDataPosition(mouseXNorm, this.dynamicOptions2D.panX, oldZoomX);
          const newPanX = this.getPanForPointerAnchoredZoom(mouseXNorm, mouseDataX, newZoomX);
          this.dynamicOptions2D = {
            ...this.dynamicOptions2D,
            zoomX: newZoomX,
            panX: this.clampPan(newPanX),
          };
        } else {
          // Zoom Y relative to mouse position (flip mouseYNorm since screen Y is inverted)
          const oldZoomY = this.dynamicOptions2D.zoomY;
          const newZoomY = Math.max(0.1, Math.min(10, oldZoomY - event.deltaY * zoomFactor * 0.01));
          const mouseYFlipped = 1 - mouseYNorm;
          const mouseDataY = this.getNormalizedDataPosition(mouseYFlipped, this.dynamicOptions2D.panY, oldZoomY);
          const newPanY = this.getPanForPointerAnchoredZoom(mouseYFlipped, mouseDataY, newZoomY);
          this.dynamicOptions2D = {
            ...this.dynamicOptions2D,
            zoomY: newZoomY,
            panY: this.clampPan(newPanY),
          };
        }
      }

      this.sendDynamicSettings();
    } else {
      // 3D mode - zoom all axes together
      const newZoom = Math.max(0.1, Math.min(10, this.dynamicOptions3D.zoomX - event.deltaY * zoomFactor * 0.01));
      this.dynamicOptions3D = {
        ...this.dynamicOptions3D,
        zoomX: newZoom,
        zoomY: newZoom,
        zoomZ: newZoom,
      };
      this.sendDynamicSettings();
    }
  }

  // ============================================================
  // Keyboard event handler
  // ============================================================

  onKeyDown(event: KeyboardEvent): void {
    if (this.isInUiOverlay(event)) {
      return;
    }
    const step = 0.1;

    if (this.mode() === '2d') {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          this.dynamicOptions2D = { ...this.dynamicOptions2D, panY: Math.min(1, this.dynamicOptions2D.panY + step) };
          break;
        case 'ArrowDown':
          event.preventDefault();
          this.dynamicOptions2D = { ...this.dynamicOptions2D, panY: Math.max(-1, this.dynamicOptions2D.panY - step) };
          break;
        case 'ArrowLeft':
          event.preventDefault();
          this.dynamicOptions2D = { ...this.dynamicOptions2D, panX: Math.max(-1, this.dynamicOptions2D.panX - step) };
          break;
        case 'ArrowRight':
          event.preventDefault();
          this.dynamicOptions2D = { ...this.dynamicOptions2D, panX: Math.min(1, this.dynamicOptions2D.panX + step) };
          break;
        case '+': case '=':
          event.preventDefault();
          this.dynamicOptions2D = {
            ...this.dynamicOptions2D,
            zoomX: Math.min(10, this.dynamicOptions2D.zoomX * 1.1),
            zoomY: Math.min(10, this.dynamicOptions2D.zoomY * 1.1),
          };
          break;
        case '-':
          event.preventDefault();
          this.dynamicOptions2D = {
            ...this.dynamicOptions2D,
            zoomX: Math.max(0.1, this.dynamicOptions2D.zoomX / 1.1),
            zoomY: Math.max(0.1, this.dynamicOptions2D.zoomY / 1.1),
          };
          break;
        case 'Home':
          event.preventDefault();
          this.dynamicOptions2D = { zoomX: 1, zoomY: 1, panX: 0, panY: 0 };
          break;
        default:
          return;
      }
      this.sendDynamicSettings();
    } else {
      // 3D mode
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          if (event.shiftKey) {
            this.dynamicOptions3D = {
              ...this.dynamicOptions3D,
              rotationX: Math.min(Math.PI / 2, this.dynamicOptions3D.rotationX + step),
            };
          } else {
            this.dynamicOptions3D = { ...this.dynamicOptions3D, panY: Math.min(2, this.dynamicOptions3D.panY + step) };
          }
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (event.shiftKey) {
            this.dynamicOptions3D = {
              ...this.dynamicOptions3D,
              rotationX: Math.max(-Math.PI / 2, this.dynamicOptions3D.rotationX - step),
            };
          } else {
            this.dynamicOptions3D = { ...this.dynamicOptions3D, panY: Math.max(-2, this.dynamicOptions3D.panY - step) };
          }
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (event.shiftKey) {
            this.dynamicOptions3D = { ...this.dynamicOptions3D, rotationY: this.dynamicOptions3D.rotationY + step };
          } else {
            this.dynamicOptions3D = { ...this.dynamicOptions3D, panX: Math.max(-2, this.dynamicOptions3D.panX - step) };
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (event.shiftKey) {
            this.dynamicOptions3D = { ...this.dynamicOptions3D, rotationY: this.dynamicOptions3D.rotationY - step };
          } else {
            this.dynamicOptions3D = { ...this.dynamicOptions3D, panX: Math.min(2, this.dynamicOptions3D.panX + step) };
          }
          break;
        case '+': case '=':
          event.preventDefault();
          this.dynamicOptions3D = {
            ...this.dynamicOptions3D,
            zoomX: Math.min(10, this.dynamicOptions3D.zoomX * 1.1),
            zoomY: Math.min(10, this.dynamicOptions3D.zoomY * 1.1),
            zoomZ: Math.min(10, this.dynamicOptions3D.zoomZ * 1.1),
          };
          break;
        case '-':
          event.preventDefault();
          this.dynamicOptions3D = {
            ...this.dynamicOptions3D,
            zoomX: Math.max(0.1, this.dynamicOptions3D.zoomX / 1.1),
            zoomY: Math.max(0.1, this.dynamicOptions3D.zoomY / 1.1),
            zoomZ: Math.max(0.1, this.dynamicOptions3D.zoomZ / 1.1),
          };
          break;
        case 'Home':
          event.preventDefault();
          this.dynamicOptions3D = {
            zoomX: 1, zoomY: 1, zoomZ: 1,
            panX: 0, panY: 0, panZ: 0,
            rotationX: -0.5, rotationY: 0.5, rotationZ: 0,
          };
          break;
        default:
          return;
      }
      this.sendDynamicSettings();
    }
  }

  // ============================================================
  // Scrollbar handlers
  // ============================================================

  onScrollbarPointerDown(event: PointerEvent, direction: 'horizontal' | 'vertical'): void {
    event.stopPropagation();
    event.preventDefault();
    this.isScrollbarDragging = true;
    this.scrollbarDirection = direction;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    // Capture pointer on the host so onPointerMove receives the events
    const el = this.elementRef.nativeElement as HTMLElement;
    try { el.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  }

  onScrollbarDoubleClick(direction: 'horizontal' | 'vertical'): void {
    if (direction === 'horizontal') {
      this.dynamicOptions2D = { ...this.dynamicOptions2D, zoomX: 1, panX: 0 };
    } else {
      this.dynamicOptions2D = { ...this.dynamicOptions2D, zoomY: 1, panY: 0 };
    }
    this.sendDynamicSettings();
  }

  /**
   * Reset view to defaults
   */
  resetView(): void {
    if (this.mode() === '2d') {
      this.dynamicOptions2D = { zoomX: 1, zoomY: 1, panX: 0, panY: 0 };
    } else {
      this.dynamicOptions3D = {
        zoomX: 1, zoomY: 1, zoomZ: 1,
        panX: 0, panY: 0, panZ: 0,
        rotationX: -0.5, rotationY: 0.5, rotationZ: 0,
      };
    }
    this.sendDynamicSettings();
  }
}
