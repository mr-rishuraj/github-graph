import { useState } from 'react';
import { GitBranch, ArrowLeftRight } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile.js';

interface DiffInputProps {
  url: string;
  onDiff: (branchA: string, branchB: string, opts: { maxFiles: number; excludeTests: boolean }) => void;
  onCancel: () => void;
}

export function DiffInput({ url, onDiff, onCancel }: DiffInputProps) {
  const [branchA, setBranchA] = useState('main');
  const [branchB, setBranchB] = useState('develop');
  const [maxFiles, setMaxFiles] = useState(2000);
  const [excludeTests, setExcludeTests] = useState(true);
  const isMobile = useIsMobile();

  const repoName = (() => {
    try { return new URL(url).pathname.replace(/^\//, '').replace(/\/$/, ''); } catch { return url; }
  })();

  const inputStyle = {
    background: 'var(--bg-canvas)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 14,
    color: 'var(--fg)',
    outline: 'none',
    fontFamily: 'monospace',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-canvas)', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <GitBranch size={22} color="var(--fg-muted)" />
            <ArrowLeftRight size={18} color="var(--fg-subtle)" />
            <GitBranch size={22} color="var(--fg-muted)" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px' }}>
            Compare Branches
          </h2>
          <p style={{ fontSize: 14, color: 'var(--fg-subtle)', margin: 0, fontFamily: 'monospace' }}>
            {repoName}
          </p>
        </div>

        {/* Branch inputs */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Base branch (A)
              </span>
              <input value={branchA} onChange={e => setBranchA(e.target.value)} placeholder="main" style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Compare branch (B)
              </span>
              <input value={branchB} onChange={e => setBranchB(e.target.value)} placeholder="develop" style={inputStyle} />
            </label>
          </div>

          <p style={{ fontSize: 12, color: 'var(--fg-subtle)', margin: 0 }}>
            Shows what changed from <strong style={{ color: '#10b981' }}>{branchA || 'A'}</strong> to <strong style={{ color: 'var(--accent)' }}>{branchB || 'B'}</strong> — added, removed, and changed files.
          </p>

          {/* Options */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Max files: {maxFiles.toLocaleString()}</span>
              <input type="range" min={100} max={5000} step={100} value={maxFiles}
                onChange={e => setMaxFiles(Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={excludeTests} onChange={e => setExcludeTests(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Skip test files</span>
            </label>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} style={{
              flex: 1, padding: '10px 0', background: 'var(--bg-overlay)',
              border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
              color: 'var(--fg-muted)', fontSize: 14, fontWeight: 600,
            }}>
              Cancel
            </button>
            <button
              onClick={() => onDiff(branchA, branchB, { maxFiles, excludeTests })}
              disabled={!branchA.trim() || !branchB.trim()}
              style={{
                flex: 2, padding: '10px 0',
                background: branchA && branchB ? 'var(--accent)' : 'var(--bg-overlay)',
                border: 'none', borderRadius: 8, cursor: branchA && branchB ? 'pointer' : 'not-allowed',
                color: branchA && branchB ? 'var(--accent-fg)' : 'var(--fg-subtle)',
                fontSize: 14, fontWeight: 700,
              }}
            >
              Compare Branches
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
