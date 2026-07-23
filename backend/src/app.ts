import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  });
}

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import axios from 'axios';
import {
  scanRepository,
  cleanupJob,
  cleanupStaleCache,
  parseGitHubUrl,
  type ScannedFile,
} from './scanner/RepositoryScanner.js';
import { detectLanguage, isParseable } from './scanner/LanguageDetector.js';
import { getParser } from './parser/ParserRegistry.js';
import { buildRelationships } from './analysis/RelationshipBuilder.js';
import { annotateSummaries } from './analysis/SummaryGenerator.js';
import { computeDiff } from './analysis/GraphDiffer.js';
import { buildGraph } from './graph/GraphBuilder.js';
import {
  getLatestSha,
  getCachedResult,
  saveResultToCache,
  cleanupResultCache,
  getCacheStats,
  invalidateRepoCache,
} from './cache/ResultCache.js';
import { config } from './config.js';
import { logger } from './logger.js';
import type { ParsedFile, GraphData, AnalysisDiagnostics } from './types/index.js';

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ─── Rate limiting ─────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
    req.socket.remoteAddress ??
    'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + config.rateLimitWindowMs });
    next();
    return;
  }
  if (entry.count >= config.rateLimitMax) {
    res.status(429).json({
      error: 'Too many requests. Please wait before making another analysis.',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }
  entry.count++;
  next();
}

// Clean up stale rate-limit entries periodically (only in long-running process)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

// ─── Lazy one-time startup cleanup (for serverless: runs on first request) ─────

let initialized = false;

app.use((_req: Request, _res: Response, next: NextFunction) => {
  if (!initialized) {
    initialized = true;
    cleanupStaleCache().catch(e =>
      logger.warn('startup', 'Extract cache cleanup failed', { error: errMsg(e) })
    );
    cleanupResultCache().catch(e =>
      logger.warn('startup', 'Result cache cleanup failed', { error: errMsg(e) })
    );
  }
  next();
});

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '1mb' }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug('http', `${req.method} ${req.path}`);
  next();
});

// ─── Utilities ────────────────────────────────────────────────────────────────

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Larger batches for small files, smaller for large — avoids OOM on big repos
function adaptiveBatchSize(files: ScannedFile[]): number {
  if (files.length === 0) return 20;
  const avgBytes = files.reduce((s, f) => s + f.sizeBytes, 0) / files.length;
  if (avgBytes < 5_000)   return 40;
  if (avgBytes < 50_000)  return 20;
  if (avgBytes < 200_000) return 10;
  return 5;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${(ms / 1000).toFixed(0)}s`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const PIPELINE_TIMEOUT_MS = 5 * 60 * 1000;

// ─── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/detailed', async (_req, res) => {
  const cacheStats = await getCacheStats();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: cacheStats,
    config: {
      port: config.port,
      nodeEnv: config.nodeEnv,
      rateLimitMax: config.rateLimitMax,
      rateLimitWindowMs: config.rateLimitWindowMs,
    },
  });
});

app.get('/api/cache/stats', async (_req, res) => {
  const stats = await getCacheStats();
  res.json(stats);
});

// ─── Shared analysis pipeline ──────────────────────────────────────────────────

interface ProgressCallback {
  onDownloading?: (repo: string, branch: string) => void;
  onExtracted?: (fileCount: number) => void;
  onParsing?: (current: number, total: number, file: string) => void;
  onBuilding?: () => void;
}

async function runAnalysisPipeline(
  url: string,
  maxFiles: number,
  excludeTests: boolean,
  excludeStyles: boolean,
  progress: ProgressCallback,
  userToken?: string
): Promise<{ graph: GraphData; jobId: string }> {
  const repoInfo = parseGitHubUrl(url);
  const pipelineStart = Date.now();
  const phase: Record<string, number> = {};
  let phaseStart = pipelineStart;

  const mark = (name: string) => {
    phase[name] = Date.now() - phaseStart;
    phaseStart = Date.now();
  };

  // 1. Download and scan repository
  progress.onDownloading?.(`${repoInfo.owner}/${repoInfo.repo}`, repoInfo.branch);
  const scanResult = await scanRepository(url, maxFiles, userToken);
  progress.onExtracted?.(scanResult.files.length);
  mark('download');

  logger.info('analyze', `Scanned ${scanResult.files.length} files`, {
    repo: `${repoInfo.owner}/${repoInfo.repo}`,
    branch: repoInfo.branch,
    downloadMs: phase['download'],
  });

  // 2. Filter files
  const filesToParse = scanResult.files.filter(file => {
    const language = detectLanguage(file.absolutePath);
    if (
      excludeTests &&
      (file.relativePath.includes('.test.') ||
        file.relativePath.includes('.spec.') ||
        file.relativePath.includes('__tests__'))
    ) return false;
    if (excludeStyles && (language === 'css' || language === 'scss')) return false;
    return true;
  });

  // 3. Parse files — adaptive batch size based on average file size
  const batchSize = adaptiveBatchSize(filesToParse);
  const parsedFiles: ParsedFile[] = [];
  const ctx = { repoRoot: scanResult.repoRoot };
  let parsedCount = 0;
  let parseFailures = 0;
  const total = filesToParse.length;

  for (let i = 0; i < filesToParse.length; i += batchSize) {
    const batch = filesToParse.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async file => {
        const language = detectLanguage(file.absolutePath);
        if (isParseable(language)) {
          const parser = getParser(language);
          if (parser) {
            try {
              return await parser.parse(file, ctx);
            } catch (err) {
              parseFailures++;
              logger.warn('parse', `Failed to parse ${file.relativePath}`, { error: errMsg(err) });
            }
          }
        }
        // Non-parseable files — minimal stub entry
        const id = Buffer.from(file.relativePath).toString('base64').slice(0, 12);
        const fileLang = detectLanguage(file.absolutePath);
        const parsed: ParsedFile = {
          id,
          absolutePath: file.absolutePath,
          relativePath: file.relativePath,
          name: file.relativePath.split('/').pop() ?? '',
          extension: file.relativePath.includes('.') ? '.' + file.relativePath.split('.').pop() : '',
          language: fileLang,
          fileType:
            fileLang === 'css' || fileLang === 'scss' ? 'style'
            : fileLang === 'json' ? 'config'
            : 'unknown',
          imports: [],
          exports: [],
          jsxComponents: [],
          lineCount: file.content.split('\n').length,
          sizeBytes: file.sizeBytes,
          summary: '',
          folder: file.relativePath.includes('/')
            ? file.relativePath.split('/').slice(0, -1).join('/')
            : '',
          hasDefaultExport: false,
          isBarrel: false,
        };
        return parsed;
      })
    );

    for (const result of batchResults) {
      if (result) parsedFiles.push(result);
    }
    parsedCount += batch.length;
    progress.onParsing?.(parsedCount, total, batch[batch.length - 1].relativePath);
  }
  mark('parse');

  logger.info('analyze', `Parsed ${parsedFiles.length} files`, {
    failures: parseFailures,
    batchSize,
    parseMs: phase['parse'],
  });

  // 4. Summaries
  const annotated = annotateSummaries(parsedFiles);

  // 5. Build relationships
  progress.onBuilding?.();
  const { edges, circularDeps, orphanFiles, diagnostics } = await buildRelationships(
    annotated,
    scanResult.repoRoot,
    scanResult.aliases
  );
  mark('relationships');

  logger.info('analyze', 'Built relationships', {
    edges: edges.length,
    circularDeps: circularDeps.length,
    resolvedImports: diagnostics.resolvedImports,
    totalImports: diagnostics.totalImports,
    relationshipsMs: phase['relationships'],
  });

  // 6. Assemble graph
  const analysisMs = Date.now() - pipelineStart;
  const fullDiagnostics: AnalysisDiagnostics = { ...diagnostics, parseFailures };
  const graph = buildGraph(
    annotated, edges, circularDeps, orphanFiles,
    url, repoInfo.owner, repoInfo.repo, repoInfo.branch,
    analysisMs, fullDiagnostics
  );

  logger.info('analyze', `Complete in ${analysisMs}ms`, {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    repo: `${repoInfo.owner}/${repoInfo.repo}`,
    phaseMs: phase,
  });

  return { graph, jobId: scanResult.jobId };
}

// ─── Input validation ──────────────────────────────────────────────────────────

const GITHUB_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\/tree\/[^\s?#]+)?$/;

function validateUrl(url: unknown): string {
  if (!url || typeof url !== 'string') throw new Error('Missing or invalid "url" parameter');
  const trimmed = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
  if (!GITHUB_URL_RE.test(trimmed)) throw new Error('URL must be a valid GitHub repository URL (https://github.com/owner/repo)');
  return trimmed;
}

function validateMaxFiles(raw: unknown, defaultVal = 2000): number {
  const n = parseInt(String(raw ?? defaultVal), 10);
  if (isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, config.maxFiles);
}

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────

app.get('/api/auth/github', (req, res) => {
  if (!config.githubClientId) {
    return res.status(501).json({ error: 'OAuth not configured on this server' });
  }
  const params = new URLSearchParams({
    client_id: config.githubClientId,
    scope: 'repo',
    allow_signup: 'true',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code || !config.githubClientId || !config.githubClientSecret) {
    return res.redirect(`${config.frontendUrl}/#auth_error=oauth_not_configured`);
  }
  try {
    const { data } = await axios.post<{ access_token?: string; error?: string }>(
      'https://github.com/login/oauth/access_token',
      { client_id: config.githubClientId, client_secret: config.githubClientSecret, code },
      { headers: { Accept: 'application/json', 'User-Agent': 'github-graph-analyzer' } }
    );
    if (data.error || !data.access_token) {
      return res.redirect(`${config.frontendUrl}/#auth_error=${data.error ?? 'unknown'}`);
    }
    res.redirect(`${config.frontendUrl}/#access_token=${data.access_token}`);
  } catch (err: unknown) {
    logger.error('auth', 'OAuth callback failed', { error: errMsg(err) });
    res.redirect(`${config.frontendUrl}/#auth_error=server_error`);
  }
});

app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const { data } = await axios.get<{ login: string; avatar_url: string; name: string }>(
      'https://api.github.com/user',
      { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'github-graph-analyzer' } }
    );
    res.json({ login: data.login, avatarUrl: data.avatar_url, name: data.name });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ─── SSE streaming endpoint ───────────────────────────────────────────────────

app.get('/api/analyze-stream', rateLimiter, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object): void => { res.write(`data: ${JSON.stringify(data)}\n\n`); };

  let url: string;
  try {
    url = validateUrl(req.query.url);
  } catch (err: unknown) {
    send({ type: 'error', message: errMsg(err) });
    res.end();
    return;
  }

  const maxFiles = validateMaxFiles(req.query.maxFiles);
  const excludeTests = req.query.excludeTests === 'true';
  const excludeStyles = req.query.excludeStyles === 'true';
  const userToken = req.query.userToken as string | undefined;

  let repoInfo: ReturnType<typeof parseGitHubUrl>;
  try {
    repoInfo = parseGitHubUrl(url);
  } catch (err: unknown) {
    send({ type: 'error', message: errMsg(err) });
    res.end();
    return;
  }

  const sha = await getLatestSha(repoInfo.owner, repoInfo.repo, repoInfo.branch);
  if (sha) {
    const cached = await getCachedResult(repoInfo.owner, repoInfo.repo, sha);
    if (cached) {
      logger.info('analyze-stream', 'Cache hit', { repo: `${repoInfo.owner}/${repoInfo.repo}`, sha });
      send({ type: 'cached', sha });
      send({ type: 'complete', graph: cached });
      res.end();
      return;
    }
  }

  send({ type: 'start', sha: sha ?? undefined });
  let jobId: string | null = null;

  try {
    const { graph, jobId: jid } = await withTimeout(
      runAnalysisPipeline(url, maxFiles, excludeTests, excludeStyles, {
        onDownloading: (repo, branch) => send({ type: 'downloading', repo, branch }),
        onExtracted: fileCount => send({ type: 'extracted', fileCount }),
        onParsing: (current, total, file) => send({ type: 'parsing', current, total, file }),
        onBuilding: () => send({ type: 'building' }),
      }, userToken),
      PIPELINE_TIMEOUT_MS,
      'Analysis'
    );
    jobId = jid;
    if (sha) await saveResultToCache(repoInfo.owner, repoInfo.repo, sha, graph);
    send({ type: 'complete', graph });
  } catch (err: unknown) {
    logger.error('analyze-stream', 'Analysis failed', { error: errMsg(err) });
    send({ type: 'error', message: errMsg(err) });
  } finally {
    res.end();
    if (jobId) cleanupJob(jobId).catch(e => logger.warn('cleanup', 'Failed', { error: errMsg(e) }));
  }
});

// ─── POST /api/analyze (synchronous fallback) ─────────────────────────────────

app.post('/api/analyze', rateLimiter, async (req, res) => {
  let url: string;
  try {
    url = validateUrl(req.body?.url);
  } catch (err: unknown) {
    return res.status(400).json({ error: errMsg(err) });
  }

  const maxFiles = validateMaxFiles(req.body?.maxFiles);
  const excludeTests = Boolean(req.body?.excludeTests);
  const excludeStyles = Boolean(req.body?.excludeStyles);
  const userToken = req.body?.userToken as string | undefined;

  let repoInfo: ReturnType<typeof parseGitHubUrl>;
  try {
    repoInfo = parseGitHubUrl(url);
  } catch (err: unknown) {
    return res.status(400).json({ error: errMsg(err) });
  }

  logger.info('analyze', 'Starting analysis', {
    repo: `${repoInfo.owner}/${repoInfo.repo}`,
    branch: repoInfo.branch,
  });

  const sha = await getLatestSha(repoInfo.owner, repoInfo.repo, repoInfo.branch);
  if (sha) {
    const cached = await getCachedResult(repoInfo.owner, repoInfo.repo, sha);
    if (cached) {
      logger.info('analyze', 'Cache hit', { sha });
      return res.json({ success: true, graph: cached, cached: true, sha });
    }
  }

  let jobId: string | null = null;
  try {
    const { graph, jobId: jid } = await withTimeout(
      runAnalysisPipeline(url, maxFiles, excludeTests, excludeStyles, {
        onDownloading: (repo, branch) => logger.info('analyze', `Downloading ${repo} @ ${branch}`),
        onExtracted: fileCount => logger.info('analyze', `Extracted ${fileCount} files`),
        onBuilding: () => logger.info('analyze', 'Building graph...'),
      }, userToken),
      PIPELINE_TIMEOUT_MS,
      'Analysis'
    );
    jobId = jid;
    if (sha) await saveResultToCache(repoInfo.owner, repoInfo.repo, sha, graph);
    res.json({ success: true, graph, jobId });
  } catch (err: unknown) {
    logger.error('analyze', 'Analysis failed', { error: errMsg(err) });
    res.status(500).json({
      error: errMsg(err),
      details: config.nodeEnv === 'development' && err instanceof Error ? err.stack : undefined,
    });
  } finally {
    if (jobId) cleanupJob(jobId).catch(e => logger.warn('cleanup', 'Failed', { error: errMsg(e) }));
  }
});

// ─── GET /api/diff-stream ─────────────────────────────────────────────────────

app.get('/api/diff-stream', rateLimiter, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object): void => { res.write(`data: ${JSON.stringify(data)}\n\n`); };

  let url: string;
  try { url = validateUrl(req.query.url); }
  catch (err: unknown) { send({ type: 'error', message: errMsg(err) }); res.end(); return; }

  const branchA = (req.query.branchA as string) || 'main';
  const branchB = (req.query.branchB as string) || 'develop';
  const maxFiles = validateMaxFiles(req.query.maxFiles);
  const excludeTests = req.query.excludeTests === 'true';
  const userToken = req.query.userToken as string | undefined;

  let repoInfo: ReturnType<typeof parseGitHubUrl>;
  try { repoInfo = parseGitHubUrl(url); }
  catch (err: unknown) { send({ type: 'error', message: errMsg(err) }); res.end(); return; }

  // suppress unused variable warning
  void repoInfo;

  const jobIds: string[] = [];

  try {
    // Analyse branchA
    send({ type: 'start', phase: 'branchA', branch: branchA });
    const baseUrl = url.replace(/\/tree\/[^\s]*$/, '');
    const urlA = `${baseUrl}/tree/${branchA}`;
    const { graph: graphA, jobId: jobIdA } = await withTimeout(
      runAnalysisPipeline(urlA, maxFiles, excludeTests, false, {
        onDownloading: (repo, branch) => send({ type: 'downloading', repo, branch, phase: 'branchA' }),
        onExtracted: fc => send({ type: 'extracted', fileCount: fc, phase: 'branchA' }),
        onParsing: (cur, tot, file) => send({ type: 'parsing', current: cur, total: tot, file, phase: 'branchA' }),
        onBuilding: () => send({ type: 'building', phase: 'branchA' }),
      }, userToken),
      PIPELINE_TIMEOUT_MS,
      'Branch A analysis'
    );
    jobIds.push(jobIdA);

    // Analyse branchB
    send({ type: 'start', phase: 'branchB', branch: branchB });
    const urlB = `${baseUrl}/tree/${branchB}`;
    const { graph: graphB, jobId: jobIdB } = await withTimeout(
      runAnalysisPipeline(urlB, maxFiles, excludeTests, false, {
        onDownloading: (repo, branch) => send({ type: 'downloading', repo, branch, phase: 'branchB' }),
        onExtracted: fc => send({ type: 'extracted', fileCount: fc, phase: 'branchB' }),
        onParsing: (cur, tot, file) => send({ type: 'parsing', current: cur, total: tot, file, phase: 'branchB' }),
        onBuilding: () => send({ type: 'building', phase: 'branchB' }),
      }, userToken),
      PIPELINE_TIMEOUT_MS,
      'Branch B analysis'
    );
    jobIds.push(jobIdB);

    send({ type: 'diffing' });
    const diffGraph = computeDiff(graphA, graphB);

    send({ type: 'complete', graph: diffGraph });
  } catch (err: unknown) {
    logger.error('diff-stream', 'Diff failed', { error: errMsg(err) });
    send({ type: 'error', message: errMsg(err) });
  } finally {
    res.end();
    for (const jid of jobIds) {
      cleanupJob(jid).catch(e => logger.warn('cleanup', 'Failed', { error: errMsg(e) }));
    }
  }
});

// ─── Cache management ──────────────────────────────────────────────────────────

// Per-repo invalidation must come BEFORE /:jobId to avoid shadowing
app.delete('/api/cache/repo/:owner/:repo', async (req, res) => {
  const { owner, repo } = req.params;
  const removed = await invalidateRepoCache(owner, repo);
  logger.info('cache', `Invalidated cache for ${owner}/${repo}`, { removed });
  res.json({ success: true, removed });
});

app.delete('/api/cache/:jobId', async (req, res) => {
  await cleanupJob(req.params.jobId).catch(() => {});
  res.json({ success: true });
});

export default app;
