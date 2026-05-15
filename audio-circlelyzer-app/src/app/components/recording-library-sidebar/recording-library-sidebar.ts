import { Component, computed, input, output, signal } from '@angular/core';
import { ContextPreset } from '../../models/context-presets';
import { DemoCatalogEntry } from '../../models/demo-catalog';
import { RecordingArchiveDocument, RecordingSourceType } from '../../models/recording-archive';

@Component({
  selector: 'app-recording-library-sidebar',
  imports: [],
  templateUrl: './recording-library-sidebar.html',
  styleUrl: './recording-library-sidebar.scss'
})
export class RecordingLibrarySidebarComponent {
  contextPresets = input<ContextPreset[]>([]);
  selectedPresetId = input<string | null>(null);
  demoEntries = input<DemoCatalogEntry[]>([]);
  selectedDemoId = input<string | null>(null);
  demoCatalogState = input<'idle' | 'loading' | 'ready' | 'error'>('idle');
  demoCatalogError = input<string | null>(null);
  recordings = input<RecordingArchiveDocument[]>([]);
  selectedRecordingId = input<string | null>(null);
  unsavedRecordingIds = input<ReadonlySet<string>>(new Set());
  isOfflineMode = input(false);
  canSaveRecordingArchive = input(false);
  currentPreset = input<ContextPreset | null>(null);
  builtInPresetCount = input(0);
  userPresetCount = input(0);
  presetToolsOpen = input(false);
  sourcePrimaryLabel = input<string>('');
  syntheticType = input<string>('white_noise');
  syntheticTypeOptions = input<Array<{ value: string; label: string }>>([]);
  isOnlineMode = input(false);
  /** True while a microphone or simulated recording is in progress.
   *  When true, library/demo controls are disabled to prevent
   *  destructive actions during the active capture. */
  isRecording = input(false);
  presetToolsOpenChange = output<boolean>();
  sourceSettingsRequested = output<void>();
  syntheticTypeChanged = output<string>();
  analysisModeChanged = output<'live' | 'offline'>();
  recordingSaveRequested = output<string>();
  recordingRenamed = output<{ id: string; name: string }>();
  workspaceExportRequested = output<void>();
  workspaceImportRequested = output<void>();
  readonly builtInPresets = computed(() => this.contextPresets().filter((preset) => preset.origin !== 'user'));
  readonly userPresets = computed(() => this.contextPresets().filter((preset) => preset.origin === 'user'));

  // Collapse state for sidebar sections
  readonly demosOpen = signal(false);
  readonly recordingsOpen = signal(true);

  // Inline-rename state: id of the recording currently being renamed (if any)
  // and the in-progress draft text. Kept local so the live `recordings` input
  // can update freely without losing user input.
  readonly editingRecordingId = signal<string | null>(null);
  readonly editingRecordingName = signal('');

  isUnsaved(recordingId: string): boolean {
    return this.unsavedRecordingIds().has(recordingId);
  }

  beginRenameRecording(event: Event, recording: RecordingArchiveDocument): void {
    event.stopPropagation();
    this.editingRecordingId.set(recording.metadata.id);
    this.editingRecordingName.set(recording.metadata.name);
  }

  onRenameInputChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.editingRecordingName.set(value);
  }

  commitRename(recording: RecordingArchiveDocument): void {
    const next = this.editingRecordingName().trim();
    this.editingRecordingId.set(null);
    if (next && next !== recording.metadata.name) {
      this.recordingRenamed.emit({ id: recording.metadata.id, name: next });
    }
  }

  cancelRename(): void {
    this.editingRecordingId.set(null);
  }

  onRenameKeydown(event: KeyboardEvent, recording: RecordingArchiveDocument): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRename(recording);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRename();
    }
  }

  saveRecording(event: Event, recordingId: string): void {
    event.stopPropagation();
    this.recordingSaveRequested.emit(recordingId);
  }

  requestWorkspaceExport(event: Event): void {
    event.stopPropagation();
    this.workspaceExportRequested.emit();
  }

  requestWorkspaceImport(event: Event): void {
    event.stopPropagation();
    this.workspaceImportRequested.emit();
  }

  presetSelected = output<string>();
  recordingSelected = output<string>();
  demoLoadRequested = output<string>();
  recordingRemoved = output<string>();
  presetSaveRequested = output<string>();
  presetImportRequested = output<void>();
  presetExportRequested = output<void>();
  presetDeleteRequested = output<void>();

  removeRecording(event: Event, recordingId: string): void {
    event.stopPropagation();
    this.recordingRemoved.emit(recordingId);
  }

  onPresetChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.presetSelected.emit(select.value);
  }

  openPresetTools(): void {
    this.presetToolsOpenChange.emit(true);
  }

  closePresetTools(): void {
    this.presetToolsOpenChange.emit(false);
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

  formatCreatedAt(value: string): string {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatCategory(value: string): string {
    return value
      .split(/[-_]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  formatValidationTargets(values: string[]): string {
    return values.join(' · ');
  }
}