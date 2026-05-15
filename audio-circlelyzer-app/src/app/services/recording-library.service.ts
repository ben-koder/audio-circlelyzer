import { Injectable, computed, inject, signal } from '@angular/core';
import { ContextPreset } from '../models/context-presets';
import {
  CreateRecordingArchiveInput,
  DecodedRecordingArchive,
  RecordingArchiveCompatibility,
  RecordingArchiveDocument,
} from '../models/recording-archive';
import { RecordingArchiveService } from './recording-archive.service';

const IDB_NAME = 'audio-circlelyzer';
const IDB_VERSION = 1;
const IDB_ARCHIVES_STORE = 'recording-archives';
const IDB_META_STORE = 'recording-library-meta';
const IDB_META_SELECTED_KEY = 'selected-recording-id';

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_ARCHIVES_STORE)) {
        db.createObjectStore(IDB_ARCHIVES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDB_META_STORE)) {
        db.createObjectStore(IDB_META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

@Injectable({
  providedIn: 'root'
})
export class RecordingLibraryService {
  private readonly archiveService = inject(RecordingArchiveService);
  private readonly decodedCache = new Map<string, DecodedRecordingArchive>();
  private readonly linearizedCache = new Map<string, Float32Array[]>();
  private readonly previewCache = new Map<string, number[]>();
  private readonly _readyPromise: Promise<void>;

  readonly recordings = signal<RecordingArchiveDocument[]>([]);
  readonly selectedRecordingId = signal<string | null>(null);
  readonly selectedBuiltInRecordingId = signal<string | null>(null);
  readonly builtInRecording = signal<RecordingArchiveDocument | null>(null);
  readonly offlinePositionRatio = signal(1);
  /**
   * Set of recording ids that are in an "unsaved" state. Unsaved recordings
   * are kept in-memory only (not persisted) and are auto-discarded when a new
   * recording is captured. They are NOT included in workspace exports.
   */
  readonly unsavedRecordingIds = signal<ReadonlySet<string>>(new Set());
  readonly selectedRecording = computed(() => {
    const builtInRecording = this.builtInRecording();
    if (builtInRecording) {
      return builtInRecording;
    }

    return this.recordings().find(recording => recording.metadata.id === this.selectedRecordingId()) ?? null;
  });
  readonly selectedRecordingCursor = computed(() => {
    const recording = this.selectedRecording();
    return recording
      ? this.archiveService.mapLinearPositionToRecordingCursor(recording, this.offlinePositionRatio())
      : null;
  });

  constructor() {
    this._readyPromise = this.hydrateAsync();
  }

  /** Resolves once the initial IndexedDB hydration has completed. */
  waitForReady(): Promise<void> {
    return this._readyPromise;
  }

  createArchive(input: CreateRecordingArchiveInput, options: { persist?: boolean; unsaved?: boolean } = {}): RecordingArchiveDocument {
    const archive = this.archiveService.createArchive(input);
    this.addArchive(archive, options);
    return archive;
  }

  addArchive(archive: RecordingArchiveDocument, options: { persist?: boolean; unsaved?: boolean } = {}): void {
    this.clearBuiltInRecording();
    this.clearCaches(archive.metadata.id);

    // When adding an unsaved recording, discard any prior unsaved one so the
    // library does not accumulate transient takes.
    let baseRecordings = this.recordings();
    if (options.unsaved) {
      const unsavedIds = this.unsavedRecordingIds();
      if (unsavedIds.size > 0) {
        baseRecordings = baseRecordings.filter((entry) => !unsavedIds.has(entry.metadata.id));
      }
    }

    const nextRecordings = this.sortRecordings([
      archive,
      ...baseRecordings.filter(existing => existing.metadata.id !== archive.metadata.id),
    ]);

    // Update unsaved set: drop prior unsaved ids; add this id only when unsaved.
    const nextUnsaved = new Set<string>();
    for (const id of this.unsavedRecordingIds()) {
      if (!options.unsaved && id !== archive.metadata.id && nextRecordings.some((r) => r.metadata.id === id)) {
        nextUnsaved.add(id);
      }
    }
    if (options.unsaved) {
      nextUnsaved.add(archive.metadata.id);
    }
    this.unsavedRecordingIds.set(nextUnsaved);

    this.recordings.set(nextRecordings);
    this.selectedRecordingId.set(archive.metadata.id);
    this.offlinePositionRatio.set(this.defaultPositionFor(archive));
    // Default behaviour: persist unless explicitly opted out, and never persist
    // unsaved recordings (they are transient until the user clicks "save").
    const shouldPersist = options.persist !== false && !options.unsaved;
    if (shouldPersist) {
      this.persist();
    }
  }

  /** Mark a previously unsaved recording as saved (kept on next capture, persisted). */
  markRecordingSaved(recordingId: string): void {
    const unsaved = this.unsavedRecordingIds();
    if (!unsaved.has(recordingId)) {
      return;
    }
    const next = new Set(unsaved);
    next.delete(recordingId);
    this.unsavedRecordingIds.set(next);
    this.persist();
  }

  /** Update the display name of a recording (in-memory + persisted if saved). */
  renameRecording(recordingId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const updated = this.recordings().map((entry) =>
      entry.metadata.id === recordingId
        ? { ...entry, metadata: { ...entry.metadata, name: trimmed } }
        : entry,
    );
    this.recordings.set(updated);
    if (!this.unsavedRecordingIds().has(recordingId)) {
      this.persist();
    }
  }

  /**
   * Compute the next auto-incremented "Recording N" name based on existing
   * recordings whose names match the pattern.
   */
  nextAutoRecordingName(prefix: string = 'Recording'): string {
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`);
    let max = 0;
    for (const entry of this.recordings()) {
      const match = re.exec(entry.metadata.name);
      if (match) {
        const n = Number.parseInt(match[1], 10);
        if (Number.isFinite(n) && n > max) {
          max = n;
        }
      }
    }
    return `${prefix} ${max + 1}`;
  }

  /** Remove all recordings (saved + unsaved) from the library. */
  clearWorkspace(): void {
    for (const entry of this.recordings()) {
      this.clearCaches(entry.metadata.id);
    }
    this.recordings.set([]);
    this.unsavedRecordingIds.set(new Set());
    this.selectedRecordingId.set(null);
    this.offlinePositionRatio.set(0);
    this.persist();
  }

  /**
   * Download the entire saved-recordings library as a single workspace bundle
   * (JSON wrapper around per-archive YAML strings). Unsaved entries are
   * excluded. Returns true when at least one archive was bundled.
   */
  exportWorkspace(): boolean {
    const unsaved = this.unsavedRecordingIds();
    const archives = this.recordings().filter((entry) => !unsaved.has(entry.metadata.id));
    if (archives.length === 0) {
      return false;
    }
    const bundle = {
      format: { kind: 'audio-circlelyzer-workspace' as const, version: 1 as const },
      exportedAt: new Date().toISOString(),
      archives: archives.map((entry) => this.archiveService.serializeArchive(entry)),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audio-circlelyzer-workspace-${new Date().toISOString().slice(0, 10)}.workspace.json`;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  /**
   * Import a workspace bundle file. Each contained archive is added as a saved
   * recording. Returns the number of archives successfully imported.
   */
  async importWorkspaceFile(file: File): Promise<number> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`Could not parse workspace file as JSON: ${(error as Error).message}`);
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Workspace file must contain a JSON object');
    }
    const bundle = parsed as { format?: { kind?: string }; archives?: unknown };
    if (bundle.format?.kind !== 'audio-circlelyzer-workspace') {
      throw new Error('File is not an audio-circlelyzer workspace bundle');
    }
    if (!Array.isArray(bundle.archives)) {
      throw new Error('Workspace bundle is missing "archives" list');
    }
    let imported = 0;
    for (const yamlEntry of bundle.archives) {
      if (typeof yamlEntry !== 'string') {
        continue;
      }
      try {
        const archive = this.archiveService.parseArchive(yamlEntry);
        this.addArchive(archive, { persist: false });
        imported += 1;
      } catch (error) {
        console.warn('Skipping invalid archive in workspace bundle', error);
      }
    }
    if (imported > 0) {
      this.persist();
    }
    return imported;
  }

  importArchiveText(yamlContent: string): RecordingArchiveDocument {
    const archive = this.archiveService.parseArchive(yamlContent);
    this.addArchive(archive);
    return archive;
  }

  loadBuiltInArchive(recordingId: string, archive: RecordingArchiveDocument): void {
    this.clearBuiltInRecording();
    this.clearCaches(archive.metadata.id);
    this.builtInRecording.set(archive);
    this.selectedBuiltInRecordingId.set(recordingId);
    this.offlinePositionRatio.set(this.defaultPositionFor(archive));
  }

  async importArchiveFile(file: File): Promise<RecordingArchiveDocument> {
    return this.importArchiveText(await file.text());
  }

  downloadArchive(recordingId: string | null = this.selectedRecording()?.metadata.id ?? null): boolean {
    if (!recordingId) {
      return false;
    }

    const recording = this.resolveRecording(recordingId);
    if (!recording) {
      return false;
    }

    const yamlContent = this.archiveService.serializeArchive(recording);
    const blob = new Blob([yamlContent], { type: 'application/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.sanitizeFileName(recording.metadata.name)}.recording.yaml`;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  selectRecording(recordingId: string): void {
    this.clearBuiltInRecording();
    this.selectedRecordingId.set(recordingId);
    const rec = this.recordings().find(r => r.metadata.id === recordingId);
    this.offlinePositionRatio.set(rec ? this.defaultPositionFor(rec) : 0);
    this.persist();
  }

  deleteRecording(recordingId: string): void {
    this.recordings.set(this.recordings().filter(recording => recording.metadata.id !== recordingId));
    this.clearCaches(recordingId);

    const unsaved = this.unsavedRecordingIds();
    if (unsaved.has(recordingId)) {
      const next = new Set(unsaved);
      next.delete(recordingId);
      this.unsavedRecordingIds.set(next);
    }

    if (this.selectedRecordingId() === recordingId) {
      const next = this.recordings()[0] ?? null;
      this.selectedRecordingId.set(next?.metadata.id ?? null);
      this.offlinePositionRatio.set(next ? this.defaultPositionFor(next) : 0);
    }

    this.persist();
  }

  /** Compute the default position placing the analysis window at the end of the recording (no wrap). */
  private defaultPositionFor(archive: RecordingArchiveDocument): number {
    const { circularLength, recordingLength } = archive.metadata;
    if (!recordingLength || !circularLength) return 0;
    const cycleLen = Math.min(circularLength, recordingLength);
    return Math.max(0, (recordingLength - cycleLen) / recordingLength);
  }

  setOfflinePositionRatio(ratio: number): void {
    this.offlinePositionRatio.set(Math.max(0, Math.min(0.9999, ratio)));
  }

  stepOfflinePosition(direction: number): void {
    const recording = this.selectedRecording();
    if (!recording) {
      return;
    }

    const hopRatio = this.getHopRatio(recording);
    this.setOfflinePositionRatio(this.offlinePositionRatio() + hopRatio * direction);
  }

  getCompatibility(
    recording: RecordingArchiveDocument,
    preset: Pick<ContextPreset, 'id' | 'name' | 'settings' | 'source'>,
  ): RecordingArchiveCompatibility {
    return this.archiveService.checkPresetCompatibility(recording, preset);
  }

  getDecodedArchive(recording: RecordingArchiveDocument): DecodedRecordingArchive {
    const cached = this.decodedCache.get(recording.metadata.id);
    if (cached) {
      return cached;
    }

    const decoded = this.archiveService.decodeArchive(recording);
    this.decodedCache.set(recording.metadata.id, decoded);
    return decoded;
  }

  getLinearizedRecordedChannels(recording: RecordingArchiveDocument): Float32Array[] {
    const cached = this.linearizedCache.get(recording.metadata.id);
    if (cached) {
      return cached;
    }

    const linearized = this.archiveService.linearizeRecordedChannels(recording);
    this.linearizedCache.set(recording.metadata.id, linearized);
    return linearized;
  }

  getWaveformPreview(recording: RecordingArchiveDocument, pointCount: number = 320): number[] {
    const cacheKey = `${recording.metadata.id}:${pointCount}`;
    const cached = this.previewCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const linearized = this.getLinearizedRecordedChannels(recording)[0];
    if (!linearized || linearized.length === 0) {
      return [];
    }

    const bucketCount = Math.min(pointCount, linearized.length);
    const preview = new Array<number>(bucketCount);
    const samplesPerBucket = linearized.length / bucketCount;

    for (let index = 0; index < bucketCount; index += 1) {
      const start = Math.floor(index * samplesPerBucket);
      const end = Math.max(start + 1, Math.floor((index + 1) * samplesPerBucket));
      let min = 1;
      let max = -1;

      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        const sample = linearized[sampleIndex];
        if (sample < min) {
          min = sample;
        }
        if (sample > max) {
          max = sample;
        }
      }

      preview[index] = Math.abs(max) >= Math.abs(min) ? max : min;
    }

    this.previewCache.set(cacheKey, preview);
    return preview;
  }

  getHopRatio(recording: RecordingArchiveDocument): number {
    return Math.min(1, recording.metadata.circularLength / recording.metadata.recordingLength);
  }

  private async hydrateAsync(): Promise<void> {
    if (!idbAvailable()) {
      return;
    }

    try {
      const db = await openLibraryDb();
      const tx = db.transaction([IDB_ARCHIVES_STORE, IDB_META_STORE], 'readonly');
      const archivesStore = tx.objectStore(IDB_ARCHIVES_STORE);
      const metaStore = tx.objectStore(IDB_META_STORE);

      const entries = await new Promise<Array<{ id: string; yaml: string }>>((resolve, reject) => {
        const req = archivesStore.getAll();
        req.onsuccess = () => resolve(req.result as Array<{ id: string; yaml: string }>);
        req.onerror = () => reject(req.error);
      });

      const selectedId = await new Promise<string | null>((resolve, reject) => {
        const req = metaStore.get(IDB_META_SELECTED_KEY);
        req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });

      db.close();

      const recordings = entries
        .map(entry => {
          try {
            return this.archiveService.parseArchive(entry.yaml);
          } catch (error) {
            console.warn('Skipping invalid persisted recording archive', error);
            return null;
          }
        })
        .filter((entry): entry is RecordingArchiveDocument => entry !== null);

      const sortedRecordings = this.sortRecordings(recordings);
      this.recordings.set(sortedRecordings);

      const resolvedSelectedId = sortedRecordings.some(entry => entry.metadata.id === selectedId)
        ? selectedId
        : sortedRecordings[0]?.metadata.id ?? null;
      this.selectedRecordingId.set(resolvedSelectedId);
    } catch (error) {
      console.warn('Could not hydrate recording library state from IndexedDB', error);
    }
  }

  private persist(): void {
    void this.persistAsync();
  }

  private async persistAsync(): Promise<void> {
    if (!idbAvailable()) {
      return;
    }
    try {
      const db = await openLibraryDb();
      const tx = db.transaction([IDB_ARCHIVES_STORE, IDB_META_STORE], 'readwrite');
      const archivesStore = tx.objectStore(IDB_ARCHIVES_STORE);
      const metaStore = tx.objectStore(IDB_META_STORE);

      archivesStore.clear();
      const unsaved = this.unsavedRecordingIds();
      for (const recording of this.recordings()) {
        // Unsaved (transient) recordings are never persisted to IndexedDB.
        if (unsaved.has(recording.metadata.id)) {
          continue;
        }
        archivesStore.put({
          id: recording.metadata.id,
          yaml: this.archiveService.serializeArchive(recording),
        });
      }
      metaStore.put(this.selectedRecordingId(), IDB_META_SELECTED_KEY);

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.warn('Could not persist recording library state to IndexedDB', error);
    }
  }

  private sortRecordings(recordings: RecordingArchiveDocument[]): RecordingArchiveDocument[] {
    return [...recordings].sort((left, right) =>
      right.metadata.createdAt.localeCompare(left.metadata.createdAt),
    );
  }

  private clearBuiltInRecording(): void {
    const builtInRecording = this.builtInRecording();
    if (builtInRecording) {
      this.clearCaches(builtInRecording.metadata.id);
    }

    this.builtInRecording.set(null);
    this.selectedBuiltInRecordingId.set(null);
  }

  private resolveRecording(recordingId: string): RecordingArchiveDocument | null {
    const builtInRecording = this.builtInRecording();
    if (builtInRecording?.metadata.id === recordingId) {
      return builtInRecording;
    }

    return this.recordings().find(entry => entry.metadata.id === recordingId) ?? null;
  }

  private clearCaches(recordingId: string): void {
    this.decodedCache.delete(recordingId);
    this.linearizedCache.delete(recordingId);
    for (const cacheKey of Array.from(this.previewCache.keys())) {
      if (cacheKey.startsWith(`${recordingId}:`)) {
        this.previewCache.delete(cacheKey);
      }
    }
  }

  private sanitizeFileName(value: string): string {
    return value.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'recording';
  }
}