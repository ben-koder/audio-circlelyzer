export type PresetSignalType =
  | 'PERFECT_WHITE'
  | 'PERFECT_PINK'
  | 'WHITE'
  | 'PINK'
  | 'WAVE_FILE'
  | 'ZADOFF_CHU'
  | 'MULTI_SOURCE_WHITE';

/**
 * All known signal types, in display order.  Used as the default list when a
 * preset does not declare an explicit `supportedSignalTypes` array.
 */
export const ALL_PRESET_SIGNAL_TYPES: readonly PresetSignalType[] = [
  'PERFECT_WHITE',
  'PERFECT_PINK',
  'WHITE',
  'PINK',
  'WAVE_FILE',
  'ZADOFF_CHU',
  'MULTI_SOURCE_WHITE',
];

/**
 * Standard circular buffer lengths (powers of two).  Used as the default list
 * when a preset does not declare an explicit `supportedCircularLengths` array.
 */
export const STANDARD_CIRCULAR_LENGTHS: readonly number[] = [
  1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288,
];

export type SourceRoutingMode = 'mirrored_mono' | 'direct';

export interface WaveFileSourceMetadata {
  fileName: string;
  channelCount: number;
  sampleRate: number;
  frameCount: number;
  fileSizeBytes?: number;
  lastModified?: number;
}

export interface ResolvedSourceConfig {
  signalType: PresetSignalType;
  circularLength: number;
  logicalSourceCount: number;
  outputChannelCount: number;
  routingMode: SourceRoutingMode;
  zadoffChuRoot?: number;
  waveFile?: WaveFileSourceMetadata;
}

/**
 * Multi-source flag for a preset.
 *
 *   { enabled: false }                  – preset does not use multi-source.
 *   { enabled: true, default: false }   – multi-source supported but off by default.
 *   { enabled: true, default: true }    – multi-source supported and on by default.
 */
export interface PresetMultiSourceFlag {
  enabled: boolean;
  default?: boolean;
}

/**
 * Simplified preset source definition.  All fields except `defaults` are
 * optional: omit them to mean "all of the standard options are supported".
 */
export interface PresetSourceDefinition {
  defaults: ResolvedSourceConfig;
  /** When omitted, all signal types are accepted. */
  supportedSignalTypes?: PresetSignalType[];
  /** When omitted, all standard circular buffer lengths are accepted. */
  supportedCircularLengths?: number[];
  /** When omitted, multi-source is disabled. */
  multiSource?: PresetMultiSourceFlag;
}

export const DEFAULT_OUTPUT_CHANNEL_COUNT = 2;

export function isPresetSignalType(value: unknown): value is PresetSignalType {
  return value === 'PERFECT_WHITE'
    || value === 'PERFECT_PINK'
    || value === 'WHITE'
    || value === 'PINK'
    || value === 'WAVE_FILE'
    || value === 'ZADOFF_CHU'
    || value === 'MULTI_SOURCE_WHITE';
}

export function isSourceRoutingMode(value: unknown): value is SourceRoutingMode {
  return value === 'mirrored_mono' || value === 'direct';
}

export function createDefaultResolvedSourceConfig(
  signalType: PresetSignalType,
  circularLength: number,
): ResolvedSourceConfig {
  return normalizeResolvedSourceConfig(undefined, signalType, circularLength);
}

export function normalizePresetSourceDefinition(
  value: Partial<PresetSourceDefinition> | undefined,
  fallbackSignalType: PresetSignalType,
  fallbackCircularLength: number,
): PresetSourceDefinition {
  const defaults = normalizeResolvedSourceConfig(
    value?.defaults,
    fallbackSignalType,
    fallbackCircularLength,
  );

  const supportedSignalTypes = Array.isArray(value?.supportedSignalTypes)
    ? Array.from(new Set(value!.supportedSignalTypes!.filter(isPresetSignalType)))
    : undefined;
  const supportedCircularLengths = Array.isArray(value?.supportedCircularLengths)
    ? Array.from(
        new Set(
          value!.supportedCircularLengths!.filter(
            (entry): entry is number => typeof entry === 'number' && Number.isInteger(entry) && entry > 0,
          ),
        ),
      )
    : undefined;
  const multiSource = value?.multiSource && typeof value.multiSource === 'object'
    ? {
        enabled: Boolean(value.multiSource.enabled),
        default: value.multiSource.default === undefined ? undefined : Boolean(value.multiSource.default),
      }
    : undefined;

  return applyPresetDefaults({
    defaults,
    supportedSignalTypes,
    supportedCircularLengths,
    multiSource,
  });
}

/**
 * Pin `defaults` so it satisfies the preset's own constraints (signal type and
 * circular length).  This avoids having to re-validate every read site.
 */
function applyPresetDefaults(definition: PresetSourceDefinition): PresetSourceDefinition {
  const allowedSignalTypes = definition.supportedSignalTypes ?? ALL_PRESET_SIGNAL_TYPES;
  const allowedLengths = definition.supportedCircularLengths ?? STANDARD_CIRCULAR_LENGTHS;
  const signalType = allowedSignalTypes.includes(definition.defaults.signalType)
    ? definition.defaults.signalType
    : allowedSignalTypes[0] ?? definition.defaults.signalType;
  const circularLength = allowedLengths.includes(definition.defaults.circularLength)
    ? definition.defaults.circularLength
    : allowedLengths[0] ?? definition.defaults.circularLength;

  return {
    ...definition,
    defaults: {
      ...definition.defaults,
      signalType,
      circularLength,
    },
  };
}

export function resolvePresetSourceConfig(
  definition: PresetSourceDefinition,
  candidate?: Partial<ResolvedSourceConfig>,
): ResolvedSourceConfig {
  const base = normalizeResolvedSourceConfig(
    candidate,
    definition.defaults.signalType,
    definition.defaults.circularLength,
  );

  return applySourceConstraints(base, definition);
}

export function normalizeResolvedSourceConfig(
  value: Partial<ResolvedSourceConfig> | undefined,
  fallbackSignalType: PresetSignalType,
  fallbackCircularLength: number,
): ResolvedSourceConfig {
  const signalType = isPresetSignalType(value?.signalType)
    ? value!.signalType!
    : fallbackSignalType;
  const outputChannelCount = clampPositiveInteger(
    value?.outputChannelCount,
    DEFAULT_OUTPUT_CHANNEL_COUNT,
  );
  const routingMode = isSourceRoutingMode(value?.routingMode)
    ? value!.routingMode!
    : 'mirrored_mono';
  const logicalSourceCount = routingMode === 'direct'
    ? outputChannelCount
    : 1;
  const circularLength = clampPositiveInteger(value?.circularLength, fallbackCircularLength);

  return {
    signalType,
    circularLength,
    logicalSourceCount,
    outputChannelCount,
    routingMode,
    zadoffChuRoot: signalType === 'ZADOFF_CHU'
      ? clampPositiveInteger(value?.zadoffChuRoot, 1)
      : undefined,
    waveFile: signalType === 'WAVE_FILE'
      ? normalizeWaveFileSourceMetadata(value?.waveFile)
      : undefined,
  };
}

function normalizeWaveFileSourceMetadata(value: unknown): WaveFileSourceMetadata | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const rawValue = value as Partial<WaveFileSourceMetadata>;
  const fileName = typeof rawValue.fileName === 'string' ? rawValue.fileName.trim() : '';
  if (!fileName) {
    return undefined;
  }

  const channelCount = clampPositiveInteger(rawValue.channelCount, 1);
  const sampleRate = clampPositiveInteger(rawValue.sampleRate, 48000);
  const frameCount = clampPositiveInteger(rawValue.frameCount, 1);
  const fileSizeBytes = rawValue.fileSizeBytes === undefined
    ? undefined
    : clampPositiveInteger(rawValue.fileSizeBytes, 1);
  const lastModified = rawValue.lastModified === undefined
    ? undefined
    : clampPositiveInteger(rawValue.lastModified, 1);

  return {
    fileName,
    channelCount,
    sampleRate,
    frameCount,
    fileSizeBytes,
    lastModified,
  };
}

function applySourceConstraints(
  config: ResolvedSourceConfig,
  definition: PresetSourceDefinition,
): ResolvedSourceConfig {
  const allowedSignalTypes = definition.supportedSignalTypes ?? ALL_PRESET_SIGNAL_TYPES;
  const allowedLengths = definition.supportedCircularLengths ?? STANDARD_CIRCULAR_LENGTHS;
  const signalType = allowedSignalTypes.includes(config.signalType)
    ? config.signalType
    : definition.defaults.signalType;
  const circularLength = allowedLengths.includes(config.circularLength)
    ? config.circularLength
    : definition.defaults.circularLength;

  return {
    signalType,
    circularLength,
    outputChannelCount: config.outputChannelCount,
    routingMode: config.routingMode,
    logicalSourceCount: config.routingMode === 'direct' ? config.outputChannelCount : 1,
    zadoffChuRoot: signalType === 'ZADOFF_CHU'
      ? clampPositiveInteger(config.zadoffChuRoot, definition.defaults.zadoffChuRoot ?? 1)
      : undefined,
    waveFile: signalType === 'WAVE_FILE' ? config.waveFile : undefined,
  };
}

function clampPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}