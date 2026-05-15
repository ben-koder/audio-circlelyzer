import { ContextPreset } from './context-presets';
import { PresetSignalType, SourceRoutingMode, WaveFileSourceMetadata } from './source-config';

export type RecordingSourceType =
  | 'perfect_white'
  | 'perfect_pink'
  | 'white'
  | 'pink'
  | 'multi_source_white'
  | 'wave_file'
  | 'output_with_filter'
  | 'zadoff_chu'
  | 'custom';

export type RecordingCaptureMode = 'microphone' | 'simulated';

export interface RecordingArchiveFormat {
  kind: 'audio-circlelyzer-recording';
  version: 1;
}

export interface RecordingArchivePresetReference {
  id: string | null;
  name: string | null;
}

export interface RecordingResolvedSourceConfig {
  sourceType: RecordingSourceType;
  /** Optional excitation-group identifier, preserved from the archive YAML. */
  groupId?: string;
  signalType?: PresetSignalType;
  circularLength: number;
  logicalSourceCount: number;
  outputChannelCount: number;
  routingMode: SourceRoutingMode;
  zadoffChuRoot?: number;
  waveFile?: WaveFileSourceMetadata;
}

export interface RecordingArchiveMetadata {
  id: string;
  name: string;
  createdAt: string;
  captureMode: RecordingCaptureMode;
  sourceType: RecordingSourceType;
  resolvedSource?: RecordingResolvedSourceConfig;
  sampleRate: number;
  circularLength: number;
  recordingLength: number;
  recordingPosition: number;
  sourceChannelCount: number;
  recordingChannelCount: number;
  notes?: string;
  preset: RecordingArchivePresetReference;
}

export interface RecordingArchiveSignalPayload {
  encoding: 'f32le-base64';
  channels: string[];
}

export interface RecordingArchiveDocument {
  format: RecordingArchiveFormat;
  metadata: RecordingArchiveMetadata;
  excitation: RecordingArchiveSignalPayload;
  recording: RecordingArchiveSignalPayload;
}

export interface CreateRecordingArchiveInput {
  name?: string;
  createdAt?: string;
  captureMode: RecordingCaptureMode;
  sourceType: RecordingSourceType;
  resolvedSource?: RecordingResolvedSourceConfig;
  sampleRate: number;
  circularLength: number;
  recordingPosition: number;
  excitationChannels: Float32Array[];
  recordedChannels: Float32Array[];
  sourceChannelCount?: number;
  notes?: string;
  preset?: Pick<ContextPreset, 'id' | 'name'> | null;
}

export interface RecordingArchiveCompatibility {
  compatible: boolean;
  reasons: string[];
}

export interface DecodedRecordingArchive {
  excitationChannels: Float32Array[];
  recordedChannels: Float32Array[];
}