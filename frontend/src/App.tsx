import { useState, useCallback, useEffect, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { UrlInput } from './components/UrlInput.js';
import { GraphCanvas } from './components/GraphCanvas.js';
import { ProgressView } from './components/ProgressView.js';
import { DiffInput } from './components/DiffInput.js';
import { DiffProgressView } from './components/DiffProgressView.js';
import { analyzeWithProgress, diffWithProgress, type ProgressEvent, type DiffProgressEvent } from './api/client.js';
import type { GraphData, DiffGraphData } from './types/index.js';
import { useRecentRepos } from './hooks/useRecentRepos.js';
import { useGitHubAuth } from './hooks/useGitHubAuth.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import { Github, ArrowLeft, Copy, Check, Sun, Moon, LogIn, LogOut, GitBranch, MoreHorizontal } from 'lucide-react';

type AppState =
  | { phase: 'input' }
  | { phase: 'progress'; url: string; events: ProgressEvent[]; currentEvent: ProgressEvent | null }
  | { phase: 'diff-input'; url: string }
  | { phase: 'diff-progress'; url: string; branchA: string; branchB: string; events: DiffProgressEvent[]; currentEvent: DiffProgressEvent | null }
  | { phase: 'graph'; url: string; graph: GraphData }
  | { phase: 'diff'; url: string; branchA: string; branchB: string; graph: DiffGraphData };

function encodeRepoUrl(url: string): string {
  return encodeURIComponent(url);
}

function decodeRepoUrl(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function getHashRepo(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/[#&]repo=([^&]*)/);
  if (match) return decodeRepoUrl(match[1]);
  return null;
}

function setHashRepo(url: string): void {
  window.location.hash = `repo=${encodeRepoUrl(url)}`;
}

function clearHash(): void {
  history.pushState('', document.title, window.location.pathname + window.location.search);
}

export function App() {
  const [appState, setAppState] = useState<AppState>({ phase: 'input' });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('github-graph-theme') as 'dark' | 'light') ?? 'dark'
  );
  const { repos: recentRepos, addRepo, exportRepos, importRepos } = useRecentRepos();
  const { token, user, loading: authLoading, login, logout } = useGitHubAuth();
  const isMobile = useIsMobile();
  // Saves the last loaded graph so Back from diff view can return to it
  const lastGraphRef = useRef<{ url: string; graph: GraphData } | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('github-graph-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  // On mount, check if hash has a repo URL and auto-analyze
  useEffect(() => {
    const repoUrl = getHashRepo();
    if (repoUrl) {
      handleAnalyze(repoUrl, { maxFiles: 2000, excludeTests: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyze = useCallback(
    async (url: string, opts: { maxFiles: number; excludeTests: boolean }) => {
      setError(null);
      setAppState({ phase: 'progress', url, events: [], currentEvent: null });

      try {
        const graph = await analyzeWithProgress(
          { url, maxFiles: opts.maxFiles, excludeTests: opts.excludeTests, userToken: token ?? undefined },
          (event) => {
            setAppState(prev => {
              if (prev.phase !== 'progress') return prev;
              return {
                ...prev,
                events: [...prev.events, event],
                currentEvent: event,
              };
            });
          }
        );

        // Update hash
        setHashRepo(url);

        // Save to recent repos
        const repoName = (() => {
          try {
            return new URL(url).pathname.replace(/^\//, '').replace(/\/$/, '');
          } catch {
            return url;
          }
        })();
        addRepo({ url, label: repoName, nodeCount: graph.nodes.length });

        lastGraphRef.current = { url, graph };
        setAppState({ phase: 'graph', url, graph });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Analysis failed. Make sure the repository is public and the URL is correct.';
        setError(message);
        setAppState({ phase: 'input' });
      }
    },
    [addRepo, token]
  );

  const handleDiffAnalyze = useCallback(
    async (url: string, branchA: string, branchB: string, opts: { maxFiles: number; excludeTests: boolean }) => {
      setError(null);
      setAppState({ phase: 'diff-progress', url, branchA, branchB, events: [], currentEvent: null });
      try {
        const graph = await diffWithProgress(
          { url, branchA, branchB, maxFiles: opts.maxFiles, excludeTests: opts.excludeTests, userToken: token ?? undefined },
          (event) => {
            setAppState(prev => {
              if (prev.phase !== 'diff-progress') return prev;
              return { ...prev, events: [...prev.events, event], currentEvent: event };
            });
          }
        );
        setAppState({ phase: 'diff', url, branchA, branchB, graph });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Diff failed.';
        setError(message);
        setAppState({ phase: 'input' });
      }
    },
    [token]
  );

  const handleBack = useCallback(() => {
    setAppState(prev => {
      // From any diff phase, return to the last graph if we have one
      if (
        (prev.phase === 'diff' || prev.phase === 'diff-input' || prev.phase === 'diff-progress')
        && lastGraphRef.current
      ) {
        const { url, graph } = lastGraphRef.current;
        setHashRepo(url);
        return { phase: 'graph', url, graph };
      }
      clearHash();
      return { phase: 'input' };
    });
    setError(null);
    setShowMobileMenu(false);
  }, []);

  const handleCopyLink = useCallback(() => {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, []);

  const topBarButtonStyle = {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    color: 'var(--fg-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    transition: 'all 0.15s',
  };

  if (appState.phase === 'input') {
    return (
      <UrlInput
        onAnalyze={handleAnalyze}
        isLoading={false}
        error={error}
        recentRepos={recentRepos}
        onExportRepos={exportRepos}
        onImportRepos={importRepos}
        isLoggedIn={!!user}
        onLogin={login}
      />
    );
  }

  if (appState.phase === 'progress') {
    return (
      <ProgressView
        events={appState.events}
        currentEvent={appState.currentEvent}
        repoUrl={appState.url}
      />
    );
  }

  if (appState.phase === 'diff-input') {
    return (
      <DiffInput
        url={appState.url}
        onDiff={(branchA, branchB, opts) => handleDiffAnalyze(appState.url, branchA, branchB, opts)}
        onCancel={handleBack}
      />
    );
  }

  if (appState.phase === 'diff-progress') {
    return (
      <DiffProgressView
        events={appState.events}
        currentEvent={appState.currentEvent}
        branchA={appState.branchA}
        branchB={appState.branchB}
      />
    );
  }

  if (appState.phase === 'diff') {
    const { graph, branchA, branchB, url } = appState;
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-canvas)',
          overflow: 'hidden',
        }}
      >
        {/* Top bar */}
        <div
          style={{
            height: 44,
            borderBottom: '1px solid var(--bg-overlay)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 12,
            flexShrink: 0,
            zIndex: 30,
          }}
        >
          <button
            onClick={handleBack}
            style={topBarButtonStyle}
            className="hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <ArrowLeft size={13} />
            {isMobile ? '' : 'Graph'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, minWidth: 0, overflow: 'hidden' }}>
            {!isMobile && <Github size={15} color="var(--fg-muted)" style={{ flexShrink: 0 }} />}
            <span style={{ fontSize: isMobile ? 11 : 13, color: '#10b981', fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{branchA}</span>
            <span style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}>→</span>
            <span style={{ fontSize: isMobile ? 11 : 13, color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{branchB}</span>
          </div>

          {/* Diff summary badges — hide on mobile to save space */}
          {!isMobile && [
            { label: `+${graph.diff.meta.added}`, color: '#10b981' },
            { label: `-${graph.diff.meta.removed}`, color: '#ef4444' },
            { label: `~${graph.diff.meta.changed}`, color: '#f59e0b' },
          ].map(b => (
            <span key={b.label} style={{ fontSize: 11, fontWeight: 700, color: b.color, background: `${b.color}18`, border: `1px solid ${b.color}40`, borderRadius: 5, padding: '2px 8px' }}>
              {b.label}
            </span>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: isMobile ? 6 : 12, alignItems: 'center' }}>
            {/* On mobile, show compact diff badges here */}
            {isMobile && [
              { label: `+${graph.diff.meta.added}`, color: '#10b981' },
              { label: `-${graph.diff.meta.removed}`, color: '#ef4444' },
              { label: `~${graph.diff.meta.changed}`, color: '#f59e0b' },
            ].map(b => (
              <span key={b.label} style={{ fontSize: 10, fontWeight: 700, color: b.color }}>{b.label}</span>
            ))}
            {!isMobile && (
              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                {graph.nodes.length.toLocaleString()} nodes
              </span>
            )}
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
                color: 'var(--fg-muted)',
                display: 'flex',
                alignItems: 'center',
                fontSize: 12,
                transition: 'all 0.15s',
              }}
              className="hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <ReactFlowProvider>
            <GraphCanvas data={graph} diffMode diffData={graph.diff} />
          </ReactFlowProvider>
        </div>
      </div>
    );
  }

  const { graph, url } = appState as Extract<AppState, { phase: 'graph' }>;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-canvas)',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 44,
          borderBottom: '1px solid var(--bg-overlay)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          flexShrink: 0,
          zIndex: 30,
        }}
      >
        <button
          onClick={handleBack}
          style={topBarButtonStyle}
          className="hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <ArrowLeft size={13} />
          Back
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
          <Github size={15} color="var(--fg-muted)" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 600, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {graph.meta.owner}/{graph.meta.repo}
          </span>
          {!isMobile && (
            <span style={{ fontSize: 12, color: 'var(--fg-subtle)', flexShrink: 0 }}>
              @ {graph.meta.branch}
            </span>
          )}
        </div>

        {/* Compare button — hidden on mobile (accessible via stats panel) */}
        {!isMobile && (
          <button
            onClick={() => setAppState({ phase: 'diff-input', url })}
            style={topBarButtonStyle}
            className="hover:border-[var(--accent)] hover:text-[var(--accent)]"
            title="Compare two branches"
          >
            <GitBranch size={13} />
            Compare
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: isMobile ? 6 : 12, alignItems: 'center' }}>
          {!isMobile && (
            <>
              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                {graph.nodes.length.toLocaleString()} nodes
              </span>
              <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                {graph.edges.length.toLocaleString()} edges
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: '#10b981',
                  background: '#10b98118',
                  border: '1px solid #10b98140',
                  borderRadius: 5,
                  padding: '2px 8px',
                  fontWeight: 600,
                }}
              >
                {(graph.meta.analysisMs / 1000).toFixed(1)}s
              </span>
            </>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              color: 'var(--fg-muted)',
              display: 'flex',
              alignItems: 'center',
              fontSize: 12,
              transition: 'all 0.15s',
            }}
            className="hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>

          {/* Desktop-only: copy link + auth */}
          {!isMobile && (
            <>
              <button
                onClick={handleCopyLink}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  color: copied ? '#10b981' : 'var(--fg-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'all 0.15s',
                  borderColor: copied ? '#10b98140' : 'var(--border)',
                }}
                title={`Share link: ${url}`}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy link'}
              </button>

              {!authLoading && (
                user ? (
                  <button
                    onClick={logout}
                    title={`Signed in as ${user.login} — click to sign out`}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      color: 'var(--fg-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 12,
                      fontWeight: 600,
                      transition: 'all 0.15s',
                    }}
                  >
                    <LogOut size={12} />
                    {user.login}
                  </button>
                ) : (
                  <button
                    onClick={login}
                    title="Sign in with GitHub for private repos"
                    style={{
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      color: 'var(--fg-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 12,
                      fontWeight: 600,
                      transition: 'all 0.15s',
                    }}
                  >
                    <LogIn size={12} />
                    Sign in
                  </button>
                )
              )}
            </>
          )}

          {/* Mobile: hamburger menu for extra actions */}
          {isMobile && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMobileMenu(v => !v)}
                style={{
                  background: showMobileMenu ? 'var(--bg-overlay)' : 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  color: 'var(--fg-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <MoreHorizontal size={15} />
              </button>
              {showMobileMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 100,
                    minWidth: 160,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => { setAppState({ phase: 'diff-input', url }); setShowMobileMenu(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontSize: 13, borderBottom: '1px solid var(--bg-overlay)' }}
                  >
                    <GitBranch size={13} color="var(--fg-muted)" /> Compare branches
                  </button>
                  <button
                    onClick={() => { handleCopyLink(); setShowMobileMenu(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#10b981' : 'var(--fg)', fontSize: 13, borderBottom: '1px solid var(--bg-overlay)' }}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  {!authLoading && (
                    user ? (
                      <button
                        onClick={() => { logout(); setShowMobileMenu(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontSize: 13 }}
                      >
                        <LogOut size={13} color="var(--fg-muted)" /> {user.login}
                      </button>
                    ) : (
                      <button
                        onClick={() => { login(); setShowMobileMenu(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontSize: 13 }}
                      >
                        <LogIn size={13} color="var(--fg-muted)" /> Sign in
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ReactFlowProvider>
          <GraphCanvas data={graph} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
