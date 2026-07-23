import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { JavaScriptParser } from '../parser/JavaScriptParser.js';

const FIXTURES = path.join(__dirname, 'fixtures');
const CTX = { repoRoot: FIXTURES };

function makeFile(relativePath: string, content: string) {
  return {
    absolutePath: path.join(FIXTURES, relativePath),
    relativePath,
    sizeBytes: Buffer.byteLength(content),
    content,
  };
}

const parser = new JavaScriptParser();

describe('JavaScriptParser', () => {
  it('parses static ESM imports', async () => {
    const file = makeFile('a.ts', `import React from 'react';\nimport { useState, useEffect } from 'react';`);
    const result = await parser.parse(file, CTX);
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].source).toBe('react');
    expect(result.imports[0].isDefault).toBe(true);
    expect(result.imports[1].specifiers).toContain('useState');
    expect(result.imports[1].specifiers).toContain('useEffect');
  });

  it('parses dynamic imports', async () => {
    const file = makeFile('a.ts', `const mod = await import('./heavy');`);
    const result = await parser.parse(file, CTX);
    expect(result.imports.some(i => i.isDynamic && i.source === './heavy')).toBe(true);
  });

  it('parses CommonJS require()', async () => {
    const file = makeFile('a.js', `const fs = require('fs');\nconst { join } = require('path');`);
    const result = await parser.parse(file, CTX);
    expect(result.imports.map(i => i.source)).toContain('fs');
    expect(result.imports.map(i => i.source)).toContain('path');
  });

  it('detects default export', async () => {
    const file = makeFile('a.tsx', `export default function MyComponent() { return null; }`);
    const result = await parser.parse(file, CTX);
    expect(result.hasDefaultExport).toBe(true);
    expect(result.exports.some(e => e.isDefault)).toBe(true);
  });

  it('detects named exports', async () => {
    const file = makeFile('a.ts', `export function formatBytes(n: number) { return n; }\nexport const MAX = 100;`);
    const result = await parser.parse(file, CTX);
    const names = result.exports.map(e => e.name);
    expect(names).toContain('formatBytes');
    expect(names).toContain('MAX');
  });

  it('classifies hooks by name convention', async () => {
    const file = makeFile('a.ts', `export function useTheme() { return {}; }`);
    const result = await parser.parse(file, CTX);
    expect(result.exports.find(e => e.name === 'useTheme')?.type).toBe('hook');
  });

  it('classifies PascalCase exports as components', async () => {
    const file = makeFile('a.tsx', `export function Button() { return null; }`);
    const result = await parser.parse(file, CTX);
    expect(result.exports.find(e => e.name === 'Button')?.type).toBe('component');
  });

  it('detects re-export (export * from)', async () => {
    const file = makeFile('index.ts', `export * from './Button';\nexport * from './Card';`);
    const result = await parser.parse(file, CTX);
    const reExports = result.exports.filter(e => e.isReExport);
    expect(reExports).toHaveLength(2);
    expect(reExports.map(e => e.reExportSource)).toContain('./Button');
  });

  it('detects re-export (export { X } from)', async () => {
    const file = makeFile('index.ts', `export { Button, Card } from './components';`);
    const result = await parser.parse(file, CTX);
    const reExports = result.exports.filter(e => e.isReExport);
    expect(reExports.length).toBeGreaterThan(0);
  });

  it('marks index files as barrels', async () => {
    const file = makeFile('index.ts', `export * from './Foo';`);
    const result = await parser.parse(file, CTX);
    expect(result.isBarrel).toBe(true);
  });

  it('detects JSX component usage', async () => {
    const file = makeFile('a.tsx', `function App() { return <Button onClick={fn}><Card /></Button>; }`);
    const result = await parser.parse(file, CTX);
    expect(result.jsxComponents).toContain('Button');
    expect(result.jsxComponents).toContain('Card');
  });

  it('strips Vite query strings from import sources', async () => {
    const file = makeFile('a.ts', `import url from './image.png?url';`);
    const result = await parser.parse(file, CTX);
    expect(result.imports[0].source).toBe('./image.png');
  });

  it('returns minimal result on parse failure', async () => {
    const file = makeFile('broken.ts', `this is not valid typescript @@@`);
    const result = await parser.parse(file, CTX);
    expect(result.id).toBeTruthy();
    expect(result.imports).toEqual([]);
  });

  it('handles type-only imports', async () => {
    const file = makeFile('a.ts', `import type { Foo } from './types';`);
    const result = await parser.parse(file, CTX);
    expect(result.imports[0].isTypeOnly).toBe(true);
  });
});
