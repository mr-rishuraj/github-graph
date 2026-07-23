import * as path from 'path';
import * as crypto from 'crypto';
import type { ImportEntry, ParsedFile } from '../types/index.js';
import { BaseParser, type ParserContext } from './BaseParser.js';
import type { ScannedFile } from '../scanner/RepositoryScanner.js';

export class CssParser extends BaseParser {
  readonly supportedLanguages = ['css', 'scss'];

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

    // Match @import 'path', @import "path", @import url('path'), @import url("path")
    // Only capture relative imports (starting with . or ..)
    const importPattern = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g;

    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(file.content)) !== null) {
      const source = match[1];
      // Only track relative imports
      if (source.startsWith('.')) {
        imports.push({
          source,
          specifiers: [],
          isDefault: false,
          isNamespace: false,
          isDynamic: false,
          isTypeOnly: false,
        });
      }
    }

    const language = ext === '.scss' || ext === '.sass' ? 'scss' as const : 'css' as const;

    return {
      id,
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      name,
      extension: ext,
      language,
      fileType: 'style',
      imports,
      exports: [],
      jsxComponents: [],
      lineCount,
      sizeBytes: file.sizeBytes,
      summary: '',
      folder: folder === '.' ? '' : folder,
      hasDefaultExport: false,
      isBarrel: false,
    };
  }
}
