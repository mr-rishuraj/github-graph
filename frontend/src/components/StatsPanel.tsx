import { useState } from 'react';
import type { GraphMeta, GraphNode } from '../types/index.js';
import {
  AlertCircle, Zap, FileCode, Activity, TrendingUp, TrendingDown,
  ChevronDown, ChevronRight, ChevronLeft, GitMerge,
} from 'lucide-react';

interface StatsPanelProps {
  meta: GraphMeta;
  nodes?: GraphNode[];
  onFocusCycle?: (paths: string[]) => void;
}

type SectionKey = 'circular' | 'instability' | 'imported' | 'health';

function instabilityColor(v: number): string {
  if (v < 0.4) return '#10b981';
  if (v < 0.7) return '#f59e0b';
  return '#ef4444';
}

// ─── Shared mini-bar ──────────────────────────────────────────────────────────
function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 3, background: 'var(--bg-overlay)', borderRadius: 99, overflow: 'hidden', minWidth: 30 }}>
      <div style={{ height: '100%', width: `${Math.round(value * 100)}%`, background: color, borderRadius: 99 }} />
    </div>
  );
}

// ─── Section row (accordion header) ──────────────────────────────────────────
function SectionRow({
  icon, label, meta: badge, open, hasAlert, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  meta?: string;
  open: boolean;
  hasAlert?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        width: '100%',
        padding: '8px 12px',
        background: 'none',
        border: 'none',
        borderTop: '1px solid #21262d',
        cursor: 'pointer',
        color: hasAlert ? '#f87171' : 'var(--fg-muted)',
        transition: 'background 0.1s',
        textAlign: 'left',
      }}
      className="hover:bg-[var(--bg-overlay)]"
    >
      <span style={{ display: 'flex', color: hasAlert ? '#ef4444' : 'var(--fg-subtle)' }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 600, flex: 1, color: hasAlert ? '#f87171' : 'var(--fg-muted)' }}>
        {label}
      </span>
      {badge && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: hasAlert ? '#f87171' : 'var(--fg-subtle)',
            background: hasAlert ? '#ef444418' : 'var(--bg-overlay)',
            borderRadius: 4,
            padding: '1px 6px',
            marginRight: 4,
          }}
        >
          {badge}
        </span>
      )}
      {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function StatsPanel({ meta, nodes = [], onFocusCycle }: StatsPanelProps) {
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    () => new Set(meta.circularDeps.length > 0 ? (['circular'] as SectionKey[]) : [])
  );
  const [showAllCycles, setShowAllCycles] = useState(false);

  const toggle = (s: SectionKey) =>
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  // Derived data
  const nodesWithInst = nodes.filter(n => n.instability !== undefined);
  const avgInst =
    nodesWithInst.length > 0
      ? nodesWithInst.reduce((s, n) => s + (n.instability ?? 0), 0) / nodesWithInst.length
      : null;
  const mostUnstable = [...nodesWithInst].sort((a, b) => (b.instability ?? 0) - (a.instability ?? 0)).slice(0, 5);
  const mostStable = [...nodesWithInst]
    .filter(n => (n.afferentCoupling ?? 0) >= 2 && (n.instability ?? 1) < 0.4)
    .sort((a, b) => (b.afferentCoupling ?? 0) - (a.afferentCoupling ?? 0))
    .slice(0, 5);

  const deadCount = meta.deadExports != null
    ? Array.isArray(meta.deadExports) ? meta.deadExports.length : (meta.deadExports as number)
    : 0;
  const resolutionPct = meta.diagnostics && meta.diagnostics.totalImports > 0
    ? Math.round((meta.diagnostics.resolvedImports / meta.diagnostics.totalImports) * 100)
    : null;

  const cyclesShown = showAllCycles ? meta.circularDeps : meta.circularDeps.slice(0, 4);

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        top: 16,
        zIndex: 14,
        width: 248,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: panelCollapsed ? 'none' : '1px solid #21262d',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--fg)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'monospace',
            }}
            title={`${meta.owner}/${meta.repo}`}
          >
            {meta.owner}/{meta.repo}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 1 }}>
            {meta.branch} · {(meta.analysisMs / 1000).toFixed(1)}s
          </div>
        </div>
        <button
          onClick={() => setPanelCollapsed(v => !v)}
          title={panelCollapsed ? 'Expand panel' : 'Collapse panel'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-subtle)',
            display: 'flex',
            padding: 3,
            borderRadius: 4,
            flexShrink: 0,
          }}
          className="hover:bg-[var(--bg-overlay)] hover:text-[var(--fg)] transition-colors"
        >
          <ChevronLeft
            size={14}
            style={{ transform: panelCollapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          />
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {!panelCollapsed && (
        <>
          {/* Key numbers */}
          <div style={{ display: 'flex', gap: 0, padding: '8px 12px 6px' }}>
            {[
              { icon: <FileCode size={11} />, label: 'Files', value: meta.totalFiles },
              { icon: <GitMerge size={11} />, label: 'Edges', value: meta.edgeCount ?? 0 },
            ].map(s => (
              <div key={s.label} style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--fg-subtle)' }}>
                  {s.icon}
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.2, marginTop: 2 }}>
                  {s.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* Import resolution bar */}
          {resolutionPct !== null && (
            <div style={{ padding: '0 12px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Import resolution
                </span>
                <span style={{ fontSize: 9, color: 'var(--fg-muted)', fontWeight: 600 }}>{resolutionPct}%</span>
              </div>
              <div style={{ height: 3, background: 'var(--bg-overlay)', borderRadius: 99, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${resolutionPct}%`,
                    background: resolutionPct > 70 ? '#10b981' : resolutionPct > 40 ? '#f59e0b' : '#ef4444',
                    borderRadius: 99,
                  }}
                />
              </div>
              {meta.diagnostics && meta.diagnostics.parseFailures > 0 && (
                <div style={{ fontSize: 9, color: '#f59e0b', marginTop: 3 }}>
                  {meta.diagnostics.parseFailures} parse failure{meta.diagnostics.parseFailures !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}

          {/* ── Circular Deps section ─────────────────────────────────────── */}
          {meta.circularDeps.length > 0 && (
            <>
              <SectionRow
                icon={<AlertCircle size={12} />}
                label="Circular Deps"
                meta={String(meta.circularDeps.length)}
                open={openSections.has('circular')}
                hasAlert
                onClick={() => toggle('circular')}
              />
              {openSections.has('circular') && (
                <div style={{ padding: '6px 12px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {cyclesShown.map((cycle, i) => (
                    <button
                      key={i}
                      onClick={() => onFocusCycle?.(cycle)}
                      title={`Click to highlight: ${cycle.join(' → ')}`}
                      style={{
                        fontSize: 10,
                        color: '#f87171',
                        fontFamily: 'monospace',
                        background: 'var(--bg-canvas)',
                        padding: '4px 8px',
                        borderRadius: 5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        border: '1px solid #ef444420',
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      className="hover:bg-[var(--bg-overlay)]"
                    >
                      {cycle.map(p => p.split('/').pop()).join(' → ')}
                    </button>
                  ))}
                  {meta.circularDeps.length > 4 && (
                    <button
                      onClick={() => setShowAllCycles(v => !v)}
                      style={{
                        fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none',
                        cursor: 'pointer', padding: '2px 0', textAlign: 'left',
                      }}
                    >
                      {showAllCycles
                        ? 'Show less'
                        : `+ ${meta.circularDeps.length - 4} more cycles`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Instability section ───────────────────────────────────────── */}
          {avgInst !== null && (
            <>
              <SectionRow
                icon={<Activity size={12} />}
                label="Instability"
                meta={avgInst.toFixed(2)}
                open={openSections.has('instability')}
                onClick={() => toggle('instability')}
              />
              {openSections.has('instability') && (
                <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Avg bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--fg-subtle)', width: 26, flexShrink: 0 }}>Avg</span>
                    <MiniBar value={avgInst} color={instabilityColor(avgInst)} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: instabilityColor(avgInst), width: 28, textAlign: 'right', flexShrink: 0 }}>
                      {avgInst.toFixed(2)}
                    </span>
                  </div>

                  {mostUnstable.length > 0 && (
                    <>
                      <div style={{ fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingUp size={9} /> Most unstable
                      </div>
                      {mostUnstable.map(n => {
                        const inst = n.instability ?? 0;
                        return (
                          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{ fontSize: 10, color: 'var(--fg-subtle)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={n.label}
                            >
                              {n.label}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: instabilityColor(inst), flexShrink: 0 }}>
                              {inst.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {mostStable.length > 0 && (
                    <>
                      <div style={{ fontSize: 9, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingDown size={9} /> Most stable
                      </div>
                      {mostStable.map(n => (
                        <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700, width: 18, textAlign: 'right', flexShrink: 0 }}>
                            {n.afferentCoupling}×
                          </span>
                          <span
                            style={{ fontSize: 10, color: 'var(--fg-subtle)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={n.label}
                          >
                            {n.label}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Most Imported section ─────────────────────────────────────── */}
          {meta.mostImported.length > 0 && (
            <>
              <SectionRow
                icon={<Zap size={12} />}
                label="Most Imported"
                open={openSections.has('imported')}
                onClick={() => toggle('imported')}
              />
              {openSections.has('imported') && (
                <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {meta.mostImported.slice(0, 7).map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, width: 22, textAlign: 'right', flexShrink: 0 }}>
                        {item.count}×
                      </span>
                      <span
                        style={{ fontSize: 10, color: 'var(--fg-muted)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={item.label}
                      >
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Code Health section ───────────────────────────────────────── */}
          {(deadCount > 0 || meta.orphanFiles.length > 0) && (
            <>
              <SectionRow
                icon={<Activity size={12} />}
                label="Code Health"
                meta={String(deadCount + meta.orphanFiles.length)}
                open={openSections.has('health')}
                onClick={() => toggle('health')}
              />
              {openSections.has('health') && (
                <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {deadCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Dead exports</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginLeft: 'auto' }}>{deadCount}</span>
                    </div>
                  )}
                  {meta.orphanFiles.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Orphan files</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', marginLeft: 'auto' }}>{meta.orphanFiles.length}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
