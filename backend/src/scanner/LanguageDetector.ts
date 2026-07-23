import * as path from 'path';
import type { FileType, Language } from '../types/index.js';

const EXT_TO_LANGUAGE: Record<string, Language> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'css',
  '.json': 'json',
  '.py': 'python',
};

const PARSEABLE_LANGUAGES: Language[] = ['javascript', 'typescript', 'jsx', 'tsx', 'python', 'css', 'scss'];

export function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? 'other';
}

export function isParseable(lang: Language): boolean {
  return PARSEABLE_LANGUAGES.includes(lang);
}

export function detectFileType(
  filePath: string,
  exportNames: string[],
  hasDirMatch = false
): FileType {
  const rel = filePath.replace(/\\/g, '/');
  const basename = path.basename(rel);
  const nameLower = basename.toLowerCase();
  const ext = path.extname(basename).toLowerCase();
  const dirParts = rel.split('/');

  // Style files
  if (['.css', '.scss', '.sass', '.less', '.styl'].includes(ext)) return 'style';

  // Asset files
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.mp4', '.mp3', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'].includes(ext)) return 'asset';

  // Test files
  if (
    nameLower.includes('.test.') ||
    nameLower.includes('.spec.') ||
    nameLower.endsWith('.test') ||
    nameLower.endsWith('.spec') ||
    dirParts.some(p => p === '__tests__' || p === 'test' || p === 'tests' || p === 'e2e' || p === 'cypress')
  ) return 'test';

  // Config files
  if (
    nameLower.includes('.config.') ||
    nameLower === 'tsconfig.json' ||
    nameLower === '.eslintrc' ||
    nameLower === '.prettierrc' ||
    nameLower === '.babelrc' ||
    nameLower === 'jest.config' ||
    nameLower === 'vite.config' ||
    nameLower === 'webpack.config' ||
    nameLower === 'rollup.config' ||
    nameLower === 'next.config' ||
    nameLower.startsWith('.env')
  ) return 'config';

  // Context / Provider files
  if (nameLower.includes('context') || nameLower.includes('provider')) return 'context';
  if (dirParts.some(p => p === 'contexts' || p === 'context' || p === 'providers')) return 'context';

  // Hook files
  const hooksDir = dirParts.some(p => p === 'hooks' || p === 'hook');
  const nameWithoutExt = path.basename(nameLower, ext);
  if (nameWithoutExt.startsWith('use') && nameWithoutExt.length > 3) return 'hook';
  if (hooksDir) return 'hook';

  // Page/View files
  if (
    nameLower.includes('page') ||
    nameLower.includes('view') ||
    nameLower.includes('screen') ||
    dirParts.some(p => p === 'pages' || p === 'views' || p === 'screens' || p === 'routes')
  ) return 'page';

  // Layout files
  if (nameLower.includes('layout') || dirParts.some(p => p === 'layouts')) return 'layout';

  // API / Service files
  if (
    nameLower.includes('api') ||
    nameLower.includes('service') ||
    nameLower.includes('client') ||
    nameLower.includes('fetch') ||
    nameLower.includes('request') ||
    nameLower.includes('http') ||
    dirParts.some(p => p === 'api' || p === 'services' || p === 'service' || p === 'requests')
  ) return 'api';

  // Component files — based on export names or component directory
  const componentDir = dirParts.some(p => p === 'components' || p === 'component' || p === 'ui' || p === 'shared');
  const hasComponentExport = exportNames.some(name => /^[A-Z][a-zA-Z0-9]*$/.test(name));

  if (componentDir) return 'component';
  if (hasComponentExport) return 'component';

  // Utility files
  if (
    nameLower.includes('util') ||
    nameLower.includes('helper') ||
    nameLower.includes('lib') ||
    nameLower === 'constants' ||
    nameLower === 'index' ||
    dirParts.some(p => p === 'utils' || p === 'helpers' || p === 'lib' || p === 'shared' || p === 'common')
  ) return 'utility';

  return 'unknown';
}

export function shouldSkipFile(filePath: string): boolean {
  const rel = filePath.replace(/\\/g, '/');
  const SKIP_PATTERNS = [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.next/',
    '/out/',
    '/coverage/',
    '/.git/',
    '/.turbo/',
    '/.cache/',
    '/public/',
    '/__pycache__/',
  ];
  return SKIP_PATTERNS.some(p => rel.includes(p));
}
