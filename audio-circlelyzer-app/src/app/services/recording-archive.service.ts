import { Injectable } from '@angular/core';
import { parse, stringify } from 'yaml';
import { ContextPreset } from '../models/context-presets';
import {
  CreateRecordingArchiveInput,
  DecodedRecordingArchive,
  RecordingArchiveCompatibility,
  RecordingCaptureMode,
  RecordingArchiveDocument,
  RecordingArchiveSignalPayload,
  RecordingArchiveMetadata,
  RecordingResolvedSourceConfig,
  RecordingSourceType,
} from '../models/recording-archive';
import {
  isPresetSignalType,
  isSourceRoutingMode,
  WaveFileSourceMetadata,
} from '../models/source-config';

@Injectable({
  providedIn: 'root'
})
export class RecordingArchiveService {
  createArchive(input: CreateRecordingArchiveInput): RecordingArchiveDocument {
    if (input.excitationChannels.length === 0) {
      throw new Error('Recording archive requires at least one excitation channel');
    }

    if (input.recordedChannels.length === 0) {
      throw new Error('Recording archive requires at least one recorded channel');
    }

    const resolvedSource = input.resolvedSource
      ? this.normalizeResolvedSource(input.resolvedSource, input.sourceType, input.circularLength)
      : undefined;
    const sourceChannelCount = input.sourceChannelCount ?? resolvedSource?.logicalSourceCount ?? 1;
    const recordingLength = input.recordedChannels[0].length;
    const recordingPosition = this.normalizeRingPosition(input.recordingPosition, recordingLength);

    const metadata: RecordingArchiveMetadata = {
      id: this.createArchiveId(),
      name: input.name?.trim() || this.createDefaultName(input.sourceType, input.createdAt),
      createdAt: input.createdAt ?? new Date().toISOString(),
      captureMode: input.captureMode,
      sourceType: resolvedSource?.sourceType ?? input.sourceType,
      resolvedSource,
      sampleRate: input.sampleRate,
      circularLength: input.circularLength,
      recordingLength,
      recordingPosition,
      sourceChannelCount,
      recordingChannelCount: input.recordedChannels.length,
      notes: input.notes?.trim() || undefined,
      preset: {
        id: input.preset?.id ?? null,
        name: input.preset?.name ?? null,
      },
    };

    this.assertMetadata(metadata);
    this.assertChannels(
      input.excitationChannels,
      metadata.circularLength,
      input.excitationChannels.length,
      'excitation',
    );
    this.assertChannels(
      input.recordedChannels,
      metadata.recordingLength,
      metadata.recordingChannelCount,
      'recording',
    );

    return {
      format: {
        kind: 'audio-circlelyzer-recording',
        version: 1,
      },
      metadata,
      excitation: {
        encoding: 'f32le-base64',
        channels: input.excitationChannels.map(channel => this.encodeChannel(channel)),
      },
      recording: {
        encoding: 'f32le-base64',
        channels: input.recordedChannels.map(channel => this.encodeChannel(channel)),
      },
    };
  }

  serializeArchive(archive: RecordingArchiveDocument): string {
    this.assertArchive(archive);
    return stringify(archive);
  }

  parseArchive(yamlContent: string): RecordingArchiveDocument {
    const parsed = parse(yamlContent);
    return this.normalizeArchive(parsed);
  }

  decodeArchive(archive: RecordingArchiveDocument): DecodedRecordingArchive {
    this.assertArchive(archive);

    return {
      excitationChannels: this.decodePayload(
        archive.excitation,
        archive.metadata.circularLength,
        archive.excitation.channels.length,
        'excitation',
      ),
      recordedChannels: this.decodePayload(
        archive.recording,
        archive.metadata.recordingLength,
        archive.metadata.recordingChannelCount,
        'recording',
      ),
    };
  }

  decodeExcitationChannels(archive: RecordingArchiveDocument): Float32Array[] {
    return this.decodeArchive(archive).excitationChannels;
  }

  decodeRecordedChannels(archive: RecordingArchiveDocument): Float32Array[] {
    return this.decodeArchive(archive).recordedChannels;
  }

  linearizeRecordedChannels(archive: RecordingArchiveDocument): Float32Array[] {
    const decoded = this.decodeRecordedChannels(archive);
    const { recordingPosition, recordingLength } = archive.metadata;

    return decoded.map(channel => {
      const linear = new Float32Array(recordingLength);
      linear.set(channel.subarray(recordingPosition));
      linear.set(channel.subarray(0, recordingPosition), recordingLength - recordingPosition);
      return linear;
    });
  }

  mapLinearPositionToRecordingCursor(
    archive: RecordingArchiveDocument,
    positionRatio: number,
  ): number {
    const clampedRatio = Math.max(0, Math.min(0.9999, positionRatio));
    const { circularLength, recordingLength, recordingPosition } = archive.metadata;
    // Circular model: positionRatio IS the window-start fraction of recordingLength.
    // cursor = ring-buffer position of the window END.
    const cycleLen = Math.min(circularLength, recordingLength);
    const windowStartSample = Math.round(clampedRatio * recordingLength);
    return (recordingPosition + windowStartSample + cycleLen) % recordingLength;
  }

  checkPresetCompatibility(
    archive: RecordingArchiveDocument,
    preset: Pick<ContextPreset, 'id' | 'name' | 'settings' | 'source'>,
  ): RecordingArchiveCompatibility {
    const reasons: string[] = [];
    const resolvedSource = archive.metadata.resolvedSource;

    if (archive.metadata.circularLength !== preset.settings.nc) {
      reasons.push(
        `Circular length mismatch: archive has ${archive.metadata.circularLength}, preset requires ${preset.settings.nc}`,
      );
    }

    if (resolvedSource?.signalType
        && preset.source.supportedSignalTypes
        && !preset.source.supportedSignalTypes.includes(resolvedSource.signalType)) {
      reasons.push(
        `Signal type mismatch: archive uses ${resolvedSource.signalType}, preset supports ${preset.source.supportedSignalTypes.join(', ')}`,
      );
    }

    if (resolvedSource) {
      // outputChannelCount and routingMode are no longer constrained per-preset
      // in the simplified source model — accept whatever the archive recorded.
    }

    if (archive.metadata.recordingLength < archive.metadata.circularLength) {
      reasons.push('Recording data is shorter than one circular source length');
    }

    return {
      compatible: reasons.length === 0,
      reasons,
    };
  }

  private normalizeArchive(value: unknown): RecordingArchiveDocument {
    if (!this.isRecord(value)) {
      throw new Error('Archive YAML must parse to an object');
    }

    const format = this.readFormat(value['format']);
    const metadata = this.readMetadata(value['metadata']);
    const excitation = this.readSignalPayload(
      value['excitation'],
      metadata.circularLength,
      undefined,
      'excitation',
    );
    const recording = this.readSignalPayload(
      value['recording'],
      metadata.recordingLength,
      metadata.recordingChannelCount,
      'recording',
    );

    const archive: RecordingArchiveDocument = {
      format,
      metadata,
      excitation,
      recording,
    };

    this.assertArchive(archive);
    return archive;
  }

  private readFormat(value: unknown): RecordingArchiveDocument['format'] {
    if (!this.isRecord(value)) {
      throw new Error('Archive format must be an object');
    }

    if (value['kind'] !== 'audio-circlelyzer-recording') {
      throw new Error('Unsupported archive kind');
    }

    if (value['version'] !== 1) {
      throw new Error('Unsupported archive version');
    }

    return {
      kind: 'audio-circlelyzer-recording',
      version: 1,
    };
  }

  private readMetadata(value: unknown): RecordingArchiveMetadata {
    if (!this.isRecord(value)) {
      throw new Error('Archive metadata must be an object');
    }

    const presetValue = value['preset'];
    if (!this.isRecord(presetValue)) {
      throw new Error('Archive preset metadata must be an object');
    }

    const sourceType = this.readSourceType(value['sourceType']);
    const circularLength = this.readPositiveInteger(value['circularLength'], 'metadata.circularLength');

    const metadata: RecordingArchiveMetadata = {
      id: this.readString(value['id'], 'metadata.id'),
      name: this.readString(value['name'], 'metadata.name'),
      createdAt: this.readString(value['createdAt'], 'metadata.createdAt'),
      captureMode: this.readCaptureMode(value['captureMode']),
      sourceType,
      resolvedSource:
        value['resolvedSource'] === undefined
          ? undefined
          : this.readResolvedSource(value['resolvedSource'], sourceType, circularLength),
      sampleRate: this.readPositiveNumber(value['sampleRate'], 'metadata.sampleRate'),
      circularLength,
      recordingLength: this.readPositiveInteger(value['recordingLength'], 'metadata.recordingLength'),
      recordingPosition: this.readNonNegativeInteger(value['recordingPosition'], 'metadata.recordingPosition'),
      sourceChannelCount: this.readPositiveInteger(value['sourceChannelCount'], 'metadata.sourceChannelCount'),
      recordingChannelCount: this.readPositiveInteger(value['recordingChannelCount'], 'metadata.recordingChannelCount'),
      notes:
        value['notes'] === undefined
          ? undefined
          : this.readString(value['notes'], 'metadata.notes'),
      preset: {
        id: this.readNullableString(presetValue['id'], 'metadata.preset.id'),
        name: this.readNullableString(presetValue['name'], 'metadata.preset.name'),
      },
    };

    this.assertMetadata(metadata);
    return metadata;
  }

  private readSignalPayload(
    value: unknown,
    expectedLength: number,
    expectedChannelCount: number | undefined,
    fieldName: string,
  ): RecordingArchiveSignalPayload {
    if (!this.isRecord(value)) {
      throw new Error(`Archive ${fieldName} must be an object`);
    }

    if (value['encoding'] !== 'f32le-base64') {
      throw new Error(`Unsupported archive ${fieldName} encoding`);
    }

    if (!Array.isArray(value['channels'])) {
      throw new Error(`Archive ${fieldName} channels must be an array`);
    }

    const channels = value['channels'].map((entry, index) =>
      this.readString(entry, `${fieldName}.channels[${index}]`),
    );

    if (expectedChannelCount !== undefined && channels.length !== expectedChannelCount) {
      throw new Error(`Archive ${fieldName} channel count does not match metadata`);
    }

    const payload: RecordingArchiveSignalPayload = {
      encoding: 'f32le-base64',
      channels,
    };

    this.assertPayload(payload, expectedLength, expectedChannelCount, fieldName);
    return payload;
  }

  private assertArchive(archive: RecordingArchiveDocument): void {
    if (archive.format.kind !== 'audio-circlelyzer-recording' || archive.format.version !== 1) {
      throw new Error('Unsupported archive format');
    }

    this.assertMetadata(archive.metadata);

    this.assertPayload(archive.excitation, archive.metadata.circularLength, undefined, 'excitation');
    this.assertPayload(
      archive.recording,
      archive.metadata.recordingLength,
      archive.metadata.recordingChannelCount,
      'recording',
    );
  }

  private assertPayload(
    payload: RecordingArchiveSignalPayload,
    expectedLength: number,
    expectedChannelCount: number | undefined,
    fieldName: string,
  ): void {
    if (payload.encoding !== 'f32le-base64') {
      throw new Error(`Unsupported archive ${fieldName} encoding`);
    }

    if (expectedChannelCount !== undefined && payload.channels.length !== expectedChannelCount) {
      throw new Error(`Archive ${fieldName} channel count does not match metadata`);
    }

    const decodedChannels = payload.channels.map(channel => this.decodeChannel(channel));
    this.assertChannels(
      decodedChannels,
      expectedLength,
      payload.channels.length,
      fieldName,
    );
  }

  private assertMetadata(metadata: RecordingArchiveMetadata): void {
    if (!metadata.id.trim()) {
      throw new Error('Archive metadata id is required');
    }

    if (!metadata.name.trim()) {
      throw new Error('Archive metadata name is required');
    }

    if (!Number.isFinite(metadata.sampleRate) || metadata.sampleRate <= 0) {
      throw new Error('Archive metadata sampleRate must be positive');
    }

    if (!Number.isInteger(metadata.circularLength) || metadata.circularLength <= 0) {
      throw new Error('Archive metadata circularLength must be a positive integer');
    }

    if (!Number.isInteger(metadata.recordingLength) || metadata.recordingLength <= 0) {
      throw new Error('Archive metadata recordingLength must be a positive integer');
    }

    if (!Number.isInteger(metadata.recordingPosition) || metadata.recordingPosition < 0) {
      throw new Error('Archive metadata recordingPosition must be a non-negative integer');
    }

    if (metadata.recordingPosition >= metadata.recordingLength) {
      throw new Error('Archive metadata recordingPosition must be within the recording buffer length');
    }

    if (!Number.isInteger(metadata.sourceChannelCount) || metadata.sourceChannelCount <= 0) {
      throw new Error('Archive metadata sourceChannelCount must be a positive integer');
    }

    if (!Number.isInteger(metadata.recordingChannelCount) || metadata.recordingChannelCount <= 0) {
      throw new Error('Archive metadata recordingChannelCount must be a positive integer');
    }

    if (metadata.recordingLength < metadata.circularLength) {
      throw new Error('Archive metadata recordingLength must be at least circularLength');
    }

    if (metadata.resolvedSource) {
      this.assertResolvedSource(metadata.resolvedSource, metadata.sourceType, metadata.circularLength);
    }
  }

  private assertChannels(
    channels: Float32Array[],
    expectedLength: number,
    expectedChannelCount: number,
    fieldName: string,
  ): void {
    if (channels.length !== expectedChannelCount) {
      throw new Error(`Archive ${fieldName} channel count does not match metadata`);
    }

    channels.forEach((channel, index) => {
      if (channel.length !== expectedLength) {
        throw new Error(
          `Archive ${fieldName} channel ${index} has ${channel.length} samples, expected ${expectedLength}`,
        );
      }
    });
  }

  private decodePayload(
    payload: RecordingArchiveSignalPayload,
    expectedLength: number,
    expectedChannelCount: number,
    fieldName: string,
  ): Float32Array[] {
    const decodedChannels = payload.channels.map(channel => this.decodeChannel(channel));
    this.assertChannels(decodedChannels, expectedLength, expectedChannelCount, fieldName);
    return decodedChannels;
  }

  private createArchiveId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    return `recording-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private createDefaultName(sourceType: RecordingSourceType, createdAt?: string): string {
    const stamp = (createdAt ?? new Date().toISOString()).replace(/[:.]/g, '-');
    return `${sourceType}-${stamp}`;
  }

  private encodeChannel(channel: Float32Array): string {
    const buffer = new ArrayBuffer(channel.length * Float32Array.BYTES_PER_ELEMENT);
    const view = new DataView(buffer);

    for (let index = 0; index < channel.length; index += 1) {
      view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, channel[index], true);
    }

    return this.bytesToBase64(new Uint8Array(buffer));
  }

  private decodeChannel(encodedChannel: string): Float32Array {
    const bytes = this.base64ToBytes(encodedChannel);

    if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
      throw new Error('Encoded archive channel byte length is invalid');
    }

    const sampleCount = bytes.byteLength / Float32Array.BYTES_PER_ELEMENT;
    const samples = new Float32Array(sampleCount);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
    }

    return samples;
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  private base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  private readString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }

    return value;
  }

  private readNullableString(value: unknown, fieldName: string): string | null {
    if (value === null) {
      return null;
    }

    return this.readString(value, fieldName);
  }

  private readPositiveNumber(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${fieldName} must be a positive number`);
    }

    return value;
  }

  private readPositiveInteger(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new Error(`${fieldName} must be a positive integer`);
    }

    return value;
  }

  private readNonNegativeInteger(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(`${fieldName} must be a non-negative integer`);
    }

    return value;
  }

  private readSourceType(value: unknown): RecordingSourceType {
    if (
      value === 'perfect_white'
      || value === 'perfect_pink'
      || value === 'white'
      || value === 'pink'
      || value === 'multi_source_white'
      || value === 'wave_file'
      || value === 'output_with_filter'
      || value === 'zadoff_chu'
      || value === 'custom'
    ) {
      return value;
    }

    throw new Error('Unsupported recording source type');
  }

  private readCaptureMode(value: unknown): RecordingCaptureMode {
    if (value === 'microphone' || value === 'simulated') {
      return value;
    }

    throw new Error('Unsupported recording capture mode');
  }

  private readResolvedSource(
    value: unknown,
    fallbackSourceType: RecordingSourceType,
    fallbackCircularLength: number,
  ): RecordingResolvedSourceConfig {
    if (!this.isRecord(value)) {
      throw new Error('metadata.resolvedSource must be an object');
    }

    const signalType = value['signalType'] === undefined
      ? undefined
      : this.readPresetSignalType(value['signalType']);
    // `groupId` is optional; pass it through verbatim if present.
    const groupId = typeof value['groupId'] === 'string' ? value['groupId'] : undefined;

    const resolvedSource: RecordingResolvedSourceConfig = {
      sourceType:
        value['sourceType'] === undefined
          ? fallbackSourceType
          : this.readSourceType(value['sourceType']),
      groupId,
      signalType,
      circularLength:
        value['circularLength'] === undefined
          ? fallbackCircularLength
          : this.readPositiveInteger(value['circularLength'], 'metadata.resolvedSource.circularLength'),
      logicalSourceCount: this.readPositiveInteger(
        value['logicalSourceCount'],
        'metadata.resolvedSource.logicalSourceCount',
      ),
      outputChannelCount: this.readPositiveInteger(
        value['outputChannelCount'],
        'metadata.resolvedSource.outputChannelCount',
      ),
      routingMode: this.readRoutingMode(value['routingMode']),
      zadoffChuRoot:
        value['zadoffChuRoot'] === undefined
          ? undefined
          : this.readPositiveInteger(value['zadoffChuRoot'], 'metadata.resolvedSource.zadoffChuRoot'),
      waveFile:
        value['waveFile'] === undefined
          ? undefined
          : this.readWaveFileMetadata(value['waveFile'], 'metadata.resolvedSource.waveFile'),
    };

    this.assertResolvedSource(resolvedSource, resolvedSource.sourceType, resolvedSource.circularLength);
    return resolvedSource;
  }

  private normalizeResolvedSource(
    value: RecordingResolvedSourceConfig,
    fallbackSourceType: RecordingSourceType,
    fallbackCircularLength: number,
  ): RecordingResolvedSourceConfig {
    const sourceType = this.readSourceType(value.sourceType ?? fallbackSourceType);
    const signalType = value.signalType && isPresetSignalType(value.signalType)
      ? value.signalType
      : undefined;
    const groupId = typeof value.groupId === 'string' ? value.groupId : undefined;
    const resolvedSource: RecordingResolvedSourceConfig = {
      sourceType,
      groupId,
      signalType,
      circularLength: this.readPositiveInteger(
        value.circularLength ?? fallbackCircularLength,
        'resolvedSource.circularLength',
      ),
      logicalSourceCount: this.readPositiveInteger(
        value.logicalSourceCount,
        'resolvedSource.logicalSourceCount',
      ),
      outputChannelCount: this.readPositiveInteger(
        value.outputChannelCount,
        'resolvedSource.outputChannelCount',
      ),
      routingMode: this.readRoutingMode(value.routingMode),
      zadoffChuRoot:
        value.zadoffChuRoot === undefined
          ? undefined
          : this.readPositiveInteger(value.zadoffChuRoot, 'resolvedSource.zadoffChuRoot'),
      waveFile:
        value.waveFile === undefined
          ? undefined
          : this.normalizeWaveFileMetadata(value.waveFile, 'resolvedSource.waveFile'),
    };

    this.assertResolvedSource(resolvedSource, sourceType, resolvedSource.circularLength);
    return resolvedSource;
  }

  private assertResolvedSource(
    resolvedSource: RecordingResolvedSourceConfig,
    sourceType: RecordingSourceType,
    circularLength: number,
  ): void {
    if (resolvedSource.sourceType !== sourceType) {
      throw new Error('Archive metadata resolvedSource.sourceType must match metadata.sourceType');
    }

    if (resolvedSource.circularLength !== circularLength) {
      throw new Error('Archive metadata resolvedSource.circularLength must match metadata.circularLength');
    }

    if (!Number.isInteger(resolvedSource.logicalSourceCount) || resolvedSource.logicalSourceCount <= 0) {
      throw new Error('Archive metadata resolvedSource.logicalSourceCount must be a positive integer');
    }

    if (!Number.isInteger(resolvedSource.outputChannelCount) || resolvedSource.outputChannelCount <= 0) {
      throw new Error('Archive metadata resolvedSource.outputChannelCount must be a positive integer');
    }

    if (!isSourceRoutingMode(resolvedSource.routingMode)) {
      throw new Error('Archive metadata resolvedSource.routingMode is invalid');
    }

    if (resolvedSource.routingMode === 'mirrored_mono' && resolvedSource.logicalSourceCount !== 1) {
      throw new Error('Archive metadata mirrored_mono sources must use logicalSourceCount = 1');
    }

    if (
      resolvedSource.routingMode === 'direct'
      && resolvedSource.logicalSourceCount !== resolvedSource.outputChannelCount
    ) {
      throw new Error('Archive metadata direct sources must use logicalSourceCount = outputChannelCount');
    }

    if (resolvedSource.waveFile && resolvedSource.sourceType !== 'wave_file' && resolvedSource.signalType !== 'WAVE_FILE') {
      throw new Error('Archive metadata resolvedSource.waveFile requires a wave-file source');
    }
  }

  private readPresetSignalType(value: unknown) {
    if (isPresetSignalType(value)) {
      return value;
    }

    throw new Error('Unsupported preset signal type in archive metadata');
  }

  private readRoutingMode(value: unknown) {
    if (isSourceRoutingMode(value)) {
      return value;
    }

    throw new Error('Unsupported routing mode in archive metadata');
  }

  private readWaveFileMetadata(value: unknown, fieldName: string): WaveFileSourceMetadata {
    if (!this.isRecord(value)) {
      throw new Error(`${fieldName} must be an object`);
    }

    return {
      fileName: this.readString(value['fileName'], `${fieldName}.fileName`),
      channelCount: this.readPositiveInteger(value['channelCount'], `${fieldName}.channelCount`),
      sampleRate: this.readPositiveNumber(value['sampleRate'], `${fieldName}.sampleRate`),
      frameCount: this.readPositiveInteger(value['frameCount'], `${fieldName}.frameCount`),
      fileSizeBytes:
        value['fileSizeBytes'] === undefined
          ? undefined
          : this.readPositiveInteger(value['fileSizeBytes'], `${fieldName}.fileSizeBytes`),
      lastModified:
        value['lastModified'] === undefined
          ? undefined
          : this.readPositiveInteger(value['lastModified'], `${fieldName}.lastModified`),
    };
  }

  private normalizeWaveFileMetadata(value: WaveFileSourceMetadata, fieldName: string): WaveFileSourceMetadata {
    return {
      fileName: this.readString(value.fileName, `${fieldName}.fileName`),
      channelCount: this.readPositiveInteger(value.channelCount, `${fieldName}.channelCount`),
      sampleRate: this.readPositiveNumber(value.sampleRate, `${fieldName}.sampleRate`),
      frameCount: this.readPositiveInteger(value.frameCount, `${fieldName}.frameCount`),
      fileSizeBytes:
        value.fileSizeBytes === undefined
          ? undefined
          : this.readPositiveInteger(value.fileSizeBytes, `${fieldName}.fileSizeBytes`),
      lastModified:
        value.lastModified === undefined
          ? undefined
          : this.readPositiveInteger(value.lastModified, `${fieldName}.lastModified`),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private normalizeRingPosition(position: number, recordingLength: number): number {
    if (!Number.isFinite(position)) {
      throw new Error('recordingPosition must be finite');
    }

    if (recordingLength <= 0) {
      throw new Error('recordingLength must be positive');
    }

    const normalized = Math.round(position) % recordingLength;
    return normalized < 0 ? normalized + recordingLength : normalized;
  }
}