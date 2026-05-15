import { Injectable, inject } from '@angular/core';
import { stringify } from 'yaml';
import { ContextPreset, normalizeContextPreset } from '../models/context-presets';
import { PresetLoaderService } from './preset-loader.service';

interface PersistedUserPresetStore {
  version: 1;
  presets: Array<{
    savedAt: string;
    preset: Omit<ContextPreset, 'origin' | 'updatedAt'>;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class PresetLibraryService {
  private readonly storageKey = 'audio-circlelyzer.user-presets.v1';
  private readonly presetLoader = inject(PresetLoaderService);

  private builtInPresets: ContextPreset[] = [];
  private userPresets: ContextPreset[] = [];
  private initialized = false;

  async loadPresets(): Promise<ContextPreset[]> {
    if (!this.initialized) {
      const builtInPresets = await this.presetLoader.loadPresets();
      this.builtInPresets = builtInPresets.map((preset) => ({
        ...this.clonePresetData(preset),
        origin: 'built-in',
      }));
      this.userPresets = this.loadUserPresetsFromStorage();
      this.initialized = true;
    }

    return this.getPresets();
  }

  getPresets(): ContextPreset[] {
    return [...this.builtInPresets, ...this.userPresets];
  }

  getPresetById(presetId: string): ContextPreset | undefined {
    return this.getPresets().find((preset) => preset.id === presetId);
  }

  getDefaultPreset(): ContextPreset | undefined {
    return this.builtInPresets.find((preset) => preset.id === 'room-analysis') ?? this.getPresets()[0];
  }

  savePreset(snapshot: ContextPreset, preferredName?: string): ContextPreset {
    this.assertInitialized();

    const savedAt = new Date().toISOString();
    const trimmedName = preferredName?.trim();

    if (snapshot.origin === 'user' && this.userPresets.some((preset) => preset.id === snapshot.id)) {
      const updatedPreset: ContextPreset = {
        ...this.clonePresetData(snapshot),
        name: trimmedName || snapshot.name,
        origin: 'user',
        updatedAt: savedAt,
      };

      this.userPresets = this.userPresets.map((preset) => preset.id === updatedPreset.id ? updatedPreset : preset);
      this.persistUserPresets();
      return updatedPreset;
    }

    const baseName = trimmedName || snapshot.name;
    const newPreset: ContextPreset = {
      ...this.clonePresetData(snapshot),
      id: this.createUniqueUserPresetId(baseName || snapshot.id),
      name: baseName,
      origin: 'user',
      updatedAt: savedAt,
    };

    this.userPresets = [newPreset, ...this.userPresets];
    this.persistUserPresets();
    return newPreset;
  }

  async importPresetFile(file: File): Promise<ContextPreset> {
    return this.importPresetText(await file.text(), file.name);
  }

  importPresetText(yamlContent: string, fileName?: string): ContextPreset {
    this.assertInitialized();

    const importedPreset = this.presetLoader.parsePresetYaml(yamlContent);
    const savedAt = new Date().toISOString();
    const fallbackId = fileName?.replace(/\.ya?ml$/i, '') || importedPreset.name || 'user-preset';

    const userPreset: ContextPreset = {
      ...this.clonePresetData(importedPreset),
      id: this.createUniqueUserPresetId(importedPreset.id || fallbackId),
      origin: 'user',
      updatedAt: savedAt,
    };

    this.userPresets = [userPreset, ...this.userPresets];
    this.persistUserPresets();
    return userPreset;
  }

  deleteUserPreset(presetId: string): boolean {
    this.assertInitialized();

    const beforeCount = this.userPresets.length;
    this.userPresets = this.userPresets.filter((preset) => preset.id !== presetId);

    if (this.userPresets.length === beforeCount) {
      return false;
    }

    this.persistUserPresets();
    return true;
  }

  downloadPreset(preset: ContextPreset): boolean {
    const yamlContent = stringify(this.toSerializablePreset(preset));
    const blob = new Blob([yamlContent], { type: 'application/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.sanitizeFileName(preset.name)}.preset.yaml`;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  private loadUserPresetsFromStorage(): ContextPreset[] {
    const rawValue = localStorage.getItem(this.storageKey);
    if (!rawValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawValue) as Partial<PersistedUserPresetStore>;
      if (parsed.version !== 1 || !Array.isArray(parsed.presets)) {
        console.warn('Ignoring invalid preset storage payload');
        return [];
      }

      return parsed.presets
        .map((entry) => this.restorePersistedPreset(entry))
        .filter((preset): preset is ContextPreset => preset !== null);
    } catch (error) {
      console.warn('Failed to restore user presets from storage:', error);
      return [];
    }
  }

  private restorePersistedPreset(
    entry: PersistedUserPresetStore['presets'][number] | Partial<PersistedUserPresetStore['presets'][number]>,
  ): ContextPreset | null {
    if (!entry || typeof entry !== 'object' || typeof entry.savedAt !== 'string' || !entry.preset) {
      return null;
    }

    const preset = entry.preset as Partial<ContextPreset>;
    if (!this.isPresetShape(preset)) {
      return null;
    }

    return normalizeContextPreset({
      ...preset,
      origin: 'user',
      updatedAt: entry.savedAt,
    });
  }

  private persistUserPresets(): void {
    const payload: PersistedUserPresetStore = {
      version: 1,
      presets: this.userPresets.map((preset) => ({
        savedAt: preset.updatedAt ?? new Date().toISOString(),
        preset: this.toSerializablePreset(preset),
      })),
    };

    localStorage.setItem(this.storageKey, JSON.stringify(payload));
  }

  private toSerializablePreset(preset: ContextPreset): Omit<ContextPreset, 'origin' | 'updatedAt'> {
    const cloned = this.clonePresetData(preset);
    return {
      id: cloned.id,
      name: cloned.name,
      description: cloned.description,
      script: cloned.script,
      scriptVariables: cloned.scriptVariables,
      layout: cloned.layout,
      signalType: cloned.signalType,
      source: cloned.source,
      settings: cloned.settings,
    };
  }

  private clonePresetData(preset: ContextPreset): Omit<ContextPreset, 'origin' | 'updatedAt'> {
    const normalized = normalizeContextPreset(preset);

    return {
      id: normalized.id,
      name: normalized.name,
      description: normalized.description,
      script: normalized.script,
      scriptVariables: this.clonePlainValue(normalized.scriptVariables) as Record<string, unknown>,
      layout: this.clonePlainValue(normalized.layout),
      signalType: normalized.signalType,
      source: this.clonePlainValue(normalized.source),
      settings: {
        nc: normalized.settings.nc,
        n_y: normalized.settings.n_y,
      },
    };
  }

  private clonePlainValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private createUniqueUserPresetId(source: string): string {
    const normalizedSource = this.slugify(source) || 'user-preset';
    const baseId = normalizedSource.startsWith('user-') ? normalizedSource : `user-${normalizedSource}`;

    if (!this.getPresetById(baseId)) {
      return baseId;
    }

    let counter = 2;
    while (this.getPresetById(`${baseId}-${counter}`)) {
      counter += 1;
    }

    return `${baseId}-${counter}`;
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private sanitizeFileName(value: string): string {
    const sanitized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return sanitized || 'audio-circlelyzer-preset';
  }

  private isPresetShape(value: Partial<ContextPreset>): value is ContextPreset {
    try {
      normalizeContextPreset(value);
      return true;
    } catch {
      return false;
    }
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('Preset library must be loaded before use');
    }
  }
}