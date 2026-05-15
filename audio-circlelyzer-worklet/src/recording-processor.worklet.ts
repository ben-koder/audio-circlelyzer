// AudioWorklet Processor for recording and playback

interface RecordingProcessorMessage {
  type: 'setSignal' | 'startPlayback' | 'stopPlayback' | 'startRecording' | 'stopRecording' | 'startSimulatedRecording' | 'stopSimulatedRecording' | 'getData' | 'init' | 'updateSharedBuffers';
  signal?: Float32Array[];  // Now multichannel
  syntheticSignal?: Float32Array[];  // Synthetic recording data (multichannel)
  nc?: number;
  nRec?: number;
  channelCount?: number;
  sharedBuffers?: {
    x_c: SharedArrayBuffer[];  // Now multichannel
    y_c: SharedArrayBuffer[];
    currentPosition: SharedArrayBuffer;
  };
  preservePlayState?: boolean;  // Whether to preserve play/record state when updating buffers
}

class RecordingProcessor extends AudioWorkletProcessor {
  private x_c: Float32Array[] = [];  // Now multichannel
  private y_c: Float32Array[] = [];
  private currentPositionBuffer: Int32Array | null = null;
  private absoluteIndex: number = 0;
  private recording: boolean = false;
  private playing: boolean = false;
  private nc: number = 0;
  private nRec: number = 0;
  private channelCount: number = 1;
  private usingSharedBuffers: boolean = false;
  private simulatedRecording: boolean = false;
  private syntheticSignal: Float32Array[] = [];  // Synthetic data for simulated recording

  constructor() {
    super();
    this.port.onmessage = this.handleMessage.bind(this);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: any
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];

    if (!output || output.length === 0) {
      return true;
    }

    const bufferSize = output[0].length;

    // Playback looped signal x_c
    if (this.playing && this.x_c) {
      this.playbackLoop(output, bufferSize);
    }

    // Record to circular buffer (real or simulated)
    if (this.recording && !this.simulatedRecording && input && input.length > 0) {
      this.recordToBuffer(input, bufferSize);
    } else if (this.simulatedRecording && this.syntheticSignal.length > 0) {
      this.recordSimulatedToBuffer(bufferSize);
    }

    this.absoluteIndex += bufferSize;

    // Update shared position buffer with absoluteIndex if using shared buffers
    if (this.usingSharedBuffers && this.currentPositionBuffer && (this.recording || this.simulatedRecording)) {
      Atomics.store(this.currentPositionBuffer, 0, this.absoluteIndex);
    }

    return true; // Keep processor alive
  }

  private playbackLoop(output: Float32Array[], bufferSize: number): void {
    if (this.x_c.length === 0 || this.nc === 0) return;

    const outputChannelCount = output.length;
    const x_cChannelCount = this.x_c.length;
    
    for (let channel = 0; channel < outputChannelCount; channel++) {
      // Repeat x_c channels to match output channel count
      const sourceChannel = this.x_c[channel % x_cChannelCount];
      
      for (let i = 0; i < bufferSize; i++) {
        const circularPos = (this.absoluteIndex + i) % this.nc;
        output[channel][i] = sourceChannel[circularPos];
      }
    }
  }

  private recordToBuffer(input: Float32Array[], bufferSize: number): void {
    if (this.y_c.length === 0 || this.nc === 0) return;

    for (let channel = 0; channel < Math.min(input.length, this.y_c.length); channel++) {
      const bufferLength = this.y_c[channel].length;  // Use actual buffer length (nc * n_y)
      for (let i = 0; i < bufferSize; i++) {
        // Write to circular buffer position using absoluteIndex modulo full buffer length
        const circularPos = (this.absoluteIndex + i) % bufferLength;
        this.y_c[channel][circularPos] = input[channel][i];
      }
    }
  }

  private recordSimulatedToBuffer(bufferSize: number): void {
    if (this.y_c.length === 0 || this.nc === 0 || this.syntheticSignal.length === 0) return;

    const syntheticChannelCount = this.syntheticSignal.length;
    // syntheticSignal is nc samples long, loops cyclically (like playback)
    const signalLength = this.syntheticSignal[0].length;

    for (let channel = 0; channel < this.y_c.length; channel++) {
      const sourceChannel = this.syntheticSignal[channel % syntheticChannelCount];
      const bufferLength = this.y_c[channel].length;
      for (let i = 0; i < bufferSize; i++) {
        const srcPos = (this.absoluteIndex + i) % signalLength;
        const dstPos = (this.absoluteIndex + i) % bufferLength;
        this.y_c[channel][dstPos] = sourceChannel[srcPos];
      }
    }
  }

  private handleMessage(event: MessageEvent<RecordingProcessorMessage>): void {
    const { type, signal, nc, nRec, channelCount, sharedBuffers } = event.data;

    switch (type) {
      case 'init':
        if (nc && channelCount) {
          this.nc = nc;
          this.nRec = nRec || nc;
          this.channelCount = channelCount;
          
          if (sharedBuffers) {
            // Use shared buffers - map each buffer to Float32Array
            this.usingSharedBuffers = true;
            this.x_c = sharedBuffers.x_c.map(buf => new Float32Array(buf));
            this.y_c = sharedBuffers.y_c.map(buf => new Float32Array(buf));
            this.currentPositionBuffer = new Int32Array(sharedBuffers.currentPosition);
          } else {
            // Create local buffers (fallback)
            this.usingSharedBuffers = false;
            this.x_c = [];
            this.y_c = [];
            for (let i = 0; i < channelCount; i++) {
              this.x_c.push(new Float32Array(nc));
              this.y_c.push(new Float32Array(this.nRec));
            }
            console.warn('Worklet using local buffers', { nRec: this.nRec, channels: this.y_c.length });
          }
          
          this.absoluteIndex = 0;
          
          // Initialize shared position buffer
          if (this.usingSharedBuffers && this.currentPositionBuffer) {
            Atomics.store(this.currentPositionBuffer, 0, 0);
          }
          
          this.port.postMessage({ type: 'initialized' });
        }
        break;

      case 'setSignal':
        if (signal) {
          if (this.usingSharedBuffers && this.x_c.length > 0) {
            // Copy to existing shared buffers
            for (let ch = 0; ch < Math.min(signal.length, this.x_c.length); ch++) {
              this.x_c[ch].set(signal[ch]);
            }
          } else {
            // Create new local buffers
            this.x_c = signal.map(ch => new Float32Array(ch));
          }
          this.nc = signal[0]?.length || 0;
          this.absoluteIndex = 0;
          
          // Reset shared position buffer
          if (this.usingSharedBuffers && this.currentPositionBuffer) {
            Atomics.store(this.currentPositionBuffer, 0, 0);
          }
          
          this.port.postMessage({ type: 'signalSet' });
        }
        break;

      case 'startPlayback':
        this.playing = true;
        this.absoluteIndex = 0;
        
        // Reset shared position buffer
        if (this.usingSharedBuffers && this.currentPositionBuffer) {
          Atomics.store(this.currentPositionBuffer, 0, 0);
        }
        
        this.port.postMessage({ type: 'playbackStarted' });
        break;

      case 'stopPlayback':
        this.playing = false;
        this.port.postMessage({ type: 'playbackStopped' });
        break;

      case 'startRecording':
        this.recording = true;
        this.absoluteIndex = 0;
        
        // Reset shared position buffer
        if (this.usingSharedBuffers && this.currentPositionBuffer) {
          Atomics.store(this.currentPositionBuffer, 0, 0);
        }
        
        this.port.postMessage({ type: 'recordingStarted' });
        break;

      case 'stopRecording':
        this.recording = false;
        this.simulatedRecording = false;
        this.syntheticSignal = [];
        this.port.postMessage({ type: 'recordingStopped' });
        break;

      case 'startSimulatedRecording':
        if (event.data.syntheticSignal && event.data.syntheticSignal.length > 0) {
          this.syntheticSignal = event.data.syntheticSignal.map((ch: Float32Array) => new Float32Array(ch));
          this.simulatedRecording = true;
          this.recording = false;  // Not real recording
          this.absoluteIndex = 0;

          // Reset shared position buffer
          if (this.usingSharedBuffers && this.currentPositionBuffer) {
            Atomics.store(this.currentPositionBuffer, 0, 0);
          }

          this.port.postMessage({ type: 'simulatedRecordingStarted' });
        }
        break;

      case 'stopSimulatedRecording':
        this.simulatedRecording = false;
        this.syntheticSignal = [];
        this.port.postMessage({ type: 'simulatedRecordingStopped' });
        break;

      case 'getData':
        // Send recorded data back to main thread
        const data = {
          type: 'data',
          buffers: this.y_c.map(buf => buf.slice()),
          currentPosition: this.absoluteIndex,
        };
        this.port.postMessage(data);
        break;

      case 'updateSharedBuffers':
        // Update shared buffers when context changes (e.g., preset switch or settings change)
        if (sharedBuffers) {
          this.usingSharedBuffers = true;
          this.x_c = sharedBuffers.x_c.map(buf => new Float32Array(buf));
          this.y_c = sharedBuffers.y_c.map(buf => new Float32Array(buf));
          this.currentPositionBuffer = new Int32Array(sharedBuffers.currentPosition);
          
          // Update nc if provided, otherwise infer from buffer size
          if (nc) {
            this.nc = nc;
          } else if (this.x_c.length > 0 && this.x_c[0].length > 0) {
            this.nc = this.x_c[0].length;
          }
          
          // Reset position and sync
          this.absoluteIndex = 0;
          if (this.currentPositionBuffer) {
            Atomics.store(this.currentPositionBuffer, 0, 0);
          }
          
          this.port.postMessage({ type: 'sharedBuffersUpdated' });
        }
        break;
    }
  }
}

registerProcessor('recording-processor', RecordingProcessor);
