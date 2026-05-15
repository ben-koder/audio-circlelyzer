/**
 * Visualization Types Index
 * 
 * This file serves as the main entry point for all visualization types.
 * Each visualization type is defined in its own file in this folder.
 * Shared visualization code should be placed in this file.
 */

// Export all visualization types from individual files
export { AbsSpecVisualization } from './vis-absspec';
export { PhaseVisualization } from './vis-phase';
export { TimeSigVisualization } from './vis-timesig';
export { OctaveBarsVisualization } from './vis-octbars';
export { RT60Visualization } from './vis-rt60';
export { STFTWaterfallVisualization } from './vis-stft-absspec';
export { STFTHeatmapVisualization } from './vis-stft-heatmap';
export { TraceVisualization } from './vis-trace';
export { GroupDelayVisualization, PhaseDelayVisualization } from './vis-group-delay';
export { PolyfitVisualization } from './vis-polyfit';
export { PolyfitCoeffsVisualization } from './vis-polyfit-coeffs';

// Export WebGPU visualization types
export { STFTWaterfallWebGPUVisualization } from './vis-stft-absspec-webgpu';
export { TraceWebGPUVisualization } from './vis-trace-webgpu';

import { VisualizationType } from '../types';
import { AbsSpecVisualization } from './vis-absspec';
import { PhaseVisualization } from './vis-phase';
import { TimeSigVisualization } from './vis-timesig';
import { OctaveBarsVisualization } from './vis-octbars';
import { RT60Visualization } from './vis-rt60';
import { STFTWaterfallVisualization } from './vis-stft-absspec';
import { STFTHeatmapVisualization } from './vis-stft-heatmap';
import { TraceVisualization } from './vis-trace';
import { STFTWaterfallWebGPUVisualization } from './vis-stft-absspec-webgpu';
import { TraceWebGPUVisualization } from './vis-trace-webgpu';
import { GroupDelayVisualization, PhaseDelayVisualization } from './vis-group-delay';
import { PolyfitVisualization } from './vis-polyfit';
import { PolyfitCoeffsVisualization } from './vis-polyfit-coeffs';

/**
 * Channel color palette
 */
export const CHANNEL_COLORS = [
  '#3b82f6', // Blue - Channel 0
  '#ef4444', // Red - Channel 1
  '#22c55e', // Green - Channel 2
  '#f59e0b', // Amber - Channel 3
  '#8b5cf6', // Purple - Channel 4
  '#ec4899', // Pink - Channel 5
  '#14b8a6', // Teal - Channel 6
  '#f97316', // Orange - Channel 7
];

/**
 * Get color for a specific channel index
 */
export function getChannelColor(channelIndex: number): string {
  return CHANNEL_COLORS[channelIndex % CHANNEL_COLORS.length];
}

/**
 * Factory function to create all visualization types
 * Returns an array of all registered visualization type instances
 * 
 * Note: WebGPU versions are listed after Canvas 2D versions.
 * The system will prefer WebGPU if available and fall back to Canvas 2D.
 */
export function createVisualizationTypes(): VisualizationType<any>[] {
  return [
    // Basic 2D visualizations (Canvas 2D only)
    new AbsSpecVisualization(),
    new PhaseVisualization(),
    new TimeSigVisualization(),
    new OctaveBarsVisualization(),
    new RT60Visualization(),
    new GroupDelayVisualization(),
    new PhaseDelayVisualization(),
    new PolyfitVisualization(),
    new PolyfitCoeffsVisualization(),
    
    // 3D visualizations - Canvas 2D versions (legacy/fallback)
    new STFTWaterfallVisualization(),
    new STFTHeatmapVisualization(),
    new TraceVisualization(),
    
    // 3D visualizations - WebGPU versions (preferred when available)
    new STFTWaterfallWebGPUVisualization(),
    new TraceWebGPUVisualization()
  ];
}
