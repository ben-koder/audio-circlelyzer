import { Component, input } from '@angular/core';
import { PlotCanvasComponent } from '../plot-canvas/plot-canvas.component';

@Component({
  selector: 'app-time-signal',
  imports: [PlotCanvasComponent],
  templateUrl: './time-signal.html',
  styleUrl: './time-signal.scss',
})
export class TimeSignal {
  data = input<Float32Array | null>(null);
  sampleRate = input<number>(48000);
  title = input<string>('Time Signal');
  contextId = input<string>('');
  visKey = input<string>('');
}
