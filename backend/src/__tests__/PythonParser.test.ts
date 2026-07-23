import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { PythonParser } from '../parser/PythonParser.js';

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

const parser = new PythonParser();

describe('PythonParser', () => {
  it('parses simple imports', async () => {
    const file = makeFile('a.py', `import os\nimport sys`);
    const result = await parser.parse(file, CTX);
    const sources = result.imports.map(i => i.source);
    expect(sources).toContain('os');
    expect(sources).toContain('sys');
  });

  it('parses from-imports with specifiers', async () => {
    const file = makeFile('a.py', `from pathlib import Path, PurePath`);
    const result = await parser.parse(file, CTX);
    expect(result.imports[0].source).toBe('pathlib');
    expect(result.imports[0].specifiers).toContain('Path');
    expect(result.imports[0].specifiers).toContain('PurePath');
  });

  it('parses relative imports', async () => {
    const file = makeFile('app/views.py', `from .utils import helper\nfrom ..models import User`);
    const result = await parser.parse(file, CTX);
    const sources = result.imports.map(i => i.source);
    expect(sources.some(s => s.includes('utils'))).toBe(true);
    expect(sources.some(s => s.includes('models'))).toBe(true);
  });

  it('exports def functions', async () => {
    const file = makeFile('a.py', `def my_function(x):\n    return x`);
    const result = await parser.parse(file, CTX);
    expect(result.exports.map(e => e.name)).toContain('my_function');
    expect(result.exports[0].type).toBe('function');
  });

  it('exports async def functions', async () => {
    const file = makeFile('a.py', `async def fetch_data(url):\n    pass`);
    const result = await parser.parse(file, CTX);
    expect(result.exports.map(e => e.name)).toContain('fetch_data');
  });

  it('exports classes', async () => {
    const file = makeFile('a.py', `class MyModel:\n    pass`);
    const result = await parser.parse(file, CTX);
    const cls = result.exports.find(e => e.name === 'MyModel');
    expect(cls?.type).toBe('class');
  });

  it('parses __all__ single-line', async () => {
    const file = makeFile('a.py', `__all__ = ['run', 'setup']`);
    const result = await parser.parse(file, CTX);
    const names = result.exports.map(e => e.name);
    expect(names).toContain('run');
    expect(names).toContain('setup');
  });

  it('parses __all__ multi-line', async () => {
    const file = makeFile('a.py', `__all__ = [\n  'alpha',\n  'beta',\n  'gamma',\n]`);
    const result = await parser.parse(file, CTX);
    const names = result.exports.map(e => e.name);
    expect(names).toContain('alpha');
    expect(names).toContain('gamma');
  });

  it('detects ALL_CAPS constants', async () => {
    const file = makeFile('a.py', `MAX_SIZE = 1024\nAPI_URL = "https://example.com"`);
    const result = await parser.parse(file, CTX);
    const names = result.exports.map(e => e.name);
    expect(names).toContain('MAX_SIZE');
    expect(names).toContain('API_URL');
  });

  it('marks __init__.py as barrel', async () => {
    const file = makeFile('pkg/__init__.py', `from .core import main`);
    const result = await parser.parse(file, CTX);
    expect(result.isBarrel).toBe(true);
  });

  it('detects test file type', async () => {
    const file = makeFile('tests/test_utils.py', `def test_format(): pass`);
    const result = await parser.parse(file, CTX);
    expect(result.fileType).toBe('test');
  });

  it('detects Django views file type', async () => {
    const file = makeFile('app/views.py', `def index(request): pass`);
    const result = await parser.parse(file, CTX);
    expect(result.fileType).toBe('page');
  });

  it('parses the sample fixture file', async () => {
    const content = (await import('fs')).readFileSync(
      path.join(FIXTURES, 'sample.py'), 'utf-8'
    );
    const file = makeFile('sample.py', content);
    const result = await parser.parse(file, CTX);
    expect(result.imports.length).toBeGreaterThan(0);
    expect(result.exports.map(e => e.name)).toContain('run');
    expect(result.exports.map(e => e.name)).toContain('Manager');
    expect(result.exports.map(e => e.name)).toContain('MAX_SIZE');
  });
});
