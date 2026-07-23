import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
}

type ContextMenuEntry = ContextMenuItem | 'separator';

interface NodeContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  nodePath: string;
  onClose: () => void;
  onFocusNode: (id: string) => void;
  onShowOnlyConnected: (id: string) => void;
  onHideNode: (id: string) => void;
  onResetHidden: () => void;
  onHighlightPathFrom: (id: string) => void;
}

export function NodeContextMenu({
  x,
  y,
  nodeId,
  nodePath,
  onClose,
  onFocusNode,
  onShowOnlyConnected,
  onHideNode,
  onResetHidden,
  onHighlightPathFrom,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to avoid going off-screen
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 240);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Element)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const items: ContextMenuEntry[] = [
    {
      label: 'Focus node',
      action: () => {
        onFocusNode(nodeId);
        onClose();
      },
    },
    {
      label: 'Copy file path',
      action: () => {
        navigator.clipboard.writeText(nodePath).catch(() => {});
        onClose();
      },
    },
    'separator',
    {
      label: 'Show only connected',
      action: () => {
        onShowOnlyConnected(nodeId);
        onClose();
      },
    },
    {
      label: 'Highlight path to…',
      action: () => {
        onHighlightPathFrom(nodeId);
        onClose();
      },
    },
    'separator',
    {
      label: 'Hide this file',
      action: () => {
        onHideNode(nodeId);
        onClose();
      },
      danger: true,
    },
    {
      label: 'Reset hidden',
      action: () => {
        onResetHidden();
        onClose();
      },
    },
  ];

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 9999,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-lg)',
        minWidth: 200,
        overflow: 'hidden',
        padding: '4px 0',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item === 'separator') {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 1,
                background: 'var(--bg-overlay)',
                margin: '4px 0',
              }}
            />
          );
        }
        return (
          <button
            key={item.label}
            onClick={item.action}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '7px 14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              color: item.danger ? '#f87171' : 'var(--fg)',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-overlay)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'none';
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return createPortal(menu, document.body);
}
