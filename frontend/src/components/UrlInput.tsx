import { useState, useRef } from 'react';
import { Github, ArrowRight, AlertCircle, Clock, GitBranch, Upload, Download } from 'lucide-react';
import type { RecentRepo } from '../hooks/useRecentRepos.js';
import { timeAgo } from '../hooks/useRecentRepos.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

interface UrlInputProps {
  onAnalyze: (url: string, opts: { maxFiles: number; excludeTests: boolean }) => void;
  isLoading: boolean;
  error: string | null;
  recentRepos?: RecentRepo[];
  onExportRepos?: () => void;
  onImportRepos?: (repos: RecentRepo[]) => void;
  isLoggedIn?: boolean;
  onLogin?: () => void;
}

const EXAMPLE_REPOS = [
  'https://github.com/facebook/react',
  'https://github.com/vercel/next.js',
  'https://github.com/vitejs/vite',
  'https://github.com/tailwindlabs/tailwindcss',
];

// If branch is specified, append /tree/{branch} to the URL (unless already there)
function buildUrl(baseUrl: string, branchOverride: string): string {
  if (!branchOverride.trim()) return baseUrl;
  const cleaned = baseUrl.trim().replace(/\.git$/, '').replace(/\/$/, '');
  // Remove existing /tree/... if present
  const withoutTree = cleaned.replace(/\/tree\/[^\s]*$/, '');
  return `${withoutTree}/tree/${branchOverride.trim()}`;
}

export function UrlInput({ onAnalyze, isLoading, error, recentRepos = [], onExportRepos, onImportRepos, isLoggedIn, onLogin }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [maxFiles, setMaxFiles] = useState(2000);
  const [excludeTests, setExcludeTests] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [branch, setBranch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as RecentRepo[];
        if (Array.isArray(data)) onImportRepos?.(data);
      } catch {
        // ignore invalid file
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const finalUrl = buildUrl(trimmed, branch);
    onAnalyze(finalUrl, { maxFiles, excludeTests });
  };

  const handleQuickAnalyze = (repoUrl: string) => {
    const finalUrl = buildUrl(repoUrl, branch);
    onAnalyze(finalUrl, { maxFiles, excludeTests });
  };

  const isValid = url.trim().includes('github.com');

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      {/* Logo / Title */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div
          style={{
            width: 56,
            height: 56,
            background: 'var(--bg-surface)',
            border: '1px solid #30363d',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 0 0 1px #388bfd20, 0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <Github size={28} color="var(--fg)" />
        </div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: 'var(--fg)',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          GitHub Graph
        </h1>
        <p style={{ fontSize: 16, color: 'var(--fg-muted)', margin: 0 }}>
          Visualize any repository as an interactive dependency map
        </p>
      </div>

      {/* Input form */}
      <div
        style={{
          width: '100%',
          maxWidth: 560,
        }}
      >
        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              gap: 0,
              background: 'var(--bg-surface)',
              border: `1px solid ${error ? '#ef4444' : isValid ? '#388bfd' : 'var(--border)'}`,
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: `0 4px 24px rgba(0,0,0,0.4)${isValid ? ', 0 0 0 3px #388bfd18' : ''}`,
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', color: 'var(--fg-subtle)' }}>
              <Github size={18} />
            </div>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
              disabled={isLoading}
              autoFocus
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                fontSize: 15,
                color: 'var(--fg)',
                padding: '14px 0',
                fontFamily: 'SFMono-Regular, Consolas, monospace',
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !isValid}
              style={{
                background: isValid && !isLoading ? '#388bfd' : 'var(--bg-overlay)',
                border: 'none',
                borderLeft: '1px solid #30363d',
                padding: '0 20px',
                cursor: isValid && !isLoading ? 'pointer' : 'not-allowed',
                color: isValid && !isLoading ? '#fff' : 'var(--fg-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.15s',
                minWidth: 100,
                justifyContent: 'center',
              }}
            >
              Analyze
              <ArrowRight size={16} />
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              background: '#ef444418',
              border: '1px solid #ef444440',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#f87171',
              fontSize: 13,
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Advanced options */}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--fg-subtle)',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {showAdvanced ? '▾' : '▸'} Advanced options
          </button>

          {showAdvanced && (
            <div
              style={{
                marginTop: 8,
                background: 'var(--bg-surface)',
                border: '1px solid #30363d',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 500 }}>
                  Max files to analyze: {maxFiles.toLocaleString()}
                </span>
                <input
                  type="range"
                  min={100}
                  max={5000}
                  step={100}
                  value={maxFiles}
                  onChange={e => setMaxFiles(Number(e.target.value))}
                  style={{ accentColor: '#388bfd' }}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={excludeTests}
                  onChange={e => setExcludeTests(e.target.checked)}
                  style={{ accentColor: '#388bfd' }}
                />
                <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Skip test files</span>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 500 }}>
                  Branch <span style={{ color: 'var(--fg-subtle)', fontWeight: 400 }}>(optional, defaults to main/master)</span>
                </span>
                <input
                  type="text"
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="e.g. develop, feat/my-feature"
                  style={{
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 13,
                    color: 'var(--fg)',
                    outline: 'none',
                    fontFamily: 'monospace',
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />

        {/* Recent repos */}
        {recentRepos.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={10} />
              Recent
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {onExportRepos && (
                  <button
                    onClick={onExportRepos}
                    title="Export recent repos"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', display: 'flex', padding: 2 }}
                    className="hover:text-[#388bfd] transition-colors"
                  >
                    <Download size={11} />
                  </button>
                )}
                {onImportRepos && (
                  <button
                    onClick={handleImportClick}
                    title="Import recent repos"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', display: 'flex', padding: 2 }}
                    className="hover:text-[#388bfd] transition-colors"
                  >
                    <Upload size={11} />
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentRepos.map(repo => (
                <button
                  key={repo.url}
                  onClick={() => handleQuickAnalyze(repo.url)}
                  disabled={isLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'var(--bg-surface)',
                    border: '1px solid #21262d',
                    borderRadius: 8,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    width: '100%',
                  }}
                  className="hover:border-[var(--border)] hover:bg-[var(--bg-overlay)]"
                >
                  <GitBranch size={13} color="var(--fg-subtle)" style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--fg)',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {repo.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--fg-subtle)', flexShrink: 0 }}>
                    {repo.nodeCount.toLocaleString()} nodes
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--fg-subtle)', flexShrink: 0 }}>
                    {timeAgo(repo.timestamp)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Private repo hint */}
        {!isLoggedIn && onLogin && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'center' }}>
            <button
              onClick={onLogin}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#388bfd',
                fontSize: 12,
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Sign in with GitHub
            </button>
            {' '}to analyze private repos
          </div>
        )}

        {/* Examples */}
        <div style={{ marginTop: recentRepos.length > 0 ? 20 : 32 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            Try an example
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLE_REPOS.map(repo => {
              const name = repo.replace('https://github.com/', '');
              return (
                <button
                  key={repo}
                  onClick={() => setUrl(repo)}
                  disabled={isLoading}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid #30363d',
                    borderRadius: 6,
                    padding: '5px 10px',
                    fontSize: 12,
                    color: 'var(--fg-muted)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    transition: 'all 0.15s',
                  }}
                  className="hover:border-[#388bfd] hover:text-[#388bfd] transition-colors"
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Features */}
      <div
        style={{
          marginTop: isMobile ? 32 : 64,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 12,
          maxWidth: 680,
          width: '100%',
        }}
      >
        {[
          { icon: '🔍', title: 'AST Analysis', desc: 'Parses JS/TS/JSX/TSX with Babel — no AI, fully local' },
          { icon: '🕸️', title: 'Dependency Map', desc: 'Tracks imports, exports, re-exports, dynamic imports' },
          { icon: '⚡', title: 'Interactive', desc: 'Zoom, pan, search, filter, and explore any node' },
        ].map(f => (
          <div
            key={f.title}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid #21262d',
              borderRadius: 10,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 6 }}>{f.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 4 }}>{f.title}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      <footer style={{ marginTop: 40, fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'center' }}>
        Made with love and Claude by{' '}
        <a
          href="https://www.linkedin.com/in/rishu-raj-gupta/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--fg-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          Rishu Raj Gupta
        </a>
      </footer>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
