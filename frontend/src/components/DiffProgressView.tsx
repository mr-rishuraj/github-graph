import type { DiffProgressEvent } from '../api/client.js';

interface DiffProgressViewProps {
  events: DiffProgressEvent[];
  currentEvent: DiffProgressEvent | null;
  branchA: string;
  branchB: string;
}

export function DiffProgressView({ currentEvent, branchA, branchB }: DiffProgressViewProps) {
  const currentPhase = (() => {
    if (!currentEvent) return 'branchA';
    if (currentEvent.type === 'diffing' || currentEvent.type === 'complete') return 'done';
    return (currentEvent as { phase?: string }).phase ?? 'branchA';
  })();

  const phaseADone = currentPhase === 'branchB' || currentPhase === 'done';
  const phaseBDone = currentPhase === 'done';

  const getLabel = () => {
    if (!currentEvent) return 'Starting...';
    switch (currentEvent.type) {
      case 'start': return `Analysing ${(currentEvent as { branch: string }).branch}...`;
      case 'downloading': return `Downloading ${(currentEvent as { branch: string }).branch}`;
      case 'extracted': return `Scanning ${(currentEvent as { fileCount: number }).fileCount} files`;
      case 'parsing': { const e = currentEvent as { current: number; total: number }; return `Parsing ${e.current}/${e.total} files`; }
      case 'building': return 'Building graph...';
      case 'diffing': return 'Computing diff...';
      case 'complete': return 'Done!';
      case 'error': return `Error: ${(currentEvent as { message: string }).message}`;
      default: return 'Working...';
    }
  };

  const percent = (() => {
    if (!currentEvent) return 0;
    switch (currentEvent.type) {
      case 'start': return currentPhase === 'branchB' ? 50 : 2;
      case 'downloading': return currentPhase === 'branchB' ? 55 : 5;
      case 'extracted': return currentPhase === 'branchB' ? 60 : 10;
      case 'parsing': {
        const e = currentEvent as { current: number; total: number; phase: string };
        const pct = e.total > 0 ? (e.current / e.total) * 35 : 20;
        return Math.round(e.phase === 'branchB' ? 50 + pct : pct);
      }
      case 'building': return currentPhase === 'branchB' ? 90 : 45;
      case 'diffing': return 95;
      case 'complete': return 100;
      default: return 0;
    }
  })();

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-canvas)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 40,
    }}>
      <div style={{
        width: '100%', maxWidth: 560, background: 'var(--bg-surface)',
        border: '1px solid var(--border)', borderRadius: 16, padding: '32px 36px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
      }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--fg-subtle)', marginBottom: 6 }}>Comparing branches</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 14, fontWeight: 700, color: '#10b981',
              background: '#10b98118', border: '1px solid #10b98140',
              borderRadius: 6, padding: '3px 10px', fontFamily: 'monospace',
            }}>{branchA}</span>
            <span style={{ color: 'var(--fg-subtle)', fontSize: 16 }}>{'→'}</span>
            <span style={{
              fontSize: 14, fontWeight: 700, color: '#388bfd',
              background: '#388bfd18', border: '1px solid #388bfd40',
              borderRadius: 6, padding: '3px 10px', fontFamily: 'monospace',
            }}>{branchB}</span>
          </div>
        </div>

        {/* Phase indicators */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { label: branchA, done: phaseADone, active: currentPhase === 'branchA', color: '#10b981' },
            { label: branchB, done: phaseBDone, active: currentPhase === 'branchB', color: '#388bfd' },
            { label: 'Diff', done: phaseBDone, active: currentPhase === 'done', color: '#f59e0b' },
          ].map(step => (
            <div key={step.label} style={{
              flex: 1, padding: '8px 10px', borderRadius: 8, textAlign: 'center',
              background: step.active ? `${step.color}18` : step.done ? `${step.color}10` : 'var(--bg-overlay)',
              border: `1px solid ${step.active || step.done ? `${step.color}40` : 'var(--border)'}`,
              transition: 'all 0.3s',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: step.active || step.done ? step.color : 'var(--fg-subtle)', fontFamily: 'monospace' }}>
                {step.done ? '✓ ' : step.active ? '● ' : ''}{step.label}
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{
            height: '100%', width: `${percent}%`,
            background: 'linear-gradient(90deg, #10b981, #388bfd)',
            borderRadius: 99, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>

        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{getLabel()}</div>
      </div>
    </div>
  );
}
