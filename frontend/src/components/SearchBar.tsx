import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import type { GraphNode } from '../types/index.js';
import { FILE_TYPE_COLORS } from '../types/index.js';

interface SearchBarProps {
  nodes: GraphNode[];
  onHighlight: (ids: Set<string>) => void;
  onFocusNode: (id: string) => void;
}

export function SearchBar({ nodes, onHighlight, onFocusNode }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GraphNode[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(
    (q: string) => {
      const trimmed = q.trim().toLowerCase();
      if (!trimmed) {
        setResults([]);
        onHighlight(new Set());
        return;
      }

      const matched = nodes
        .filter(
          n =>
            n.label.toLowerCase().includes(trimmed) ||
            n.path.toLowerCase().includes(trimmed) ||
            n.summary.toLowerCase().includes(trimmed) ||
            n.exports.some(e => e.name.toLowerCase().includes(trimmed))
        )
        .slice(0, 12);

      setResults(matched);
      onHighlight(new Set(matched.map(n => n.id)));
    },
    [nodes, onHighlight]
  );

  useEffect(() => {
    search(query);
    setSelectedIdx(0);
  }, [query, search]);

  const handleSelect = (node: GraphNode) => {
    onFocusNode(node.id);
    setOpen(false);
    setQuery('');
    onHighlight(new Set());
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIdx]) handleSelect(results[selectedIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      onHighlight(new Set());
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        onHighlight(new Set());
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onHighlight]);

  // Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className="search-bar-container"
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        width: 380,
      }}
    >
      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-surface)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: open && results.length > 0 ? '8px 8px 0 0' : 8,
          padding: '8px 12px',
          boxShadow: 'var(--shadow-md)',
          transition: 'border-color 0.15s',
        }}
      >
        <Search size={14} color="var(--fg-subtle)" style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (query) search(query);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search files, exports…"
          style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            flex: 1,
            fontSize: 13,
            color: 'var(--fg)',
            fontFamily: 'inherit',
          }}
        />
        {query ? (
          <button
            onClick={() => {
              setQuery('');
              onHighlight(new Set());
              setResults([]);
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', display: 'flex', padding: 0 }}
          >
            <X size={14} />
          </button>
        ) : (
          <span
            style={{
              fontSize: 10,
              color: 'var(--fg-subtle)',
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '2px 5px',
              whiteSpace: 'nowrap' as const,
            }}
          >
            ⌘K
          </span>
        )}
      </div>

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent)',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {results.map((node, i) => {
            const color = FILE_TYPE_COLORS[node.type] ?? '#6b7280';
            const q = query.trim().toLowerCase();
            return (
              <button
                key={node.id}
                onMouseDown={e => { e.preventDefault(); handleSelect(node); }}
                onMouseEnter={() => setSelectedIdx(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '9px 14px',
                  background: i === selectedIdx ? 'var(--bg-overlay)' : 'transparent',
                  border: 'none',
                  borderBottom: i < results.length - 1 ? '1px solid #21262d' : 'none',
                  cursor: 'pointer',
                  textAlign: 'left' as const,
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--fg)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.path}
                  </div>
                  {!node.label.toLowerCase().includes(q) && !node.path.toLowerCase().includes(q) && (
                    <div style={{ fontSize: 10, color: '#8b5cf6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      exports: {node.exports.filter(e => e.name.toLowerCase().includes(q)).map(e => e.name).slice(0, 3).join(', ')}
                    </div>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && query.trim() && results.length === 0 && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            padding: '12px 14px',
            fontSize: 13,
            color: 'var(--fg-subtle)',
          }}
        >
          No files matching &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
