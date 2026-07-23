import type {
  ParsedFile,
  ResolvedEdge,
  GraphData,
  GraphNode,
  GraphEdge,
  FileType,
  Language,
  AnalysisDiagnostics,
} from '../types/index.js';

export function buildGraph(
  files: ParsedFile[],
  edges: ResolvedEdge[],
  circularDeps: string[][],
  orphanFiles: string[],
  repoUrl: string,
  owner: string,
  repo: string,
  branch: string,
  analysisMs: number,
  diagnostics: AnalysisDiagnostics
): GraphData {
  // Build coupling maps
  const afferentMap = new Map<string, number>(); // incoming (Ca)
  const efferentMap = new Map<string, number>(); // outgoing (Ce)
  const fileIdSet = new Set(files.map(f => f.id));

  for (const e of edges) {
    if (e.relation === 'imports' || e.relation === 'dynamic-import' || e.relation === 're-exports') {
      if (fileIdSet.has(e.sourceId) && fileIdSet.has(e.targetId)) {
        efferentMap.set(e.sourceId, (efferentMap.get(e.sourceId) ?? 0) + 1);
        afferentMap.set(e.targetId, (afferentMap.get(e.targetId) ?? 0) + 1);
      }
    }
  }

  // Compute depth via BFS from entry points (nodes with 0 incoming edges)
  // Build adjacency list
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (fileIdSet.has(e.sourceId) && fileIdSet.has(e.targetId)) {
      if (!adj.has(e.sourceId)) adj.set(e.sourceId, new Set());
      adj.get(e.sourceId)!.add(e.targetId);
    }
  }

  // Entry points: files with 0 afferent coupling (nobody depends on them)
  // OR files of type page/component with 0 incoming
  const depthMap = new Map<string, number>();
  const entryPoints: string[] = [];
  for (const f of files) {
    if ((afferentMap.get(f.id) ?? 0) === 0) {
      entryPoints.push(f.id);
      depthMap.set(f.id, 0);
    }
  }

  // BFS — use visited set to avoid infinite loops on cyclic graphs
  const visited = new Set<string>(entryPoints);
  const queue: string[] = [...entryPoints];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthMap.get(current) ?? 0;
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        depthMap.set(neighbor, currentDepth + 1);
        queue.push(neighbor);
      }
    }
  }

  // Dead exports: exports that are never imported by any file in the repo
  const importedNames = new Set<string>();
  for (const e of edges) {
    for (const spec of e.sourceSpecifiers) {
      importedNames.add(spec);
    }
  }
  // Collect all exported names from all files
  const deadExportsList: string[] = [];
  const allExportedNames = new Set<string>();
  for (const f of files) {
    for (const exp of f.exports) {
      if (!exp.isReExport) {
        allExportedNames.add(exp.name);
      }
    }
  }
  for (const name of allExportedNames) {
    if (!importedNames.has(name) && name !== 'default' && name !== '*') {
      deadExportsList.push(name);
    }
  }
  deadExportsList.sort();

  const nodes: GraphNode[] = files.map(f => {
    const ca = afferentMap.get(f.id) ?? 0;
    const ce = efferentMap.get(f.id) ?? 0;
    const total = ca + ce;
    const instability = total === 0 ? 0 : ce / total;
    const depth = depthMap.get(f.id) ?? 0;

    return {
      id: f.id,
      path: f.relativePath,
      label: f.name,
      summary: f.summary,
      type: f.fileType,
      language: f.language,
      folder: f.folder,
      lineCount: f.lineCount,
      importCount: f.imports.filter(i => !i.isTypeOnly).length,
      exportCount: f.exports.filter(e => !e.isReExport).length,
      sizeBytes: f.sizeBytes,
      isBarrel: f.isBarrel,
      exports: f.exports,
      imports: f.imports,
      jsxComponents: f.jsxComponents,
      instability,
      afferentCoupling: ca,
      efferentCoupling: ce,
      depth,
    };
  });

  const graphEdges: GraphEdge[] = edges.map((e, i) => ({
    id: `e${i}`,
    source: e.sourceId,
    target: e.targetId,
    relation: e.relation,
    specifiers: e.sourceSpecifiers,
  }));

  // Aggregate file type counts
  const fileTypes = {} as Record<FileType, number>;
  const languages = {} as Record<Language, number>;
  for (const f of files) {
    fileTypes[f.fileType] = (fileTypes[f.fileType] ?? 0) + 1;
    languages[f.language] = (languages[f.language] ?? 0) + 1;
  }

  // Most imported files — count only 'imports' and 'dynamic-import' edges (not re-export)
  const incomingCount = new Map<string, number>();
  for (const e of edges) {
    if (e.relation === 'imports' || e.relation === 'dynamic-import') {
      incomingCount.set(e.targetId, (incomingCount.get(e.targetId) ?? 0) + 1);
    }
  }
  const mostImported = [...incomingCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id, count]) => {
      const node = files.find(f => f.id === id);
      return { id, label: node?.name ?? id, count };
    });

  const avgInstability =
    nodes.length === 0
      ? 0
      : nodes.reduce((sum, n) => sum + n.instability, 0) / nodes.length;

  return {
    nodes,
    edges: graphEdges,
    meta: {
      repoUrl,
      owner,
      repo,
      branch,
      totalFiles: files.length,
      parsedFiles: files.filter(f => f.imports.length > 0 || f.exports.length > 0).length,
      edgeCount: graphEdges.length,
      analysisMs,
      fileTypes,
      languages,
      circularDeps,
      orphanFiles,
      mostImported,
      deadExports: deadExportsList,
      avgInstability,
      diagnostics,
    },
  };
}
