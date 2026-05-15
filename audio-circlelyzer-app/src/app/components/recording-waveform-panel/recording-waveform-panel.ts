import { Component, computed, input, output } from '@angular/core';
import {
  RecordingArchiveCompatibility,
  RecordingArchiveDocument,
  RecordingSourceType,
} from '../../models/recording-archive';
import { DemoCatalogEntry } from '../../models/demo-catalog';
import { DemoValidationReport } from '../../models/demo-validation';

@Component({
  selector: 'app-recording-waveform-panel',
  templateUrl: './recording-waveform-panel.html',
  styleUrl: './recording-waveform-panel.scss'
})
export class RecordingWaveformPanelComponent {
  recording = input<RecordingArchiveDocument | null>(null);
  waveform = input<number[]>([]);
  positionRatio = input(1);
  hopRatio = input(0);
  compatibility = input<RecordingArchiveCompatibility | null>(null);
  demoEntry = input<DemoCatalogEntry | null>(null);
  canValidateDemo = input(false);
  validationState = input<'idle' | 'loading' | 'ready' | 'error'>('idle');
  validationReport = input<DemoValidationReport | null>(null);
  validationError = input<string | null>(null);

  positionChanged = output<number>();
  stepRequested = output<number>();
  validationRequested = output<void>();

  protected readonly waveformBars = computed(() => {
    const values = this.waveform();
    if (values.length === 0) {
      return [] as Array<{ x: number; y: number; width: number; height: number }>;
    }

    const step = 1000 / values.length;
    const barWidth = Math.max(1.6, Math.min(4.8, step * 0.68));

    return values
      .map((value, index) => {
        const magnitude = Math.max(0.03, Math.min(1, Math.abs(value)));
        const height = 4 + magnitude * 60;
        const x = index * step + (step - barWidth) / 2;
        const y = 36 - height / 2;
        return { x, y, width: barWidth, height };
      });
  });

  protected readonly cursorLeft = computed(
    () => `${Math.max(0, Math.min(1, this.positionRatio())) * 100}%`,
  );

  /**
   * Circular model: positionRatio is window START as fraction of recordingLength.
   * Returns 1 or 2 segments when the window wraps around the end of the recording.
   */
  protected readonly cycleWindows = computed(() => {
    const recording = this.recording();
    if (!recording || recording.metadata.recordingLength === 0) {
      return [{ left: 0, width: 0 }];
    }
    const { circularLength, recordingLength } = recording.metadata;
    const windowWidth = Math.min(circularLength, recordingLength) / recordingLength;
    const pos = Math.max(0, Math.min(0.9999, this.positionRatio()));
    const windowEnd = pos + windowWidth;

    if (windowEnd <= 1.0) {
      return [{ left: pos, width: windowWidth }];
    }
    // Wrap-around: split into two boxes
    return [
      { left: pos, width: 1.0 - pos },
      { left: 0, width: windowEnd - 1.0 },
    ];
  });

  /** Primary window (non-wrapped segment) for the progress bars SVG viewBox */
  protected readonly cycleViewBox = computed(() => {
    const { left, width } = this.cycleWindows()[0];
    const svgLeft = left * 1000;
    const svgWidth = Math.max(1, width * 1000);
    return `${svgLeft} 0 ${svgWidth} 72`;
  });
  protected readonly validationOpen = computed(
    () => this.validationState() === 'loading' || !!this.validationReport() || !!this.validationError(),
  );
  protected readonly validationSummaryText = computed(() => {
    if (this.validationState() === 'loading') {
      return 'Validating current demo';
    }

    if (this.validationReport()) {
      return this.validationReport()!.summary;
    }

    if (this.validationError()) {
      return 'Validation error';
    }

    return 'Validation ready';
  });

  protected readonly positionLabel = computed(() => {
    const recording = this.recording();
    if (!recording) {
      return '';
    }

    const { circularLength, recordingLength } = recording.metadata;
    const cycleLen = Math.min(circularLength, recordingLength);
    const windowStartSample = Math.round(this.positionRatio() * recordingLength);
    const windowEndSample = (windowStartSample + cycleLen) % recordingLength || cycleLen;

    return `${windowEndSample} / ${recordingLength} samples`;
  });

  onPositionInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.positionChanged.emit(parseFloat(input.value));
  }

  /**
   * Active drag state. We use window-level pointer listeners (rather than
   * `setPointerCapture`) because the cycle-window highlight & progress layer
   * re-render on every position update; on some browsers this re-render
   * cancels capture mid-drag and the cursor "freezes" after a tiny move.
   */
  private dragState: {
    plotEl: HTMLElement;
    plotWidth: number;
    plotLeft: number;
    /** Pointer offset (in [0,1)) between the click point and the window-start
     *  when dragging started inside the window; null for click-to-seek mode. */
    offsetRatio: number | null;
  } | null = null;
  private readonly onWindowPointerMove = (event: PointerEvent) => this.handleDragMove(event);
  private readonly onWindowPointerUp = () => this.endDrag();

  onWaveformPointerDown(event: PointerEvent): void {
    const plotEl = event.currentTarget as HTMLElement;
    const rect = plotEl.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const insideWindow = this.isRatioInsideCycleWindow(ratio);

    this.dragState = {
      plotEl,
      plotWidth: rect.width,
      plotLeft: rect.left,
      offsetRatio: insideWindow ? this.normalizeOffset(ratio - this.positionRatio()) : null,
    };

    if (!insideWindow) {
      // Click-to-seek behaviour: jump immediately, then continue tracking.
      this.emitPositionFromClientX(event.clientX);
    }

    window.addEventListener('pointermove', this.onWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('pointercancel', this.onWindowPointerUp);
    event.preventDefault();
  }

  private handleDragMove(event: PointerEvent): void {
    if (!this.dragState) return;
    this.emitPositionFromClientX(event.clientX);
  }

  private endDrag(): void {
    if (!this.dragState) return;
    this.dragState = null;
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('pointercancel', this.onWindowPointerUp);
  }

  private emitPositionFromClientX(clientX: number): void {
    if (!this.dragState) return;
    // Re-read bounding rect lazily would be ideal, but the plot element does
    // not move during a drag — width/left captured at pointerdown is fine and
    // avoids forcing layout on every pointermove.
    const rect = this.dragState.plotEl.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    let next = ratio;
    if (this.dragState.offsetRatio !== null) {
      next = this.normalizeOffset(ratio - this.dragState.offsetRatio);
    }
    this.positionChanged.emit(Math.max(0, Math.min(0.9999, next)));
  }

  private isRatioInsideCycleWindow(ratio: number): boolean {
    const clamped = Math.max(0, Math.min(0.9999, ratio));
    for (const win of this.cycleWindows()) {
      if (clamped >= win.left && clamped < win.left + win.width) {
        return true;
      }
    }
    return false;
  }

  /** Wrap a ratio offset into [0,1) to keep arithmetic stable across cycle wraps. */
  private normalizeOffset(value: number): number {
    return ((value % 1) + 1) % 1;
  }

  requestStep(direction: number): void {
    this.stepRequested.emit(direction);
  }

  requestValidation(): void {
    this.validationRequested.emit();
  }

  formatSignalType(value: RecordingSourceType): string {
    switch (value) {
      case 'perfect_white':
        return 'Perfect White';
      case 'perfect_pink':
        return 'Perfect Pink';
      case 'white':
        return 'White';
      case 'pink':
        return 'Pink';
      case 'multi_source_white':
        return 'Multi-Source White';
      case 'wave_file':
        return 'Wave File';
      case 'output_with_filter':
        return 'Output + Filter';
      case 'zadoff_chu':
        return 'Zadoff-Chu';
      default:
        return 'Custom';
    }
  }

  formatValidationTargets(values: string[]): string {
    return values.join(' · ');
  }
}