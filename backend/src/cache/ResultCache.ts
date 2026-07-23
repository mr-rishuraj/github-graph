import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import type { GraphData } from '../types/index.js';
import { logger } from '../logger.js';

const RESULT_CACHE_DIR = path.join(os.tmpdir(), 'github-graph-cache', 'results');
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ENTRIES = 50;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

let cacheHits = 0;
let cacheMisses = 0;

export async function getLatestSha(
  owner: string,
  repo: string,
  branch: string
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'github-graph-analyzer',
  };
  if (token) headers['Authorization'] = `token ${token}`;

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
    const response = await axios.get(url, { headers, timeout: 15_000 });
    return (response.data?.sha as string) ?? null;
  } catch {
    return null;
  }
}

function cacheFilePath(owner: string, repo: string, sha: string): string {
  return path.join(RESULT_CACHE_DIR, `${owner}-${repo}-${sha}.json`);
}

export async function getCachedResult(
  owner: string,
  repo: string,
  sha: string
): Promise<GraphData | null> {
  const filePath = cacheFilePath(owner, repo, sha);
  try {
    if (await fs.pathExists(filePath)) {
      const data = await fs.readJson(filePath);
      cacheHits++;
      return data as GraphData;
    }
  } catch {
    // ignore read errors
  }
  cacheMisses++;
  return null;
}

export async function saveResultToCache(
  owner: string,
  repo: string,
  sha: string,
  graph: GraphData
): Promise<void> {
  try {
    await fs.ensureDir(RESULT_CACHE_DIR);
    const filePath = cacheFilePath(owner, repo, sha);
    await fs.writeJson(filePath, graph);
    // Evict oldest entries when over limit
    await evictIfNeeded();
  } catch (err) {
    logger.warn('cache', 'Failed to save result', { error: String(err) });
  }
}

async function evictIfNeeded(): Promise<void> {
  try {
    if (!await fs.pathExists(RESULT_CACHE_DIR)) return;
    const files = await fs.readdir(RESULT_CACHE_DIR);
    if (files.length === 0) return;

    const stats = await Promise.all(
      files.map(async f => {
        const fp = path.join(RESULT_CACHE_DIR, f);
        const s = await fs.stat(fp);
        return { file: f, mtime: s.mtimeMs, size: s.size };
      })
    );

    const totalBytes = stats.reduce((s, f) => s + f.size, 0);
    if (stats.length <= MAX_ENTRIES && totalBytes <= MAX_BYTES) return;

    // Evict oldest until under 80% of each limit
    stats.sort((a, b) => a.mtime - b.mtime);
    let count = stats.length;
    let bytes = totalBytes;
    for (const { file, size } of stats) {
      if (count <= MAX_ENTRIES * 0.8 && bytes <= MAX_BYTES * 0.8) break;
      await fs.remove(path.join(RESULT_CACHE_DIR, file));
      count--;
      bytes -= size;
    }
    logger.info('cache', `Evicted down to ${count} entries (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  } catch {
    // ignore
  }
}

export async function getCacheStats(): Promise<{
  hits: number;
  misses: number;
  entries: number;
  totalBytes: number;
}> {
  let entries = 0;
  let totalBytes = 0;
  try {
    if (await fs.pathExists(RESULT_CACHE_DIR)) {
      const files = await fs.readdir(RESULT_CACHE_DIR);
      entries = files.length;
      for (const f of files) {
        try {
          const stat = await fs.stat(path.join(RESULT_CACHE_DIR, f));
          totalBytes += stat.size;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return { hits: cacheHits, misses: cacheMisses, entries, totalBytes };
}

export async function invalidateRepoCache(owner: string, repo: string): Promise<number> {
  let removed = 0;
  try {
    if (!await fs.pathExists(RESULT_CACHE_DIR)) return 0;
    const prefix = `${owner}-${repo}-`;
    const entries = await fs.readdir(RESULT_CACHE_DIR);
    for (const entry of entries) {
      if (entry.startsWith(prefix)) {
        await fs.remove(path.join(RESULT_CACHE_DIR, entry));
        removed++;
      }
    }
  } catch {
    // ignore
  }
  return removed;
}

export async function cleanupResultCache(): Promise<void> {
  try {
    if (!await fs.pathExists(RESULT_CACHE_DIR)) return;
    const entries = await fs.readdir(RESULT_CACHE_DIR);
    const now = Date.now();
    let removed = 0;
    for (const entry of entries) {
      const fullPath = path.join(RESULT_CACHE_DIR, entry);
      try {
        const stat = await fs.stat(fullPath);
        if (now - stat.mtimeMs > TTL_MS) {
          await fs.remove(fullPath);
          removed++;
        }
      } catch {
        // ignore
      }
    }
    if (removed > 0) logger.info('cache', `Removed ${removed} stale result cache entries`);
  } catch {
    // ignore
  }
}
