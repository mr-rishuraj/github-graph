import * as path from 'path';
import type { ParsedFile, ResolvedEdge, AliasMap } from '../types/index.js';

const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const INDEX_NAMES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs'];

// Build a map from absolute path (with and without extension) → file id
function buildPathMap(files: ParsedFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of files) {
    // Full path (with extension)
    map.set(normalize(f.absolutePath), f.id);
    // Without extension — covers `import './Button'` resolving Button.tsx
    const withoutExt = f.absolutePath.replace(/\.[^/.]+$/, '');
    map.set(normalize(withoutExt), f.id);
    // Without extension, also try replacing .js with .ts (TypeScript dual-emit pattern)
    if (f.absolutePath.endsWith('.ts') || f.absolutePath.endsWith('.tsx')) {
      const jsEquiv = withoutExt + (f.absolutePath.endsWith('.tsx') ? '.jsx' : '.js');
      map.set(normalize(jsEquiv), f.id);
    }
  }
  return map;
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

// Given a resolved base path (may or may not have extension), find a matching file id
function tryExtensions(base: string, pathMap: Map<string, string>): string | null {
  const nb = normalize(base);

  // 1. Direct match (exact path or already without-extension key)
  if (pathMap.has(nb)) return pathMap.get(nb)!;

  // 2. Try adding each extension
  for (const ext of RESOLVABLE_EXTENSIONS) {
    const candidate = nb + ext;
    if (pathMap.has(candidate)) return pathMap.get(candidate)!;
  }

  // 3. Try as directory barrel (./components → ./components/index.ts)
  for (const idx of INDEX_NAMES) {
    const candidate = nb + '/' + idx;
    if (pathMap.has(candidate)) return pathMap.get(candidate)!;
  }

  // 4. .js import that actually points to a .ts file (TypeScript project using .js extensions)
  if (nb.endsWith('.js')) {
    const tsVariants = [nb.slice(0, -3) + '.ts', nb.slice(0, -3) + '.tsx'];
    for (const v of tsVariants) {
      if (pathMap.has(v)) return pathMap.get(v)!;
    }
  }

  // 5. .jsx → .tsx
  if (nb.endsWith('.jsx')) {
    const tsx = nb.slice(0, -4) + '.tsx';
    if (pathMap.has(tsx)) return pathMap.get(tsx)!;
  }

  return null;
}

// Resolve an import source string to an absolute path (or null if external)
function resolveImport(
  importSource: string,
  fromFile: ParsedFile,
  repoRoot: string,
  aliases: AliasMap
): string | null {
  if (!importSource) return null;

  // Skip node: bun: data: protocol imports
  if (/^(node:|bun:|data:|https?:)/.test(importSource)) return null;

  const isRelative = importSource.startsWith('./') || importSource.startsWith('../');

  if (isRelative) {
    const fromDir = path.dirname(fromFile.absolutePath);
    return path.resolve(fromDir, importSource);
  }

  // Alias resolution (e.g. @/ → src/, ~ → src/)
  for (const [alias, aliasTarget] of Object.entries(aliases)) {
    if (!alias) continue;
    if (importSource === alias || importSource.startsWith(alias + '/')) {
      const rest = importSource.slice(alias.length).replace(/^\//, '');
      return path.join(aliasTarget, rest);
    }
  }

  // baseUrl-style absolute imports (aliases[''] = resolved baseUrl directory)
  if (aliases['']) {
    const candidate = path.join(aliases[''], importSource);
    return candidate;
  }

  // Last-ditch: try resolving from common project roots
  for (const rootDir of [path.join(repoRoot, 'src'), repoRoot]) {
    const candidate = path.join(rootDir, importSource);
    // Only return this if there's a plausible hit — checked later in tryExtensions
    // We can't know here, so just return the candidate
    if (!importSource.includes('/') || importSource.startsWith('@')) break;
    return candidate;
  }

  return null; // External node_module
}

// Detect circular dependencies via DFS
function detectCircularDeps(files: ParsedFile[], edges: ResolvedEdge[]): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const f of files) adj.set(f.id, new Set());
  for (const e of edges) adj.get(e.sourceId)?.add(e.targetId);

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const idToPath = new Map(files.map(f => [f.id, f.relativePath]));

  function dfs(id: string): void {
    if (inStack.has(id)) {
      const start = stack.indexOf(id);
      if (start >= 0) cycles.push(stack.slice(start).map(i => idToPath.get(i) ?? i));
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    inStack.add(id);
    stack.push(id);
    for (const neighbor of adj.get(id) ?? []) dfs(neighbor);
    stack.pop();
    inStack.delete(id);
  }

  for (const f of files) {
    if (!visited.has(f.id)) dfs(f.id);
  }

  return cycles;
}

export interface RelationshipResult {
  edges: ResolvedEdge[];
  circularDeps: string[][];
  orphanFiles: string[];
  diagnostics: {
    totalImports: number;
    externalImports: number;
    resolvedImports: number;
    barrelFollowedEdges: number;
  };
}

export async function buildRelationships(
  files: ParsedFile[],
  repoRoot: string,
  aliases: AliasMap
): Promise<RelationshipResult> {
  const pathMap = buildPathMap(files);
  const fileById = new Map(files.map(f => [f.id, f]));
  const edges: ResolvedEdge[] = [];
  const edgeSet = new Set<string>();
  const referencedIds = new Set<string>();

  let totalImports = 0;
  let externalImports = 0;
  let resolvedImports = 0;

  // ── Pass 1: Direct import → file edges ──────────────────────────────────
  for (const file of files) {
    for (const imp of file.imports) {
      if (!imp.source) continue;
      totalImports++;

      const resolved = resolveImport(imp.source, file, repoRoot, aliases);
      if (!resolved) {
        externalImports++;
        continue;
      }

      const targetId = tryExtensions(resolved, pathMap);
      if (!targetId || targetId === file.id) {
        continue;
      }

      const key = `${file.id}→${targetId}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      referencedIds.add(targetId);
      resolvedImports++;

      edges.push({
        sourceId: file.id,
        targetId,
        relation: imp.isDynamic ? 'dynamic-import' : 'imports',
        sourceSpecifiers: imp.specifiers,
      });
    }
  }

  // ── Pass 2: Re-export edges — barrel → each file it re-exports from ─────
  // This adds edges like: components/index.ts → Button.tsx, Card.tsx, etc.
  // Also covers: export { X } from './X' and export * from './X'
  for (const file of files) {
    for (const exp of file.exports) {
      if (!exp.isReExport || !exp.reExportSource) continue;

      const resolved = resolveImport(exp.reExportSource, file, repoRoot, aliases);
      if (!resolved) continue;

      const targetId = tryExtensions(resolved, pathMap);
      if (!targetId || targetId === file.id) continue;

      const key = `${file.id}→${targetId}:reexport`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      referencedIds.add(targetId);

      edges.push({
        sourceId: file.id,
        targetId,
        relation: 're-exports',
        sourceSpecifiers: exp.name === '*' ? ['*'] : [exp.name],
      });
    }
  }

  // ── Pass 3: Barrel following — when A→barrel, also add A→barrel's sources
  // This makes "import { Button } from './components'" show A→Button directly.
  let barrelFollowedEdges = 0;
  const snapshot = [...edges]; // iterate the edges from passes 1+2 only

  for (const edge of snapshot) {
    if (edge.relation === 're-exports') continue; // don't follow re-export edges themselves

    const targetFile = fileById.get(edge.targetId);
    if (!targetFile) continue;

    // Only follow if the target file has re-exports (is a barrel or re-exporting file)
    const reExports = targetFile.exports.filter(e => e.isReExport && e.reExportSource);
    if (reExports.length === 0) continue;

    for (const exp of reExports) {
      const resolved = resolveImport(exp.reExportSource!, targetFile, repoRoot, aliases);
      if (!resolved) continue;

      const transitiveTargetId = tryExtensions(resolved, pathMap);
      if (!transitiveTargetId || transitiveTargetId === edge.sourceId || transitiveTargetId === edge.targetId) continue;

      const key = `${edge.sourceId}→${transitiveTargetId}:barrel`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      referencedIds.add(transitiveTargetId);
      barrelFollowedEdges++;

      edges.push({
        sourceId: edge.sourceId,
        targetId: transitiveTargetId,
        relation: 'imports',
        sourceSpecifiers: exp.name === '*' ? ['*'] : [exp.name],
      });
    }
  }

  // ── Pass 4: Orphan detection & circular deps ─────────────────────────────
  const orphanFiles = files
    .filter(f =>
      !referencedIds.has(f.id) &&
      !f.isBarrel &&
      f.fileType !== 'page' &&
      f.fileType !== 'config' &&
      f.imports.length === 0 &&
      f.exports.length === 0
    )
    .map(f => f.relativePath);

  const circularDeps = detectCircularDeps(files, edges.filter(e => e.relation !== 're-exports'));

  return {
    edges,
    circularDeps,
    orphanFiles,
    diagnostics: { totalImports, externalImports, resolvedImports, barrelFollowedEdges },
  };
}
