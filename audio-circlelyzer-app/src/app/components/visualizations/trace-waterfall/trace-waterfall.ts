import { Component, input } from '@angular/core';
import { PlotCanvasComponent } from '../plot-canvas/plot-canvas.component';

@Component({
  selector: 'app-trace-waterfall',
  imports: [PlotCanvasComponent],
  template: `
    <div class="w-full h-full">
      <app-plot-canvas [contextId]="contextId()" [visKey]="visKey()" mode="3d"></app-plot-canvas>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
  `]
})
export class TraceWaterfall {
  data = input<any>(null);
  title = input<string>('Trace Waterfall');
  contextId = input<string>('');
  visKey = input<string>('');
}
