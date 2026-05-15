import { Component, input } from '@angular/core';
import { PlotCanvasComponent } from '../plot-canvas/plot-canvas.component';

interface SpectrumData {
  frequencies: Float32Array;
  magnitudes: Float32Array;
}

@Component({
  selector: 'app-frequency-spectrum',
  imports: [PlotCanvasComponent],
  templateUrl: './frequency-spectrum.html',
  styleUrl: './frequency-spectrum.scss',
})
export class FrequencySpectrum {
  data = input<SpectrumData | null>(null);
  sampleRate = input<number>(48000);
  title = input<string>('Frequency Spectrum');
  contextId = input<string>('');
  visKey = input<string>('');
}
