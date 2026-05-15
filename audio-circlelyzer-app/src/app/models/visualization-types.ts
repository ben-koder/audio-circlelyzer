/**
 * Visualization Types
 *
 * This file is the main entry point for visualization type classes.
 * Individual implementations are in the visualization-types/ subfolder.
 * Shared utilities are in visualization-types/index.ts.
 */

// Re-export everything from the visualization-types subfolder
export { 
  AbsSpecVisualization,
  PhaseVisualization,
  TimeSigVisualization,
  OctaveBarsVisualization,
  RT60Visualization,
  STFTWaterfallVisualization,
  STFTHeatmapVisualization,
  TraceVisualization,
  STFTWaterfallWebGPUVisualization,
  TraceWebGPUVisualization,
  CHANNEL_COLORS,
  getChannelColor,
  createVisualizationTypes
} from './visualization-types/index';



