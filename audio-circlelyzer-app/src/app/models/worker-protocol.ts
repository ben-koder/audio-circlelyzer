import { CalculationContextDefinition, COMPUTATION_CONTEXT_ID, CONTEXT_KEY, VISUALIZATION_TYPE_ID, COMPUTATION_SCRIPT } from './types';

export enum WorkerMessageType {
  // UI → Worker
  INIT_CONTEXT = 'INIT_CONTEXT',
  UPDATE_SETTING = 'UPDATE_SETTING',
  UPDATE_SCRIPT = 'UPDATE_SCRIPT',
  UPDATE_VISUALIZATION_DYNAMIC_SETTINGS = 'UPDATE_VISUALIZATION_DYNAMIC_SETTINGS',
  UPDATE_POSITION_OFFSET = 'UPDATE_POSITION_OFFSET',
  UPDATE_N_AVERAGE = 'UPDATE_N_AVERAGE',
  UPDATE_ACTIVE_FREQ_RANGE = 'UPDATE_ACTIVE_FREQ_RANGE',
  SET_MODE = 'SET_MODE',
  SET_ACTIVE_CONTEXT = 'SET_ACTIVE_CONTEXT',
  TRIGGER_CALCULATION = 'TRIGGER_CALCULATION',
  TRANSFER_CANVAS = 'TRANSFER_CANVAS',
  UNREGISTER_CANVAS = 'UNREGISTER_CANVAS',
  RESIZE_CANVAS = 'RESIZE_CANVAS',
  DESTROY_CONTEXT = 'DESTROY_CONTEXT',
  SET_CONTEXT_TYPE = 'SET_CONTEXT_TYPE',
  CHECK_WEBGPU_SUPPORT = 'CHECK_WEBGPU_SUPPORT',
  CHECK_WEBGL2_SUPPORT = 'CHECK_WEBGL2_SUPPORT',
  REQUEST_RESULT_SNAPSHOT = 'REQUEST_RESULT_SNAPSHOT',
  UI_READY = 'UI_READY',
  SET_PLOT_PREFERENCES = 'SET_PLOT_PREFERENCES',
  
  // Worker → UI
  CONTEXT_INITIALIZED = 'CONTEXT_INITIALIZED',
  CALCULATION_COMPLETE = 'CALCULATION_COMPLETE',
  ERROR = 'ERROR',
  CANVAS_RENDERED = 'CANVAS_RENDERED',
  WEBGPU_SUPPORT = 'WEBGPU_SUPPORT',
  WEBGL2_SUPPORT = 'WEBGL2_SUPPORT',
  RESULT_SNAPSHOT = 'RESULT_SNAPSHOT',
}

export interface WorkerMessage {
  type: WorkerMessageType;
  payload?: any;
}

// UI → Worker Messages

export interface InitContextMessage extends WorkerMessage {
  type: WorkerMessageType.INIT_CONTEXT;
  payload: {
    definition: CalculationContextDefinition;
    sharedBuffers: {
      x_c: SharedArrayBuffer[];  // Now multichannel
      y_c: SharedArrayBuffer[];
      currentPosition: SharedArrayBuffer;  // Int32Array for Atomics
    };
  };
}

export interface UpdateSettingMessage extends WorkerMessage {
  type: WorkerMessageType.UPDATE_SETTING;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    key: CONTEXT_KEY;
    value: any;
  };
}

export interface UpdateScriptMessage extends WorkerMessage {
  type: WorkerMessageType.UPDATE_SCRIPT;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    script: COMPUTATION_SCRIPT;
  };
}

export interface UpdateVisualizationDynamicSettingsMessage extends WorkerMessage {
  type: WorkerMessageType.UPDATE_VISUALIZATION_DYNAMIC_SETTINGS;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    visKey: CONTEXT_KEY;
    settings: any;
  };
}

export interface UpdatePositionOffsetMessage extends WorkerMessage {
  type: WorkerMessageType.UPDATE_POSITION_OFFSET;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    offset: number;  // 0-1 range, proportion of nc
  };
}

export interface UpdateNAverageMessage extends WorkerMessage {
  type: WorkerMessageType.UPDATE_N_AVERAGE;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    nAverage: number;  // 1, 2, 4, 8, ... — capped to n_y by the worker
  };
}

/** Sets the global active analysis frequency range. The worker uses this to
 *  bandpass the implicit `Y_c` (and consequently the implicit `y_c =
 *  IFFT(Y_c)`) so all downstream calculations operate on the band of interest.
 *  `low`/`high` are in Hz; `null` disables filtering at that end. */
export interface UpdateActiveFreqRangeMessage extends WorkerMessage {
  type: WorkerMessageType.UPDATE_ACTIVE_FREQ_RANGE;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    low: number | null;
    high: number | null;
  };
}

export interface SetModeMessage extends WorkerMessage {
  type: WorkerMessageType.SET_MODE;
  payload: {
    mode: 'live' | 'offline';
  };
}

export interface SetActiveContextMessage extends WorkerMessage {
  type: WorkerMessageType.SET_ACTIVE_CONTEXT;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
  };
}

export interface TransferCanvasMessage extends WorkerMessage {
  type: WorkerMessageType.TRANSFER_CANVAS;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    visKey: CONTEXT_KEY;
    canvas: OffscreenCanvas;
    width: number;
    height: number;
  };
}
export interface UnregisterCanvasMessage {
  type: WorkerMessageType.UNREGISTER_CANVAS;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    visKey: CONTEXT_KEY;
  };
}
export interface ResizeCanvasMessage extends WorkerMessage {
  type: WorkerMessageType.RESIZE_CANVAS;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    visKey: CONTEXT_KEY;
    width: number;
    height: number;
  };
}

export interface DestroyContextMessage extends WorkerMessage {
  type: WorkerMessageType.DESTROY_CONTEXT;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
  };
}

export interface TriggerCalculationMessage extends WorkerMessage {
  type: WorkerMessageType.TRIGGER_CALCULATION;
  payload?: {
    force?: boolean;
  };
}

export interface SetContextTypeMessage extends WorkerMessage {
  type: WorkerMessageType.SET_CONTEXT_TYPE;
  payload: {
    contextType: 'webgpu' | 'webgl2' | '2d';
  };
}

export interface CheckWebGPUSupportMessage extends WorkerMessage {
  type: WorkerMessageType.CHECK_WEBGPU_SUPPORT;
}

export interface CheckWebGL2SupportMessage extends WorkerMessage {
  type: WorkerMessageType.CHECK_WEBGL2_SUPPORT;
}

export interface RequestResultSnapshotMessage extends WorkerMessage {
  type: WorkerMessageType.REQUEST_RESULT_SNAPSHOT;
  payload: {
    requestId: string;
    contextId: COMPUTATION_CONTEXT_ID;
    keys: CONTEXT_KEY[];
  };
}

export interface UIReadyMessage extends WorkerMessage {
  type: WorkerMessageType.UI_READY;
}

export interface PlotPreferencesPayload {
  autoscaleAlgorithm: 'minmax' | 'percentile';
  percentileLow: number;
  percentileHigh: number;
  percentilePadding: number;
}

export interface SetPlotPreferencesMessage extends WorkerMessage {
  type: WorkerMessageType.SET_PLOT_PREFERENCES;
  payload: PlotPreferencesPayload;
}

// Worker → UI

export interface WebGPUSupportMessage extends WorkerMessage {
  type: WorkerMessageType.WEBGPU_SUPPORT;
  payload: {
    supported: boolean;
  };
}

export interface WebGL2SupportMessage extends WorkerMessage {
  type: WorkerMessageType.WEBGL2_SUPPORT;
  payload: {
    supported: boolean;
  };
}

// Worker → UI Messages

export interface ContextInitializedMessage extends WorkerMessage {
  type: WorkerMessageType.CONTEXT_INITIALIZED;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    visualizations: {
      key: CONTEXT_KEY;
      type: VISUALIZATION_TYPE_ID;
      isSimpleValue: boolean;
    }[];
  };
}

export interface CalculationCompleteMessage extends WorkerMessage {
  type: WorkerMessageType.CALCULATION_COMPLETE;
  payload: {
    contextId: COMPUTATION_CONTEXT_ID;
    simpleValues?: {  // For RT60, etc.
      [key: CONTEXT_KEY]: any;
    };
  };
}

export interface CanvasRenderedMessage extends WorkerMessage {
  type: WorkerMessageType.CANVAS_RENDERED;
  payload: {
    visKey: CONTEXT_KEY;
  };
}

export interface ErrorMessage extends WorkerMessage {
  type: WorkerMessageType.ERROR;
  payload: {
    message: string;
    stack?: string;
  };
}

export interface ResultSnapshotMessage extends WorkerMessage {
  type: WorkerMessageType.RESULT_SNAPSHOT;
  payload: {
    requestId: string;
    contextId: COMPUTATION_CONTEXT_ID;
    results?: {
      [key: CONTEXT_KEY]: any;
    };
    error?: string;
  };
}
