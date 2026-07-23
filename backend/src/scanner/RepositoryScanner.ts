import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import unzipper from 'unzipper';
import { glob } from 'glob';
import { v4 as uuidv4 } from 'uuid';
import type { RepoInfo, AliasMap } from '../types/index.js';
import { shouldSkipFile } from './LanguageDetector.js';
import { logger } from '../logger.js';

const CACHE_DIR = path.join(os.tmpdir(), 'github-graph-cache');
const EXTRACT_TTL_MS = 30 * 60 * 1000;

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  content: string;
}

export interface ScanResult {
  files: ScannedFile[];
  repoRoot: string;
  aliases: AliasMap;
  jobId: string;
}

export function parseGitHubUrl(url: string): RepoInfo {
  const cleaned = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const match = cleaned.match(
    /github\.com[/:]([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/
  );
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return {
    owner: match[1],
    repo: match[2],
    branch: match[3] || 'main',
    defaultBranch: match[3] || 'main',
  };
}

// ─── Download with exponential-backoff retry ──────────────────────────────────

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (
    msg.includes('econnreset') || msg.includes('econnrefused') ||
    msg.includes('etimedout') || msg.includes('socket hang up') ||
    msg.includes('network error')
  ) return true;
  // Axios HTTP 5xx
  const anyErr = err as { response?: { status?: number } };
  return typeof anyErr.response?.status === 'number' && anyErr.response.status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadZip(
  owner: string,
  repo: string,
  branch: string,
  destDir: string,
  attempt = 1,
  maxAttempts = 3,
  userToken?: string
): Promise<void> {
  const token = userToken ?? process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'github-graph-analyzer',
  };
  if (token) headers['Authorization'] = `token ${token}`;

  const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;

  try {
    const response = await axios({
      method: 'GET',
      url: zipUrl,
      responseType: 'stream',
      headers,
      maxRedirects: 5,
      timeout: 120_000,
    });

    await new Promise<void>((resolve, reject) => {
      response.data
        .pipe(unzipper.Extract({ path: destDir }))
        .on('close', resolve)
        .on('error', reject);
    });
  } catch (err: unknown) {
    if (isRetryableError(err) && attempt < maxAttempts) {
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      logger.warn('scanner', `Download attempt ${attempt} failed, retrying in ${delay}ms`, {
        branch,
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(delay);
      return downloadZip(owner, repo, branch, destDir, attempt + 1, maxAttempts, userToken);
    }
    throw err;
  }
}

async function tryDownload(
  owner: string,
  repo: string,
  info: RepoInfo,
  destDir: string,
  userToken?: string
): Promise<string> {
  const branches = info.branch !== 'main'
    ? [info.branch]
    : ['main', 'master', 'develop', 'trunk'];

  let lastError: unknown = null;
  for (const branch of branches) {
    try {
      await downloadZip(owner, repo, branch, destDir, 1, 3, userToken);
      return branch;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Could not download ${owner}/${repo}. Tried branches: ${branches.join(', ')}. ` +
    `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findRepoRoot(extractDir: string): string {
  const entries = fs.readdirSync(extractDir);
  if (entries.length === 1) {
    const candidate = path.join(extractDir, entries[0]);
    if (fs.statSync(candidate).isDirectory()) return candidate;
  }
  return extractDir;
}

// ─── Alias resolution (tsconfig paths + workspace packages) ───────────────────

async function readWorkspaceAliases(repoRoot: string): Promise<AliasMap> {
  const aliases: AliasMap = {};

  // npm/yarn workspaces in root package.json
  const rootPkg = path.join(repoRoot, 'package.json');
  if (await fs.pathExists(rootPkg)) {
    try {
      const pkg = await fs.readJson(rootPkg) as Record<string, unknown>;
      const workspaces: string[] = Array.isArray(pkg['workspaces'])
        ? (pkg['workspaces'] as string[])
        : Array.isArray((pkg['workspaces'] as Record<string, string[]>)?.packages)
        ? (pkg['workspaces'] as Record<string, string[]>).packages
        : [];

      for (const pattern of workspaces) {
        const cleanPattern = pattern.replace(/\/\*$/, '');
        const dirs = await glob(`${cleanPattern}/*/`, { cwd: repoRoot, absolute: true });
        for (const pkgDir of dirs) {
          const pkgJsonPath = path.join(pkgDir, 'package.json');
          if (await fs.pathExists(pkgJsonPath)) {
            const pkgJson = await fs.readJson(pkgJsonPath).catch(() => ({})) as Record<string, unknown>;
            if (typeof pkgJson['name'] === 'string') {
              aliases[pkgJson['name']] = pkgDir;
            }
          }
        }
      }
    } catch {
      // ignore malformed package.json
    }
  }

  // pnpm-workspace.yaml
  const pnpmYaml = path.join(repoRoot, 'pnpm-workspace.yaml');
  if (await fs.pathExists(pnpmYaml)) {
    try {
      const content = await fs.readFile(pnpmYaml, 'utf-8');
      const lines = content.split('\n');
      let inPackages = false;
      for (const line of lines) {
        if (line.match(/^packages:/)) { inPackages = true; continue; }
        if (inPackages && line.match(/^\s+-\s+/)) {
          const pattern = line.replace(/^\s+-\s+['"]?/, '').replace(/['"]?\s*$/, '').trim();
          const cleanPattern = pattern.replace(/\/\*$/, '');
          const dirs = await glob(`${cleanPattern}/*/`, { cwd: repoRoot, absolute: true });
          for (const pkgDir of dirs) {
            const pkgJsonPath = path.join(pkgDir, 'package.json');
            if (await fs.pathExists(pkgJsonPath)) {
              const pkgJson = await fs.readJson(pkgJsonPath).catch(() => ({})) as Record<string, unknown>;
              if (typeof pkgJson['name'] === 'string') {
                aliases[pkgJson['name']] = pkgDir;
              }
            }
          }
        } else if (inPackages && !line.match(/^\s/)) {
          inPackages = false;
        }
      }
    } catch {
      // ignore
    }
  }

  return aliases;
}

// Parse vite.config.* for resolve.alias — regex-based, handles common patterns
async function readViteAliases(repoRoot: string): Promise<AliasMap> {
  const aliases: AliasMap = {};
  const candidates = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'];

  for (const cfg of candidates) {
    const cfgPath = path.join(repoRoot, cfg);
    if (!await fs.pathExists(cfgPath)) continue;
    try {
      const content = await fs.readFile(cfgPath, 'utf-8');
      // Match patterns like:
      //   '@': path.resolve(__dirname, './src')
      //   '@': path.resolve(__dirname, 'src')
      //   '@': './src'
      //   '~': 'src'
      const re = /['"]([^'"]{1,30})['"]\s*:\s*(?:path\.(?:resolve|join)\s*\([^)]*,\s*)?['"](\.\/[\w./]+|[\w][^'"]*)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const alias = m[1].trim();
        const raw = m[2].trim();
        // Skip if looks like a URL, plugin name, or non-path string
        if (!alias || alias.includes(' ') || alias.includes(':')) continue;
        const resolved = path.resolve(repoRoot, raw.startsWith('./') ? raw : `./${raw}`);
        aliases[alias] = resolved;
      }
    } catch {
      // ignore
    }
    break; // only read first found vite config
  }
  return aliases;
}

async function readAliases(repoRoot: string): Promise<AliasMap> {
  const aliases: AliasMap = {};

  // tsconfig paths
  const tsconfigPaths = [
    path.join(repoRoot, 'tsconfig.json'),
    path.join(repoRoot, 'tsconfig.base.json'),
    path.join(repoRoot, 'tsconfig.paths.json'),
  ];
  for (const tsconfigPath of tsconfigPaths) {
    if (await fs.pathExists(tsconfigPath)) {
      try {
        const tsconfig = await fs.readJson(tsconfigPath) as Record<string, unknown>;
        const compilerOptions = (tsconfig['compilerOptions'] ?? {}) as Record<string, unknown>;
        const paths = (compilerOptions['paths'] ?? {}) as Record<string, string[]>;
        const baseUrl = (compilerOptions['baseUrl'] ?? '.') as string;

        for (const [alias, targets] of Object.entries(paths)) {
          if (targets.length > 0) {
            const cleanAlias = alias.replace(/\/\*$/, '');
            const cleanTarget = targets[0].replace(/\/\*$/, '');
            aliases[cleanAlias] = path.resolve(repoRoot, baseUrl, cleanTarget);
          }
        }
        if (baseUrl && baseUrl !== '.' && baseUrl !== './') {
          aliases[''] = path.resolve(repoRoot, baseUrl);
        }
        break;
      } catch {
        // ignore
      }
    }
  }

  // Common alias defaults
  const srcDir = path.join(repoRoot, 'src');
  if (await fs.pathExists(srcDir)) {
    if (!aliases['@']) aliases['@'] = srcDir;
    if (!aliases['~']) aliases['~'] = srcDir;
    if (!aliases['#']) aliases['#'] = srcDir;
  }

  // Workspace package aliases (monorepo support)
  const workspaceAliases = await readWorkspaceAliases(repoRoot);
  for (const [name, dir] of Object.entries(workspaceAliases)) {
    if (!aliases[name]) {
      aliases[name] = dir;
      logger.debug('scanner', `Workspace alias: ${name} → ${path.relative(repoRoot, dir)}`);
    }
  }

  // Vite resolve.alias (supplement — tsconfig paths take precedence)
  const viteAliases = await readViteAliases(repoRoot);
  for (const [alias, target] of Object.entries(viteAliases)) {
    if (!aliases[alias]) {
      aliases[alias] = target;
      logger.debug('scanner', `Vite alias: ${alias} → ${path.relative(repoRoot, target)}`);
    }
  }

  return aliases;
}

// ─── Main scan entry point ─────────────────────────────────────────────────────

export async function scanRepository(
  url: string,
  maxFiles = 5000,
  userToken?: string
): Promise<ScanResult> {
  const info = parseGitHubUrl(url);
  const { owner, repo } = info;

  await fs.ensureDir(CACHE_DIR);
  const jobId = uuidv4();
  const extractDir = path.join(CACHE_DIR, jobId);
  await fs.ensureDir(extractDir);

  try {
    const branch = await tryDownload(owner, repo, info, extractDir, userToken);
    const repoRoot = findRepoRoot(extractDir);
    const aliases = await readAliases(repoRoot);

    const allFiles = await glob('**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,css,scss,sass,less,json,py}', {
      cwd: repoRoot,
      absolute: true,
      ignore: [
        '**/node_modules/**', '**/dist/**', '**/build/**',
        '**/.next/**', '**/out/**', '**/coverage/**',
        '**/.git/**', '**/.turbo/**',
        '**/*.d.ts', '**/*.min.js', '**/*.min.css',
        '**/public/**', '**/__pycache__/**', '**/*.pyc',
      ],
    });

    // Reject if total file size would exceed 500MB (ZIP bomb protection)
    const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
    let totalBytes = 0;
    const checkedFiles: string[] = [];
    for (const absPath of allFiles.slice(0, maxFiles)) {
      if (shouldSkipFile(absPath)) continue;
      try {
        const stat = await fs.stat(absPath);
        if (stat.size > 1_000_000) continue;
        totalBytes += stat.size;
        if (totalBytes > MAX_TOTAL_BYTES) {
          logger.warn('scanner', `Total extraction size exceeded ${MAX_TOTAL_BYTES / 1024 / 1024}MB limit, truncating`);
          break;
        }
        checkedFiles.push(absPath);
      } catch { continue; }
    }

    const scannedFiles: ScannedFile[] = [];
    for (const absPath of checkedFiles) {
      try {
        const content = await fs.readFile(absPath, 'utf-8');
        const relativePath = path.relative(repoRoot, absPath).replace(/\\/g, '/');
        const stat = await fs.stat(absPath);
        scannedFiles.push({ absolutePath: absPath, relativePath, sizeBytes: stat.size, content });
      } catch { continue; }
    }

    const workspaceCount = Object.keys(aliases).filter(k => k.includes('/')).length;
    if (workspaceCount > 0) {
      logger.info('scanner', `Detected ${workspaceCount} workspace package aliases`);
    }

    return { files: scannedFiles, repoRoot, aliases, jobId };
  } catch (err) {
    await fs.remove(extractDir).catch(() => {});
    throw err;
  }
}

export async function cleanupJob(jobId: string): Promise<void> {
  await fs.remove(path.join(CACHE_DIR, jobId)).catch(() => {});
}

export async function cleanupStaleCache(): Promise<void> {
  if (!await fs.pathExists(CACHE_DIR)) return;
  const entries = await fs.readdir(CACHE_DIR);
  const now = Date.now();
  for (const entry of entries) {
    const fullPath = path.join(CACHE_DIR, entry);
    try {
      const stat = await fs.stat(fullPath);
      if (now - stat.mtimeMs > EXTRACT_TTL_MS) await fs.remove(fullPath);
    } catch {
      // ignore
    }
  }
}
