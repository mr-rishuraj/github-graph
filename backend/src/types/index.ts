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

export interface ParsedFile {
  id: string;
  absolutePath: string;
  relativePath: string;
  name: string;
  extension: string;
  language: Language;
  fileType: FileType;
  imports: ImportEntry[];
  exports: ExportEntry[];
  jsxComponents: string[];
  lineCount: number;
  sizeBytes: number;
  summary: string;
  folder: string;
  hasDefaultExport: boolean;
  isBarrel: boolean;
}

export interface ResolvedEdge {
  sourceId: string;
  targetId: string;
  relation: EdgeRelation;
  sourceSpecifiers: string[];
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
  instability: number;
  afferentCoupling: number;
  efferentCoupling: number;
  depth: number;
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

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
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
    deadExports: string[];
    avgInstability: number;
    diagnostics: AnalysisDiagnostics;
  };
}

export interface AnalysisConfig {
  excludeTests: boolean;
  excludeStyles: boolean;
  excludeAssets: boolean;
  excludeConfigs: boolean;
  maxFiles: number;
}

export interface AliasMap {
  [alias: string]: string;
}

export interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
}

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
    nodeStatus: Record<string, DiffStatus>;  // keyed by node.id
    edgeStatus: Record<string, DiffStatus>;  // keyed by edge.id
    removedNodes: GraphNode[];               // nodes only in branchA
    removedEdges: GraphEdge[];               // edges only in branchA
    meta: DiffMeta;
  };
}
