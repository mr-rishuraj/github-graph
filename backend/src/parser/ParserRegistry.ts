import type { Language } from '../types/index.js';
import type { BaseParser } from './BaseParser.js';
import { JavaScriptParser } from './JavaScriptParser.js';
import { PythonParser } from './PythonParser.js';
import { CssParser } from './CssParser.js';

const parsers: BaseParser[] = [new JavaScriptParser(), new PythonParser(), new CssParser()];

export function getParser(language: Language): BaseParser | null {
  return parsers.find(p => p.supportedLanguages.includes(language)) ?? null;
}

// Allow registering additional parsers (e.g., Python, Go) at runtime
export function registerParser(parser: BaseParser): void {
  parsers.unshift(parser);
}
