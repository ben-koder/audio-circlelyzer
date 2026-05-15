import { Injectable, signal, inject, effect } from '@angular/core';
import {
  CalculationContext,
  CalculationContextDefinition,
  CalculationContextSettings,
  COMPUTATION_CONTEXT_ID,
  CONTEXT_KEY,
  SIGNAL_ID,
  SignalGenerator,
} from '../models/types';
import {
  WorkerMessageType,
  InitContextMessage,
  UpdateSettingMessage,
  UpdateScriptMessage,
  UpdateVisualizationDynamicSettingsMessage,
  UpdatePositionOffsetMessage,
  SetModeMessage,
  SetActiveContextMessage,
  TransferCanvasMessage,
  UnregisterCanvasMessage,
  ResizeCanvasMessage,
  DestroyContextMessage,
  SetContextTypeMessage,
  CheckWebGPUSupportMessage,
  CheckWebGL2SupportMessage,
  WebGPUSupportMessage,
  WebGL2SupportMessage,
  WorkerMessage,
  ContextInitializedMessage,
  CalculationCompleteMessage,
  ErrorMessage,
  RequestResultSnapshotMessage,
  ResultSnapshotMessage,
} from '../models/worker-protocol';
import { createCalculationTypes } from '../models/calculation-types';
import { createVisualizationTypes } from '../models/visualization-types';
import { WasmService } from './wasm.service';
import { AudioEngineService } from './audio-engine.service';
import { ScriptParserService } from './script-parser.service';
import { PlotPreferencesService } from './plot-preferences.service';
import { CALCULATION_SETTINGS_UI } from '../models/calculation-types-ui';
import { VISUALIZATION_SETTINGS_UI, VISUALIZATION_DISPLAY_UI } from '../models/visualization-types-ui';

@Injectable({
  providedIn: 'root'
})
export class CalculationManagerService {
  private worker: Worker | null = null;
  private resultSnapshotRequestCounter = 0;
  private contexts = new Map<COMPUTATION_CONTEXT_ID, {
    definition: CalculationContextDefinition;
    sharedBuffers: {
      x_c: SharedArrayBuffer[];  // Now multichannel
      y_c: SharedArrayBuffer[];
      currentPosition: SharedArrayBuffer;
    };
    visualizations: Map<CONTEXT_KEY, { type: string; isSimpleValue: boolean }>;
    calculationTypes: Map<CONTEXT_KEY, string>;
    simpleValues: Map<CONTEXT_KEY, any>;
    calculationSettings: Map<CONTEXT_KEY, any>;
    visualizationSettings: Map<CONTEXT_KEY, any>;
    visualizationDynamicSettings: Map<CONTEXT_KEY, any>;
  }>();
  private pendingResultSnapshotRequests = new Map<string, {
    resolve: (results: Record<CONTEXT_KEY, any>) => void;
    reject: (reason?: unknown) => void;
  }>();
  private signalGenerators = new Map<SIGNAL_ID, SignalGenerator>();
  
  // Expose registered types
  public readonly calculationTypes = new Map<string, any>();
  public readonly visualizationTypes = new Map<string, any>();
  
  public activeContextId = signal<COMPUTATION_CONTEXT_ID | null>(null);
  public mode = signal<'live' | 'offline'>('live');
  public isCalculating = signal(false);
  public webGPUSupported = signal<boolean | null>(null);
  public webGL2Supported = signal<boolean | null>(null);
  public useWebGPU = signal(false);
  public useWebGL2 = signal(false);
  /** Incremented whenever simpleValues are updated from the worker. Use in computed() to react to new calculation results. */
  public simpleValuesVersion = signal(0);
  /** Incremented whenever a visualization setting is updated. Use in computed() to react to settings changes. */
  public vizSettingsVersion = signal(0);
  /** Global active analysis frequency range applied via implicit Y_c bandpass.
   *  null = no bandpass (full nyquist range). The top-bar dual slider drives
   *  this; presets seed the initial value via `defaultFrequencyRange`. */
  public activeFrequencyRange = signal<{ low: number; high: number } | null>(null);
  private initializationPromise: Promise<void>;
  private audioEngine = inject(AudioEngineService);
  // ScriptParserService is a plain class (no @Injectable) so it can be safely
  // imported by the calculation worker without triggering Angular JIT.
  private scriptParser = new ScriptParserService();
  private plotPreferences = inject(PlotPreferencesService);

  constructor(private wasmService: WasmService) {
    this.initializationPromise = this.initialize();
    // Push plot preferences to the worker on every change. The worker uses
    // them when computing data-driven autoscale ranges; a re-render is
    // triggered so the UI reflects the new algorithm immediately.
    effect(() => {
      const prefs = this.plotPreferences.preferences();
      this.worker?.postMessage({
        type: WorkerMessageType.SET_PLOT_PREFERENCES,
        payload: { ...prefs },
      });
      // Force a re-calc so axes are recomputed with the new prefs.
      // (Worker computes autoscale during the same pipeline that produces plots.)
      if (this.worker) {
        this.triggerCalculation(true);
      }
    });
  }

  private async initialize(): Promise<void> {
    await this.wasmService.initialize();
    this.initializeWorker();
    this.registerSignalGenerators();
    this.registerCalculationTypes();
    this.registerVisualizationTypes();
    this.checkWebGPUSupport();
    this.checkWebGL2Support();
    // Push initial plot preferences so the worker has them before the first
    // render. Subsequent changes are pushed by the effect in the constructor.
    this.worker?.postMessage({
      type: WorkerMessageType.SET_PLOT_PREFERENCES,
      payload: { ...this.plotPreferences.preferences() },
    });
  }

  async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
  }

  private registerCalculationTypes(): void {
    const types = createCalculationTypes(this.wasmService);
    types.forEach(type => {
      this.calculationTypes.set(type.id, type);
      if (CALCULATION_SETTINGS_UI[type.id]) {
        type.getSettingsUI = () => CALCULATION_SETTINGS_UI[type.id];
      }
    });
  }

  private registerVisualizationTypes(): void {
    const types = createVisualizationTypes();
    types.forEach(type => {
      this.visualizationTypes.set(type.id, type);
      if (VISUALIZATION_SETTINGS_UI[type.id]) {
        type.getSettingsUI = () => VISUALIZATION_SETTINGS_UI[type.id];
      }
      if (VISUALIZATION_DISPLAY_UI[type.id]) {
        type.getVisualizationUI = () => VISUALIZATION_DISPLAY_UI[type.id];
      }
    });
  }

  private initializeWorker(): void {
    // Create Web Worker
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../workers/calculation.worker', import.meta.url), {
        type: 'module'
      });
      
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        this.handleWorkerMessage(event.data);
      };
      
      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
      };
    } else {
      console.error('Web Workers not supported');
    }
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    switch (message.type) {
      case WorkerMessageType.CONTEXT_INITIALIZED:
        this.handleContextInitialized(message as ContextInitializedMessage);
        break;
      
      case WorkerMessageType.CALCULATION_COMPLETE:
        this.handleCalculationComplete(message as CalculationCompleteMessage);
        break;
      
      case WorkerMessageType.ERROR:
        this.handleWorkerError(message as ErrorMessage);
        break;
      
      case WorkerMessageType.CANVAS_RENDERED:
        // Canvas was rendered in worker, UI will update automatically
        break;

      case WorkerMessageType.WEBGPU_SUPPORT:
        this.webGPUSupported.set((message as WebGPUSupportMessage).payload.supported);
        break;

      case WorkerMessageType.WEBGL2_SUPPORT:
        this.webGL2Supported.set((message as WebGL2SupportMessage).payload.supported);
        break;

      case WorkerMessageType.RESULT_SNAPSHOT:
        this.handleResultSnapshot(message as ResultSnapshotMessage);
        break;
    }
  }

  private handleContextInitialized(message: ContextInitializedMessage): void {
    const { contextId, visualizations } = message.payload;
    const context = this.contexts.get(contextId);
    
    if (context) {
      // Store visualization info
      visualizations.forEach(vis => {
        context.visualizations.set(vis.key, {
          type: vis.type,
          isSimpleValue: vis.isSimpleValue
        });
      });
    }
  }

  private handleCalculationComplete(message: CalculationCompleteMessage): void {
    const { contextId, simpleValues } = message.payload;
    const context = this.contexts.get(contextId);
    
    if (context && simpleValues) {
      // Update simple values (like RT60)
      Object.entries(simpleValues).forEach(([key, value]) => {
        context.simpleValues.set(key, value);
      });
      this.simpleValuesVersion.update(v => v + 1);
    }
    
    this.isCalculating.set(false);
  }

  private handleWorkerError(message: ErrorMessage): void {
    console.error('Worker error:', message.payload.message);
    if (message.payload.stack) {
      console.error(message.payload.stack);
    }
    this.isCalculating.set(false);
  }

  private handleResultSnapshot(message: ResultSnapshotMessage): void {
    const request = this.pendingResultSnapshotRequests.get(message.payload.requestId);
    if (!request) {
      return;
    }

    this.pendingResultSnapshotRequests.delete(message.payload.requestId);

    if (message.payload.error) {
      request.reject(new Error(message.payload.error));
      return;
    }

    request.resolve(message.payload.results ?? {});
  }

  private registerSignalGenerators(): void {
    // Register PERFECT_WHITE
    this.signalGenerators.set('PERFECT_WHITE', {
      id: 'PERFECT_WHITE',
      name: 'Perfect White Noise',
      description: 'Perfectly flat frequency response',
      generate: (len: number, sampleRate: number) => {
        return this.wasmService.generatePerfectWhite(len, sampleRate);
      }
    });
    
    // Register PERFECT_PINK
    this.signalGenerators.set('PERFECT_PINK', {
      id: 'PERFECT_PINK',
      name: 'Perfect Pink Noise',
      description: '1/f frequency response',
      generate: (len: number, sampleRate: number) => {
        return this.wasmService.generatePerfectPink(len, sampleRate);
      }
    });
    
    // Register WHITE
    this.signalGenerators.set('WHITE', {
      id: 'WHITE',
      name: 'White Noise',
      description: 'Random white noise',
      generate: (len: number, sampleRate: number) => {
        return this.wasmService.generateWhite(len);
      }
    });
    
    // Register PINK
    this.signalGenerators.set('PINK', {
      id: 'PINK',
      name: 'Pink Noise',
      description: 'Random pink noise',
      generate: (len: number, sampleRate: number) => {
        return this.wasmService.generatePink(len, sampleRate);
      }
    });

    this.signalGenerators.set('ZADOFF_CHU', {
      id: 'ZADOFF_CHU',
      name: 'Zadoff-Chu Excitation',
      description: 'Real phase-coded Zadoff-Chu excitation sequence',
      generate: (len: number) => {
        return this.wasmService.generateZadoffChu(len, 1);
      }
    });
  }

  // Public API

  async initContext(
    contextId: COMPUTATION_CONTEXT_ID,
    settings: { nc: number; n_y: number; sampleRate?: number },
    script: string,
    channelCount: number = 2,
  ): Promise<void> {
    await this.ensureInitialized();
    // Default sampleRate to 48000 if not provided (determined by WebAudio)
    const fullSettings = {
      nc: settings.nc,
      n_y: settings.n_y,
      sampleRate: settings.sampleRate ?? 48000
    };
    const definition: CalculationContextDefinition = {
      id: contextId,
      name: 'Main Context',
      description: 'Main calculation context',
      settings: fullSettings,
      script
    };
    this.createContext(definition, channelCount);
  }

  createContext(definition: CalculationContextDefinition, channelCount: number = 2): COMPUTATION_CONTEXT_ID {
    const { nc, n_y } = definition.settings;
    const numChannels = Math.max(1, channelCount);
    const circularBufferLength = nc * n_y;  // y_c is a circular buffer of n_y cycles
    
    // Check if context already exists to preserve settings
    const existingContext = this.contexts.get(definition.id);
    
    // Allocate SharedArrayBuffers - x_c is now multichannel
    const x_c_buffers = Array.from({ length: numChannels }, () =>
      new SharedArrayBuffer(nc * Float32Array.BYTES_PER_ELEMENT)
    );
    // y_c is the circular recording buffer: nc * n_y samples per channel
    const y_c_buffers = Array.from({ length: numChannels }, () =>
      new SharedArrayBuffer(circularBufferLength * Float32Array.BYTES_PER_ELEMENT)
    );
    const currentPosition_buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    
    // x_c is left zero-initialized here. The real excitation signal is
    // generated and pushed by `top-bar.generateSignal()` →
    // `updateExcitationSignals()` (live) or by the offline-recording effect
    // (review). Pre-filling with a different signal here would create a
    // transient mismatch where the worker analyses Y/X with an X that does
    // not match what was actually played, manifesting as a high noise floor
    // in the impulse response on the very first frames after preset load.
    
    // Parse script to get calculation types
    const parsed = this.scriptParser.parse(definition.script);
    const calculationTypes = new Map<CONTEXT_KEY, string>();
    const calculationSettings = new Map<CONTEXT_KEY, any>();
    const visualizationSettings = new Map<CONTEXT_KEY, any>();
    const visualizations = new Map<CONTEXT_KEY, { type: string; isSimpleValue: boolean }>();
    
    // Temporary context for initializing settings
    const tempContext: any = {
      settings: definition.settings,
      calculationSettings,
      visualizationSettings
    };

    parsed.operations.forEach((op, key) => {
      if (!op.isVisualization) {
        calculationTypes.set(key, op.type);
        const type = this.calculationTypes.get(op.type);
        if (type) {
          // Priority: 1) existing settings, 2) arg settings from script, 3) default init settings
          const existingSettings = existingContext?.calculationSettings.get(key);
          const scriptArgSettings = op.argSettings;
          calculationSettings.set(key, existingSettings ?? scriptArgSettings ?? type.initSettings(key, tempContext));
        }
      } else {
        // Also populate visualizations map immediately (not waiting for worker response)
        const type = this.visualizationTypes.get(op.type);
        if (type) {
          visualizations.set(key, {
            type: op.type,
            isSimpleValue: type.isSimpleValue || false
          });
          // Priority: 1) existing settings, 2) arg settings from script, 3) default init settings
          const existingSettings = existingContext?.visualizationSettings.get(key);
          const scriptArgSettings = op.argSettings;
          const defaultSettings = type.initSettings(key, tempContext);
          visualizationSettings.set(
            key,
            existingSettings ?? (scriptArgSettings ? { ...defaultSettings, ...scriptArgSettings } : defaultSettings),
          );
        }
      }
    });

    // Store context info
    this.contexts.set(definition.id, {
      definition,
      sharedBuffers: {
        x_c: x_c_buffers,
        y_c: y_c_buffers,
        currentPosition: currentPosition_buffer
      },
      visualizations,
      calculationTypes,
      simpleValues: new Map(),
      calculationSettings,
      visualizationSettings,
      visualizationDynamicSettings: existingContext?.visualizationDynamicSettings ?? new Map()
    });
    
    // Send to worker
    const message: InitContextMessage = {
      type: WorkerMessageType.INIT_CONTEXT,
      payload: {
        definition,
        sharedBuffers: {
          x_c: x_c_buffers,
          y_c: y_c_buffers,
          currentPosition: currentPosition_buffer
        }
      }
    };
    
    this.worker?.postMessage(message);
    
    // Set as active context (sends message to worker)
    this.setActiveContext(definition.id);
    
    // Update audio engine with new shared buffers and nc
    if (this.audioEngine.isInitialized()) {
      this.audioEngine.updateSharedBuffers({
        x_c: x_c_buffers,
        y_c: y_c_buffers,
        currentPosition: currentPosition_buffer
      }, nc);
    }
    
    return definition.id;
  }

  updateContextSettings(contextId: COMPUTATION_CONTEXT_ID, settings: CalculationContextSettings): void {
    const context = this.contexts.get(contextId);
    if (context) {
      // Re-initialize context with new settings
      this.initContext(contextId, settings, context.definition.script, context.sharedBuffers.x_c.length);
    }
  }

  updateCalculationSetting(contextId: COMPUTATION_CONTEXT_ID, key: CONTEXT_KEY, setting: any): void {
    // Update local context immediately
    const context = this.contexts.get(contextId);
    if (context) {
      context.calculationSettings.set(key, setting);
    }
    // Send to worker
    this.updateSetting(contextId, key, setting);
  }

  updateVisualizationSetting(contextId: COMPUTATION_CONTEXT_ID, key: CONTEXT_KEY, setting: any): void {
    // Update local context immediately
    const context = this.contexts.get(contextId);
    if (context) {
      context.visualizationSettings.set(key, setting);
    }
    this.vizSettingsVersion.update(v => v + 1);
    // Send to worker
    this.updateSetting(contextId, key, setting);
  }

  updateVisualizationDynamicSettings(contextId: COMPUTATION_CONTEXT_ID, visKey: CONTEXT_KEY, settings: any): void {
    // Update local context immediately
    const context = this.contexts.get(contextId);
    if (context) {
      context.visualizationDynamicSettings.set(visKey, settings);
    }
    // Send to worker
    const message: UpdateVisualizationDynamicSettingsMessage = {
      type: WorkerMessageType.UPDATE_VISUALIZATION_DYNAMIC_SETTINGS,
      payload: { contextId, visKey, settings }
    };
    this.worker?.postMessage(message);
  }

  getVisualizationDynamicSettings(contextId: COMPUTATION_CONTEXT_ID, visKey: CONTEXT_KEY): any {
    return this.contexts.get(contextId)?.visualizationDynamicSettings.get(visKey);
  }

  getCalculationTypeId(contextId: COMPUTATION_CONTEXT_ID, key: CONTEXT_KEY): string | undefined {
    return this.contexts.get(contextId)?.calculationTypes.get(key);
  }

  getContextIds(): COMPUTATION_CONTEXT_ID[] {
    return Array.from(this.contexts.keys());
  }

  updateSetting(contextId: COMPUTATION_CONTEXT_ID, key: CONTEXT_KEY, value: any): void {
    const message: UpdateSettingMessage = {
      type: WorkerMessageType.UPDATE_SETTING,
      payload: { contextId, key, value }
    };
    
    this.worker?.postMessage(message);
  }

  updateScript(contextId: COMPUTATION_CONTEXT_ID, script: string): void {
    const message: UpdateScriptMessage = {
      type: WorkerMessageType.UPDATE_SCRIPT,
      payload: { contextId, script }
    };
    
    this.worker?.postMessage(message);
  }

  updatePositionOffset(contextId: COMPUTATION_CONTEXT_ID, offset: number): void {
    const message: UpdatePositionOffsetMessage = {
      type: WorkerMessageType.UPDATE_POSITION_OFFSET,
      payload: { contextId, offset }
    };
    
    this.worker?.postMessage(message);
  }

  updateNAverage(contextId: COMPUTATION_CONTEXT_ID, nAverage: number): void {
    this.worker?.postMessage({
      type: WorkerMessageType.UPDATE_N_AVERAGE,
      payload: { contextId, nAverage }
    });
  }

  /** Update the global active analysis frequency range. The worker uses this
   *  to bandpass-filter implicit `Y_c` (and the redefined implicit `y_c`).
   *  Pass `null` for either bound to disable filtering on that side; pass
   *  `null` for the whole range to disable filtering entirely. */
  updateActiveFrequencyRange(
    contextId: COMPUTATION_CONTEXT_ID,
    range: { low: number; high: number } | null,
  ): void {
    this.activeFrequencyRange.set(range);
    this.worker?.postMessage({
      type: WorkerMessageType.UPDATE_ACTIVE_FREQ_RANGE,
      payload: {
        contextId,
        low: range?.low ?? null,
        high: range?.high ?? null,
      },
    });
  }

  setMode(mode: 'live' | 'offline'): void {
    this.mode.set(mode);
    
    const message: SetModeMessage = {
      type: WorkerMessageType.SET_MODE,
      payload: { mode }
    };
    
    this.worker?.postMessage(message);
  }
  
  setActiveContext(contextId: COMPUTATION_CONTEXT_ID): void {
    this.activeContextId.set(contextId);
    
    const message: SetActiveContextMessage = {
      type: WorkerMessageType.SET_ACTIVE_CONTEXT,
      payload: { contextId }
    };
    
    this.worker?.postMessage(message);
  }

  destroyContext(contextId: COMPUTATION_CONTEXT_ID): void {
    if (!contextId) return;
    
    // Remove from local map
    this.contexts.delete(contextId);
    
    // Tell worker to clean up
    const message: DestroyContextMessage = {
      type: WorkerMessageType.DESTROY_CONTEXT,
      payload: { contextId }
    };
    this.worker?.postMessage(message);
  }

  triggerCalculation(force: boolean = false): void {
    this.isCalculating.set(true);

    this.worker?.postMessage({
      type: WorkerMessageType.TRIGGER_CALCULATION,
      payload: {
        force,
      }
    });
  }

  checkWebGPUSupport(): void {
    const message: CheckWebGPUSupportMessage = {
      type: WorkerMessageType.CHECK_WEBGPU_SUPPORT
    };
    this.worker?.postMessage(message);
  }

  setContextType(contextType: 'webgpu' | 'webgl2' | '2d'): void {
    this.useWebGPU.set(contextType === 'webgpu');
    this.useWebGL2.set(contextType === 'webgl2');
    const message: SetContextTypeMessage = {
      type: WorkerMessageType.SET_CONTEXT_TYPE,
      payload: { contextType }
    };
    this.worker?.postMessage(message);
  }

  checkWebGL2Support(): void {
    const message: CheckWebGL2SupportMessage = {
      type: WorkerMessageType.CHECK_WEBGL2_SUPPORT
    };
    this.worker?.postMessage(message);
  }

  toggleContextType(): void {
    if (this.useWebGPU()) {
      if (this.webGL2Supported()) {
        this.setContextType('webgl2');
      } else {
        this.setContextType('2d');
      }
    } else if (this.useWebGL2()) {
      this.setContextType('2d');
    } else {
      if (this.webGPUSupported()) {
        this.setContextType('webgpu');
      } else if (this.webGL2Supported()) {
        this.setContextType('webgl2');
      }
    }
  }

  transferCanvas(
    contextId: COMPUTATION_CONTEXT_ID,
    visKey: CONTEXT_KEY,
    canvas: HTMLCanvasElement
  ): void {
    const rect = canvas.getBoundingClientRect();
    const offscreen = canvas.transferControlToOffscreen();
    
    const message: TransferCanvasMessage = {
      type: WorkerMessageType.TRANSFER_CANVAS,
      payload: {
        contextId,
        visKey,
        canvas: offscreen,
        width: rect.width,
        height: rect.height
      }
    };
    
    this.worker?.postMessage(message, [offscreen]);
  }

  unregisterCanvas(contextId: COMPUTATION_CONTEXT_ID, visKey: CONTEXT_KEY): void {
    const message: UnregisterCanvasMessage = {
      type: WorkerMessageType.UNREGISTER_CANVAS,
      payload: {
        contextId,
        visKey
      }
    };
    
    this.worker?.postMessage(message);
  }

  resizeCanvas(
    contextId: COMPUTATION_CONTEXT_ID,
    visKey: CONTEXT_KEY,
    width: number,
    height: number
  ): void {
    const message: ResizeCanvasMessage = {
      type: WorkerMessageType.RESIZE_CANVAS,
      payload: {
        contextId,
        visKey,
        width,
        height
      }
    };
    
    this.worker?.postMessage(message);
  }

  getSimpleValue(contextId: COMPUTATION_CONTEXT_ID, visKey: CONTEXT_KEY): any {
    const context = this.contexts.get(contextId);
    return context?.simpleValues.get(visKey);
  }

  getSignalGenerators(): SignalGenerator[] {
    return Array.from(this.signalGenerators.values());
  }

  generateSignal(generatorId: SIGNAL_ID, len: number, sampleRate: number): Float32Array | null {
    const generator = this.signalGenerators.get(generatorId);
    if (generator) {
      return generator.generate(len, sampleRate);
    }
    return null;
  }

  updateExcitationSignal(contextId: COMPUTATION_CONTEXT_ID, signal: Float32Array): void {
    this.updateExcitationSignals(contextId, [signal]);
  }

  updateExcitationSignals(contextId: COMPUTATION_CONTEXT_ID, signals: Float32Array[]): void {
    const context = this.contexts.get(contextId);
    if (!context || signals.length === 0) {
      return;
    }

    for (let index = 0; index < context.sharedBuffers.x_c.length; index += 1) {
      const target = new Float32Array(context.sharedBuffers.x_c[index]);
      const source = signals[index % signals.length];

      if (source.length >= target.length) {
        target.set(source.subarray(0, target.length));
      } else {
        target.fill(0);
        target.set(source);
      }
    }
  }

  updatePosition(contextId: COMPUTATION_CONTEXT_ID, position: number): void {
    const context = this.contexts.get(contextId);
    if (context) {
      const positionBuffer = new Int32Array(context.sharedBuffers.currentPosition);
      Atomics.store(positionBuffer, 0, position);
    }
  }

  updateRecordedBuffers(
    contextId: COMPUTATION_CONTEXT_ID,
    buffers: Float32Array[],
    currentPosition?: number
  ): void {
    const context = this.contexts.get(contextId);
    if (!context) return;

    const targetBuffers = context.sharedBuffers.y_c;
    for (let i = 0; i < Math.min(targetBuffers.length, buffers.length); i++) {
      const target = new Float32Array(targetBuffers[i]);
      const source = buffers[i];
      const nc = target.length;

      if (source.length >= nc) {
        // Copy the most recent nc samples
        target.set(source.subarray(source.length - nc));
      } else {
        // Copy all available and zero-fill the rest
        target.fill(0);
        target.set(source, nc - source.length);
      }
    }

    for (let i = buffers.length; i < targetBuffers.length; i++) {
      new Float32Array(targetBuffers[i]).fill(0);
    }

    if (currentPosition !== undefined) {
      const positionBuffer = new Int32Array(context.sharedBuffers.currentPosition);
      const bufferLength = targetBuffers[0] ? new Float32Array(targetBuffers[0]).length : 1;
      const sourceLength = buffers[0]?.length ?? bufferLength;
      const writeOffset = Math.max(0, bufferLength - sourceLength);
      const effectiveCurrentPosition = currentPosition === 0 && sourceLength > 0
        ? sourceLength
        : currentPosition;
      let normalizedPosition = (writeOffset + effectiveCurrentPosition) % bufferLength;
      if (normalizedPosition < 0) {
        normalizedPosition += bufferLength;
      }
      Atomics.store(positionBuffer, 0, normalizedPosition);
    }
  }

  getContext(contextId: COMPUTATION_CONTEXT_ID) {
    return this.contexts.get(contextId);
  }

  requestCalculationResults(
    contextId: COMPUTATION_CONTEXT_ID,
    keys: CONTEXT_KEY[],
  ): Promise<Record<CONTEXT_KEY, any>> {
    if (!this.worker) {
      return Promise.reject(new Error('Calculation worker is not available'));
    }

    if (!this.contexts.has(contextId)) {
      return Promise.reject(new Error(`Unknown calculation context: ${contextId}`));
    }

    const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `result-snapshot-${Date.now()}-${++this.resultSnapshotRequestCounter}`;

    const message: RequestResultSnapshotMessage = {
      type: WorkerMessageType.REQUEST_RESULT_SNAPSHOT,
      payload: {
        requestId,
        contextId,
        keys,
      }
    };

    return new Promise<Record<CONTEXT_KEY, any>>((resolve, reject) => {
      this.pendingResultSnapshotRequests.set(requestId, { resolve, reject });
      this.worker?.postMessage(message);
    });
  }

  /**
   * Get the visualization type ID for a given context key.
   * This allows inferring the visualization type from the contextKey alone.
   */
  getVisualizationType(contextId: COMPUTATION_CONTEXT_ID, contextKey: CONTEXT_KEY): string | null {
    const context = this.contexts.get(contextId);
    if (!context) return null;
    
    const visInfo = context.visualizations.get(contextKey);
    return visInfo?.type || null;
  }

  getVisualizationComponent(visualizationType: string, contextKey: CONTEXT_KEY, context: CalculationContext): any {
    const visType = this.visualizationTypes.get(visualizationType);
    if (!visType) return null;

    // Always use getVisualizationUI - each visualization type returns its own component
    // (e.g., CanvasDisplay for 2D plots, CanvasDisplay3D for 3D plots)
    if (visType.getVisualizationUI) {
      return visType.getVisualizationUI(contextKey, context);
    }
    return null;
  }

  getCalculationResult(contextId: COMPUTATION_CONTEXT_ID, key: CONTEXT_KEY): any {
    const context = this.contexts.get(contextId);
    if (!context) return null;
    
    // For visualizations, check simple values first
    const simpleValue = context.simpleValues.get(key);
    if (simpleValue !== undefined) {
      return simpleValue;
    }
    
    // Otherwise would need to read from SharedArrayBuffer
    // This is handled by the components themselves accessing the shared memory
    return null;
  }

  destroy(): void {
    this.pendingResultSnapshotRequests.forEach(({ reject }) => reject(new Error('Calculation manager destroyed')));
    this.pendingResultSnapshotRequests.clear();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
