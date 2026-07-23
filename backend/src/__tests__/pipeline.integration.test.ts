import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { JavaScriptParser } from '../parser/JavaScriptParser.js';
import { buildRelationships } from '../analysis/RelationshipBuilder.js';
import { annotateSummaries } from '../analysis/SummaryGenerator.js';
import { buildGraph } from '../graph/GraphBuilder.js';
import type { ParsedFile, AnalysisDiagnostics } from '../types/index.js';

// Mini in-process pipeline — no network, no zip, uses fixture files
async function runPipeline(files: Record<string, string>) {
  const tmpDir = path.join(os.tmpdir(), `graph-test-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const scannedFiles = Object.entries(files).map(([rel, content]) => {
    const abs = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return { absolutePath: abs, relativePath: rel, sizeBytes: Buffer.byteLength(content), content };
  });

  const parser = new JavaScriptParser();
  const ctx = { repoRoot: tmpDir };
  const parsedFiles: ParsedFile[] = await Promise.all(
    scannedFiles.map(f => parser.parse(f, ctx))
  );

  const annotated = annotateSummaries(parsedFiles);
  const { edges, circularDeps, orphanFiles, diagnostics } = await buildRelationships(
    annotated, tmpDir, {}
  );
  const fullDiagnostics: AnalysisDiagnostics = { ...diagnostics, parseFailures: 0 };
  const graph = buildGraph(
    annotated, edges, circularDeps, orphanFiles,
    'https://github.com/test/repo', 'test', 'repo', 'main', 0, fullDiagnostics
  );

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  return graph;
}

describe('Analysis pipeline integration', () => {
  it('produces nodes for each file', async () => {
    const graph = await runPipeline({
      'src/App.tsx': `import { Button } from './Button';`,
      'src/Button.tsx': `export function Button() { return null; }`,
    });
    expect(graph.nodes).toHaveLength(2);
  });

  it('produces edges between importing files', async () => {
    const graph = await runPipeline({
      'src/a.ts': `import { b } from './b';`,
      'src/b.ts': `export function b() {}`,
    });
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('detects circular dependencies', async () => {
    const graph = await runPipeline({
      'src/a.ts': `import { b } from './b';`,
      'src/b.ts': `import { a } from './a';`,
    });
    expect(graph.meta.circularDeps.length).toBeGreaterThan(0);
  });

  it('includes meta with file type breakdown', async () => {
    const graph = await runPipeline({
      'src/Button.tsx': `export function Button() { return null; }`,
      'src/useAuth.ts': `export function useAuth() { return {}; }`,
    });
    expect(graph.meta.totalFiles).toBe(2);
    expect(graph.meta.fileTypes).toBeDefined();
  });

  it('computes instability metrics', async () => {
    const graph = await runPipeline({
      'src/App.tsx': `import { Button } from './Button'; import { Card } from './Card';`,
      'src/Button.tsx': `export function Button() { return null; }`,
      'src/Card.tsx': `export function Card() { return null; }`,
    });
    const app = graph.nodes.find(n => n.label === 'App.tsx');
    expect(app?.instability).toBeGreaterThan(0);
    const button = graph.nodes.find(n => n.label === 'Button.tsx');
    expect(button?.afferentCoupling).toBe(1);
  });

  it('returns diagnostics in meta', async () => {
    const graph = await runPipeline({
      'src/a.ts': `import React from 'react'; import { b } from './b';`,
      'src/b.ts': `export function b() {}`,
    });
    expect(graph.meta.diagnostics).toBeDefined();
    expect(graph.meta.diagnostics.totalImports).toBeGreaterThan(0);
    expect(graph.meta.diagnostics.externalImports).toBeGreaterThan(0);
  });
});
