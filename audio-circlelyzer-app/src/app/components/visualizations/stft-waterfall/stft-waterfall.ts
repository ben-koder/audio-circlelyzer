import { Component, input } from '@angular/core';
import { PlotCanvasComponent } from '../plot-canvas/plot-canvas.component';

@Component({
  selector: 'app-stft-waterfall',
  imports: [PlotCanvasComponent],
  templateUrl: './stft-waterfall.html',
  styleUrl: './stft-waterfall.scss',
})
export class StftWaterfall {
  data = input<any>(null);
  sampleRate = input<number>(48000);
  title = input<string>('STFT Waterfall');
  contextId = input<string>('');
  visKey = input<string>('');
}
