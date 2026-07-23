import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ShortcutRowProps {
  keys: string[];
  description: string;
}

function ShortcutRow({ keys, description }: ShortcutRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{description}</span>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {keys.map((key, i) => (
          <span key={i}>
            <kbd
              style={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: 'var(--fg)',
                background: 'var(--bg-overlay)',
                border: '1px solid #30363d',
                borderBottomWidth: 2,
                borderRadius: 4,
                padding: '2px 6px',
              }}
            >
              {key}
            </kbd>
            {i < keys.length - 1 && (
              <span style={{ fontSize: 11, color: 'var(--fg-subtle)', padding: '0 2px' }}>+</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--fg-subtle)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 6,
          paddingBottom: 6,
          borderBottom: '1px solid #21262d',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

interface Props {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--backdrop-strong)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '24px 28px',
          width: 480,
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-modal)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>Keyboard Shortcuts</h2>
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
          >
            <X size={16} />
          </button>
        </div>

        <Section title="Navigation">
          <ShortcutRow keys={['⌘K']} description="Focus search" />
          <ShortcutRow keys={['↑', '↓']} description="Navigate to parent / child node" />
          <ShortcutRow keys={['←', '→']} description="Navigate to dependent / dependency" />
          <ShortcutRow keys={['F']} description="Fit graph to viewport" />
        </Section>

        <Section title="Selection">
          <ShortcutRow keys={['Click']} description="Select node (shows sidebar)" />
          <ShortcutRow keys={['Esc']} description="Deselect / clear highlights" />
          <ShortcutRow keys={['H']} description="Hide selected node" />
        </Section>

        <Section title="View">
          <ShortcutRow keys={['?']} description="Show this help" />
          <ShortcutRow keys={['⌘', 'Shift', 'F']} description="Fit view (alternative)" />
        </Section>

        <Section title="Context Menu (right-click)">
          <ShortcutRow keys={['Right-click']} description="Open context menu on node" />
          <div style={{ fontSize: 11, color: 'var(--fg-subtle)', paddingTop: 4 }}>
            Options: Focus, Show only connected, Hide node, Highlight path from here
          </div>
        </Section>

        <div style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid #21262d', fontSize: 11, color: 'var(--fg-subtle)', textAlign: 'center' }}>
          Press <kbd style={{ fontSize: 10, color: 'var(--fg)', background: 'var(--bg-overlay)', border: '1px solid #30363d', borderRadius: 3, padding: '1px 4px' }}>Esc</kbd> or <kbd style={{ fontSize: 10, color: 'var(--fg)', background: 'var(--bg-overlay)', border: '1px solid #30363d', borderRadius: 3, padding: '1px 4px' }}>?</kbd> to close
        </div>
      </div>
    </div>
  );
}
