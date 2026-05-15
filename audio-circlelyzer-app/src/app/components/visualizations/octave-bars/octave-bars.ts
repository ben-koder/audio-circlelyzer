import { Component, input } from '@angular/core';
import { PlotCanvasComponent } from '../plot-canvas/plot-canvas.component';

interface OctaveData {
  frequencies: number[];
  rmsValues: Float32Array;
  mode: 'full' | 'third';
}

@Component({
  selector: 'app-octave-bars',
  imports: [PlotCanvasComponent],
  templateUrl: './octave-bars.html',
  styleUrl: './octave-bars.scss',
})
export class OctaveBars {
  data = input<OctaveData | null>(null);
  title = input<string>('Octave Band Analysis');
  contextId = input<string>('');
  visKey = input<string>('');
}
