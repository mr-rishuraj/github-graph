import type { ParsedFile } from '../types/index.js';
import type { ScannedFile } from '../scanner/RepositoryScanner.js';

export interface ParserContext {
  repoRoot: string;
}

export abstract class BaseParser {
  abstract readonly supportedLanguages: string[];

  abstract parse(file: ScannedFile, ctx: ParserContext): Promise<ParsedFile>;
}
