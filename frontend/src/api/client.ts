import axios from 'axios';
import type { AnalysisResponse, GraphData } from '../types/index.js';

const api = axios.create({
  baseURL: '/api',
  timeout: 300_000,
});

export interface AnalyzeOptions {
  url: string;
  maxFiles?: number;
  excludeTests?: boolean;
  excludeStyles?: boolean;
}

export async function analyzeRepository(opts: AnalyzeOptions): Promise<AnalysisResponse> {
  const { data } = await api.post<AnalysisResponse>('/analyze', opts);
  return data;
}

export type ProgressEvent =
  | { type: 'start'; sha?: string }
  | { type: 'cached'; sha: string }
  | { type: 'downloading'; repo: string; branch: string }
  | { type: 'extracted'; fileCount: number }
  | { type: 'parsing'; current: number; total: number; file: string }
  | { type: 'building' }
  | { type: 'complete'; graph: GraphData }
  | { type: 'error'; message: string };

function friendlyError(message: string): string {
  if (message.includes('404') || message.includes('Not Found')) {
    return 'Repository not found. Check the URL and make sure the repository is public.';
  }
  if (message.includes('403') || message.includes('rate limit')) {
    return 'GitHub API rate limit exceeded. Set a GITHUB_TOKEN on the backend to increase limits.';
  }
  if (message.includes('SSE connection failed') || message.includes('Failed to fetch')) {
    return 'Cannot connect to the backend server. Make sure it is running on port 3001.';
  }
  if (message.includes('Too many requests')) {
    return 'Too many requests. Please wait a moment before trying again.';
  }
  if (message.includes('Invalid GitHub URL')) {
    return 'Invalid GitHub URL. Use the format: https://github.com/owner/repo';
  }
  if (message.includes('timeout')) {
    return 'Request timed out. The repository may be too large. Try reducing the max files limit.';
  }
  return message;
}

export function analyzeWithProgress(
  opts: AnalyzeOptions,
  onProgress: (event: ProgressEvent) => void
): Promise<GraphData> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ url: opts.url });
    if (opts.maxFiles !== undefined) params.set('maxFiles', String(opts.maxFiles));
    if (opts.excludeTests !== undefined) params.set('excludeTests', String(opts.excludeTests));
    if (opts.excludeStyles !== undefined) params.set('excludeStyles', String(opts.excludeStyles));

    const es = new EventSource(`/api/analyze-stream?${params.toString()}`);
    let settled = false;

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      es.close();
      fn();
    };

    es.onmessage = (e: MessageEvent) => {
      let event: ProgressEvent;
      try {
        event = JSON.parse(e.data as string) as ProgressEvent;
      } catch {
        return;
      }

      onProgress(event);

      if (event.type === 'complete') {
        done(() => resolve(event.graph));
      } else if (event.type === 'error') {
        done(() => reject(new Error(friendlyError(event.message))));
      }
    };

    es.onerror = () => {
      done(() => reject(new Error(friendlyError('SSE connection failed'))));
    };
  });
}
