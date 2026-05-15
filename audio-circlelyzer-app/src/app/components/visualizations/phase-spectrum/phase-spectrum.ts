import { Component, input } from '@angular/core';
import { PlotCanvasComponent } from '../plot-canvas/plot-canvas.component';

interface PhaseData {
  frequencies: Float32Array;
  phase: Float32Array;
}

@Component({
  selector: 'app-phase-spectrum',
  imports: [PlotCanvasComponent],
  templateUrl: './phase-spectrum.html',
  styleUrl: './phase-spectrum.scss',
})
export class PhaseSpectrum {
  data = input<PhaseData | null>(null);
  title = input<string>('Phase Spectrum');
  contextId = input<string>('');
  visKey = input<string>('');
}
