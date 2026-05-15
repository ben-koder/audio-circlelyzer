import { Component, input, output, inject, ViewChildren, QueryList, ViewContainerRef, AfterViewInit, ComponentRef, ChangeDetectorRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalculationManagerService } from '../../../services/calculation-manager.service';

@Component({
  selector: 'app-calculation-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col gap-6">
      @for (entry of getEntries(); track entry.key) {
        @if (hasSettingsUI(entry.key)) {
          <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-4">
              <h3 class="card-title text-lg">{{ getCalculationName(entry.key) }} <span class="text-sm font-normal opacity-70">({{ entry.key }})</span></h3>
              <ng-container #settingsContainer></ng-container>
            </div>
          </div>
        }
      }
      @if (getEntries().length === 0) {
        <div class="alert alert-info">
          <span>No configurable calculations found in this context.</span>
        </div>
      }
    </div>
  `,
  styles: []
})
export class CalculationSettingsComponent implements AfterViewInit {
  calculationManager = inject(CalculationManagerService);
  private cdr = inject(ChangeDetectorRef);
  
  context = input.required<any>(); // Use any to handle the safe context object
  settingsMap = input.required<Map<string, any>>();
  settingsChange = output<{key: string, value: any}>();
  
  @ViewChildren('settingsContainer', { read: ViewContainerRef }) containers!: QueryList<ViewContainerRef>;
  private componentRefs: ComponentRef<any>[] = [];

  constructor() {
    effect(() => {
      // React to settingsMap changes
      const map = this.settingsMap();
      if (map && this.containers?.length) {
        // Schedule after change detection
        setTimeout(() => this.createComponents(), 0);
      }
    });
  }

  ngAfterViewInit() {
    this.createComponents();
    this.containers.changes.subscribe(() => {
      this.createComponents();
    });
  }

  private createComponents() {
    // Clean up old components
    this.componentRefs.forEach(ref => ref.destroy());
    this.componentRefs = [];
    
    const entries = this.getEntries();
    const containers = this.containers.toArray();
    
    entries.forEach((entry, index) => {
      if (index < containers.length && this.hasSettingsUI(entry.key)) {
        const container = containers[index];
        container.clear();
        
        const componentType = this.getSettingsUI(entry.key);
        if (componentType) {
          const ref = container.createComponent(componentType);
          ref.setInput('settings', entry.value);
          
          // Subscribe to the output
          const instance = ref.instance as any;
          if (instance.settingsChange) {
            instance.settingsChange.subscribe((newValue: any) => {
              this.settingsChange.emit({ key: entry.key, value: newValue });
            });
          }
          
          this.componentRefs.push(ref);
        }
      }
    });
    
    this.cdr.detectChanges();
  }

  getEntries(): { key: string; value: any }[] {
    const map = this.settingsMap();
    if (!map) return [];
    return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
  }

  getCalculationTypeId(key: string): string | undefined {
    // First try to get from context's calculationTypes map
    const ctx = this.context();
    if (ctx?.calculationTypes?.get) {
      const typeId = ctx.calculationTypes.get(key);
      if (typeId) return typeId;
    }
    // Fallback to calculationManager
    return this.calculationManager.getCalculationTypeId(ctx?.id, key);
  }

  hasSettingsUI(key: string): boolean {
    const typeId = this.getCalculationTypeId(key);
    if (!typeId) return false;
    const type = this.calculationManager.calculationTypes.get(typeId);
    return !!type?.getSettingsUI;
  }

  getSettingsUI(key: string): any {
    const typeId = this.getCalculationTypeId(key);
    if (!typeId) return null;
    const type = this.calculationManager.calculationTypes.get(typeId);
    return type?.getSettingsUI ? type.getSettingsUI() : null;
  }

  getCalculationName(key: string): string {
    const typeId = this.getCalculationTypeId(key);
    if (!typeId) return key;
    const type = this.calculationManager.calculationTypes.get(typeId);
    return type ? type.name : key;
  }
}
