import { describe, it, expect } from 'vitest';
import { buildRelationships } from '../analysis/RelationshipBuilder.js';
import type { ParsedFile } from '../types/index.js';

function makeFile(id: string, rel: string, imports: { source: string }[] = [], exports: { name: string; isReExport?: boolean; reExportSource?: string }[] = []): ParsedFile {
  return {
    id,
    absolutePath: `/repo/${rel}`,
    relativePath: rel,
    name: rel.split('/').pop()!,
    extension: '.' + rel.split('.').pop()!,
    language: 'typescript',
    fileType: 'unknown',
    imports: imports.map(i => ({ source: i.source, specifiers: [], isDefault: false, isNamespace: false, isDynamic: false, isTypeOnly: false })),
    exports: exports.map(e => ({ name: e.name, isDefault: false, type: 'function' as const, isReExport: e.isReExport ?? false, reExportSource: e.reExportSource })),
    jsxComponents: [],
    lineCount: 10,
    sizeBytes: 200,
    summary: '',
    folder: rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : '',
    hasDefaultExport: false,
    isBarrel: rel.endsWith('index.ts'),
  };
}

const REPO_ROOT = '/repo';

describe('RelationshipBuilder', () => {
  it('creates edges for relative imports', async () => {
    const a = makeFile('a', 'src/a.ts', [{ source: './b' }]);
    const b = makeFile('b', 'src/b.ts');
    const { edges } = await buildRelationships([a, b], REPO_ROOT, {});
    expect(edges.some(e => e.sourceId === 'a' && e.targetId === 'b')).toBe(true);
  });

  it('ignores external/node_modules imports', async () => {
    const a = makeFile('a', 'src/a.ts', [{ source: 'react' }, { source: 'lodash' }]);
    const { edges, diagnostics } = await buildRelationships([a], REPO_ROOT, {});
    expect(edges).toHaveLength(0);
    expect(diagnostics.externalImports).toBe(2);
  });

  it('resolves alias imports', async () => {
    const a = makeFile('a', 'src/a.ts', [{ source: '@/utils' }]);
    const b = makeFile('b', 'src/utils/index.ts');
    const aliases = { '@': '/repo/src' };
    const { edges } = await buildRelationships([a, b], REPO_ROOT, aliases);
    expect(edges.length).toBeGreaterThan(0);
  });

  it('detects circular dependencies', async () => {
    const a = makeFile('a', 'src/a.ts', [{ source: './b' }]);
    const b = makeFile('b', 'src/b.ts', [{ source: './a' }]);
    const { circularDeps } = await buildRelationships([a, b], REPO_ROOT, {});
    expect(circularDeps.length).toBeGreaterThan(0);
  });

  it('identifies orphan files', async () => {
    const a = makeFile('a', 'src/a.ts'); // no imports, no exports, not referenced
    const { orphanFiles } = await buildRelationships([a], REPO_ROOT, {});
    expect(orphanFiles).toContain('src/a.ts');
  });

  it('creates re-export edges (barrel following)', async () => {
    const barrel = makeFile('idx', 'src/index.ts', [], [{ name: '*', isReExport: true, reExportSource: './Button' }]);
    const button = makeFile('btn', 'src/Button.ts');
    const { edges } = await buildRelationships([barrel, button], REPO_ROOT, {});
    const reExportEdge = edges.find(e => e.relation === 're-exports');
    expect(reExportEdge).toBeTruthy();
  });

  it('deduplicates edges', async () => {
    const a = makeFile('a', 'src/a.ts', [{ source: './b' }, { source: './b' }]);
    const b = makeFile('b', 'src/b.ts');
    const { edges } = await buildRelationships([a, b], REPO_ROOT, {});
    const abEdges = edges.filter(e => e.sourceId === 'a' && e.targetId === 'b');
    expect(abEdges).toHaveLength(1);
  });

  it('resolves .js extension to .ts file', async () => {
    const a = makeFile('a', 'src/a.ts', [{ source: './utils.js' }]);
    const b = makeFile('b', 'src/utils.ts');
    const { edges } = await buildRelationships([a, b], REPO_ROOT, {});
    expect(edges.some(e => e.sourceId === 'a' && e.targetId === 'b')).toBe(true);
  });

  it('reports diagnostics', async () => {
    const a = makeFile('a', 'src/a.ts', [{ source: './b' }, { source: 'react' }]);
    const b = makeFile('b', 'src/b.ts');
    const { diagnostics } = await buildRelationships([a, b], REPO_ROOT, {});
    expect(diagnostics.totalImports).toBe(2);
    expect(diagnostics.externalImports).toBe(1);
    expect(diagnostics.resolvedImports).toBe(1);
  });
});
