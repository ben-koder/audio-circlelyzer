import { Component, computed, signal, OnInit, OnDestroy, effect, inject, ViewChild } from '@angular/core';
import { TopBarComponent } from './components/top-bar/top-bar';
import { SplitPane, LayoutNode } from './components/layout/split-pane/split-pane';
import { RecordingLibrarySidebarComponent } from './components/recording-library-sidebar/recording-library-sidebar';
import { RecordingWaveformPanelComponent } from './components/recording-waveform-panel/recording-waveform-panel';
import { CalculationManagerService } from './services/calculation-manager.service';
import { AudioEngineService } from './services/audio-engine.service';
import { PresetLibraryService } from './services/preset-library.service';
import { RecordingLibraryService } from './services/recording-library.service';
import { DemoCatalogService } from './services/demo-catalog.service';
import { DemoValidationService } from './services/demo-validation.service';
import { SessionStateService, SyntheticType } from './services/session-state.service';
import { ContextPreset } from './models/context-presets';
import { ResolvedSourceConfig, resolvePresetSourceConfig } from './models/source-config';
import { PresetManagementPanelComponent } from './components/preset-management-panel/preset-management-panel';

@Component({
  selector: 'app-root',
  imports: [TopBarComponent, SplitPane, RecordingLibrarySidebarComponent, RecordingWaveformPanelComponent, PresetManagementPanelComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('Audio Circlelyzer');

  private readonly calculationManager = inject(CalculationManagerService);
  private readonly audioEngine = inject(AudioEngineService);
  private readonly presetLibrary = inject(PresetLibraryService);
  private readonly recordingLibrary = inject(RecordingLibraryService);
  private readonly demoCatalog = inject(DemoCatalogService);
  private readonly demoValidation = inject(DemoValidationService);
  protected readonly sessionState = inject(SessionStateService);

  // Available context presets - loaded from YAML files at runtime
  protected readonly contextPresets = signal<ContextPreset[]>([]);
  protected readonly currentPreset = this.sessionState.currentPreset;
  protected readonly currentSourceConfig = this.sessionState.activeSourceConfig;
  protected readonly currentContextId = this.sessionState.currentContextId;
  protected readonly recordings = this.recordingLibrary.recordings;
  protected readonly selectedRecordingId = this.recordingLibrary.selectedRecordingId;
  protected readonly unsavedRecordingIds = this.recordingLibrary.unsavedRecordingIds;
  protected readonly selectedDemoId = this.recordingLibrary.selectedBuiltInRecordingId;
  protected readonly offlinePositionRatio = this.recordingLibrary.offlinePositionRatio;
  protected readonly demoEntries = this.demoCatalog.demos;
  protected readonly demoCatalogLoadState = this.demoCatalog.loadState;
  protected readonly demoCatalogLoadError = this.demoCatalog.loadError;
  protected readonly selectedDemoEntry = computed(
    () => this.demoEntries().find((entry) => entry.id === this.selectedDemoId()) ?? null,
  );
  protected readonly demoValidationState = this.demoValidation.state;
  protected readonly demoValidationReport = this.demoValidation.report;
  protected readonly demoValidationError = this.demoValidation.error;
  
  // Layout tree based on current preset
  protected layoutTree = signal<LayoutNode | null>(null);
  protected readonly isOfflineMode = computed(() => this.calculationManager.mode() === 'offline');
  /** True while a microphone or simulated recording is in progress. */
  protected readonly isRecording = computed(
    () => this.audioEngine.isRecording() || this.audioEngine.isSimulatedRecording(),
  );
  protected readonly selectedRecording = this.recordingLibrary.selectedRecording;
  protected readonly selectedRecordingCompatibility = computed(() => {
    const recording = this.recordingLibrary.selectedRecording();
    const preset = this.getEffectivePresetForCompatibility();

    if (!recording || !preset) {
      return null;
    }

    return this.recordingLibrary.getCompatibility(recording, preset);
  });
  protected readonly waveformPreview = computed(() => {
    const recording = this.recordingLibrary.selectedRecording();
    return recording ? this.recordingLibrary.getWaveformPreview(recording, 320) : [];
  });
  protected readonly recordingHopRatio = computed(() => {
    const recording = this.recordingLibrary.selectedRecording();
    return recording ? this.recordingLibrary.getHopRatio(recording) : 0;
  });
  protected readonly sidebarOpen = signal(false);

  @ViewChild(TopBarComponent) private topBar?: TopBarComponent;

  // Sidebar modal state lifted to app level so modals render outside will-change:transform container
  protected readonly sidebarPresetToolsOpen = signal(false);

  // "Clear workspace after save?" modal state. Set after a successful workspace
  // export so the user can opt to wipe the live library and start fresh.
  protected readonly clearWorkspaceConfirmOpen = signal(false);

  // Source settings open state (model-bound to top-bar so sidebar can trigger it)
  protected readonly sourceSettingsOpen = signal(false);

  // Synthetic excitation type (model-bound to top-bar, displayed in sidebar)
  protected readonly syntheticType = this.sessionState.syntheticType;
  protected readonly syntheticTypeOptions: Array<{ value: SyntheticType; label: string }> = [
    { value: 'white_noise', label: 'White Noise' },
    { value: 'pink_noise', label: 'Pink Noise' },
    { value: 'wave_file', label: 'Wave File' },
    { value: 'output_with_filter', label: 'Out+Filter' },
  ];

  // Compact label for sidebar source display
  protected readonly sourcePrimaryLabel = computed(() => {
    const config = this.currentSourceConfig();
    if (!config) { return 'Not configured'; }
    const labels: Record<string, string> = {
      'PERFECT_WHITE': 'Perfect White', 'PERFECT_PINK': 'Perfect Pink',
      'WHITE': 'White Noise', 'PINK': 'Pink Noise',
      'WAVE_FILE': 'Wave File', 'ZADOFF_CHU': 'Zadoff-Chu',
      'MULTI_SOURCE_WHITE': 'Multi-Source', 'OUTPUT_WITH_FILTER': 'Out+Filter',
    };
    return labels[config.signalType] ?? config.signalType;
  });

  // Waveform panel resize state
  protected readonly waveformHeight = signal(168);
  private resizing = false;
  private resizeStartY = 0;
  private resizeStartH = 0;

  private readonly onResizeMove = (event: PointerEvent): void => {
    if (!this.resizing) return;
    event.preventDefault();
    const delta = event.clientY - this.resizeStartY;
    this.waveformHeight.set(Math.max(80, Math.min(440, this.resizeStartH + delta)));
  };

  private readonly onResizeEnd = (): void => {
    this.resizing = false;
    window.removeEventListener('pointermove', this.onResizeMove);
    window.removeEventListener('pointerup', this.onResizeEnd);
    window.removeEventListener('pointercancel', this.onResizeEnd);
  };

  protected startWaveformResize(event: PointerEvent): void {
    event.preventDefault();
    this.resizing = true;
    this.resizeStartY = event.clientY;
    this.resizeStartH = this.waveformHeight();
    window.addEventListener('pointermove', this.onResizeMove, { passive: false });
    window.addEventListener('pointerup', this.onResizeEnd);
    window.addEventListener('pointercancel', this.onResizeEnd);
  }

  // Analysis board height override (null = auto/flex fill, positive px = fixed + scrollable)
  protected readonly boardHeight = signal<number | null>(null);
  private boardResizing = false;
  private boardResizeStartY = 0;
  private boardResizeStartH = 0;

  private readonly onBoardResizeMove = (event: PointerEvent): void => {
    if (!this.boardResizing) return;
    event.preventDefault();
    const delta = event.clientY - this.boardResizeStartY;
    const next = this.boardResizeStartH + delta;
    this.boardHeight.set(Math.max(280, next));
  };

  private readonly onBoardResizeEnd = (): void => {
    this.boardResizing = false;
    window.removeEventListener('pointermove', this.onBoardResizeMove);
    window.removeEventListener('pointerup', this.onBoardResizeEnd);
    window.removeEventListener('pointercancel', this.onBoardResizeEnd);
  };

  protected startBoardResize(event: PointerEvent): void {
    event.preventDefault();
    this.boardResizing = true;
    this.boardResizeStartY = event.clientY;
    // Capture current rendered height or fallback to a sensible default
    const boardEl = document.querySelector('.analysis-board') as HTMLElement | null;
    this.boardResizeStartH = this.boardHeight() ?? (boardEl ? boardEl.getBoundingClientRect().height : 500);
    window.addEventListener('pointermove', this.onBoardResizeMove, { passive: false });
    window.addEventListener('pointerup', this.onBoardResizeEnd);
    window.addEventListener('pointercancel', this.onBoardResizeEnd);
  }
  protected readonly offlineAnalysisMessage = computed(() => {
    if (!this.isOfflineMode()) {
      return '';
    }

    const recording = this.recordingLibrary.selectedRecording();
    if (!recording) {
      return 'Capture a recording or load one from disk to inspect it offline.';
    }

    const compatibility = this.selectedRecordingCompatibility();
    if (compatibility && !compatibility.compatible) {
      return compatibility.reasons.join(' ');
    }

    return '';
  });
  protected readonly builtInPresetCount = computed(
    () => this.contextPresets().filter((preset) => preset.origin !== 'user').length,
  );
  protected readonly userPresetCount = computed(
    () => this.contextPresets().filter((preset) => preset.origin === 'user').length,
  );
  protected readonly canValidateSelectedDemo = computed(() => {
    if (!this.selectedDemoEntry() || !this.currentContextId() || !this.isOfflineMode()) {
      return false;
    }

    const compatibility = this.selectedRecordingCompatibility();
    return !compatibility || compatibility.compatible;
  });

  private contextCounter = 0;

  private generateContextId(): string {
    return `ctx-${++this.contextCounter}`;
  }

  constructor() {
    // Watch for recording position updates
    effect(() => {
      const mode = this.calculationManager.mode();
      const position = this.audioEngine.currentPosition();
      const ctxId = this.currentContextId();
      if (mode === 'live' && position > 0 && ctxId) {
        this.calculationManager.updatePosition(ctxId, position);
      }
    });

    // Copy recorded buffers into the shared calculation buffers
    effect(() => {
      const mode = this.calculationManager.mode();
      const recorded = this.audioEngine.recordedData();
      const ctxId = this.currentContextId();
      if (mode === 'live' && recorded && ctxId) {
        this.calculationManager.updateRecordedBuffers(ctxId, recorded, this.audioEngine.currentPosition());
      }
    });

    // When an offline recording is selected, lock the active source to that
    // recording's resolved source config, but leave the user-editable
    // `pendingSourceConfig` unchanged so the user can stage settings for the
    // next live recording.
    effect(() => {
      const mode = this.calculationManager.mode();
      const recording = this.recordingLibrary.selectedRecording();
      const preset = this.currentPreset();

      if (mode !== 'offline' || !preset || !recording || !recording.metadata.resolvedSource) {
        // Live mode (or no recording) → unlock and adopt pending as active.
        if (this.sessionState.activeSourceLocked()) {
          const promoted = this.sessionState.unlockAndPromotePending();
          if (promoted && !this.isSameSourceConfig(this.currentSourceConfig(), promoted)) {
            void this.loadPresetWithSource(preset!, promoted);
          }
        }
        return;
      }

      const desiredSource = resolvePresetSourceConfig(preset.source, recording.metadata.resolvedSource);
      if (!this.isSameSourceConfig(this.currentSourceConfig(), desiredSource)) {
        // Rebuild the worker context for the locked source, but mark it
        // locked so the source-settings panel keeps editing `pending`.
        void this.loadPresetWithSource(preset, desiredSource).then(() => {
          this.sessionState.lockActiveSource(desiredSource);
        });
      } else if (!this.sessionState.activeSourceLocked()) {
        this.sessionState.lockActiveSource(desiredSource);
      }
    });

    effect(() => {
      const mode = this.calculationManager.mode();
      const ctxId = this.currentContextId();
      const preset = this.currentPreset();
      const recording = this.recordingLibrary.selectedRecording();
      const recordingCursor = this.recordingLibrary.selectedRecordingCursor();

      if (mode !== 'offline' || !ctxId || !preset || !recording || recordingCursor === null) {
        return;
      }

      const compatibilityPreset = this.getEffectivePresetForCompatibility();
      if (!compatibilityPreset) {
        return;
      }

      const compatibility = this.recordingLibrary.getCompatibility(recording, compatibilityPreset);
      if (!compatibility.compatible) {
        return;
      }

      const decoded = this.recordingLibrary.getDecodedArchive(recording);
      this.calculationManager.updateExcitationSignals(ctxId, decoded.excitationChannels);
      this.calculationManager.updateRecordedBuffers(ctxId, decoded.recordedChannels, recordingCursor);
      // Force recompute: in offline/review mode the worker's
      // updateContext() short-circuits when currentPosition is unchanged.
      // Switching to a different recording with the same cursor would then
      // silently keep the previous frames on screen.
      this.calculationManager.triggerCalculation(true);
    });

    effect(() => {
      this.selectedDemoId();
      this.currentContextId();
      this.offlinePositionRatio();
      this.demoValidation.reset();
    });
  }

  async ngOnInit(): Promise<void> {
    // Wire the offline-cursor flusher so the throttle in SessionStateService can
    // forward coalesced drag values to the recording library.
    this.sessionState.registerOfflineFlusher((ratio) => {
      this.recordingLibrary.setOfflinePositionRatio(ratio);
    });

    // Load presets from YAML files
    try {
      this.contextPresets.set(await this.presetLibrary.loadPresets());
    } catch (error) {
      console.error('Failed to load presets from YAML:', error);
      return;
    }

    if (this.contextPresets().length === 0) {
      console.error('No presets loaded from YAML files');
      return;
    }

    // Initialize with default preset (Room Analysis or first available)
    const defaultPreset = this.presetLibrary.getDefaultPreset();
    if (defaultPreset) {
      await this.loadPreset(defaultPreset);
    }

    // Wait for IDB hydration to complete, then auto-switch to offline mode
    // if the library already has recordings from a previous session.
    await this.recordingLibrary.waitForReady();
    if (this.recordingLibrary.recordings().length > 0) {
      await this.topBar?.setAnalysisMode('offline');
    }

    void this.demoCatalog.loadCatalog();
  }

  async loadPreset(preset: ContextPreset): Promise<void> {
    return this.loadPresetWithSource(preset);
  }

  protected async updateSourceConfig(sourceConfig: ResolvedSourceConfig): Promise<void> {
    const preset = this.currentPreset();
    if (!preset) {
      return;
    }

    if (this.isSameSourceConfig(this.currentSourceConfig(), sourceConfig)) {
      // Structural identity check above ignores fields like `waveFile`,
      // `mediaFile` and `multiSource`. Push the new reference so consumers
      // that read those fields (signal regeneration, audio engine) pick up
      // the change without rebuilding the entire calculation context.
      this.sessionState.activeSourceConfig.set(sourceConfig);
      return;
    }

    await this.loadPresetWithSource(preset, sourceConfig);
  }

  private async loadPresetWithSource(
    preset: ContextPreset,
    sourceOverride?: Partial<ResolvedSourceConfig>,
  ): Promise<void> {
    const oldContextId = this.currentContextId();
    const newContextId = this.generateContextId();
    const resolvedSource = resolvePresetSourceConfig(preset.source, sourceOverride);

    // Initialize context with a fresh unique ID
    await this.calculationManager.initContext(
      newContextId,
      {
        nc: resolvedSource.circularLength,
        n_y: preset.settings.n_y,
      },
      preset.script,
      resolvedSource.outputChannelCount,
    );

    // Update current context ID first — this triggers the template to rebuild
    // split-panes with new contextId, which in turn creates new canvas components
    this.currentContextId.set(newContextId);

    // Update layout to match preset
    this.layoutTree.set(preset.layout);

    this.sessionState.applyPresetReset(preset, resolvedSource);

    // Preserve the currently selected analysis mode across preset switches.
    this.calculationManager.setMode(this.calculationManager.mode());

    // Destroy the old context (worker will clean up canvases)
    if (oldContextId) {
      this.calculationManager.destroyContext(oldContextId);
    }
  }

  async switchPreset(presetId: string): Promise<void> {
    const preset = this.contextPresets().find(p => p.id === presetId);
    if (!preset) {
      console.warn('Preset not found:', presetId);
      return;
    }
    
    await this.loadPreset(preset);
  }

  protected async selectRecording(recordingId: string): Promise<void> {
    // Locate the recording in the library *before* selecting so we can choose
    // the appropriate preset to switch to. Saved recordings remember the
    // preset they were captured with via `metadata.preset.id`; if that preset
    // still exists in the library we switch to it first so the analysis
    // pipeline (script, layout, defaults) matches the recording. The
    // offline-recording effect then locks the source config from the
    // recording's `resolvedSource`.
    const target = this.recordingLibrary.recordings()
      .find((entry) => entry.metadata.id === recordingId);
    const targetPresetId = target?.metadata.preset?.id ?? null;
    if (targetPresetId && targetPresetId !== this.currentPreset()?.id) {
      const targetPreset = this.contextPresets()
        .find((candidate) => candidate.id === targetPresetId);
      if (targetPreset) {
        await this.loadPreset(targetPreset);
      }
    }

    this.recordingLibrary.selectRecording(recordingId);
    // Make sure we are in offline/review mode after picking a library entry.
    if (this.calculationManager.mode() !== 'offline') {
      await this.topBar?.setAnalysisMode('offline');
    }
  }

  protected deleteRecording(recordingId: string): void {
    this.recordingLibrary.deleteRecording(recordingId);
  }

  protected markRecordingSaved(recordingId: string): void {
    this.recordingLibrary.markRecordingSaved(recordingId);
  }

  protected renameRecording(payload: { id: string; name: string }): void {
    this.recordingLibrary.renameRecording(payload.id, payload.name);
  }

  protected exportWorkspace(): void {
    const exported = this.recordingLibrary.exportWorkspace();
    if (exported) {
      this.clearWorkspaceConfirmOpen.set(true);
    }
  }

  protected async importWorkspace(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.multiple = false;

    const files = await new Promise<File[]>((resolve) => {
      input.onchange = () => resolve(Array.from(input.files ?? []));
      input.click();
    });

    if (files.length === 0) {
      return;
    }

    try {
      const imported = await this.recordingLibrary.importWorkspaceFile(files[0]);
      if (imported > 0) {
        await this.topBar?.setAnalysisMode('offline');
      }
    } catch (error) {
      console.error('Workspace import failed:', error);
    }
  }

  protected confirmClearWorkspace(): void {
    this.recordingLibrary.clearWorkspace();
    this.clearWorkspaceConfirmOpen.set(false);
  }

  protected updateOfflinePosition(positionRatio: number): void {
    this.sessionState.requestOfflinePositionRatio(positionRatio);
  }

  protected stepOfflinePosition(direction: number): void {
    this.recordingLibrary.stepOfflinePosition(direction);
  }

  protected async validateSelectedDemo(): Promise<void> {
    const entry = this.selectedDemoEntry();
    const contextId = this.currentContextId();
    if (!entry || !contextId) {
      return;
    }

    try {
      await this.demoValidation.validateDemo(entry, contextId);
    } catch (error) {
      console.error('Demo validation failed:', error);
    }
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected async onSidebarModeChange(mode: 'live' | 'offline'): Promise<void> {
    await this.topBar?.setAnalysisMode(mode);
  }

  protected async loadDemoRecording(entryId: string): Promise<void> {
    const entry = this.demoEntries().find((candidate) => candidate.id === entryId);
    if (!entry) {
      return;
    }

    const targetPreset = entry.presetIds
      .map((presetId) => this.contextPresets().find((candidate) => candidate.id === presetId) ?? null)
      .find((candidate): candidate is ContextPreset => candidate !== null);

    if (targetPreset && targetPreset.id !== this.currentPreset()?.id) {
      await this.loadPreset(targetPreset);
    }

    const archive = await this.demoCatalog.loadArchive(entryId);
    this.recordingLibrary.loadBuiltInArchive(entryId, archive);
    this.calculationManager.setMode('offline');
    this.demoValidation.reset();
  }

  protected saveCurrentPreset(preferredName: string): void {
    const preset = this.currentPreset();
    if (!preset) {
      return;
    }

    const savedPreset = this.presetLibrary.savePreset(this.buildPresetSnapshot(preset), preferredName);
    this.refreshPresetList();
    this.currentPreset.set(savedPreset);
  }

  protected async importPreset(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml,text/yaml';
    input.multiple = true;

    const files = await new Promise<File[]>((resolve) => {
      input.onchange = () => resolve(Array.from(input.files ?? []));
      input.click();
    });

    if (files.length === 0) {
      return;
    }

    let firstImportedPreset: ContextPreset | null = null;
    for (const file of files) {
      const importedPreset = await this.presetLibrary.importPresetFile(file);
      firstImportedPreset ??= importedPreset;
    }

    this.refreshPresetList();

    if (firstImportedPreset) {
      await this.loadPreset(firstImportedPreset);
    }
  }

  protected exportCurrentPreset(): void {
    const preset = this.currentPreset();
    if (!preset) {
      return;
    }

    this.presetLibrary.downloadPreset(this.buildPresetSnapshot(preset));
  }

  protected async deleteCurrentPreset(): Promise<void> {
    const preset = this.currentPreset();
    if (!preset || preset.origin !== 'user') {
      return;
    }

    if (!this.presetLibrary.deleteUserPreset(preset.id)) {
      return;
    }

    this.refreshPresetList();

    const fallbackPreset = this.presetLibrary.getDefaultPreset() ?? this.contextPresets()[0] ?? null;
    if (fallbackPreset) {
      await this.loadPreset(fallbackPreset);
    }
  }

  private refreshPresetList(): void {
    this.contextPresets.set(this.presetLibrary.getPresets());
  }

  private getEffectivePresetForCompatibility(): ContextPreset | null {
    const preset = this.currentPreset();
    const sourceConfig = this.currentSourceConfig();
    if (!preset || !sourceConfig) {
      return preset;
    }

    return {
      ...preset,
      signalType: sourceConfig.signalType,
      source: {
        ...preset.source,
        defaults: sourceConfig,
      },
      settings: {
        ...preset.settings,
        nc: sourceConfig.circularLength,
      },
    };
  }

  private isSameSourceConfig(
    current: ResolvedSourceConfig | null,
    candidate: ResolvedSourceConfig | undefined,
  ): boolean {
    if (!current || !candidate) {
      return false;
    }

    return current.signalType === candidate.signalType
      && current.circularLength === candidate.circularLength
      && current.logicalSourceCount === candidate.logicalSourceCount
      && current.outputChannelCount === candidate.outputChannelCount
      && current.routingMode === candidate.routingMode
      && (current.zadoffChuRoot ?? 1) === (candidate.zadoffChuRoot ?? 1);
  }

  private buildPresetSnapshot(preset: ContextPreset): ContextPreset {
    const contextId = this.currentContextId();
    const context = contextId ? this.calculationManager.getContext(contextId) : null;
    const sourceDefaults = resolvePresetSourceConfig(
      preset.source,
      this.currentSourceConfig() ?? preset.source.defaults,
    );

    if (!context) {
      return {
        ...preset,
        signalType: sourceDefaults.signalType,
        source: {
          ...preset.source,
          defaults: sourceDefaults,
        },
        settings: {
          nc: sourceDefaults.circularLength,
          n_y: preset.settings.n_y,
        },
      };
    }

    return {
      ...preset,
      signalType: sourceDefaults.signalType,
      source: {
        ...preset.source,
        defaults: sourceDefaults,
      },
      script: context.definition.script,
      settings: {
        nc: sourceDefaults.circularLength,
        n_y: context.definition.settings.n_y,
      },
    };
  }

  ngOnDestroy(): void {
    this.onResizeEnd();
  }
}
