import { Component, OnInit, computed, inject, input, output, ViewChild, signal, model, HostListener, ElementRef } from '@angular/core';
import { AudioEngineService } from '../../services/audio-engine.service';
import { RecordingLibraryService } from '../../services/recording-library.service';
import { ThemeService } from '../../services/theme.service';
import { WasmService } from '../../services/wasm.service';
import { CalculationManagerService } from '../../services/calculation-manager.service';
import { ContextPreset } from '../../models/context-presets';
import {
  RecordingCaptureMode,
  RecordingResolvedSourceConfig,
  RecordingSourceType,
} from '../../models/recording-archive';
import {
  ALL_PRESET_SIGNAL_TYPES,
  PresetSignalType,
  ResolvedSourceConfig,
  SourceRoutingMode,
  WaveFileSourceMetadata,
  resolvePresetSourceConfig,
} from '../../models/source-config';
import { SettingsDialogComponent } from '../settings-dialog/settings-dialog';
import { SessionStateService } from '../../services/session-state.service';
import { FormsModule } from '@angular/forms';

import * as wasm from '../../../assets/wasm/audio_circlelyzer_wasm.js';

export type SyntheticType = 'white_noise' | 'pink_noise' | 'wave_file' | 'output_with_filter';
type AnalysisMode = 'live' | 'offline';

@Component({
  selector: 'app-top-bar',
  imports: [SettingsDialogComponent, FormsModule],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.scss'
})
export class TopBarComponent implements OnInit {
  audioEngine = inject(AudioEngineService);
  recordingLibrary = inject(RecordingLibraryService);
  themeService = inject(ThemeService);
  wasmService = inject(WasmService);
  calculationManager = inject(CalculationManagerService);
  sessionState = inject(SessionStateService);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  
  @ViewChild(SettingsDialogComponent) settingsDialog!: SettingsDialogComponent;

  // Inputs
  contextPresets = input<ContextPreset[]>([]);
  currentPreset = input<ContextPreset | null>(null);
  currentSourceConfig = input<ResolvedSourceConfig | null>(null);
  
  // Outputs
  presetChanged = output<string>();
  sourceConfigChanged = output<ResolvedSourceConfig>();
  sidebarToggleRequested = output<void>();
  
  sourceSettingsOpen = model(false);

  readonly builtInPresets = computed(() => this.contextPresets().filter((preset) => preset.origin !== 'user'));
  readonly userPresets = computed(() => this.contextPresets().filter((preset) => preset.origin === 'user'));

  // Simulated recording
  selectedSyntheticType = model<SyntheticType>('white_noise');

  // ── Session-level signals are owned by SessionStateService (Issue 1 /
  // ARCHITECTURE.md §2). The fields below alias the service signals so
  // existing template/component references continue to work; mutating these
  // signals from the UI flows through to the worker via service effects.
  readonly isMuted = this.sessionState.isMuted;
  readonly simulationMode = this.sessionState.simulationMode;
  readonly nAverage = this.sessionState.nAverage;
  /**
   * True when the active source config is locked to the currently-selected
   * offline recording. Lock-affecting controls (buffer size, signal type,
   * channel routing/count, wave file) remain user-editable but mutate the
   * `pendingSourceConfig` only — they take effect on the next new recording.
   * The locked active config is summarised in the banner so the user can see
   * what the currently-selected recording was made with. Settings that only
   * affect display/analysis (averaging, position offset, active frequency
   * range) edit the live worker state directly regardless of lock.
   */
  readonly sourceLocked = this.sessionState.activeSourceLocked;
  /**
   * Source config the source-settings buttons should highlight & mutate.
   * When locked → `pendingSourceConfig` (staged for next recording).
   * When unlocked → the active config (which equals pending in live mode).
   */
  readonly editableSourceConfig = computed<ResolvedSourceConfig | null>(() => {
    if (this.sourceLocked()) {
      return this.sessionState.pendingSourceConfig() ?? this.sessionState.activeSourceConfig();
    }
    return this.currentSourceConfig();
  });
  /** Pretty-formatted summary of the *locked* active source (the recording's settings). */
  readonly lockedSourceSummary = computed(() => {
    const cfg = this.sessionState.activeSourceConfig();
    if (!cfg) return [] as { label: string; value: string }[];
    const sampleRate = this.audioEngine.isInitialized() ? this.audioEngine.getSampleRate() : 48000;
    const items: { label: string; value: string }[] = [
      { label: 'Buffer', value: `${this.formatBufferDuration(cfg.circularLength, sampleRate)} (${cfg.circularLength} smp)` },
      { label: 'Signal', value: this.formatSignalType(cfg.signalType) },
      { label: 'Routing', value: cfg.routingMode === 'direct' ? 'Direct outputs' : 'Mirrored mono' },
      { label: 'Outputs', value: `${cfg.outputChannelCount} ch` },
    ];
    if (cfg.signalType === 'WAVE_FILE' && cfg.waveFile?.fileName) {
      items.push({ label: 'Wave file', value: cfg.waveFile.fileName });
    }
    return items;
  });
  /** Pretty-formatted summary of the *pending* (staged-for-next-recording) source. */
  readonly pendingSourceSummary = computed(() => {
    const cfg = this.sessionState.pendingSourceConfig();
    if (!cfg) return [] as { label: string; value: string }[];
    const sampleRate = this.audioEngine.isInitialized() ? this.audioEngine.getSampleRate() : 48000;
    const items: { label: string; value: string }[] = [
      { label: 'Buffer', value: `${this.formatBufferDuration(cfg.circularLength, sampleRate)} (${cfg.circularLength} smp)` },
      { label: 'Signal', value: this.formatSignalType(cfg.signalType) },
      { label: 'Routing', value: cfg.routingMode === 'direct' ? 'Direct outputs' : 'Mirrored mono' },
      { label: 'Outputs', value: `${cfg.outputChannelCount} ch` },
    ];
    if (cfg.signalType === 'WAVE_FILE' && cfg.waveFile?.fileName) {
      items.push({ label: 'Wave file', value: cfg.waveFile.fileName });
    }
    return items;
  });
  private readonly N_AVERAGE_CHOICES = [1, 2, 4, 8, 16, 32, 64];

  // Standard circular buffer sizes (powers of 2). Filtered by preset constraints when present.
  private readonly STANDARD_CIRCULAR_LENGTHS: number[] = [
    1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288,
  ];

  // Position offset (0–1 proportion of the circular buffer to look back)
  readonly positionOffset = this.sessionState.positionOffset;

  readonly offsetLabel = computed(() => `${Math.round(this.positionOffset() * 100)}%`);

  // ── Active analysis frequency range ────────────────────────────────────
  // Stored as actual Hz; the dual-handle UI uses log10(Hz) as the slider
  // value and converts back on input. Defaults to a wide audio range; on
  // preset load we reseed from `defaultFrequencyRange` when present.
  readonly freqRangeLow = this.sessionState.freqRangeLow;
  readonly freqRangeHigh = this.sessionState.freqRangeHigh;
  /** Absolute upper bound = sample rate / 2 (Nyquist). */
  readonly freqRangeMaxHz = computed(() => {
    const sr = this.audioEngine.isInitialized() ? this.audioEngine.getSampleRate() : 48000;
    return sr / 2;
  });
  readonly freqRangeMinHz = 10; // hard floor of the slider track
  readonly freqRangeLowLog = computed(() => Math.log10(Math.max(this.freqRangeMinHz, this.freqRangeLow())));
  readonly freqRangeHighLog = computed(() => Math.log10(Math.max(this.freqRangeMinHz, this.freqRangeHigh())));
  readonly freqRangeMinLog = computed(() => Math.log10(this.freqRangeMinHz));
  readonly freqRangeMaxLog = computed(() => Math.log10(this.freqRangeMaxHz()));
  readonly freqRangeLabel = computed(() => `${this.formatHz(this.freqRangeLow())}–${this.formatHz(this.freqRangeHigh())}`);
  /** Position of each handle along the dual-range track, in percent.
   *  Used to draw the highlighted "selected band" between the thumbs. */
  readonly freqRangeLowPct = computed(() => {
    const span = this.freqRangeMaxLog() - this.freqRangeMinLog();
    if (span <= 0) return 0;
    return ((this.freqRangeLowLog() - this.freqRangeMinLog()) / span) * 100;
  });
  readonly freqRangeHighPct = computed(() => {
    const span = this.freqRangeMaxLog() - this.freqRangeMinLog();
    if (span <= 0) return 100;
    return ((this.freqRangeHighLog() - this.freqRangeMinLog()) / span) * 100;
  });

  private formatHz(hz: number): string {
    if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`;
    return `${Math.round(hz)} Hz`;
  }

  readonly syntheticTypeOptions: { value: SyntheticType; label: string }[] = [
    { value: 'white_noise', label: 'White Noise' },
    { value: 'pink_noise', label: 'Pink Noise' },
    { value: 'wave_file', label: 'Wave File' },
    { value: 'output_with_filter', label: 'Output + Filter' },
  ];

  readonly syntheticTypeLabels: Record<SyntheticType, string> = {
    white_noise: 'White',
    pink_noise: 'Pink',
    wave_file: 'WAV',
    output_with_filter: 'Out+Filt',
  };

  readonly currentModeIcon = computed(() => this.isOnlineMode() ? '⏵' : '◌');
  readonly currentModeLabel = computed(() => this.isOnlineMode() ? 'Online' : 'Offline');
  readonly presetOriginLabel = computed(() => this.currentPreset()?.origin === 'user' ? 'User preset' : 'Built-in preset');
  readonly transportStatusLabel = computed(() => {
    if (this.audioEngine.isRecording()) {
      return 'Recording';
    }

    if (this.audioEngine.isSimulatedRecording()) {
      return 'Simulating';
    }

    if (this.audioEngine.isPlaying()) {
      return 'Playing';
    }

    return this.isOnlineMode() ? 'Ready' : 'Offline';
  });
  readonly signalTypeOptions = computed(() => {
    const preset = this.currentPreset();
    const allowed = preset?.source.supportedSignalTypes ?? ALL_PRESET_SIGNAL_TYPES;
    // Issue 2 / ARCHITECTURE.md §4: enforce preset.source.multiSource.enabled.
    const multiOk = preset?.source.multiSource?.enabled ?? false;
    return allowed
      .filter((signalType) => multiOk || signalType !== 'MULTI_SOURCE_WHITE')
      .map((signalType) => ({
        value: signalType,
        label: this.formatSignalType(signalType),
      }));
  });
  readonly routingModeOptions = computed(() => {
    const preset = this.currentPreset();
    if (!preset) {
      return [];
    }

    // Routing mode is no longer constrained per-preset in the simplified model.
    const routingModes: SourceRoutingMode[] = ['mirrored_mono', 'direct'];
    return routingModes.map((routingMode) => ({
      value: routingMode,
      label: routingMode === 'direct' ? 'Direct Outputs' : 'Mirrored Mono',
    }));
  });
  readonly outputChannelCountOptions = computed(() => {
    const preset = this.currentPreset();
    const activeSource = this.getActiveSourceConfig();
    if (!preset && !activeSource) {
      return [];
    }

    // Output-channel-count is no longer constrained per-preset in the
    // simplified model — offer everything up to the engine's max.
    const max = Math.max(2, this.audioEngine.getMaxOutputChannelCount());
    const counts: number[] = [];
    for (let n = 1; n <= max; n += 1) {
      counts.push(n);
    }
    return counts.map((count) => ({
      value: count,
      label: `${count} out`,
    }));
  });

  /** Buffer-size choices: standard powers-of-two list (1024..524288) per v1 spec.
   *  Filtered by the preset's `supportedCircularLengths` when present. */
  readonly bufferSizeOptions = computed(() => {
    const sampleRate = this.audioEngine.isInitialized() ? this.audioEngine.getSampleRate() : 48000;
    const allowed = this.currentPreset()?.source.supportedCircularLengths;
    const lengths = (allowed && allowed.length > 0)
      ? this.STANDARD_CIRCULAR_LENGTHS.filter((v) => allowed.includes(v))
      : this.STANDARD_CIRCULAR_LENGTHS;
    return lengths.map((value) => ({
      value,
      sampleLabel: `${value} smp`,
      durationLabel: this.formatBufferDuration(value, sampleRate),
    }));
  });

  /**
   * n_average choices. Each value is disabled when it exceeds the preset's `n_y`
   * (number of cycles in the live circular buffer); only those many cycles can
   * be coherently averaged.
   */
  readonly nAverageOptions = computed(() => {
    const nY = Math.max(1, this.currentPreset()?.settings.n_y ?? 1);
    return this.N_AVERAGE_CHOICES.map((value) => ({
      value,
      label: value === 1 ? 'Off' : `×${value}`,
      disabled: value > nY,
    }));
  });

  /** Compact summary of the active source config, shown in the top-bar source button. */
  readonly compactSourceSummary = computed(() => {
    const cfg = this.getActiveSourceConfig();
    if (!cfg) {
      return 'No source';
    }
    const sampleRate = this.audioEngine.isInitialized() ? this.audioEngine.getSampleRate() : 48000;
    const parts: string[] = [
      this.formatBufferDuration(cfg.circularLength, sampleRate),
      this.formatSignalType(cfg.signalType),
      cfg.routingMode === 'direct' ? `${cfg.outputChannelCount}×direct` : `${cfg.outputChannelCount}×mono`,
    ];
    const avg = this.nAverage();
    if (avg > 1) {
      parts.push(`avg ×${avg}`);
    }
    return parts.join(' · ');
  });

  /** Line 1 of the multiline source button: signal type. */
  readonly sourceSummaryLine1 = computed(() => {
    const cfg = this.getActiveSourceConfig();
    if (!cfg) return 'No source';
    return `${this.formatSignalType(cfg.signalType)}`;
  });

  /** Line 2 of the multiline source button: duration. */
  readonly sourceSummaryLine2 = computed(() => {
    const cfg = this.getActiveSourceConfig();
    if (!cfg) return '---';
    const sampleRate = this.audioEngine.isInitialized() ? this.audioEngine.getSampleRate() : 48000;
    return `${this.formatBufferDuration(cfg.circularLength, sampleRate)}`;
  });

  /** Line 3 of the multiline source button: channel routing (and optional avg). */
  readonly sourceSummaryLine3 = computed(() => {
    const cfg = this.getActiveSourceConfig();
    if (!cfg) return '';
    const channelStr = cfg.routingMode === 'direct'
      ? `${cfg.outputChannelCount}×direct`
      : `${cfg.outputChannelCount}×mono`;
    const avg = this.nAverage();
    return avg > 1 ? `${channelStr} · avg×${avg}` : channelStr;
  });

  readonly sourceChannelSummary = computed(() => {
    const sourceConfig = this.getActiveSourceConfig();
    if (!sourceConfig) {
      return '';
    }

    return `${sourceConfig.logicalSourceCount} -> ${sourceConfig.outputChannelCount}`;
  });
  readonly isWaveFileSourceActive = computed(() => this.getActiveSourceConfig()?.signalType === 'WAVE_FILE');
  readonly sourceGroupLabel = computed(() => {
    // Source-group concept removed; show the active signal type instead.
    const sourceConfig = this.getActiveSourceConfig();
    return sourceConfig ? this.formatSignalType(sourceConfig.signalType) : 'Source';
  });
  readonly sourcePrimaryLabel = computed(() => {
    const sourceConfig = this.getActiveSourceConfig();
    return sourceConfig ? this.formatSignalType(sourceConfig.signalType) : 'Not configured';
  });
  readonly sourceSecondaryLabel = computed(() => {
    const sourceConfig = this.getActiveSourceConfig();
    if (!sourceConfig) {
      return 'Open source settings';
    }

    return `${this.formatRoutingMode(sourceConfig.routingMode)} · ${sourceConfig.outputChannelCount} out · ${sourceConfig.circularLength} smp`;
  });
  readonly waveFileMetadata = computed(() => {
    if (!this.isWaveFileSourceActive()) {
      return null;
    }

    return this.getActiveSourceConfig()?.waveFile ?? this.selectedWaveFileMetadata;
  });
  readonly waveFileDisplayName = computed(() => this.waveFileMetadata()?.fileName ?? 'No wave file linked');
  readonly waveFileStatus = computed(() => {
    const metadata = this.waveFileMetadata();
    if (!metadata) {
      return 'Select a wave file to drive this preset.';
    }

    const details = [
      `${metadata.channelCount} ch`,
      `${(metadata.sampleRate / 1000).toFixed(metadata.sampleRate % 1000 === 0 ? 0 : 1)} kHz`,
      this.formatWaveFileDuration(metadata.frameCount / Math.max(metadata.sampleRate, 1)),
    ];

    if (!this.canReuseSelectedWaveFile(metadata)) {
      details.push('relink required');
    }

    return details.join(' · ');
  });
  readonly waveFileActionLabel = computed(() => {
    const metadata = this.waveFileMetadata();
    if (!metadata) {
      return 'Select file';
    }

    return this.canReuseSelectedWaveFile(metadata) ? 'Change file' : 'Relink file';
  });

  private signal: Float32Array[] | null = null;  // Now multichannel
  private selectedWaveFile: File | null = null;
  private selectedWaveFileMetadata: WaveFileSourceMetadata | null = null;
  private activeRecordingMetadata: {
    captureMode: RecordingCaptureMode;
    resolvedSource: RecordingResolvedSourceConfig;
  } | null = null;

  constructor() {
  }

  async ngOnInit() {
    // Initialize services
    await this.wasmService.initialize();
    
    // Wait for an active context to be created (poll with timeout)
    let activeId = this.calculationManager.activeContextId();
    let context = activeId ? this.calculationManager.getContext(activeId) : undefined;
    let attempts = 0;
    while (!context && attempts < 50) { // Wait up to 5 seconds
      await new Promise(resolve => setTimeout(resolve, 100));
      activeId = this.calculationManager.activeContextId();
      context = activeId ? this.calculationManager.getContext(activeId) : undefined;
      attempts++;
    }
    
    const preset = this.currentPreset();
    if (!preset) {
      console.error('No current preset available');
      return;
    }
    
    // Generate signal based on preset
    await this.generateSignal(this.getActiveSourceConfig() ?? preset.source.defaults, this.audioEngine.getSampleRate());
    
    const sharedBuffers = context?.sharedBuffers;
    
    // sampleRate is determined by WebAudio's AudioContext (default 48000)
    await this.audioEngine.initialize(
      48000,
      (this.getActiveSourceConfig() ?? preset.source.defaults).circularLength,
      sharedBuffers,
    );

    // Seed the global active frequency range from the preset's default.
    this.sessionState.applyPresetFrequencyRange(preset);
  }

  isOnlineMode(): boolean {
    return this.calculationManager.mode() === 'live';
  }

  async setAnalysisMode(mode: AnalysisMode): Promise<void> {
    if (this.calculationManager.mode() === mode) {
      return;
    }

    if (mode === 'offline') {
      await this.stopLiveAudioActions();
    }

    this.calculationManager.setMode(mode);
  }

  canPlay(): boolean {
    return this.isOnlineMode() && this.audioEngine.isInitialized() && this.signal !== null;
  }

  canRecord(): boolean {
    // Record can always be initiated when the audio engine is ready;
    // pressing the button auto-engages live mode (see onMainRecordPress).
    return this.audioEngine.isInitialized();
  }

  toggleMute(): void {
    const nowMuted = !this.isMuted();
    this.isMuted.set(nowMuted);
    // While recording: mute pauses playback, unmute resumes it
    if (this.audioEngine.isRecording() || this.audioEngine.isSimulatedRecording()) {
      if (nowMuted && this.audioEngine.isPlaying()) {
        this.audioEngine.stopPlayback();
      } else if (!nowMuted && !this.audioEngine.isPlaying() && this.signal) {
        this.audioEngine.startPlayback(this.signal);
      }
    }
  }

  async onMainRecordPress(): Promise<void> {
    if (this.audioEngine.isRecording()) {
      const metadata = this.activeRecordingMetadata;
      if (this.audioEngine.isPlaying()) {
        await this.audioEngine.stopPlayback();
      }
      await this.audioEngine.stopRecording();
      this.activeRecordingMetadata = null;
      if (metadata) {
        await this.captureRecordingArchive(metadata.captureMode, metadata.resolvedSource);
      }
      // Recording finished → drop back to review mode automatically.
      this.calculationManager.setMode('offline');
      return;
    }
    // Start mic recording + playback (unless muted)
    const sourceConfig = this.getActiveSourceConfig();
    if (!sourceConfig) return;
    // Pressing record always engages live mode.
    this.calculationManager.setMode('live');
    this.activeRecordingMetadata = {
      captureMode: 'microphone',
      resolvedSource: this.toRecordingResolvedSource(sourceConfig),
    };
    await this.audioEngine.startRecording();
    if (!this.isMuted() && this.signal) {
      await this.audioEngine.startPlayback(this.signal);
    }
  }

  requestSidebarToggle(): void {
    this.sidebarToggleRequested.emit();
  }

  openSourceSettings(): void {
    this.sourceSettingsOpen.set(true);
  }

  closeSourceSettings(): void {
    this.sourceSettingsOpen.set(false);
  }

  async togglePlayback() {
    if (this.audioEngine.isPlaying()) {
      await this.audioEngine.stopPlayback();
    } else if (this.signal) {
      await this.audioEngine.startPlayback(this.signal);
    }
  }

  async toggleRecording() {
    if (this.audioEngine.isRecording()) {
      const metadata = this.activeRecordingMetadata;
      await this.audioEngine.stopRecording();
      this.activeRecordingMetadata = null;
      if (metadata) {
        await this.captureRecordingArchive(metadata.captureMode, metadata.resolvedSource);
      }
      this.calculationManager.setMode('offline');
    } else {
      const sourceConfig = this.getActiveSourceConfig();
      if (!sourceConfig) {
        return;
      }

      this.calculationManager.setMode('live');
      this.activeRecordingMetadata = {
        captureMode: 'microphone',
        resolvedSource: this.toRecordingResolvedSource(sourceConfig),
      };
      await this.audioEngine.startRecording();
    }
  }

  async onPresetChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const presetId = select.value;
    const preset = this.contextPresets().find(p => p.id === presetId);
    
    if (!preset) {
      console.error('Preset not found:', presetId);
      return;
    }
    
    // Wait for new context to be created
    this.presetChanged.emit(presetId);
    
    // Wait a bit for context to be created
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Regenerate signal based on new preset
    await this.generateSignal(
      this.getActiveSourceConfig() ?? resolvePresetSourceConfig(preset.source, preset.source.defaults),
      this.audioEngine.getSampleRate(),
    );
    
    // Update audio engine with new shared buffers
    const activeContextId = this.calculationManager.activeContextId();
    const context = activeContextId ? this.calculationManager.getContext(activeContextId) : undefined;
    if (context?.sharedBuffers) {
      this.audioEngine.updateSharedBuffers(
        context.sharedBuffers,
        (this.getActiveSourceConfig() ?? preset.source.defaults).circularLength,
      );
    }
    
    // Restart playback if currently playing
    if (this.audioEngine.isPlaying() && this.signal) {
      await this.audioEngine.stopPlayback();
      await this.audioEngine.startPlayback(this.signal);
    }

    // Re-seed the global active frequency range from the new preset's default.
    this.sessionState.applyPresetFrequencyRange(preset);
  }

  /** Called from the preset-selector dropdown. Closes the <details> immediately. */
  async selectPreset(presetId: string, dropdown?: HTMLDetailsElement): Promise<void> {
    dropdown?.removeAttribute('open');
    const preset = this.contextPresets().find(p => p.id === presetId);
    if (!preset) return;

    this.presetChanged.emit(presetId);
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.generateSignal(
      this.getActiveSourceConfig() ?? resolvePresetSourceConfig(preset.source, preset.source.defaults),
      this.audioEngine.getSampleRate(),
    );
    const activeContextId = this.calculationManager.activeContextId();
    const context = activeContextId ? this.calculationManager.getContext(activeContextId) : undefined;
    if (context?.sharedBuffers) {
      this.audioEngine.updateSharedBuffers(
        context.sharedBuffers,
        (this.getActiveSourceConfig() ?? preset.source.defaults).circularLength,
      );
    }
    if (this.audioEngine.isPlaying() && this.signal) {
      await this.audioEngine.stopPlayback();
      await this.audioEngine.startPlayback(this.signal);
    }

    // Re-seed the global active frequency range from the new preset's default.
    this.sessionState.applyPresetFrequencyRange(preset);
  }

  /** Called from the offset slider on every input event. Throttled in SessionStateService. */
  onOffsetSliderInput(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.sessionState.requestPositionOffset(value);
  }

  /** Frequency-range slider handlers. The slider value is log10(Hz); converted
   *  back to Hz, ordering clamped, then throttled via SessionStateService. */
  onFreqLowSliderInput(event: Event): void {
    const logHz = parseFloat((event.target as HTMLInputElement).value);
    let hz = Math.pow(10, logHz);
    const high = this.freqRangeHigh();
    if (hz >= high * 0.99) hz = high * 0.99;
    if (hz < this.freqRangeMinHz) hz = this.freqRangeMinHz;
    this.sessionState.requestFrequencyRange(hz, high);
  }

  onFreqHighSliderInput(event: Event): void {
    const logHz = parseFloat((event.target as HTMLInputElement).value);
    let hz = Math.pow(10, logHz);
    const low = this.freqRangeLow();
    if (hz <= low * 1.01) hz = low * 1.01;
    const max = this.freqRangeMaxHz();
    if (hz > max) hz = max;
    this.sessionState.requestFrequencyRange(low, hz);
  }


  private async stopLiveAudioActions(): Promise<void> {
    const metadata = this.activeRecordingMetadata;

    if (this.audioEngine.isPlaying()) {
      await this.audioEngine.stopPlayback();
    }

    if (this.audioEngine.isSimulatedRecording()) {
      await this.audioEngine.stopSimulatedRecording();
      this.activeRecordingMetadata = null;
      if (metadata) {
        await this.captureRecordingArchive(metadata.captureMode, metadata.resolvedSource);
      }
      return;
    }

    if (this.audioEngine.isRecording()) {
      await this.audioEngine.stopRecording();
      this.activeRecordingMetadata = null;
      if (metadata) {
        await this.captureRecordingArchive(metadata.captureMode, metadata.resolvedSource);
      }
    }
  }

  async onSignalTypeChange(event: Event): Promise<void> {
    const preset = this.currentPreset();
    const current = this.getActiveSourceConfig();
    if (!preset || !current) {
      return;
    }

    const signalType = (event.target as HTMLSelectElement).value as PresetSignalType;
    await this.applySourceConfigChange({
      ...current,
      signalType,
    }, preset);
  }

  async onRoutingModeChange(event: Event): Promise<void> {
    const preset = this.currentPreset();
    const current = this.getActiveSourceConfig();
    if (!preset || !current) {
      return;
    }

    const routingMode = (event.target as HTMLSelectElement).value as SourceRoutingMode;
    await this.applySourceConfigChange({
      ...current,
      routingMode,
    }, preset);
  }

  async onOutputChannelCountChange(event: Event): Promise<void> {
    const preset = this.currentPreset();
    const current = this.getActiveSourceConfig();
    if (!preset || !current) {
      return;
    }

    const outputChannelCount = Number.parseInt((event.target as HTMLSelectElement).value, 10);
    if (!Number.isInteger(outputChannelCount) || outputChannelCount <= 0) {
      return;
    }

    await this.applySourceConfigChange({
      ...current,
      outputChannelCount,
    }, preset);
  }

  async changeWaveFile(): Promise<void> {
    const sourceConfig = this.getActiveSourceConfig();
    if (!sourceConfig || sourceConfig.signalType !== 'WAVE_FILE') {
      return;
    }

    const previousSignal = this.signal;
    const wasPlaying = this.audioEngine.isPlaying();
    const hadActiveCapture = this.audioEngine.isRecording() || this.audioEngine.isSimulatedRecording();

    if (hadActiveCapture) {
      await this.stopLiveAudioActions();
    } else if (wasPlaying) {
      await this.audioEngine.stopPlayback();
    }

    try {
      const channels = await this.loadWaveFileChannels(sourceConfig, { forcePicker: true });
      this.signal = channels;

      const activeContextId = this.calculationManager.activeContextId();
      if (activeContextId && this.signal) {
        this.calculationManager.updateExcitationSignals(activeContextId, this.signal);
      }
    } catch (error) {
      if (this.isWaveFileSelectionCancelled(error)) {
        this.signal = previousSignal;
        if (wasPlaying && !hadActiveCapture && previousSignal) {
          await this.audioEngine.startPlayback(previousSignal);
        }
        return;
      }

      throw error;
    }

    if (wasPlaying && !hadActiveCapture && this.signal) {
      await this.audioEngine.startPlayback(this.signal);
    }
  }

  private async applySourceConfigChange(
    candidate: ResolvedSourceConfig,
    preset: ContextPreset,
  ): Promise<void> {
    const nextSourceConfig = resolvePresetSourceConfig(preset.source, candidate);
    const wasPlaying = this.audioEngine.isPlaying();
    const wasMicRecording = this.audioEngine.isRecording() && !this.audioEngine.isSimulatedRecording();
    const wasSimRecording = this.audioEngine.isSimulatedRecording();
    const hadActiveCapture = wasMicRecording || wasSimRecording;
    // Snapshot synthetic excitation choice for sim-recording restart.
    const syntheticChoiceForRestart = this.selectedSyntheticType();

    if (hadActiveCapture) {
      await this.stopLiveAudioActions();
    } else if (wasPlaying) {
      await this.audioEngine.stopPlayback();
    }

    // Promote the pending source to active (we are entering a live mode).
    this.sessionState.unlockAndPromotePending();

    this.sourceConfigChanged.emit(nextSourceConfig);
    await new Promise(resolve => setTimeout(resolve, 100));

    const activeSourceConfig = this.getActiveSourceConfig() ?? nextSourceConfig;
    await this.generateSignal(activeSourceConfig, this.audioEngine.getSampleRate());

    const activeContextId = this.calculationManager.activeContextId();
    const context = activeContextId ? this.calculationManager.getContext(activeContextId) : undefined;
    if (context?.sharedBuffers) {
      this.audioEngine.updateSharedBuffers(context.sharedBuffers, activeSourceConfig.circularLength);
    }

    // Issue 4 / ARCHITECTURE.md §5: auto-restart the active capture mode that
    // was running before the rebuild. Playback also restarts when not muted
    // (same behaviour as the normal record-button path in onMainRecordPress).
    if (hadActiveCapture) {
      try {
        if (wasSimRecording && this.signal) {
          // Mirror the synthetic-data shape used by toggleSimulatedRecording.
          const synthetic = await this.buildSyntheticDataForRestart(syntheticChoiceForRestart, activeSourceConfig);
          if (synthetic) {
            await this.audioEngine.startSimulatedRecording(synthetic);
          }
        } else if (wasMicRecording) {
          await this.audioEngine.startRecording();
          if (!this.isMuted() && this.signal) {
            await this.audioEngine.startPlayback(this.signal);
          }
        }
      } catch (err) {
        console.warn('Auto-restart of recording after source change failed:', err);
      }
    } else if (wasPlaying && this.signal) {
      await this.audioEngine.startPlayback(this.signal);
    }
  }

  /** Best-effort rebuild of synthetic-recording data after a source change.
   *  Returns null when the synthetic input cannot be reproduced (e.g. the
   *  user-selected wave file no longer matches the new source). */
  private async buildSyntheticDataForRestart(
    syntheticType: SyntheticType,
    sourceConfig: ResolvedSourceConfig,
  ): Promise<Float32Array[] | null> {
    if (syntheticType === 'output_with_filter' && this.signal) {
      // Reuse the just-generated excitation as the simulated input.
      return this.signal.map((ch) => Float32Array.from(ch));
    }
    if (syntheticType === 'wave_file') {
      try {
        const channels = await this.loadWaveFileChannels(sourceConfig, { forcePicker: false });
        return channels;
      } catch {
        return null;
      }
    }
    // White / pink noise: synthesise nc samples per channel.
    const channels: Float32Array[] = [];
    const nc = sourceConfig.circularLength;
    const numCh = sourceConfig.outputChannelCount;
    for (let c = 0; c < numCh; c++) {
      const buf = new Float32Array(nc);
      if (syntheticType === 'pink_noise') {
        // Simple Voss-McCartney pink approximation.
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < nc; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.0990460;
          b1 = 0.96300 * b1 + w * 0.2965164;
          b2 = 0.57000 * b2 + w * 1.0526913;
          buf[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
        }
      } else {
        for (let i = 0; i < nc; i++) buf[i] = (Math.random() * 2 - 1) * 0.5;
      }
      channels.push(buf);
    }
    return channels;
  }

  private async generateSignal(
    sourceConfig: ResolvedSourceConfig,
    sampleRate: number,
    options: { forceWaveFilePicker?: boolean } = {},
  ): Promise<void> {
    const { circularLength } = sourceConfig;
    
    try {
      this.signal = await this.buildSignalChannels(sourceConfig, sampleRate, options);
    } catch (error) {
      if (this.isWaveFileSelectionCancelled(error)) {
        this.signal = null;
        return;
      }

      console.error('Could not generate signal with WASM:', error);
      const channelCount = Math.max(1, sourceConfig.outputChannelCount);
      this.signal = Array.from({ length: channelCount }, () => {
        const channel = new Float32Array(circularLength);
        for (let index = 0; index < circularLength; index += 1) {
          channel[index] = (Math.random() * 2 - 1) * 0.5;
        }
        return channel;
      });
    }

    const activeContextId = this.calculationManager.activeContextId();
    if (activeContextId && this.signal) {
      this.calculationManager.updateExcitationSignals(activeContextId, this.signal);
    }
  }

  openSettings() {
    this.settingsDialog.open();
  }

  getRendererOptions(): Array<{ value: 'webgpu' | 'webgl2' | '2d'; label: string; disabled?: boolean }> {
    return [
      {
        value: 'webgpu',
        label: 'WebGPU',
        disabled: this.calculationManager.webGPUSupported() !== true,
      },
      {
        value: 'webgl2',
        label: 'WebGL2',
        disabled: this.calculationManager.webGL2Supported() !== true,
      },
      {
        value: '2d',
        label: 'Canvas 2D',
      },
    ];
  }

  getSelectedRenderer(): 'webgpu' | 'webgl2' | '2d' {
    if (this.calculationManager.useWebGPU()) {
      return 'webgpu';
    }

    if (this.calculationManager.useWebGL2()) {
      return 'webgl2';
    }

    return '2d';
  }

  onRendererChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value as 'webgpu' | 'webgl2' | '2d';
    this.calculationManager.setContextType(value);
  }

  selectSyntheticType(type: SyntheticType) {
    this.selectedSyntheticType.set(type);
  }

  toggleSimulationMode(): void {
    this.simulationMode.update((value) => !value);
  }

  /**
   * Set the coherent multi-cycle averaging factor. Updates the worker
   * immediately (no buffer rebuild needed).
   */
  setNAverage(value: number): void {
    const clean = Math.max(1, Math.floor(value));
    this.nAverage.set(clean);
    const contextId = this.calculationManager.activeContextId();
    if (contextId) {
      this.calculationManager.updateNAverage(contextId, clean);
    }
  }

  /** Set the circular buffer length and propagate the change. */
  async setBufferSize(circularLength: number): Promise<void> {
    const preset = this.currentPreset();
    const current = this.editableSourceConfig();
    if (!preset || !current || current.circularLength === circularLength) {
      return;
    }
    const next = resolvePresetSourceConfig(preset.source, { ...current, circularLength });
    if (this.sourceLocked()) {
      // Stage for next recording; do not touch the live audio engine or the
      // worker context (those stay aligned with the locked recording).
      this.sessionState.setPendingSourceConfig(next);
      return;
    }
    await this.applySourceConfigChange(next, preset);
  }

  /** Set signal type. */
  async setSignalType(signalType: PresetSignalType): Promise<void> {
    const preset = this.currentPreset();
    const current = this.editableSourceConfig();
    if (!preset || !current || current.signalType === signalType) {
      return;
    }
    const next = resolvePresetSourceConfig(preset.source, { ...current, signalType });
    if (this.sourceLocked()) {
      this.sessionState.setPendingSourceConfig(next);
      return;
    }
    await this.applySourceConfigChange(next, preset);
  }

  async setRoutingMode(routingMode: SourceRoutingMode): Promise<void> {
    const preset = this.currentPreset();
    const current = this.editableSourceConfig();
    if (!preset || !current || current.routingMode === routingMode) {
      return;
    }
    const next = resolvePresetSourceConfig(preset.source, { ...current, routingMode });
    if (this.sourceLocked()) {
      this.sessionState.setPendingSourceConfig(next);
      return;
    }
    await this.applySourceConfigChange(next, preset);
  }

  async setOutputChannelCount(outputChannelCount: number): Promise<void> {
    const preset = this.currentPreset();
    const current = this.editableSourceConfig();
    if (!preset || !current || current.outputChannelCount === outputChannelCount) {
      return;
    }
    const next = resolvePresetSourceConfig(preset.source, { ...current, outputChannelCount });
    if (this.sourceLocked()) {
      this.sessionState.setPendingSourceConfig(next);
      return;
    }
    await this.applySourceConfigChange(next, preset);
  }

  /** Format a circular buffer length as ms/seconds, e.g. "21 ms", "11 s". */
  formatBufferDuration(samples: number, sampleRate: number): string {
    if (!sampleRate || !Number.isFinite(samples) || samples <= 0) {
      return '–';
    }
    const seconds = samples / sampleRate;
    if (seconds >= 1) {
      return seconds >= 10 ? `${seconds.toFixed(0)} s` : `${seconds.toFixed(1)} s`;
    }
    const ms = seconds * 1000;
    return `${ms < 10 ? ms.toFixed(1) : ms.toFixed(0)} ms`;
  }

  /**
   * Close any open <details> dropdowns inside the top-bar when the user clicks
   * (pointerdown) outside of them.
   */
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    const root = this.hostElement.nativeElement as HTMLElement;
    const opened = Array.from(root.querySelectorAll('details[open]')) as HTMLDetailsElement[];
    for (const detail of opened) {
      if (target && detail.contains(target)) {
        continue;
      }
      detail.removeAttribute('open');
    }
  }

  async toggleSimulatedRecording() {
    if (this.audioEngine.isSimulatedRecording()) {
      const metadata = this.activeRecordingMetadata;
      await this.audioEngine.stopSimulatedRecording();
      this.activeRecordingMetadata = null;
      if (metadata) {
        await this.captureRecordingArchive(metadata.captureMode, metadata.resolvedSource);
      }
      this.calculationManager.setMode('offline');
      return;
    }

    const currentSourceConfig = this.getActiveSourceConfig();
    const syntheticType = this.selectedSyntheticType();
    this.calculationManager.setMode('live');
    this.activeRecordingMetadata = {
      captureMode: 'simulated',
      resolvedSource: this.createSyntheticResolvedSource(syntheticType, currentSourceConfig),
    };

    if (syntheticType === 'wave_file') {
      await this.startSimulatedFromWaveFile();
    } else {
      await this.startSimulatedFromGenerated(syntheticType);
    }
  }

  private async captureRecordingArchive(
    captureMode: RecordingCaptureMode,
    resolvedSource: RecordingResolvedSourceConfig,
  ): Promise<void> {
    const preset = this.currentPreset();
    const contextId = this.calculationManager.activeContextId();
    const context = contextId ? this.calculationManager.getContext(contextId) : null;

    if (!preset || !context) {
      return;
    }

    const recordedChannels = await this.audioEngine.getRecordedData();
    const recordingPosition = this.audioEngine.getCurrentPosition();

    if (recordingPosition <= 0) {
      return;
    }

    if (recordedChannels.length === 0) {
      return;
    }

    // Trim the circular recording buffer per v1 spec:
    //   - drop samples that have not yet been recorded;
    //   - keep a length that is a whole number of base circular cycles (nc);
    //   - the last kept sample must equal the last recorded sample.
    const nc = Math.max(1, resolvedSource.circularLength);
    const ringLength = recordedChannels[0].length;
    const totalRecorded = Math.max(0, recordingPosition);
    const usableLength = Math.min(totalRecorded, ringLength);
    const trimmedLength = Math.floor(usableLength / nc) * nc;

    if (trimmedLength <= 0) {
      return;
    }

    const excitationChannels = this.buildArchiveExcitationChannels(
      context.sharedBuffers.x_c,
      resolvedSource,
    );
    if (excitationChannels.length === 0) {
      return;
    }

    const writeHead = ((totalRecorded % ringLength) + ringLength) % ringLength;
    const firstIdx = ((writeHead - trimmedLength) % ringLength + ringLength) % ringLength;
    const trimmedChannels = recordedChannels.map((channel) => {
      const out = new Float32Array(trimmedLength);
      if (firstIdx + trimmedLength <= ringLength) {
        out.set(channel.subarray(firstIdx, firstIdx + trimmedLength));
      } else {
        const tail = ringLength - firstIdx;
        out.set(channel.subarray(firstIdx, ringLength), 0);
        out.set(channel.subarray(0, trimmedLength - tail), tail);
      }
      return out;
    });

    // New recordings start in an "unsaved" state with an auto-incremented name.
    // The next captured recording will discard this one unless the user
    // explicitly clicks the save icon in the recording library.
    this.recordingLibrary.createArchive({
      name: this.recordingLibrary.nextAutoRecordingName(),
      captureMode,
      sourceType: resolvedSource.sourceType,
      resolvedSource,
      sampleRate: this.audioEngine.getSampleRate(),
      circularLength: resolvedSource.circularLength,
      // Trimmed channels are already linearized so no rotation is needed.
      recordingPosition: 0,
      excitationChannels,
      recordedChannels: trimmedChannels,
      sourceChannelCount: resolvedSource.logicalSourceCount,
      preset: {
        id: preset.id,
        name: preset.name,
      },
    }, { unsaved: true });
  }

  private buildArchiveExcitationChannels(
    sharedExcitationBuffers: SharedArrayBuffer[],
    resolvedSource: RecordingResolvedSourceConfig,
  ): Float32Array[] {
    const circularLength = Math.max(1, resolvedSource.circularLength);
    const signalChannels = this.signal?.filter(channel => channel.length > 0) ?? [];
    const sharedChannels = sharedExcitationBuffers.map(buffer => new Float32Array(buffer));
    const nonEmptySharedChannels = sharedChannels.filter(channel => channel.length > 0);

    let sourceChannels = signalChannels;
    if (!signalChannels.some(channel => channel.length === circularLength)
        && nonEmptySharedChannels.some(channel => channel.length === circularLength)) {
      sourceChannels = nonEmptySharedChannels;
    } else if (sourceChannels.length === 0) {
      sourceChannels = nonEmptySharedChannels;
    }

    return sourceChannels.map(channel => this.loopAudioChannel(channel, circularLength));
  }

  private getSourceTypeFromSignalType(signalType: PresetSignalType): RecordingSourceType {
    switch (signalType) {
      case 'PERFECT_WHITE':
        return 'perfect_white';
      case 'PERFECT_PINK':
        return 'perfect_pink';
      case 'WHITE':
        return 'white';
      case 'PINK':
        return 'pink';
      case 'WAVE_FILE':
        return 'wave_file';
      case 'MULTI_SOURCE_WHITE':
        return 'multi_source_white';
      case 'ZADOFF_CHU':
        return 'zadoff_chu';
      default:
        return 'custom';
    }
  }

  private getSyntheticSourceType(type: SyntheticType): RecordingSourceType {
    switch (type) {
      case 'white_noise':
        return 'white';
      case 'pink_noise':
        return 'pink';
      case 'wave_file':
        return 'wave_file';
      case 'output_with_filter':
        return 'output_with_filter';
      default:
        return 'custom';
    }
  }

  private async startSimulatedFromGenerated(syntheticType: SyntheticType): Promise<void> {
    const sourceConfig = this.getActiveSourceConfig();
    if (!sourceConfig) return;

    const nc = sourceConfig.circularLength;
    const sampleRate = this.audioEngine.getSampleRate();

    let signalChannels: Float32Array[];

    switch (syntheticType) {
      case 'white_noise':
      case 'pink_noise': {
        // Use the signal that is already stored in x_c (SharedArrayBuffer).
        // The calculation worker uses x_c to compute H[k] = Y[k]/X[k], so the
        // synthetic y_c MUST contain the same signal as x_c — otherwise H[k] is
        // just random noise and the phase is meaningless.
        const activeId = this.calculationManager.activeContextId();
        const ctx = activeId ? this.calculationManager.getContext(activeId) : null;
        if (ctx?.sharedBuffers?.x_c?.length) {
          signalChannels = ctx.sharedBuffers.x_c.map((buffer) => new Float32Array(buffer));
        } else {
          // Fallback: generate and accept the mismatch (context not ready yet)
          signalChannels = await this.buildSignalChannels(sourceConfig, sampleRate);
        }
        break;
      }
      case 'output_with_filter':
        signalChannels = this.generateOutputWithFilterChannels(nc, sampleRate);
        break;
      default:
        return;
    }

    await this.audioEngine.startSimulatedRecording(signalChannels);
  }

  private generateOutputWithFilterChannels(nc: number, sampleRate: number): Float32Array[] {
    // Take the current output signal (x_c), apply FFT, bandpass, IFFT
    if (!this.signal || this.signal.length === 0) {
      // Fallback: generate white noise if no output signal
      return [
        this.wasmService.generatePerfectWhite(nc, sampleRate),
        this.wasmService.generatePerfectWhite(nc, sampleRate),
      ];
    }

    return this.signal.map((channel) => this.generateOutputWithFilterChannel(channel, nc, sampleRate));
  }

  private generateOutputWithFilterChannel(
    sourceSignal: Float32Array,
    nc: number,
    sampleRate: number,
  ): Float32Array {
    const fftContext = this.wasmService.createFFTContext(nc);

    // FFT the output signal
    const spectrum = this.wasmService.fft(fftContext, sourceSignal);

    // Apply bandpass filter (200 Hz - 8000 Hz as a reasonable default)
    const filtered = wasm.bandpassFilterSmooth(
      spectrum.re, spectrum.im,
      sampleRate, nc,
      200,   // low cutoff
      8000,  // high cutoff
      4      // filter order
    );

    // IFFT back to time domain
    const filteredSignal = this.wasmService.ifft(fftContext, {
      re: new Float32Array(filtered.re),
      im: new Float32Array(filtered.im),
    });

    return filteredSignal;
  }

  private async startSimulatedFromWaveFile(): Promise<void> {
    const sourceConfig = this.getActiveSourceConfig();
    if (!sourceConfig) return;

    let signalChannels: Float32Array[];

    try {
      signalChannels = await this.loadWaveFileChannels(sourceConfig);
    } catch (error) {
      if (this.isWaveFileSelectionCancelled(error)) {
        return;
      }
      throw error;
    }

    await this.audioEngine.startSimulatedRecording(signalChannels);
  }

  private async buildSignalChannels(
    sourceConfig: ResolvedSourceConfig,
    sampleRate: number,
    options: { forceWaveFilePicker?: boolean } = {},
  ): Promise<Float32Array[]> {
    if (sourceConfig.signalType === 'WAVE_FILE') {
      return this.loadWaveFileChannels(sourceConfig, { forcePicker: options.forceWaveFilePicker });
    }

    const channelCount = Math.max(1, sourceConfig.outputChannelCount);

    if (sourceConfig.routingMode === 'direct') {
      const channels: Float32Array[] = [];
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        channels.push(await this.generateSignalChannel(sourceConfig, sampleRate, channelIndex));
      }
      return channels;
    }

    const monoSignal = await this.generateSignalChannel(sourceConfig, sampleRate, 0);
    return Array.from({ length: channelCount }, () => new Float32Array(monoSignal));
  }

  private async generateSignalChannel(
    sourceConfig: ResolvedSourceConfig,
    sampleRate: number,
    channelIndex: number,
  ): Promise<Float32Array> {
    switch (sourceConfig.signalType) {
      case 'PERFECT_WHITE':
        return this.wasmService.generatePerfectWhite(sourceConfig.circularLength, sampleRate);
      case 'PERFECT_PINK':
        return this.wasmService.generatePerfectPink(sourceConfig.circularLength, sampleRate);
      case 'WHITE':
        return this.wasmService.generateWhite(sourceConfig.circularLength);
      case 'PINK':
        return this.wasmService.generatePink(sourceConfig.circularLength, sampleRate);
      case 'WAVE_FILE':
        throw new Error('Wave file sources are generated at the multichannel level');
      case 'MULTI_SOURCE_WHITE':
        return this.wasmService.generateFrequencyDivisionPerfectWhite(
          sourceConfig.circularLength,
          sampleRate,
          channelIndex,
          Math.max(1, sourceConfig.logicalSourceCount),
        );
      case 'ZADOFF_CHU':
        return this.wasmService.generateZadoffChu(
          sourceConfig.circularLength,
          (sourceConfig.zadoffChuRoot ?? 1) + channelIndex,
        );
      default:
        throw new Error(`Unknown signal type: ${sourceConfig.signalType}`);
    }
  }

  private getActiveSourceConfig(): ResolvedSourceConfig | null {
    const preset = this.currentPreset();
    if (!preset) {
      return null;
    }

    return resolvePresetSourceConfig(preset.source, this.currentSourceConfig() ?? preset.source.defaults);
  }

  private createSyntheticResolvedSource(
    syntheticType: SyntheticType,
    currentSourceConfig: ResolvedSourceConfig | null,
  ): RecordingResolvedSourceConfig {
    return {
      sourceType: this.getSyntheticSourceType(syntheticType),
      circularLength: currentSourceConfig?.circularLength ?? this.currentPreset()?.settings.nc ?? 4096,
      logicalSourceCount: currentSourceConfig?.logicalSourceCount ?? 1,
      outputChannelCount: currentSourceConfig?.outputChannelCount ?? 2,
      routingMode: currentSourceConfig?.routingMode ?? 'mirrored_mono',
      waveFile: syntheticType === 'wave_file'
        ? currentSourceConfig?.waveFile ?? this.selectedWaveFileMetadata ?? undefined
        : undefined,
    };
  }

  private toRecordingResolvedSource(sourceConfig: ResolvedSourceConfig): RecordingResolvedSourceConfig {
    return {
      sourceType: this.getSourceTypeFromSignalType(sourceConfig.signalType),
      signalType: sourceConfig.signalType,
      circularLength: sourceConfig.circularLength,
      logicalSourceCount: sourceConfig.logicalSourceCount,
      outputChannelCount: sourceConfig.outputChannelCount,
      routingMode: sourceConfig.routingMode,
      zadoffChuRoot: sourceConfig.zadoffChuRoot,
      waveFile: sourceConfig.waveFile ?? this.selectedWaveFileMetadata ?? undefined,
    };
  }

  private formatSignalType(signalType: PresetSignalType): string {
    switch (signalType) {
      case 'PERFECT_WHITE':
        return 'Perfect White';
      case 'PERFECT_PINK':
        return 'Perfect Pink';
      case 'WHITE':
        return 'White';
      case 'PINK':
        return 'Pink';
      case 'WAVE_FILE':
        return 'Wave File';
      case 'MULTI_SOURCE_WHITE':
        return 'Multi-Source White';
      case 'ZADOFF_CHU':
        return 'Zadoff-Chu';
      default:
        return signalType;
    }
  }

  private formatRoutingMode(routingMode: SourceRoutingMode): string {
    return routingMode === 'direct' ? 'Direct outputs' : 'Mirrored mono';
  }

  private async loadWaveFileChannels(
    sourceConfig: ResolvedSourceConfig,
    options: { forcePicker?: boolean } = {},
  ): Promise<Float32Array[]> {
    const file = !options.forcePicker && this.canReuseSelectedWaveFile(sourceConfig.waveFile)
      ? this.selectedWaveFile!
      : await this.pickWaveFile();
    if (!file) {
      const error = new Error('Wave file selection was cancelled');
      error.name = 'WaveFileSelectionCancelled';
      throw error;
    }

    const { audioBuffer, metadata } = await this.decodeWaveFileAudioBuffer(file, sourceConfig);
    this.rememberWaveFileSelection(file, metadata, sourceConfig);
    return this.buildWaveFileChannels(audioBuffer, sourceConfig);
  }

  private isWaveFileSelectionCancelled(error: unknown): boolean {
    return error instanceof Error && error.name === 'WaveFileSelectionCancelled';
  }

  private async pickWaveFile(): Promise<File | null> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.wav,audio/wav';

    return new Promise<File | null>((resolve) => {
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
  }

  private async decodeWaveFileAudioBuffer(
    file: File,
    sourceConfig: ResolvedSourceConfig,
  ): Promise<{ audioBuffer: AudioBuffer; metadata: WaveFileSourceMetadata }> {
    const circularLength = sourceConfig.circularLength;
    const sampleRate = this.audioEngine.isInitialized() ? this.audioEngine.getSampleRate() : 48000;
    const audioContext = new OfflineAudioContext(
      Math.max(1, sourceConfig.outputChannelCount),
      circularLength,
      sampleRate,
    );
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    return {
      audioBuffer,
      metadata: this.buildWaveFileMetadata(file, audioBuffer),
    };
  }

  private buildWaveFileChannels(
    audioBuffer: AudioBuffer,
    sourceConfig: ResolvedSourceConfig,
  ): Float32Array[] {
    const circularLength = sourceConfig.circularLength;
    const outputChannelCount = Math.max(1, sourceConfig.outputChannelCount);
    const sourceChannelCount = Math.max(1, audioBuffer.numberOfChannels);

    if (sourceConfig.routingMode !== 'direct') {
      const monoChannel = this.loopAudioChannel(audioBuffer.getChannelData(0), circularLength);
      return Array.from({ length: outputChannelCount }, () => new Float32Array(monoChannel));
    }

    const channels: Float32Array[] = [];
    for (let channelIndex = 0; channelIndex < outputChannelCount; channelIndex += 1) {
      const decoded = audioBuffer.getChannelData(channelIndex % sourceChannelCount);
      channels.push(this.loopAudioChannel(decoded, circularLength));
    }
    return channels;
  }

  private buildWaveFileMetadata(file: File, audioBuffer: AudioBuffer): WaveFileSourceMetadata {
    return {
      fileName: file.name,
      channelCount: Math.max(1, audioBuffer.numberOfChannels),
      sampleRate: audioBuffer.sampleRate,
      frameCount: audioBuffer.length,
      fileSizeBytes: file.size,
      lastModified: file.lastModified,
    };
  }

  private rememberWaveFileSelection(
    file: File,
    metadata: WaveFileSourceMetadata,
    sourceConfig: ResolvedSourceConfig,
  ): void {
    this.selectedWaveFile = file;
    this.selectedWaveFileMetadata = metadata;

    if (sourceConfig.signalType === 'WAVE_FILE' && !this.areWaveFileMetadataEqual(sourceConfig.waveFile, metadata)) {
      this.sourceConfigChanged.emit({
        ...sourceConfig,
        waveFile: metadata,
      });
    }
  }

  private canReuseSelectedWaveFile(metadata?: WaveFileSourceMetadata): boolean {
    if (!this.selectedWaveFile) {
      return false;
    }

    if (!metadata) {
      return true;
    }

    return this.matchesWaveFileMetadata(this.selectedWaveFile, metadata);
  }

  private matchesWaveFileMetadata(
    file: Pick<File, 'name' | 'size' | 'lastModified'>,
    metadata: WaveFileSourceMetadata,
  ): boolean {
    return file.name === metadata.fileName
      && (metadata.fileSizeBytes === undefined || file.size === metadata.fileSizeBytes)
      && (metadata.lastModified === undefined || file.lastModified === metadata.lastModified);
  }

  private areWaveFileMetadataEqual(
    current: WaveFileSourceMetadata | undefined,
    candidate: WaveFileSourceMetadata,
  ): boolean {
    if (!current) {
      return false;
    }

    return current.fileName === candidate.fileName
      && current.channelCount === candidate.channelCount
      && current.sampleRate === candidate.sampleRate
      && current.frameCount === candidate.frameCount
      && current.fileSizeBytes === candidate.fileSizeBytes
      && current.lastModified === candidate.lastModified;
  }

  private formatWaveFileDuration(durationSeconds: number): string {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return '0.0s';
    }

    if (durationSeconds >= 60) {
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = Math.round(durationSeconds % 60);
      return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    }

    return `${durationSeconds.toFixed(durationSeconds >= 10 ? 1 : 2)}s`;
  }

  private loopAudioChannel(source: Float32Array, circularLength: number): Float32Array {
    const channel = new Float32Array(circularLength);
    if (source.length === 0) {
      return channel;
    }
    for (let sampleIndex = 0; sampleIndex < circularLength; sampleIndex += 1) {
      channel[sampleIndex] = source[sampleIndex % source.length];
    }
    return channel;
  }
}
