import { LayoutNode } from '../components/layout/split-pane/split-pane';
import {
  PresetSignalType,
  PresetSourceDefinition,
  isPresetSignalType,
  normalizePresetSourceDefinition,
} from './source-config';

export type PresetOrigin = 'built-in' | 'user';

export interface ContextPreset {
  id: string;
  name: string;
  description: string;
  script: string; // Can use # for comments (start of line or end of line)
  scriptVariables: Record<string, unknown>; // Variables context passed to MiniJinja evaluation of script before parsing
  layout: LayoutNode;
  signalType: PresetSignalType;
  source: PresetSourceDefinition;
  settings: {
    nc: number;
    n_y: number;
  };
  /** Optional default for the global active analysis frequency range. The
   *  top-bar dual-handle slider initializes from this when a preset loads;
   *  user adjustments override at runtime without modifying the preset. */
  defaultFrequencyRange?: { low: number; high: number };
  origin?: PresetOrigin;
  updatedAt?: string;
}

type ContextPresetInput = Partial<ContextPreset> & {
  signalType?: PresetSignalType | string;
  source?: Partial<PresetSourceDefinition>;
};

export function normalizeContextPreset(value: ContextPresetInput): ContextPreset {
  if (!isRecord(value)) {
    throw new Error('Preset must be an object');
  }

  const settings = normalizePresetSettings(value.settings);
  const fallbackSignalType = isPresetSignalType(value.signalType)
    ? value.signalType
    : 'PERFECT_WHITE';
  const source = normalizePresetSourceDefinition(value.source, fallbackSignalType, settings.nc);

  return {
    id: readString(value.id, 'id'),
    name: readString(value.name, 'name'),
    description: readString(value.description, 'description'),
    script: readString(value.script, 'script'),
    scriptVariables: isRecord(value.scriptVariables)
      ? clonePlainValue(value.scriptVariables) as Record<string, unknown>
      : {},
    layout: readLayout(value.layout),
    signalType: source.defaults.signalType,
    source,
    settings,
    defaultFrequencyRange: normalizeFrequencyRange(value.defaultFrequencyRange),
    origin: value.origin === 'built-in' || value.origin === 'user' ? value.origin : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  };
}

function normalizePresetSettings(value: unknown): ContextPreset['settings'] {
  if (!isRecord(value)) {
    throw new Error('Preset settings must be an object');
  }

  const nc = readPositiveInteger(value['nc'], 'settings.nc');
  const n_y = readPositiveInteger(value['n_y'], 'settings.n_y');

  return { nc, n_y };
}

function normalizeFrequencyRange(value: unknown): { low: number; high: number } | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return undefined;
  const low = Number(value['low']);
  const high = Number(value['high']);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= low) {
    return undefined;
  }
  return { low, high };
}

function readLayout(value: unknown): LayoutNode {
  if (!isRecord(value)) {
    throw new Error('Preset layout must be an object');
  }

  return clonePlainValue(value) as unknown as LayoutNode;
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Preset ${fieldName} must be a string`);
  }

  return value;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Preset ${fieldName} must be a positive integer`);
  }

  return value;
}

function clonePlainValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
