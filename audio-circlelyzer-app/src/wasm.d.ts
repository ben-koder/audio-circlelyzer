declare module '/audio_circlelyzer_wasm.js' {
  export default function init(): Promise<void>;
  export class WasmFFTContext {
    constructor(size: number);
    fft(input: Float32Array): { re: Float32Array; im: Float32Array };
    ifft(spectrum: any): Float32Array;
  }
  export class WasmComplexSpectrum {
    constructor(re: Float32Array, im: Float32Array);
    re: Float32Array;
    im: Float32Array;
  }
  export function generatePerfectWhite(len: number, sampleRate: number): Float32Array;
  export function generatePerfectPink(len: number, sampleRate: number): Float32Array;
  export function generateWhite(len: number): Float32Array;
  export function generatePink(len: number, sampleRate: number): Float32Array;
  export function generateZadoffChu(len: number, root: number): Float32Array;
  export function complexDivide(y_re: Float32Array, y_im: Float32Array, x_re: Float32Array, x_im: Float32Array): { re: Float32Array; im: Float32Array };
  export function complexAbs(re: Float32Array, im: Float32Array): Float32Array;
  export function complexArg(re: Float32Array, im: Float32Array): Float32Array;
  export function phaseUnwrap(phase: Float32Array): Float32Array;
  export function octaveFilterRms(magnitudeSpectrum: Float32Array, sampleRate: number, nc: number, mode: string): Float32Array;
  export function calculateRT60(impulseResponse: Float32Array, sampleRate: number, startDb: number, endDb: number): any;
}
