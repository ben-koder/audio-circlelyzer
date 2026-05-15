import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ContextPreset, normalizeContextPreset } from '../models/context-presets';
import { WasmService } from './wasm.service';
import * as wasm from '../../assets/wasm/audio_circlelyzer_wasm.js';

interface PresetIndex {
  presets: string[];
}

/**
 * Service for loading and managing context presets from YAML files.
 * Presets are loaded at runtime and can use MiniJinja templating.
 */
@Injectable({
  providedIn: 'root'
})
export class PresetLoaderService {
  private readonly wasmService = inject(WasmService);
  private readonly document = inject(DOCUMENT);
  private loadedPresets: ContextPreset[] = [];
  private initialized = false;

  /**
   * Load all presets from YAML files in the presets directory.
   * Ensures WASM is initialized before parsing.
   */
  async loadPresets(): Promise<ContextPreset[]> {
    if (this.initialized) {
      return this.loadedPresets;
    }

    // Ensure WASM is initialized before parsing YAML
    await this.wasmService.initialize();

    try {
      // Fetch the preset index — resolve relative to <base href> so the path
      // is correct regardless of the deployment sub-directory.
      const base = this.document.baseURI;
      const indexResponse = await fetch(new URL('presets/index.yaml', base).href);
      if (!indexResponse.ok) {
        console.warn('Could not load preset index, using empty preset list');
        return [];
      }

      const indexYaml = await indexResponse.text();
      const index = this.parseIndexYaml(indexYaml);

      // Load each preset file
      const presetPromises = index.presets.map(async (filename) => {
        try {
          const response = await fetch(new URL(`presets/${filename}`, base).href);
          if (!response.ok) {
            console.warn(`Could not load preset: ${filename}`);
            return null;
          }
          const yamlContent = await response.text();
          return this.parsePresetYaml(yamlContent);
        } catch (error) {
          console.error(`Error loading preset ${filename}:`, error);
          return null;
        }
      });

      const results = await Promise.all(presetPromises);
      this.loadedPresets = results.filter((p): p is ContextPreset => p !== null);
      this.initialized = true;

      return this.loadedPresets;
    } catch (error) {
      console.error('Error loading presets:', error);
      return [];
    }
  }

  /**
   * Parse the preset index YAML (simple parser for the index file)
   */
  private parseIndexYaml(yaml: string): PresetIndex {
    // Simple YAML parser for the index file
    const lines = yaml.split('\n');
    const presets: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        presets.push(trimmed.substring(2).trim());
      }
    }
    
    return { presets };
  }

  /**
   * Parse a preset YAML file using WASM
   */
  parsePresetYaml(yamlContent: string, variables?: Record<string, unknown>): ContextPreset {
    const variablesJson = variables ? JSON.stringify(variables) : '';
    const preset = wasm.parsePresetYamlWithTemplating(yamlContent, variablesJson);
    return normalizeContextPreset(preset as Partial<ContextPreset>);
  }

  /**
   * Process a script template with MiniJinja variables
   */
  processScriptTemplate(script: string, variables: Record<string, unknown>): string {
    return wasm.processScriptTemplate(script, JSON.stringify(variables));
  }

  /**
   * Strip comments from a script
   */
  stripScriptComments(script: string): string {
    return wasm.stripScriptComments(script);
  }

  /**
   * Get all loaded presets
   */
  getPresets(): ContextPreset[] {
    return this.loadedPresets;
  }

  /**
   * Get a preset by ID
   */
  getPresetById(id: string): ContextPreset | undefined {
    return this.loadedPresets.find(p => p.id === id);
  }

  /**
   * Check if presets have been loaded
   */
  isLoaded(): boolean {
    return this.initialized;
  }
}
