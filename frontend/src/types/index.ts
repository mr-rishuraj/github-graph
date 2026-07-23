export type FileType =
  | 'page'
  | 'component'
  | 'hook'
  | 'context'
  | 'utility'
  | 'api'
  | 'style'
  | 'asset'
  | 'config'
  | 'test'
  | 'layout'
  | 'unknown';

export type Language = 'javascript' | 'typescript' | 'jsx' | 'tsx' | 'css' | 'scss' | 'json' | 'python' | 'other';

export type EdgeRelation = 'imports' | 'dynamic-import' | 're-exports';

export interface ImportEntry {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  isDynamic: boolean;
  isTypeOnly: boolean;
}

export interface ExportEntry {
  name: string;
  isDefault: boolean;
  type: 'function' | 'class' | 'variable' | 'component' | 'hook' | 'unknown';
  isReExport: boolean;
  reExportSource?: string;
}

export interface GraphNode {
  id: string;
  path: string;
  label: string;
  summary: string;
  type: FileType;
  language: Language;
  folder: string;
  lineCount: number;
  importCount: number;
  exportCount: number;
  sizeBytes: number;
  isBarrel: boolean;
  exports: ExportEntry[];
  imports: ImportEntry[];
  jsxComponents: string[];
  // Metrics from backend
  instability?: number;
  afferentCoupling?: number;
  efferentCoupling?: number;
  depth?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: EdgeRelation;
  specifiers: string[];
}

export interface AnalysisDiagnostics {
  totalImports: number;
  externalImports: number;
  resolvedImports: number;
  barrelFollowedEdges: number;
  parseFailures: number;
}

export interface GraphMeta {
  repoUrl: string;
  owner: string;
  repo: string;
  branch: string;
  totalFiles: number;
  parsedFiles: number;
  edgeCount: number;
  analysisMs: number;
  fileTypes: Record<FileType, number>;
  languages: Record<Language, number>;
  circularDeps: string[][];
  orphanFiles: string[];
  mostImported: Array<{ id: string; label: string; count: number }>;
  deadExports?: number | string[];
  avgInstability?: number;
  diagnostics?: AnalysisDiagnostics;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: GraphMeta;
}

export interface AnalysisResponse {
  success: boolean;
  graph: GraphData;
  jobId: string;
}

export interface ActiveFilters {
  showTests: boolean;
  showStyles: boolean;
  showAssets: boolean;
  showConfigs: boolean;
  types: Set<FileType>;
  activeEdgeTypes: Set<EdgeRelation>;
}

export const FILE_TYPE_COLORS: Record<FileType, string> = {
  page: '#3b82f6',
  component: '#10b981',
  hook: '#8b5cf6',
  context: '#f59e0b',
  utility: '#6b7280',
  api: '#ef4444',
  style: '#ec4899',
  asset: '#eab308',
  config: '#94a3b8',
  test: '#6b7280',
  layout: '#06b6d4',
  unknown: '#4b5563',
};

export const FILE_TYPE_LABELS: Record<FileType, string> = {
  page: 'Page',
  component: 'Component',
  hook: 'Hook',
  context: 'Context',
  utility: 'Utility',
  api: 'API',
  style: 'Style',
  asset: 'Asset',
  config: 'Config',
  test: 'Test',
  layout: 'Layout',
  unknown: 'Other',
};

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffMeta {
  branchA: string;
  branchB: string;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export interface DiffGraphData extends GraphData {
  diff: {
    nodeStatus: Record<string, DiffStatus>;
    edgeStatus: Record<string, DiffStatus>;
    removedNodes: GraphNode[];
    removedEdges: GraphEdge[];
    meta: DiffMeta;
  };
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  javascript: 'JS',
  typescript: 'TS',
  jsx: 'JSX',
  tsx: 'TSX',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  python: 'PY',
  other: 'Other',
};
