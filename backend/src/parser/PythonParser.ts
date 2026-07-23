import * as path from 'path';
import * as crypto from 'crypto';
import type { ImportEntry, ExportEntry, ParsedFile } from '../types/index.js';
import { BaseParser, type ParserContext } from './BaseParser.js';
import type { ScannedFile } from '../scanner/RepositoryScanner.js';

export class PythonParser extends BaseParser {
  readonly supportedLanguages = ['python'];

  async parse(file: ScannedFile, _ctx: ParserContext): Promise<ParsedFile> {
    const id = crypto
      .createHash('sha1')
      .update(file.relativePath)
      .digest('hex')
      .slice(0, 12);

    const lineCount = file.content.split('\n').length;
    const ext = path.extname(file.absolutePath).toLowerCase();
    const name = path.basename(file.relativePath);
    const folder = path.dirname(file.relativePath);

    const imports: ImportEntry[] = [];
    const exports: ExportEntry[] = [];

    const lines = file.content.split('\n');

    // Collapse multi-line __all__ = [...] into a single string for matching
    const fullContent = file.content;
    const allMatch = fullContent.match(/__all__\s*=\s*\[([^\]]*)\]/s);
    if (allMatch) {
      const names = allMatch[1].match(/['"]([^'"]+)['"]/g);
      if (names) {
        for (const n of names) {
          const exportName = n.replace(/['"]/g, '');
          if (exportName && !exports.some(e => e.name === exportName)) {
            exports.push({ name: exportName, isDefault: false, type: 'variable', isReExport: false });
          }
        }
      }
    }

    const importSimple = /^import\s+([\w.]+)(?:\s+as\s+\w+)?/;
    const importFrom   = /^from\s+(\.{0,2}[\w.]*)\s+import\s+(.+)/;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;

      // ── Imports ──────────────────────────────────────────────────────────────
      const simpleMatch = line.match(importSimple);
      if (simpleMatch) {
        imports.push({
          source: simpleMatch[1].replace(/\./g, '/'),
          specifiers: [],
          isDefault: false,
          isNamespace: false,
          isDynamic: false,
          isTypeOnly: false,
        });
        continue;
      }

      const fromMatch = line.match(importFrom);
      if (fromMatch) {
        const rawModule = fromMatch[1];
        const rawSpecifiers = fromMatch[2];

        const specifiers = rawSpecifiers
          .split(',')
          .map(s => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(s => s.length > 0 && s !== '*' && s !== '(');

        let source: string;
        if (rawModule === '.') {
          source = './__init__';
        } else if (rawModule.startsWith('..')) {
          const dots = (rawModule.match(/^\.+/)?.[0] ?? '').length;
          const rest = rawModule.slice(dots).replace(/\./g, '/');
          const prefix = '../'.repeat(dots - 1);
          source = rest ? `${prefix}${rest}` : prefix.slice(0, -1) || '..';
        } else if (rawModule.startsWith('.')) {
          const rest = rawModule.slice(1).replace(/\./g, '/');
          source = rest ? `./${rest}` : './__init__';
        } else {
          source = rawModule.replace(/\./g, '/');
        }

        imports.push({
          source,
          specifiers,
          isDefault: false,
          isNamespace: false,
          isDynamic: false,
          isTypeOnly: false,
        });
        continue;
      }

      // ── Exports (top-level defs/classes) ─────────────────────────────────────
      // async def and def
      const defMatch = line.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*[(:]/);
      if (defMatch) {
        const fnName = defMatch[1];
        exports.push({ name: fnName, isDefault: false, type: 'function', isReExport: false });
        continue;
      }

      const classMatch = line.match(/^class\s+([A-Za-z_]\w*)\s*[:(]/);
      if (classMatch) {
        exports.push({ name: classMatch[1], isDefault: false, type: 'class', isReExport: false });
        continue;
      }

      // Top-level CONSTANT = ... (ALL_CAPS naming convention)
      const constMatch = line.match(/^([A-Z][A-Z0-9_]{2,})\s*=/);
      if (constMatch && !line.startsWith('__')) {
        const cname = constMatch[1];
        if (!exports.some(e => e.name === cname)) {
          exports.push({ name: cname, isDefault: false, type: 'variable', isReExport: false });
        }
      }
    }

    const isBarrel = name === '__init__.py';
    const exportNames = exports.map(e => e.name);
    const fileType = detectPythonFileType(file.relativePath, exportNames);

    return {
      id,
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      name,
      extension: ext,
      language: 'python',
      fileType,
      imports,
      exports,
      jsxComponents: [],
      lineCount,
      sizeBytes: file.sizeBytes,
      summary: '',
      folder: folder === '.' ? '' : folder,
      hasDefaultExport: false,
      isBarrel,
    };
  }
}

function detectPythonFileType(
  filePath: string,
  exportNames: string[]
): import('../types/index.js').FileType {
  const rel = filePath.replace(/\\/g, '/');
  const parts = rel.split('/');
  const basename = parts[parts.length - 1];
  const nameLower = basename.toLowerCase();

  if (
    nameLower.includes('_test') ||
    nameLower.startsWith('test_') ||
    parts.some(p => p === 'tests' || p === 'test')
  ) return 'test';

  if (
    nameLower === 'settings.py' ||
    nameLower === 'config.py' ||
    nameLower.includes('config') ||
    nameLower.includes('settings')
  ) return 'config';

  if (parts.some(p => p === 'api') || nameLower.includes('api')) return 'api';

  if (
    parts.some(p => p === 'views' || p === 'routes') ||
    nameLower.includes('view') ||
    nameLower.includes('route')
  ) return 'page';

  // Django-style: class inheriting from models.Model
  if (parts.some(p => p === 'models') || nameLower.includes('model')) return 'utility';

  if (
    parts.some(p => p === 'utils' || p === 'helpers') ||
    nameLower.includes('util') ||
    nameLower.includes('helper')
  ) return 'utility';

  // Infer from export names: if most exports are PascalCase, likely components/classes
  const pascalCount = exportNames.filter(n => /^[A-Z]/.test(n)).length;
  if (pascalCount > 0 && pascalCount >= exportNames.length / 2) return 'component';

  return 'unknown';
}
