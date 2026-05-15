import { Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { DemoCatalogEntry, DemoCatalogManifest } from '../models/demo-catalog';
import { RecordingArchiveDocument } from '../models/recording-archive';
import { RecordingArchiveService } from './recording-archive.service';

@Injectable({
  providedIn: 'root'
})
export class DemoCatalogService {
  private readonly archiveService = inject(RecordingArchiveService);
  private readonly document = inject(DOCUMENT);
  private readonly archiveCache = new Map<string, RecordingArchiveDocument>();

  readonly demos = signal<DemoCatalogEntry[]>([]);
  readonly loadState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly loadError = signal<string | null>(null);

  async loadCatalog(): Promise<DemoCatalogEntry[]> {
    if (this.loadState() === 'ready') {
      return this.demos();
    }

    this.loadState.set('loading');
    this.loadError.set(null);

    try {
      const response = await fetch(new URL('testdata/index.json', this.document.baseURI).href);
      if (!response.ok) {
        throw new Error(`Could not load demo catalog: ${response.status}`);
      }

      const manifest = this.normalizeManifest(await response.json());
      this.demos.set(manifest.demos);
      this.loadState.set('ready');
      return manifest.demos;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load demo catalog';
      this.loadError.set(message);
      this.loadState.set('error');
      this.demos.set([]);
      return [];
    }
  }

  async loadArchive(entryId: string): Promise<RecordingArchiveDocument> {
    const cached = this.archiveCache.get(entryId);
    if (cached) {
      return cached;
    }

    const entry = this.demos().find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new Error(`Unknown demo entry: ${entryId}`);
    }

    // archivePath in the manifest uses root-relative paths (e.g. /testdata/...).
    // Strip the leading slash so new URL() resolves it against <base href>.
    const archiveUrl = new URL(entry.archivePath.replace(/^\//, ''), this.document.baseURI).href;
    const response = await fetch(archiveUrl);
    if (!response.ok) {
      throw new Error(`Could not load demo archive: ${response.status}`);
    }

    const archive = this.archiveService.parseArchive(await response.text());
    this.archiveCache.set(entryId, archive);
    return archive;
  }

  private normalizeManifest(value: unknown): DemoCatalogManifest {
    if (!this.isRecord(value) || value['version'] !== 1 || !Array.isArray(value['demos'])) {
      throw new Error('Demo catalog manifest is invalid');
    }

    const demos = value['demos'].map((entry, index) => this.normalizeEntry(entry, index));
    return {
      version: 1,
      generatedAt: this.readOptionalString(value['generatedAt']),
      demos,
    };
  }

  private normalizeEntry(value: unknown, index: number): DemoCatalogEntry {
    if (!this.isRecord(value)) {
      throw new Error(`Demo catalog entry ${index} is invalid`);
    }

    return {
      id: this.readRequiredString(value['id'], `demos[${index}].id`),
      title: this.readRequiredString(value['title'], `demos[${index}].title`),
      description: this.readRequiredString(value['description'], `demos[${index}].description`),
      category: this.readRequiredString(value['category'], `demos[${index}].category`),
      presetIds: this.readStringArray(value['presetIds'], `demos[${index}].presetIds`),
      archivePath: this.normalizePublicPath(this.readRequiredString(value['archivePath'], `demos[${index}].archivePath`)),
      expectedPath: this.normalizePublicPath(this.readRequiredString(value['expectedPath'], `demos[${index}].expectedPath`)),
      tags: this.readStringArray(value['tags'], `demos[${index}].tags`),
      recommendedCursorRatios: this.readNumberArray(value['recommendedCursorRatios'], `demos[${index}].recommendedCursorRatios`),
      sourceSummary: this.readOptionalString(value['sourceSummary']),
      systemSummary: this.readOptionalString(value['systemSummary']),
      validationTargets: this.readStringArray(value['validationTargets'], `demos[${index}].validationTargets`),
      notes: this.readOptionalString(value['notes']),
    };
  }

  private readRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${fieldName} must be a non-empty string`);
    }

    return value.trim();
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readStringArray(value: unknown, fieldName: string): string[] {
    if (!Array.isArray(value)) {
      throw new Error(`${fieldName} must be an array`);
    }

    return value.map((entry, index) => this.readRequiredString(entry, `${fieldName}[${index}]`));
  }

  private readNumberArray(value: unknown, fieldName: string): number[] {
    if (!Array.isArray(value)) {
      throw new Error(`${fieldName} must be an array`);
    }

    return value.map((entry, index) => {
      if (typeof entry !== 'number' || Number.isNaN(entry)) {
        throw new Error(`${fieldName}[${index}] must be a number`);
      }

      return Math.max(0, Math.min(1, entry));
    });
  }

  private normalizePublicPath(value: string): string {
    return value.startsWith('/') ? value : `/${value}`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}