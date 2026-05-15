import {
  Component,
  input,
  output,
  inject,
  signal,
  effect,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
} from '@angular/core';
import { CalculationManagerService } from '../../../services/calculation-manager.service';
import { VISUALIZATION_SETTINGS_UI } from '../../../models/visualization-types-ui';

/**
 * Per-plot settings dialog. Shown inline when the user clicks the gear icon
 * on a canvas-display or canvas-display-3d component.
 *
 * It dynamically loads the correct settings editor for the visualization type
 * (reusing the same components as the global settings dialog) and applies
 * changes directly via CalculationManagerService.
 */
@Component({
  selector: 'app-plot-settings-dialog',
  standalone: true,
  template: `
    <div class="dialog-overlay"
         (click)="onOverlayClick($event)"
         (pointerdown)="$event.stopPropagation()"
         (pointermove)="$event.stopPropagation()"
         (pointerup)="$event.stopPropagation()"
         (wheel)="onOverlayWheel($event)"
         (keydown)="$event.stopPropagation()">
      <div class="dialog"
           (click)="$event.stopPropagation()"
           (pointerdown)="$event.stopPropagation()"
           (pointermove)="$event.stopPropagation()"
           (pointerup)="$event.stopPropagation()"
           (wheel)="$event.stopPropagation()"
           (keydown)="$event.stopPropagation()">
        <div class="dialog-header">
          <h2 class="dialog-title">{{ dialogTitle() }}</h2>
          <button class="close-btn" (click)="onCancel()" aria-label="Close">&times;</button>
        </div>

        <div class="dialog-content">
          <ng-container #editorContainer></ng-container>
          @if (!editorLoaded()) {
            <div class="no-editor">No settings available for this visualization type.</div>
          }
        </div>

        <div class="dialog-footer">
          <button class="btn btn-sm" (click)="onCancel()">Cancel</button>
          <button class="btn btn-sm btn-primary" (click)="onSave()">Save</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .dialog {
      background: var(--b1, #1d232a);
      color: var(--bc, #a6adbb);
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      min-width: 360px;
      max-width: 90vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--b3, #374151);
    }
    .dialog-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    .close-btn {
      background: none;
      border: none;
      font-size: 22px;
      color: inherit;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      opacity: 0.7;
    }
    .close-btn:hover { opacity: 1; }
    .dialog-content {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    }
    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--b3, #374151);
    }
    .no-editor {
      color: #888;
      text-align: center;
      padding: 32px;
    }
  `],
})
export class PlotSettingsDialogComponent {
  private readonly calculationManager = inject(CalculationManagerService);

  readonly contextId = input.required<string>();
  readonly visKey = input.required<string>();

  readonly closed = output<void>();

  readonly dialogTitle = signal('Plot Settings');
  readonly editorLoaded = signal(false);

  @ViewChild('editorContainer', { read: ViewContainerRef, static: true })
  editorContainer!: ViewContainerRef;

  private componentRef: ComponentRef<any> | null = null;
  private pendingSettings: any = null;

  constructor() {
    effect(() => {
      const ctxId = this.contextId();
      const vKey = this.visKey();
      if (ctxId && vKey) {
        this.loadEditor(ctxId, vKey);
      }
    });
  }

  private loadEditor(ctxId: string, vKey: string): void {
    this.editorContainer.clear();
    this.componentRef?.destroy();
    this.componentRef = null;
    this.editorLoaded.set(false);

    // Determine the visualization type for this visKey
    const visTypeId = this.calculationManager.getVisualizationType(ctxId, vKey);
    if (!visTypeId) return;

    const visType = this.calculationManager.visualizationTypes.get(visTypeId);
    this.dialogTitle.set(visType?.name ?? vKey);

    // Look up the editor component for this visualization type
    const editorComponent = VISUALIZATION_SETTINGS_UI[visTypeId];
    if (!editorComponent) return;

    // Get current settings
    const context = this.calculationManager.getContext(ctxId);
    if (!context) return;
    const currentSettings = context.visualizationSettings.get(vKey);
    if (!currentSettings) return;

    // Deep-copy so edits don't mutate the live settings
    this.pendingSettings = JSON.parse(JSON.stringify(currentSettings));

    const ref = this.editorContainer.createComponent(editorComponent);
    ref.setInput('settings', this.pendingSettings);

    // Listen for changes from the editor
    const instance = ref.instance as any;
    if (instance.settingsChange) {
      instance.settingsChange.subscribe((newValue: any) => {
        this.pendingSettings = newValue;
        // Update the input on the component so it stays in sync
        ref.setInput('settings', newValue);
      });
    }

    this.componentRef = ref;
    this.editorLoaded.set(true);
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  onOverlayWheel(event: WheelEvent): void {
    // Prevent the underlying plot from zooming/panning while the dialog is open.
    event.stopPropagation();
    event.preventDefault();
  }

  onCancel(): void {
    this.closed.emit();
  }

  onSave(): void {
    if (this.pendingSettings) {
      const ctxId = this.contextId();
      const vKey = this.visKey();
      if (ctxId && vKey) {
        this.calculationManager.updateVisualizationSetting(ctxId, vKey, this.pendingSettings);
      }
    }
    this.closed.emit();
  }
}
