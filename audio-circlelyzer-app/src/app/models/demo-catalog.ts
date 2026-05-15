export interface DemoCatalogEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  presetIds: string[];
  archivePath: string;
  expectedPath: string;
  tags: string[];
  recommendedCursorRatios: number[];
  sourceSummary?: string;
  systemSummary?: string;
  validationTargets: string[];
  notes?: string;
}

export interface DemoCatalogManifest {
  version: 1;
  generatedAt?: string;
  demos: DemoCatalogEntry[];
}