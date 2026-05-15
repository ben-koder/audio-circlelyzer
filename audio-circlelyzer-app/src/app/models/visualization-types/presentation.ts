import { AxisMetadata, Plot2DOptions, Plot3DOptions } from '../../plotting/types';
import { VisualizationChannelInfo, VisualizationPresentationSettings } from '../types';

export interface VisualizationInfoEntry {
  label?: string;
  value: string;
}

export function applyVisualizationPresentation<T extends Plot2DOptions | Plot3DOptions>(
  options: T,
  settings: VisualizationPresentationSettings | undefined,
  fallbackTitle: string,
): T {
  const axesMetadata = options.axesMetadata.map((axis, index) => applyAxisPresentation(axis, settings, index));

  return {
    ...options,
    title: getVisualizationTitle(settings, fallbackTitle),
    axesMetadata,
  };
}

export function getVisualizationTitle(
  settings: VisualizationPresentationSettings | undefined,
  fallbackTitle: string,
): string {
  return settings?.title?.trim() || fallbackTitle;
}

export function getVisualizationDescription(
  settings: VisualizationPresentationSettings | undefined,
  fallbackDescription?: string,
): string | undefined {
  const description = settings?.description?.trim();
  return description || fallbackDescription?.trim() || undefined;
}

export function normalizeVisualizationInfoEntries(channelInfo: VisualizationChannelInfo | undefined): VisualizationInfoEntry[] {
  if (!channelInfo) {
    return [];
  }

  if (typeof channelInfo === 'string') {
    const value = channelInfo.trim();
    return value ? [{ value }] : [];
  }

  if (Array.isArray(channelInfo)) {
    return channelInfo
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => ({ value: entry }));
  }

  return Object.entries(channelInfo)
    .filter((entry) => typeof entry[1] === 'string' && entry[1].trim().length > 0)
    .map(([label, value]) => ({
      label: label.trim() || undefined,
      value: value.trim(),
    }));
}

function applyAxisPresentation(
  axis: AxisMetadata,
  settings: VisualizationPresentationSettings | undefined,
  axisIndex: number,
): AxisMetadata {
  const label = getAxisLabel(settings, axisIndex);

  const categoryLabels = axisIndex === 0 && Array.isArray(settings?.xAxisCategories) && settings.xAxisCategories.length > 0
    ? settings.xAxisCategories
        .map((entry) => entry?.trim())
        .filter((entry): entry is string => Boolean(entry))
    : axis.categoryLabels;

  return {
    ...axis,
    label,
    categorical: categoryLabels && categoryLabels.length > 0 ? true : axis.categorical,
    categoryLabels,
  };
}

function getAxisLabel(
  settings: VisualizationPresentationSettings | undefined,
  axisIndex: number,
): string | undefined {
  const rawLabel = axisIndex === 0
    ? settings?.xAxisLabel
    : axisIndex === 1
      ? settings?.yAxisLabel
      : settings?.zAxisLabel;

  const label = rawLabel?.trim();
  return label ? label : undefined;
}