import { Component, input, computed } from '@angular/core';
import { CONTEXT_KEY } from '../../../models/types';

@Component({
  selector: 'app-value-display',
  standalone: true,
  template: `
    <div class="value-container">
      <div class="value-title">{{ title() }}</div>
      <div class="value-main">{{ formattedValue() }}</div>
      @if (unit()) {
        <div class="value-unit">{{ unit() }}</div>
      }
    </div>
  `,
  styles: [`
    .value-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      padding: 2rem;
      background: var(--fallback-b1, oklch(var(--b1)));
    }
    
    .value-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: var(--fallback-bc, oklch(var(--bc)));
    }
    
    .value-main {
      font-size: 4rem;
      font-weight: 700;
      color: var(--fallback-p, oklch(var(--p)));
    }
    
    .value-unit {
      font-size: 1.25rem;
      margin-top: 0.5rem;
      color: var(--fallback-bc, oklch(var(--bc) / 0.7));
    }
  `]
})
export class ValueDisplayComponent {
  visKey = input.required<CONTEXT_KEY>();
  value = input<number | null>(null);
  title = input<string>('');
  unit = input<string>('');
  precision = input<number>(2);
  
  formattedValue = computed(() => {
    const val = this.value();
    if (val === null || val === undefined) {
      return '--';
    }
    return val.toFixed(this.precision());
  });
}
