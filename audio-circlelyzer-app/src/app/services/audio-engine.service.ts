import { Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class AudioEngineService {
  private readonly document = inject(DOCUMENT);

  private audioContext: AudioContext | null = null;
  private recordingNode: AudioWorkletNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  
  public isInitialized = signal(false);
  public isPlaying = signal(false);
  public isRecording = signal(false);
  public isSimulatedRecording = signal(false);
  public currentPosition = signal(0);
  public recordedData = signal<Float32Array[] | null>(null);
  
  private nc: number = 4096;
  private nRec: number = 0;
  private channelCount: number = 1;
  private sharedBuffers: {
    x_c: SharedArrayBuffer[];  // Now multichannel
    y_c: SharedArrayBuffer[];
    currentPosition: SharedArrayBuffer;
  } | null = null;

  async initialize(
    sampleRate: number = 48000,
    nc: number = 4096,
    sharedBuffers?: {
      x_c: SharedArrayBuffer[];  // Now multichannel
      y_c: SharedArrayBuffer[];
      currentPosition: SharedArrayBuffer;
    }
  ): Promise<void> {
    if (this.audioContext) {
      return; // Already initialized
    }

    this.sharedBuffers = sharedBuffers || null;
    this.channelCount = this.sharedBuffers?.x_c.length ?? this.channelCount;

    this.nc = nc;
    // Set nRec to approximately 1 minute of audio (multiple of nc)
    const desiredSeconds = 60;
    const desiredSamples = sampleRate * desiredSeconds;
    const cyclesNeeded = Math.ceil(desiredSamples / nc);
    this.nRec = cyclesNeeded * nc;

    try {
      this.audioContext = new AudioContext({ sampleRate });
      
      // Load and register AudioWorklet — resolve relative to <base href> for sub-path deployments.
      await this.audioContext.audioWorklet.addModule(
        new URL('recording-processor.worklet.js', this.document.baseURI).href
      );
      
      // Create AudioWorkletNode
      this.recordingNode = new AudioWorkletNode(
        this.audioContext,
        'recording-processor',
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [Math.max(1, this.channelCount)],
        }
      );

      // Connect to output
      this.recordingNode.connect(this.audioContext.destination);

      // Listen to messages from worklet
      this.recordingNode.port.onmessage = this.handleWorkletMessage.bind(this);

      // Initialize worklet
      const initMessage: any = {
        type: 'init',
        nc: this.nc,
        nRec: this.nRec,
        channelCount: this.channelCount,
      };

      if (this.sharedBuffers) {
        initMessage.sharedBuffers = {
          x_c: this.sharedBuffers.x_c,
          y_c: this.sharedBuffers.y_c,
          currentPosition: this.sharedBuffers.currentPosition,
        };
      } else {
        console.warn('AudioEngine sending init WITHOUT shared buffers');
      }

      this.recordingNode.port.postMessage(initMessage);

      this.isInitialized.set(true);
    } catch (error) {
      console.error('Failed to initialize audio engine:', error);
      throw error;
    }
  }

  async startPlayback(x_c: Float32Array[]): Promise<void> {
    if (!this.recordingNode) {
      throw new Error('Audio engine not initialized');
    }

    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Send signal to worklet (now multichannel)
    this.recordingNode.port.postMessage({
      type: 'setSignal',
      signal: x_c,
    });

    // Wait for signal to be set
    await new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'signalSet') {
          this.recordingNode!.port.removeEventListener('message', handler);
          resolve();
        }
      };
      this.recordingNode!.port.addEventListener('message', handler);
    });

    // Start playback
    this.recordingNode.port.postMessage({ type: 'startPlayback' });
    this.isPlaying.set(true);
  }

  async stopPlayback(): Promise<void> {
    if (!this.recordingNode) {
      return;
    }

    this.recordingNode.port.postMessage({ type: 'stopPlayback' });
    this.isPlaying.set(false);
  }

  async startRecording(): Promise<void> {
    if (!this.recordingNode || !this.audioContext) {
      throw new Error('Audio engine not initialized');
    }

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Create source node
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Connect to recording node
      this.sourceNode.connect(this.recordingNode);

      // Start recording in worklet
      this.recordingNode.port.postMessage({ type: 'startRecording' });
      this.isRecording.set(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.recordingNode) {
      return;
    }

    this.recordingNode.port.postMessage({ type: 'stopRecording' });
    this.isRecording.set(false);
    this.isSimulatedRecording.set(false);

    // Stop media stream
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  async startSimulatedRecording(syntheticData: Float32Array[]): Promise<void> {
    if (!this.recordingNode || !this.audioContext) {
      throw new Error('Audio engine not initialized');
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Send synthetic data to worklet for simulated recording
    this.recordingNode.port.postMessage({
      type: 'startSimulatedRecording',
      syntheticSignal: syntheticData,
    });

    this.isSimulatedRecording.set(true);
    this.isRecording.set(true);
  }

  async stopSimulatedRecording(): Promise<void> {
    if (!this.recordingNode) {
      return;
    }

    this.recordingNode.port.postMessage({ type: 'stopSimulatedRecording' });
    this.isSimulatedRecording.set(false);
    this.isRecording.set(false);
  }

  async getRecordedData(): Promise<Float32Array[]> {
    if (!this.recordingNode) {
      throw new Error('Audio engine not initialized');
    }

    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'data') {
          if (this.recordingNode) {
            this.recordingNode.port.removeEventListener('message', handler);
          }
          this.currentPosition.set(event.data.currentPosition);
          resolve(event.data.buffers);
        }
      };
      
      if (this.recordingNode) {
        this.recordingNode.port.addEventListener('message', handler);
        this.recordingNode.port.postMessage({ type: 'getData' });
      }
    });
  }

  updateSharedBuffers(sharedBuffers: {
    x_c: SharedArrayBuffer[];  // Now multichannel
    y_c: SharedArrayBuffer[];
    currentPosition: SharedArrayBuffer;
  }, nc?: number): void {
    this.sharedBuffers = sharedBuffers;
    this.channelCount = Math.max(1, sharedBuffers.x_c.length);
    
    // Update nc if provided
    if (nc !== undefined) {
      this.nc = nc;
    }
    
    if (this.recordingNode) {
      this.recordingNode.port.postMessage({
        type: 'updateSharedBuffers',
        nc: this.nc,
        channelCount: this.channelCount,
        sharedBuffers: {
          x_c: sharedBuffers.x_c,
          y_c: sharedBuffers.y_c,
          currentPosition: sharedBuffers.currentPosition,
        }
      });
    }
  }

  getCurrentPosition(): number {
    return this.currentPosition();
  }

  getSampleRate(): number {
    return this.audioContext?.sampleRate ?? 48000;
  }

  /**
   * Maximum output channel count supported by the current AudioContext destination
   * (per WebAudio). Falls back to 2 if the engine is not initialized yet.
   */
  getMaxOutputChannelCount(): number {
    return this.audioContext?.destination?.maxChannelCount ?? 2;
  }

  async dispose(): Promise<void> {
    await this.stopPlayback();
    await this.stopRecording();

    if (this.recordingNode) {
      this.recordingNode.disconnect();
      this.recordingNode = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.isInitialized.set(false);
  }

  private handleWorkletMessage(event: MessageEvent): void {
    // Handle messages from worklet if needed
    if (event.data.type === 'initialized') {
    } else if (event.data.type === 'recordingUpdate') {
      // Update recorded data signal when recording updates
      this.recordedData.set(event.data.buffers);
      this.currentPosition.set(event.data.currentPosition);
    }
  }
}
