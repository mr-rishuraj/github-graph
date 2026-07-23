import * as path from 'path';
import type { ParsedFile, FileType } from '../types/index.js';

// --- Pattern matchers — order matters, first match wins ---

interface FilePattern {
  test: (name: string, rel: string, exports: string[], dirs: string[]) => boolean;
  describe: (name: string, exports: string[], dirs: string[]) => string;
}

const PATTERNS: FilePattern[] = [
  // index / barrel
  {
    test: name => name.startsWith('index.'),
    describe: (_name, _exports, dirs) => {
      const parent = dirs[dirs.length - 1] ?? 'module';
      return `Barrel export for the ${titleCase(parent)} module`;
    },
  },

  // Context / Provider
  {
    test: (name, _rel, exports) =>
      name.toLowerCase().includes('provider') || exports.some(e => e.toLowerCase().includes('provider')),
    describe: (name, exports) => {
      const entity = exports.find(e => e.toLowerCase().includes('provider')) ?? stripExt(name);
      const base = entity.replace(/Provider$/i, '').replace(/Context$/i, '');
      return `Provides ${titleCase(base)} context to the component tree`;
    },
  },
  {
    test: (name, _rel, exports) =>
      name.toLowerCase().includes('context') || exports.some(e => e.toLowerCase().includes('context')),
    describe: (name, exports) => {
      const entity = exports.find(e => e.toLowerCase().includes('context')) ?? stripExt(name);
      const base = entity.replace(/Context$/i, '');
      return `${titleCase(base)} context definition`;
    },
  },

  // Hooks
  {
    test: (name, _rel, exports) =>
      name.toLowerCase().startsWith('use') || exports.some(e => /^use[A-Z]/.test(e)),
    describe: (name, exports) => {
      const hook = exports.find(e => /^use[A-Z]/.test(e)) ?? stripExt(name);
      const topic = hook.replace(/^use/, '');
      return `Custom hook for ${splitCamel(topic).toLowerCase()}`;
    },
  },

  // Pages
  {
    test: (name, rel) => name.toLowerCase().includes('page') || rel.includes('/pages/') || rel.includes('/views/'),
    describe: (name, exports) => {
      const entity = exports.find(e => e.toLowerCase().includes('page')) ?? stripExt(name);
      const base = entity.replace(/Page$/i, '').replace(/View$/i, '');
      return `${titleCase(base)} page`;
    },
  },

  // Layouts
  {
    test: (name, rel) => name.toLowerCase().includes('layout') || rel.includes('/layouts/'),
    describe: (name, exports) => {
      const entity = exports.find(e => e.toLowerCase().includes('layout')) ?? stripExt(name);
      const base = entity.replace(/Layout$/i, '');
      return `${titleCase(base)} layout wrapper`;
    },
  },

  // Router / Routes
  {
    test: (name, rel) => name.toLowerCase().includes('router') || name.toLowerCase().includes('routes') || rel.includes('/router/'),
    describe: (name) => {
      const base = stripExt(name).replace(/Router$/i, '').replace(/Routes$/i, '');
      return `${titleCase(base)} routing configuration`;
    },
  },

  // API / Service
  {
    test: (name, rel) =>
      name.toLowerCase().includes('api') ||
      name.toLowerCase().includes('service') ||
      name.toLowerCase().includes('client') ||
      rel.includes('/api/') || rel.includes('/services/'),
    describe: (name, exports) => {
      const base = stripExt(name).replace(/Api$/i, '').replace(/Service$/i, '').replace(/Client$/i, '');
      if (exports.length > 0) {
        const fns = exports.slice(0, 3).join(', ');
        return `API functions for ${titleCase(base)} (${fns})`;
      }
      return `API helper functions for ${titleCase(base)}`;
    },
  },

  // Store / State
  {
    test: (name, rel) =>
      name.toLowerCase().includes('store') ||
      name.toLowerCase().includes('slice') ||
      name.toLowerCase().includes('reducer') ||
      rel.includes('/store/') || rel.includes('/redux/') || rel.includes('/zustand/'),
    describe: (name) => {
      const base = stripExt(name).replace(/Store$/i, '').replace(/Slice$/i, '').replace(/Reducer$/i, '');
      return `${titleCase(base)} state management`;
    },
  },

  // Types / Interfaces
  {
    test: (name) =>
      name.toLowerCase().includes('types') ||
      name.toLowerCase().includes('interface') ||
      name.toLowerCase().endsWith('.d.ts'),
    describe: (name) => {
      const base = stripExt(name).replace(/types$/i, '').replace(/interfaces$/i, '');
      return `Type definitions${base ? ` for ${titleCase(base)}` : ''}`;
    },
  },

  // Constants
  {
    test: (name) =>
      name.toLowerCase().includes('constant') ||
      name.toLowerCase().includes('config') ||
      name.toLowerCase().includes('setting'),
    describe: (name, exports) => {
      const base = stripExt(name).replace(/constants?$/i, '').replace(/config$/i, '');
      if (exports.some(e => /^[A-Z_]+$/.test(e))) return `Constants for ${titleCase(base) || 'application settings'}`;
      return `Configuration for ${titleCase(base) || 'application'}`;
    },
  },

  // Utils / Helpers / Lib
  {
    test: (name, rel) =>
      name.toLowerCase().includes('util') ||
      name.toLowerCase().includes('helper') ||
      rel.includes('/utils/') || rel.includes('/helpers/') || rel.includes('/lib/'),
    describe: (name, exports) => {
      const base = stripExt(name).replace(/utils?$/i, '').replace(/helpers?$/i, '');
      if (exports.length > 0) {
        const fns = exports.slice(0, 3).join(', ');
        return `Utility functions${base ? ` for ${titleCase(base)}` : ''} (${fns})`;
      }
      return `Utility functions${base ? ` for ${titleCase(base)}` : ''}`;
    },
  },

  // Style files
  {
    test: (_name, rel) => rel.endsWith('.css') || rel.endsWith('.scss') || rel.endsWith('.less'),
    describe: (name) => {
      const base = stripExt(name).replace(/\.module$/, '');
      return `Styles for ${titleCase(base)}`;
    },
  },

  // Test files
  {
    test: (name) => name.includes('.test.') || name.includes('.spec.'),
    describe: (name) => {
      const base = stripExt(name).replace(/\.test$/, '').replace(/\.spec$/, '');
      return `Test suite for ${titleCase(base)}`;
    },
  },

  // Generic React component (PascalCase export)
  {
    test: (_name, _rel, exports) => exports.some(e => /^[A-Z][a-zA-Z0-9]+$/.test(e)),
    describe: (_name, exports) => {
      const component = exports.find(e => /^[A-Z][a-zA-Z0-9]+$/.test(e)) ?? '';
      return `Reusable ${splitCamel(component)} component`;
    },
  },
];

// --- String helpers ---

function stripExt(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function titleCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

function splitCamel(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// --- File-type fallbacks ---

const TYPE_FALLBACKS: Record<FileType, string> = {
  page: 'Page component',
  component: 'Reusable UI component',
  hook: 'Custom React hook',
  context: 'React context provider',
  utility: 'Utility module',
  api: 'API module',
  style: 'Style definitions',
  asset: 'Asset file',
  config: 'Configuration file',
  test: 'Test suite',
  layout: 'Layout wrapper component',
  unknown: 'Module',
};

export function generateSummary(file: ParsedFile): string {
  const name = file.name.toLowerCase();
  const rel = file.relativePath.replace(/\\/g, '/').toLowerCase();
  const dirs = file.folder.replace(/\\/g, '/').split('/').filter(Boolean);
  const exportNames = file.exports.map(e => e.name);

  for (const pattern of PATTERNS) {
    if (pattern.test(name, rel, exportNames, dirs)) {
      try {
        const summary = pattern.describe(file.name, exportNames, dirs);
        if (summary) return summary;
      } catch {
        // ignore errors in pattern matching
      }
    }
  }

  return TYPE_FALLBACKS[file.fileType] ?? 'Module';
}

export function annotateSummaries(files: ParsedFile[]): ParsedFile[] {
  return files.map(f => ({ ...f, summary: generateSummary(f) }));
}
