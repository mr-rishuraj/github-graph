import { useState } from 'react';
import type { GraphNode, GraphEdge, FileType, DiffStatus } from '../types/index.js';
import { FILE_TYPE_COLORS, FILE_TYPE_LABELS, LANGUAGE_LABELS } from '../types/index.js';
import { X, FileCode, ArrowDown, ArrowUp, GitBranch, Layers, ExternalLink, Package, Copy, Check } from 'lucide-react';

interface SidebarProps {
  node: GraphNode | null;
  allNodes: GraphNode[];
  allEdges: GraphEdge[];
  onClose: () => void;
  onNodeClick: (id: string) => void;
  repoMeta?: { owner: string; repo: string; branch: string };
  isMobile?: boolean;
  diffStatus?: DiffStatus;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        borderRadius: 4,
        padding: '2px 6px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--fg-subtle)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: '1px solid var(--bg-overlay)',
      }}
    >
      {children}
    </div>
  );
}

function FileRef({ node, onClick }: { node: GraphNode; onClick: () => void }) {
  const color = FILE_TYPE_COLORS[node.type] ?? '#6b7280';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 8px',
        borderRadius: 6,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left' as const,
      }}
      className="hover:bg-[var(--bg-overlay)] transition-colors"
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.label}
      </span>
    </button>
  );
}

const SHOW_LIMIT = 30;

export function Sidebar({ node, allNodes, allEdges, onClose, onNodeClick, repoMeta, isMobile, diffStatus }: SidebarProps) {
  const [showAllImports, setShowAllImports] = useState(false);
  const [showAllImportedBy, setShowAllImportedBy] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);

  if (!node) return null;

  const color = FILE_TYPE_COLORS[node.type] ?? '#6b7280';

  const incomingEdges = allEdges.filter(e => e.target === node.id);
  const outgoingEdges = allEdges.filter(e => e.source === node.id);

  const importedBy = incomingEdges
    .map(e => ({ node: allNodes.find(n => n.id === e.source), relation: e.relation }))
    .filter((x): x is { node: GraphNode; relation: typeof x.relation } => Boolean(x.node));

  const importsFiles = outgoingEdges
    .map(e => ({ node: allNodes.find(n => n.id === e.target), relation: e.relation }))
    .filter((x): x is { node: GraphNode; relation: typeof x.relation } => Boolean(x.node));

  // External packages: imports whose source doesn't start with '.' (likely node_modules)
  const externalPackages = (() => {
    const map = new Map<string, string[]>();
    for (const imp of node.imports) {
      if (imp.source.startsWith('.') || imp.source.startsWith('/') || imp.isTypeOnly) continue;
      const pkg = imp.source.startsWith('@')
        ? imp.source.split('/').slice(0, 2).join('/')
        : imp.source.split('/')[0];
      if (!pkg) continue;
      if (!map.has(pkg)) map.set(pkg, []);
      if (imp.specifiers.length > 0) map.get(pkg)!.push(...imp.specifiers);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();

  const mobileStyle = isMobile ? {
    position: 'fixed' as const,
    bottom: 0, left: 0, right: 0, top: 'auto' as const,
    width: '100%',
    height: '65vh',
    borderLeft: 'none' as const,
    borderTop: '1px solid var(--border)',
    borderRadius: '16px 16px 0 0',
    zIndex: 35,
  } : {};

  return (
    <div
      className="animate-slide-in sidebar-mobile"
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 320,
        background: 'var(--bg-canvas)',
        borderLeft: '1px solid var(--border)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...mobileStyle,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid var(--bg-overlay)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--fg)',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={node.label}
              >
                {node.label}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
              <Badge color={color}>{FILE_TYPE_LABELS[node.type]}</Badge>
              <Badge color="#6b7280">{LANGUAGE_LABELS[node.language]}</Badge>
              {node.isBarrel && <Badge color="#8b5cf6">Barrel</Badge>}
              {diffStatus === 'added' && <Badge color="#10b981">+ Added</Badge>}
              {diffStatus === 'removed' && <Badge color="#ef4444">- Removed</Badge>}
              {diffStatus === 'changed' && <Badge color="#f59e0b">~ Changed</Badge>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {repoMeta && (
              <a
                href={`https://github.com/${repoMeta.owner}/${repoMeta.repo}/blob/${repoMeta.branch}/${node.path}`}
                target="_blank"
                rel="noopener noreferrer"
                title="View on GitHub"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--fg-subtle)',
                  padding: 4,
                  borderRadius: 4,
                  display: 'flex',
                  textDecoration: 'none',
                }}
                className="hover:bg-[var(--bg-overlay)] hover:text-[#388bfd] transition-colors"
              >
                <ExternalLink size={15} />
              </a>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--fg-subtle)',
                padding: 4,
                borderRadius: 4,
                display: 'flex',
              }}
              className="hover:bg-[var(--bg-overlay)] hover:text-[var(--fg)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Path */}
        <div>
          <SectionTitle>File Path</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div
              style={{
                flex: 1,
                fontSize: 11,
                color: 'var(--fg-muted)',
                fontFamily: 'monospace',
                background: 'var(--bg-surface)',
                padding: '8px 10px',
                borderRadius: 6,
                wordBreak: 'break-all' as const,
                border: '1px solid var(--bg-overlay)',
              }}
            >
              {node.path}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(node.path).then(() => {
                  setPathCopied(true);
                  setTimeout(() => setPathCopied(false), 2000);
                }).catch(() => {});
              }}
              title={pathCopied ? 'Copied!' : 'Copy path'}
              style={{
                background: 'none',
                border: '1px solid var(--bg-overlay)',
                borderRadius: 6,
                padding: '6px 8px',
                cursor: 'pointer',
                color: pathCopied ? '#10b981' : 'var(--fg-subtle)',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
            >
              {pathCopied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div>
          <SectionTitle>Summary</SectionTitle>
          <p style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.6, margin: 0 }}>{node.summary}</p>
        </div>

        {/* Stats */}
        <div>
          <SectionTitle>Stats</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Lines', value: node.lineCount.toLocaleString(), icon: <FileCode size={12} /> },
              { label: 'Size', value: formatBytes(node.sizeBytes), icon: <Layers size={12} /> },
              { label: 'Imports', value: node.importCount.toString(), icon: <ArrowDown size={12} /> },
              { label: 'Exports', value: node.exportCount.toString(), icon: <ArrowUp size={12} /> },
              { label: 'Used by', value: importedBy.length.toString(), icon: <GitBranch size={12} /> },
            ].map(stat => (
              <div
                key={stat.label}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--bg-overlay)',
                  borderRadius: 6,
                  padding: '8px 10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--fg-subtle)', marginBottom: 2 }}>
                  {stat.icon}
                  <span style={{ fontSize: 10, fontWeight: 500 }}>{stat.label}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Exports */}
        {node.exports.length > 0 && (
          <div>
            <SectionTitle>Exports ({node.exports.length})</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {node.exports.slice(0, 20).map((exp, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    borderRadius: 5,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--bg-overlay)',
                  }}
                >
                  {exp.isDefault && (
                    <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>DEFAULT</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--fg)', fontFamily: 'monospace' }}>
                    {exp.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--fg-subtle)', marginLeft: 'auto' }}>{exp.type}</span>
                </div>
              ))}
              {node.exports.length > 20 && (
                <div style={{ fontSize: 11, color: 'var(--fg-subtle)', textAlign: 'center', padding: '4px 0' }}>
                  +{node.exports.length - 20} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Imports */}
        {importsFiles.length > 0 && (
          <div>
            <SectionTitle>Imports ({importsFiles.length})</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {(showAllImports ? importsFiles : importsFiles.slice(0, SHOW_LIMIT)).map(({ node: n, relation }) => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <FileRef node={n} onClick={() => onNodeClick(n.id)} />
                  </div>
                  {relation !== 'imports' && (
                    <span style={{
                      fontSize: 9, color: relation === 're-exports' ? '#8b5cf6' : '#f59e0b',
                      background: relation === 're-exports' ? '#8b5cf618' : '#f59e0b18',
                      border: `1px solid ${relation === 're-exports' ? '#8b5cf640' : '#f59e0b40'}`,
                      borderRadius: 3, padding: '1px 5px', marginRight: 6, flexShrink: 0,
                    }}>{relation}</span>
                  )}
                </div>
              ))}
              {importsFiles.length > SHOW_LIMIT && (
                <button
                  onClick={() => setShowAllImports(v => !v)}
                  style={{ fontSize: 11, color: '#388bfd', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', textAlign: 'left' }}
                >
                  {showAllImports ? 'Show less' : `+ ${importsFiles.length - SHOW_LIMIT} more`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Imported by */}
        {importedBy.length > 0 && (
          <div>
            <SectionTitle>Imported by ({importedBy.length})</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {(showAllImportedBy ? importedBy : importedBy.slice(0, SHOW_LIMIT)).map(({ node: n, relation }) => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <FileRef node={n} onClick={() => onNodeClick(n.id)} />
                  </div>
                  {relation !== 'imports' && (
                    <span style={{
                      fontSize: 9, color: relation === 're-exports' ? '#8b5cf6' : '#f59e0b',
                      background: relation === 're-exports' ? '#8b5cf618' : '#f59e0b18',
                      border: `1px solid ${relation === 're-exports' ? '#8b5cf640' : '#f59e0b40'}`,
                      borderRadius: 3, padding: '1px 5px', marginRight: 6, flexShrink: 0,
                    }}>{relation}</span>
                  )}
                </div>
              ))}
              {importedBy.length > SHOW_LIMIT && (
                <button
                  onClick={() => setShowAllImportedBy(v => !v)}
                  style={{ fontSize: 11, color: '#388bfd', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', textAlign: 'left' }}
                >
                  {showAllImportedBy ? 'Show less' : `+ ${importedBy.length - SHOW_LIMIT} more`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* JSX components used */}
        {node.jsxComponents.length > 0 && (
          <div>
            <SectionTitle>JSX Components Used</SectionTitle>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
              {node.jsxComponents.slice(0, 30).map(c => (
                <span
                  key={c}
                  style={{
                    fontSize: 11,
                    color: '#10b981',
                    background: '#10b98118',
                    border: '1px solid #10b98140',
                    borderRadius: 4,
                    padding: '2px 7px',
                    fontFamily: 'monospace',
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* External / npm packages */}
        {externalPackages.length > 0 && (
          <div>
            <SectionTitle>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Package size={10} />
                External Packages ({externalPackages.length})
              </span>
            </SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {externalPackages.map(([pkg, specifiers]) => (
                <div
                  key={pkg}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    padding: '4px 8px',
                    borderRadius: 5,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--bg-overlay)',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--fg)', fontFamily: 'monospace', flexShrink: 0 }}>
                    {pkg}
                  </span>
                  {specifiers.length > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--fg-subtle)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={[...new Set(specifiers)].join(', ')}>
                      {[...new Set(specifiers)].slice(0, 4).join(', ')}
                      {new Set(specifiers).size > 4 && ` +${new Set(specifiers).size - 4}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
