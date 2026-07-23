import { parse } from '@babel/parser';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ImportEntry, ExportEntry, ParsedFile, Language } from '../types/index.js';
import { detectFileType, detectLanguage } from '../scanner/LanguageDetector.js';
import { BaseParser, type ParserContext } from './BaseParser.js';
import type { ScannedFile } from '../scanner/RepositoryScanner.js';

// Simple recursive AST walker — avoids @babel/traverse CJS/ESM issues
function walkAST(node: any, visitor: Record<string, (node: any, parent: any) => void>, parent: any = null): void {
  if (!node || typeof node !== 'object') return;

  if (node.type && visitor[node.type]) {
    visitor[node.type](node, parent);
  }

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'loc' || key === 'start' || key === 'end' || key === 'range' || key === 'tokens' || key === 'comments') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) {
          walkAST(child, visitor, node);
        }
      }
    } else if (val && typeof val === 'object' && val.type) {
      walkAST(val, visitor, node);
    }
  }
}

function nodeToName(node: any): string {
  if (!node) return 'unknown';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return node.id?.name ?? 'anonymous';
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return node.id?.name ?? 'AnonymousClass';
  if (node.type === 'ArrowFunctionExpression') return 'anonymous';
  if (node.type === 'ObjectExpression') return 'object';
  return 'unknown';
}

function exportType(node: any): ExportEntry['type'] {
  const decl = node.declaration;
  if (!decl) return 'unknown';
  if (decl.type === 'FunctionDeclaration' || decl.type === 'FunctionExpression' || decl.type === 'ArrowFunctionExpression') {
    const name = decl.id?.name ?? '';
    if (/^use[A-Z]/.test(name)) return 'hook';
    if (/^[A-Z]/.test(name)) return 'component';
    return 'function';
  }
  if (decl.type === 'ClassDeclaration' || decl.type === 'ClassExpression') return 'class';
  if (decl.type === 'VariableDeclaration') {
    const firstDeclarator = decl.declarations?.[0];
    if (firstDeclarator) {
      const name = firstDeclarator.id?.name ?? '';
      const init = firstDeclarator.init;
      if (/^use[A-Z]/.test(name)) return 'hook';
      if (/^[A-Z]/.test(name)) {
        if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') {
          return 'component';
        }
      }
    }
    return 'variable';
  }
  return 'unknown';
}

export class JavaScriptParser extends BaseParser {
  readonly supportedLanguages = ['javascript', 'typescript', 'jsx', 'tsx'];

  async parse(file: ScannedFile, ctx: ParserContext): Promise<ParsedFile> {
    const language = detectLanguage(file.absolutePath) as Language;
    const imports: ImportEntry[] = [];
    const exports: ExportEntry[] = [];
    const jsxComponents = new Set<string>();
    let hasDefaultExport = false;

    const id = crypto
      .createHash('sha1')
      .update(file.relativePath)
      .digest('hex')
      .slice(0, 12);

    const lineCount = file.content.split('\n').length;
    const ext = path.extname(file.absolutePath).toLowerCase();
    const isTS = ext === '.ts' || ext === '.tsx' || ext === '.mts' || ext === '.cts';
    const isJSX = ext === '.jsx' || ext === '.tsx';

    let ast: any = null;
    try {
      ast = parse(file.content, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        allowUndeclaredExports: true,
        errorRecovery: true,
        plugins: [
          ...(isTS ? (['typescript'] as const) : []),
          ...(isJSX ? (['jsx'] as const) : []),
          'decorators-legacy',
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'dynamicImport',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'optionalChaining',
          'nullishCoalescingOperator',
          'objectRestSpread',
        ],
      });
    } catch {
      // Return minimal parsed file on parse failure
      const exportNames: string[] = [];
      const fileType = detectFileType(file.relativePath, exportNames);
      const name = path.basename(file.relativePath);
      const folder = path.dirname(file.relativePath);

      return {
        id,
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        name,
        extension: ext,
        language,
        fileType,
        imports: [],
        exports: [],
        jsxComponents: [],
        lineCount,
        sizeBytes: file.sizeBytes,
        summary: '',
        folder,
        hasDefaultExport: false,
        isBarrel: name.startsWith('index.'),
      };
    }

    walkAST(ast, {
      // Static imports
      ImportDeclaration(node) {
        const rawSource = node.source?.value ?? '';
        const source = rawSource.split('?')[0]; // strip Vite/webpack query strings
        if (!source) return;
        const specifiers: string[] = [];
        let isDefault = false;
        let isNamespace = false;
        const isTypeOnly = node.importKind === 'type';

        for (const spec of node.specifiers ?? []) {
          if (spec.type === 'ImportDefaultSpecifier') {
            specifiers.push(spec.local?.name ?? 'default');
            isDefault = true;
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            specifiers.push(`* as ${spec.local?.name ?? ''}`);
            isNamespace = true;
          } else if (spec.type === 'ImportSpecifier') {
            specifiers.push(spec.imported?.name ?? spec.local?.name ?? '');
          }
        }

        imports.push({ source, specifiers, isDefault, isNamespace, isDynamic: false, isTypeOnly });
      },

      // Dynamic imports + CommonJS require()
      CallExpression(node) {
        // import('./Module') — dynamic ESM import
        if (node.callee?.type === 'Import' && node.arguments?.length > 0) {
          const arg = node.arguments[0];
          if (arg.type === 'StringLiteral' || arg.type === 'Literal') {
            const source = (arg.value ?? '').split('?')[0]; // strip query strings
            if (source) imports.push({ source, specifiers: [], isDefault: false, isNamespace: false, isDynamic: true, isTypeOnly: false });
          }
        }
        // require('./module') or require.resolve('./module')
        const callee = node.callee;
        const isRequire =
          (callee?.type === 'Identifier' && callee.name === 'require') ||
          (callee?.type === 'MemberExpression' && callee.object?.name === 'require' && (callee.property?.name === 'resolve' || callee.property?.name === 'main'));
        if (isRequire && node.arguments?.length > 0) {
          const arg = node.arguments[0];
          if (arg.type === 'StringLiteral' || arg.type === 'Literal') {
            const source = (arg.value ?? '').split('?')[0];
            if (source) imports.push({ source, specifiers: [], isDefault: false, isNamespace: false, isDynamic: false, isTypeOnly: false });
          }
        }
      },

      // Default export
      ExportDefaultDeclaration(node) {
        hasDefaultExport = true;
        const decl = node.declaration;
        let name = 'default';

        if (decl) {
          if (decl.type === 'Identifier') name = decl.name;
          else if (decl.id?.name) name = decl.id.name;
          else if (decl.type === 'FunctionDeclaration' || decl.type === 'ArrowFunctionExpression') {
            name = decl.id?.name ?? path.basename(file.relativePath, ext);
          } else if (decl.type === 'ClassDeclaration') {
            name = decl.id?.name ?? 'AnonymousClass';
          }
        }

        const etype = exportType(node);
        exports.push({ name, isDefault: true, type: etype, isReExport: false });
      },

      // Named exports
      ExportNamedDeclaration(node) {
        const isTypeOnly = node.exportKind === 'type';

        // export { foo, bar } or export { default as Foo } from '...'
        if (node.specifiers?.length > 0) {
          const rawReExportSource = node.source?.value;
          const reExportSource = rawReExportSource?.split('?')[0];
          // Re-export edges are built by RelationshipBuilder (Pass 2) from exports metadata.
          // Do NOT also push to imports — that would create duplicate edges.
          for (const spec of node.specifiers) {
            const exportedName = spec.exported?.name ?? spec.local?.name ?? '';
            exports.push({
              name: exportedName,
              isDefault: false,
              type: 'unknown',
              isReExport: !!reExportSource,
              reExportSource,
            });
          }
        }

        // export function/class/const/let/var
        const decl = node.declaration;
        if (decl) {
          if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
            const name = decl.id?.name ?? '';
            if (name) {
              const type: ExportEntry['type'] =
                decl.type === 'ClassDeclaration' ? 'class'
                : /^use[A-Z]/.test(name) ? 'hook'
                : /^[A-Z]/.test(name) ? 'component'
                : 'function';
              exports.push({ name, isDefault: false, type, isReExport: false });
            }
          } else if (decl.type === 'VariableDeclaration') {
            for (const declarator of decl.declarations ?? []) {
              const name = declarator.id?.name ?? '';
              if (!name) continue;
              const init = declarator.init;
              const type: ExportEntry['type'] =
                /^use[A-Z]/.test(name) ? 'hook'
                : /^[A-Z]/.test(name) && (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') ? 'component'
                : /^[A-Z]/.test(name) ? 'component'
                : 'variable';
              exports.push({ name, isDefault: false, type, isReExport: false });
            }
          } else if (decl.type === 'TSTypeAliasDeclaration' || decl.type === 'TSInterfaceDeclaration' || decl.type === 'TSEnumDeclaration') {
            const name = decl.id?.name ?? '';
            if (name) exports.push({ name, isDefault: false, type: 'variable', isReExport: false });
          }
        }
      },

      // export * from './module'  — wildcard re-export (very common in barrel files)
      ExportAllDeclaration(node) {
        const source = node.source?.value;
        if (!source) return;
        const cleanSource = source.split('?')[0];
        // Only push to exports (RelationshipBuilder Pass 2 will create the re-export edge).
        // Do NOT also push to imports — that would create duplicate barrel→source edges.
        exports.push({ name: '*', isDefault: false, type: 'unknown', isReExport: true, reExportSource: cleanSource });
      },

      // JSX component usages
      JSXOpeningElement(node) {
        const nameNode = node.name;
        if (!nameNode) return;
        let componentName = '';
        if (nameNode.type === 'JSXIdentifier' && /^[A-Z]/.test(nameNode.name)) {
          componentName = nameNode.name;
        } else if (nameNode.type === 'JSXMemberExpression') {
          const obj = nameNode.object?.name ?? '';
          const prop = nameNode.property?.name ?? '';
          componentName = `${obj}.${prop}`;
        }
        if (componentName) jsxComponents.add(componentName);
      },
    });

    const exportNames = exports.map(e => e.name);
    const fileType = detectFileType(file.relativePath, exportNames);
    const name = path.basename(file.relativePath);
    const folder = path.dirname(file.relativePath);
    // Barrel: named index.*, OR all exports are re-exports (pure re-export files)
    const hasReExports = exports.some(e => e.isReExport);
    const hasOwnExports = exports.some(e => !e.isReExport);
    const isBarrel = name.startsWith('index.') || (hasReExports && !hasOwnExports && imports.length === 0);

    return {
      id,
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      name,
      extension: ext,
      language,
      fileType,
      imports,
      exports,
      jsxComponents: Array.from(jsxComponents),
      lineCount,
      sizeBytes: file.sizeBytes,
      summary: '',
      folder: folder === '.' ? '' : folder,
      hasDefaultExport,
      isBarrel,
    };
  }
}
