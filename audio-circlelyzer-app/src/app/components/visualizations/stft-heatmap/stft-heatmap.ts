import { Component, input } from '@angular/core';
import { PlotCanvasComponent } from '../plot-canvas/plot-canvas.component';

@Component({
  selector: 'app-stft-heatmap',
  imports: [PlotCanvasComponent],
  templateUrl: './stft-heatmap.html',
  styleUrl: './stft-heatmap.scss',
})
export class StftHeatmap {
  data = input<any>(null);
  sampleRate = input<number>(48000);
  title = input<string>('STFT Heatmap');
  contextId = input<string>('');
  visKey = input<string>('');
}
