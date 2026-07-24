import { useState } from 'react';
import type { FileType, EdgeRelation, ActiveFilters, GraphNode } from '../types/index.js';
import { FILE_TYPE_COLORS, FILE_TYPE_LABELS } from '../types/index.js';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface FilterPanelProps {
  filters: ActiveFilters;
  counts: Partial<Record<FileType, number>>;
  onChange: (filters: ActiveFilters) => void;
  nodes?: GraphNode[];
  hiddenFolders?: Set<string>;
  onToggleFolder?: (folder: string) => void;
}

const ALL_TYPES: FileType[] = [
  'page', 'component', 'hook', 'context', 'utility', 'api', 'layout', 'style', 'asset', 'config', 'test', 'unknown',
];

const EDGE_TYPE_CONFIG: { type: EdgeRelation; label: string; color: string }[] = [
  { type: 'imports',        label: 'Imports',      color: 'var(--accent)' },
  { type: 'dynamic-import', label: 'Dynamic',      color: '#f59e0b' },
  { type: 're-exports',     label: 'Re-exports',   color: '#8b5cf6' },
];

export function FilterPanel({ filters, counts, onChange, nodes = [], hiddenFolders, onToggleFolder }: FilterPanelProps) {
  const [showFolders, setShowFolders] = useState(false);
  const [showEdgeTypes, setShowEdgeTypes] = useState(false);
  const [showAllFolders, setShowAllFolders] = useState(false);

  const toggleType = (type: FileType) => {
    const next = new Set(filters.types);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange({ ...filters, types: next });
  };

  const toggleEdgeType = (type: EdgeRelation) => {
    const next = new Set(filters.activeEdgeTypes);
    if (next.has(type)) {
      if (next.size === 1) return; // keep at least one edge type
      next.delete(type);
    } else {
      next.add(type);
    }
    onChange({ ...filters, activeEdgeTypes: next });
  };

  const allActive = filters.types.size === ALL_TYPES.length;
  const toggleAll = () => {
    onChange({
      ...filters,
      types: allActive ? new Set() : new Set(ALL_TYPES),
    });
  };

  // Compute folder counts
  const allFolderCounts = (() => {
    const map = new Map<string, number>();
    for (const n of nodes) {
      if (!n.folder) continue;
      map.set(n.folder, (map.get(n.folder) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const folderCounts = showAllFolders ? allFolderCounts : allFolderCounts.slice(0, 10);

  return (
    <div
      className="filter-panel"
      style={{
        position: 'absolute',
        left: 16,
        bottom: 40,
        zIndex: 14,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 12,
        width: 200,
        boxShadow: 'var(--shadow-md)',
        maxHeight: 'calc(100vh - 200px)',
        overflowY: 'auto',
      }}
    >
      {/* Node type filters */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--fg-subtle)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Node Types</span>
        <button
          onClick={toggleAll}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 10,
            color: 'var(--accent)',
            padding: 0,
          }}
        >
          {allActive ? 'Hide all' : 'Show all'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ALL_TYPES.map(type => {
          const count = counts[type] ?? 0;
          if (count === 0) return null;
          const active = filters.types.has(type);
          const color = FILE_TYPE_COLORS[type];

          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 7px',
                borderRadius: 5,
                background: active ? 'var(--bg-overlay)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                opacity: active ? 1 : 0.45,
                transition: 'all 0.1s',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: active ? color : '#6b7280',
                  flexShrink: 0,
                  transition: 'background 0.1s',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--fg)', flex: 1 }}>
                {FILE_TYPE_LABELS[type]}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--fg-subtle)',
                  background: 'var(--bg-canvas)',
                  borderRadius: 3,
                  padding: '1px 5px',
                  minWidth: 20,
                  textAlign: 'center',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Edge type filters */}
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => setShowEdgeTypes(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 0 6px 0',
            width: '100%',
            borderBottom: '1px solid var(--bg-overlay)',
          }}
        >
          {showEdgeTypes ? <ChevronDown size={10} color="var(--fg-subtle)" /> : <ChevronRight size={10} color="var(--fg-subtle)" />}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--fg-subtle)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Edge Types
          </span>
        </button>

        {showEdgeTypes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
            {EDGE_TYPE_CONFIG.map(({ type, label, color }) => {
              const active = filters.activeEdgeTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleEdgeType(type)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '5px 7px',
                    borderRadius: 5,
                    background: active ? 'var(--bg-overlay)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    opacity: active ? 1 : 0.45,
                    transition: 'all 0.1s',
                  }}
                >
                  <svg width="16" height="8" style={{ flexShrink: 0 }}>
                    <line
                      x1="2" y1="4" x2="13" y2="4"
                      stroke={active ? color : '#6b7280'}
                      strokeWidth="1.5"
                      strokeDasharray={type === 're-exports' ? '3 2' : undefined}
                    />
                    <polygon points="11,2 15,4 11,6" fill={active ? color : '#6b7280'} />
                  </svg>
                  <span style={{ fontSize: 12, color: 'var(--fg)' }}>{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Folder filters */}
      {folderCounts.length > 0 && onToggleFolder && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowFolders(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0 0 6px 0',
              width: '100%',
              borderBottom: '1px solid #21262d',
            }}
          >
            {showFolders ? <ChevronDown size={10} color="var(--fg-subtle)" /> : <ChevronRight size={10} color="var(--fg-subtle)" />}
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--fg-subtle)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Folders
            </span>
          </button>

          {showFolders && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
              {allFolderCounts.length > 10 && (
                <button
                  onClick={() => setShowAllFolders(v => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 10,
                    color: 'var(--accent)',
                    padding: '2px 0 4px',
                    textAlign: 'left',
                  }}
                >
                  {showAllFolders
                    ? `Show top 10`
                    : `Show all ${allFolderCounts.length} folders`}
                </button>
              )}
              {folderCounts.map(([folder, count]) => {
                const hidden = hiddenFolders?.has(folder) ?? false;
                return (
                  <button
                    key={folder}
                    onClick={() => onToggleFolder(folder)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '4px 7px',
                      borderRadius: 5,
                      background: hidden ? 'transparent' : 'var(--bg-overlay)',
                      border: 'none',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      opacity: hidden ? 0.45 : 1,
                      transition: 'all 0.1s',
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M0.5 2.5C0.5 2.22 0.72 2 1 2H3.5L4.5 3H8.5C8.78 3 9 3.22 9 3.5V7.5C9 7.78 8.78 8 8.5 8H1C0.72 8 0.5 7.78 0.5 7.5V2.5Z" fill="var(--fg-subtle)" />
                    </svg>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--fg)',
                        fontFamily: 'monospace',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={folder}
                    >
                      {folder.split('/').pop() || folder}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--fg-subtle)',
                        background: 'var(--bg-canvas)',
                        borderRadius: 3,
                        padding: '1px 5px',
                        minWidth: 16,
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
