import type { ProgressEvent } from '../api/client.js';

interface ProgressViewProps {
  events: ProgressEvent[];
  currentEvent: ProgressEvent | null;
  repoUrl: string;
}

function truncateFile(path: string, max = 50): string {
  if (path.length <= max) return path;
  const parts = path.split('/');
  if (parts.length > 3) {
    return '…/' + parts.slice(-2).join('/');
  }
  return '…' + path.slice(-(max - 1));
}

function getStepInfo(event: ProgressEvent | null): {
  label: string;
  sub: string;
  percent: number;
  step: number;
} {
  if (!event) return { label: 'Connecting…', sub: '', percent: 0, step: 0 };
  switch (event.type) {
    case 'start':
    case 'cached':
      return { label: 'Starting analysis…', sub: '', percent: 2, step: 0 };
    case 'downloading':
      return {
        label: `Downloading ${event.repo}`,
        sub: `branch: ${event.branch}`,
        percent: 10,
        step: 1,
      };
    case 'extracted':
      return {
        label: `Scanning ${event.fileCount.toLocaleString()} files`,
        sub: '',
        percent: 20,
        step: 2,
      };
    case 'parsing': {
      const pct = event.total > 0 ? Math.round((event.current / event.total) * 60) + 20 : 40;
      return {
        label: `Parsing files (${event.current}/${event.total})`,
        sub: truncateFile(event.file),
        percent: Math.min(pct, 80),
        step: 3,
      };
    }
    case 'building':
      return { label: 'Building dependency graph…', sub: '', percent: 90, step: 4 };
    case 'complete':
      return { label: 'Complete!', sub: '', percent: 100, step: 5 };
    case 'error':
      return { label: 'Error', sub: event.message, percent: 0, step: -1 };
    default:
      return { label: 'Working…', sub: '', percent: 5, step: 0 };
  }
}

const STEPS = [
  'Connect',
  'Download',
  'Scan',
  'Parse',
  'Build',
];

export function ProgressView({ currentEvent, repoUrl }: ProgressViewProps) {
  const { label, sub, percent, step } = getStepInfo(currentEvent);
  const isError = currentEvent?.type === 'error';

  // Extract owner/repo for display
  const repoName = (() => {
    try {
      const url = new URL(repoUrl);
      return url.pathname.replace(/^\//, '').replace(/\/$/, '');
    } catch {
      return repoUrl;
    }
  })();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-canvas)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--bg-surface)',
          border: `1px solid ${isError ? '#ef444440' : 'var(--border)'}`,
          borderRadius: 16,
          padding: '32px 36px',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: 'var(--fg-subtle)', marginBottom: 4, fontFamily: 'monospace' }}>
            Analyzing
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--fg)',
              fontFamily: 'SFMono-Regular, Consolas, monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={repoName}
          >
            {repoName}
          </div>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            const future = i > step;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: done ? '#388bfd' : active ? 'var(--bg-surface)' : 'var(--bg-surface)',
                      border: `2px solid ${done ? '#388bfd' : active ? '#388bfd' : 'var(--border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.3s',
                      flexShrink: 0,
                      boxShadow: active ? '0 0 0 3px #388bfd25' : 'none',
                    }}
                  >
                    {done ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : active ? (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#388bfd',
                          animation: 'pulse-dot 1.2s ease-in-out infinite',
                        }}
                      />
                    ) : (
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: future ? 'var(--border)' : '#388bfd' }} />
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      color: active ? 'var(--fg)' : done ? 'var(--fg-muted)' : 'var(--fg-subtle)',
                      fontWeight: active ? 600 : 400,
                      transition: 'all 0.3s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: 2,
                      background: done ? '#388bfd' : 'var(--bg-overlay)',
                      marginBottom: 18,
                      marginLeft: 2,
                      marginRight: 2,
                      transition: 'background 0.3s',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: '100%',
            height: 6,
            background: 'var(--bg-overlay)',
            borderRadius: 99,
            overflow: 'hidden',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${percent}%`,
              background: isError
                ? '#ef4444'
                : 'linear-gradient(90deg, #1f6feb 0%, #388bfd 50%, #58a6ff 100%)',
              borderRadius: 99,
              transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isError ? 'none' : '0 0 12px #388bfd60',
            }}
          />
        </div>

        {/* Status text */}
        <div style={{ minHeight: 40 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: isError ? '#f87171' : 'var(--fg)',
              marginBottom: 4,
            }}
          >
            {label}
          </div>
          {sub && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--fg-subtle)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={sub}
            >
              {sub}
            </div>
          )}
        </div>

        {/* Parsing detail: show file being parsed */}
        {currentEvent?.type === 'parsing' && (
          <div
            style={{
              marginTop: 16,
              background: 'var(--bg-canvas)',
              borderRadius: 8,
              padding: '8px 12px',
              border: '1px solid #21262d',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--fg-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Currently parsing
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--fg-muted)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentEvent.file}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                color: 'var(--fg-subtle)',
              }}
            >
              {currentEvent.current.toLocaleString()} / {currentEvent.total.toLocaleString()} files
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}
