import { Component, input, computed, signal, effect, viewChild, ViewContainerRef, ComponentRef, Type } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalculationManagerService } from '../../../services/calculation-manager.service';
import { CalculationContext, CONTEXT_KEY } from '../../../models/types';

export interface LayoutNode {
  type: 'split' | 'visualization';
  direction?: 'horizontal' | 'vertical';
  splitRatio?: number; // 0 to 1, default 0.5
  children?: [LayoutNode, LayoutNode]; // For split nodes
  contextKey?: string; // CONTEXT_KEY from calculation script (visID)
}

@Component({
  selector: 'app-split-pane',
  imports: [
    CommonModule,
    SplitPane // Self-import for recursion
  ],
  templateUrl: './split-pane.html',
  styleUrl: './split-pane.scss',
})
export class SplitPane {
  visualizationContainer = viewChild('visualizationContainer', { read: ViewContainerRef });
  
  node = input<LayoutNode | null>(null);
  contextId = input<string>('');
  
  private isDragging = false;
  private startPos = 0;
  private startRatio = 0.5;
  private componentRef: ComponentRef<any> | null = null;
  private currentVisualizationType = signal<string | null>(null);
  private currentContextKey = signal<string | null>(null);
  private currentContextId = signal<string | null>(null);
  
  // Use internal signal for splitRatio that can be updated
  protected splitRatioSignal = signal(0.5);

  constructor(private calculationManager: CalculationManagerService) {
    // Sync node's splitRatio to internal signal when node changes
    effect(() => {
      const node = this.node();
      if (node?.splitRatio !== undefined) {
        this.splitRatioSignal.set(node.splitRatio);
      }
    });

    // Load dynamic component ONLY when visualization type or key changes, not on every context update
    effect(() => {
      const container = this.visualizationContainer();
      const node = this.node();
      const ctxId = this.contextId();
      // React to activeContextId changes to detect when context is initialized
      const activeCtx = this.calculationManager.activeContextId();
      
      if (!container) {
        // Container isn't available yet — the @if template branch may not have rendered.
        // Schedule a microtask so zone.js triggers another change-detection cycle,
        // allowing the viewChild signal to update and this effect to re-run.
        if (node?.type === 'visualization') {
          setTimeout(() => {}, 0);
        }
        return;
      }
      
      // Visualization nodes only need contextKey - visualizationType is inferred
      if (node?.type === 'visualization' && node.contextKey && ctxId) {
        const key = node.contextKey;
        
        // Get visualization type from context (inferred from script).
        const visType = this.calculationManager.getVisualizationType(ctxId as any, key);
        
        if (!visType) {
          console.warn('SplitPane: Waiting for visualization type for key:', key);
          return;
        }
        
        const currentVisType = this.currentVisualizationType();
        const currentKey = this.currentContextKey();
        const currentCtxId = this.currentContextId();
        
        // Recreate if type, key, or contextId changed
        if (visType !== currentVisType || key !== currentKey || ctxId !== currentCtxId) {
          const ctx = this.calculationManager.getContext(ctxId);
          if (ctx) {
            // Only update tracking signals if context exists and we can actually create the component
            this.currentVisualizationType.set(visType);
            this.currentContextKey.set(key);
            this.currentContextId.set(ctxId);
            
            this.loadVisualizationComponent(visType, key, ctxId);
          } else {
            console.warn('Context not found (will retry when available):', ctxId);
            // Don't set the tracking signals yet - this will allow retry when context becomes available
          }
        }
      }
    });
    
    // Update component inputs when context data changes (without recreating component)
    effect(() => {
      if (this.componentRef) {
        const ctxId = this.contextId();
        if (ctxId) {
          const ctx = this.calculationManager.getContext(ctxId as any);
          if (ctx) {
            const key = this.currentContextKey();
            if (key) {
              const data = ctx.simpleValues.get(key);
              this.componentRef.setInput('data', data);
            }
          }
        }
      }
    });
  }

  protected isSplit = computed(() => this.node()?.type === 'split');
  protected isVisualization = computed(() => this.node()?.type === 'visualization');
  // Only use splitRatioSignal - it's synced from node via effect
  protected splitRatio = computed(() => this.splitRatioSignal());
  protected direction = computed(() => this.node()?.direction ?? 'horizontal');
  protected leftChild = computed(() => this.node()?.children?.[0] ?? null);
  protected rightChild = computed(() => this.node()?.children?.[1] ?? null);
  protected visualizationType = computed(() => this.currentVisualizationType() ?? '');

  private loadVisualizationComponent(visualizationType: string, contextKey: CONTEXT_KEY, contextId: string): void {
    const container = this.visualizationContainer();
    if (!container) {
      console.warn('Visualization container not available yet');
      return;
    }

    // Clear existing component
    if (this.componentRef) {
      this.componentRef.destroy();
      this.componentRef = null;
    }
    container.clear();

    // Get component type from calculation manager
    const componentType = this.calculationManager.getVisualizationComponent(visualizationType, contextKey, null as any);
    
    if (componentType) {
      // Create component dynamically
      this.componentRef = container.createComponent(componentType);
      
      // Set inputs using setInput for signal-based inputs
      if ('setInput' in this.componentRef) {
        this.componentRef.setInput('contextId', contextId);
        this.componentRef.setInput('visKey', contextKey);
        // CanvasDisplay only needs contextId and visKey - data and title are not needed
      }
    } else {
      console.warn(`No component found for visualization type: ${visualizationType}`);
    }
  }

  onSplitterPointerDown(event: PointerEvent): void {
    event.preventDefault();
    this.isDragging = true;
    const direction = this.direction();
    this.startPos = direction === 'horizontal' ? event.clientX : event.clientY;
    this.startRatio = this.splitRatio();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isDragging) return;
      const node = this.node();
      if (!node) return;
      const container = target.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const containerSize = direction === 'horizontal' ? rect.width : rect.height;
      const delta = currentPos - this.startPos;
      const deltaRatio = delta / containerSize;

      let newRatio = this.startRatio + deltaRatio;
      newRatio = Math.max(0.1, Math.min(0.9, newRatio));

      node.splitRatio = newRatio;
      this.splitRatioSignal.set(newRatio);
    };

    const onPointerUp = () => {
      this.isDragging = false;
      target.removeEventListener('pointermove', onPointerMove as EventListener);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
    };

    target.addEventListener('pointermove', onPointerMove as EventListener);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);
  }
}
