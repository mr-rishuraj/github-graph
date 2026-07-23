import { memo, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { GraphNode, FileType } from '../../types/index.js';
import { FILE_TYPE_COLORS, FILE_TYPE_LABELS } from '../../types/index.js';

const TYPE_ICONS: Record<FileType, string> = {
  page: '📄',
  component: '🧩',
  hook: '🪝',
  context: '🔷',
  utility: '🔧',
  api: '🔴',
  style: '🎨',
  asset: '📦',
  config: '⚙️',
  test: '🧪',
  layout: '🗂️',
  unknown: '📁',
};

interface FileNodeData extends GraphNode {
  isHighlighted?: boolean;
  isDimmed?: boolean;
  isSelected?: boolean;
  diffStatus?: 'added' | 'removed' | 'changed' | 'unchanged';
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function getNodeWidth(importCount: number, exportCount: number): number {
  const total = importCount + exportCount;
  if (total >= 16) return 260;
  if (total >= 6) return 230;
  return 200;
}

function instabilityColor(instability: number): string {
  // 0 = stable = green, 1 = unstable = red
  const r = Math.round(255 * instability);
  const g = Math.round(255 * (1 - instability));
  return `rgb(${r},${g},0)`;
}

interface TooltipProps {
  node: FileNodeData;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

function NodeTooltip({ node, anchorRef }: TooltipProps) {
  const rect = anchorRef.current?.getBoundingClientRect();
  if (!rect) return null;

  const left = rect.right + 8;
  const top = rect.top;
  const adjustedLeft = left + 260 > window.innerWidth ? rect.left - 268 : left;

  const instability = node.instability ?? null;
  const depth = node.depth ?? null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: adjustedLeft,
        top: top,
        zIndex: 99999,
        background: 'var(--bg-surface)',
        border: '1px solid #30363d',
        borderRadius: 10,
        padding: '12px 14px',
        width: 260,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--fg)',
          fontFamily: 'monospace',
          marginBottom: 6,
          wordBreak: 'break-all',
        }}
      >
        {node.path}
      </div>
      {node.summary && (
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.5, marginBottom: 8 }}>
          {node.summary}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {instability !== null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Instability</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: instabilityColor(instability) }}>
              {instability.toFixed(2)}
            </span>
          </div>
        )}
        {depth !== null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Depth</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)' }}>{depth}</span>
          </div>
        )}
        {node.afferentCoupling !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Used by</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)' }}>{node.afferentCoupling}</span>
          </div>
        )}
        {node.efferentCoupling !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Uses</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)' }}>{node.efferentCoupling}</span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export const FileNode = memo(({ data, selected }: NodeProps) => {
  const node = data as unknown as FileNodeData;
  const color = FILE_TYPE_COLORS[node.type] ?? '#4b5563';
  const label = FILE_TYPE_LABELS[node.type];
  const icon = TYPE_ICONS[node.type];

  const isDimmed = node.isDimmed && !node.isHighlighted && !selected;
  const isActive = node.isHighlighted || selected;

  // Variable width based on import/export count
  const width = getNodeWidth(node.importCount ?? 0, node.exportCount ?? 0);

  // Hotspot glow: afferentCoupling >= 5
  const isHotspot = (node.afferentCoupling ?? 0) >= 5;

  // Instability bar
  const instability = node.instability ?? null;

  // Hover tooltip
  const [showTooltip, setShowTooltip] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => setShowTooltip(true), []);
  const handleMouseLeave = useCallback(() => setShowTooltip(false), []);

  const hotspotGlow = isHotspot
    ? `0 0 0 2px ${color}60, 0 0 20px ${color}40, 0 4px 20px ${color}20`
    : '';
  const activeGlow = isActive ? `0 0 0 2px ${color}40, 0 4px 20px ${color}20` : '0 2px 8px rgba(0,0,0,0.4)';
  const boxShadow = isHotspot && isActive
    ? hotspotGlow
    : isHotspot
    ? hotspotGlow
    : activeGlow;

  // Diff styling
  const diffColors: Record<string, string> = {
    added: '#10b981',
    removed: '#ef4444',
    changed: '#f59e0b',
    unchanged: 'transparent',
  };
  const diffBorderColor = node.diffStatus && node.diffStatus !== 'unchanged' ? diffColors[node.diffStatus] : null;
  const diffBorderStyle = node.diffStatus === 'removed' ? 'dashed' : 'solid';
  const diffOpacity = node.diffStatus === 'unchanged' ? 0.45 : 1;
  const diffBadge = node.diffStatus === 'added' ? '+' : node.diffStatus === 'removed' ? '-' : node.diffStatus === 'changed' ? '~' : null;

  const finalBorder = diffBorderColor
    ? `2px ${diffBorderStyle} ${diffBorderColor}`
    : `1.5px solid ${isActive ? color : isDimmed ? 'var(--bg-overlay)' : 'var(--border)'}`;
  const finalOpacity = (isDimmed ? 0.3 : 1) * diffOpacity;
  const finalBoxShadow = diffBorderColor
    ? `0 0 12px ${diffBorderColor}40, ${boxShadow}`
    : boxShadow;

  return (
    <div
      ref={nodeRef}
      className="file-node"
      style={{
        width,
        minHeight: 80,
        background: 'var(--bg-surface)',
        border: finalBorder,
        borderRadius: 10,
        padding: instability !== null ? '10px 12px 16px' : '10px 12px',
        cursor: 'pointer',
        opacity: finalOpacity,
        boxShadow: finalBoxShadow,
        transition: 'all 0.15s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Color accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: color,
          borderRadius: '10px 10px 0 0',
        }}
      />

      {/* Diff badge */}
      {diffBadge && (
        <div style={{
          position: 'absolute', top: 6, right: 8,
          fontSize: 11, fontWeight: 900,
          color: diffColors[node.diffStatus!],
          lineHeight: 1,
        }}>
          {diffBadge}
        </div>
      )}

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: color, border: 'none', width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: color, border: 'none', width: 8, height: 8 }}
      />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, marginTop: 2 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--fg)',
            fontFamily: 'SFMono-Regular, Consolas, monospace',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={node.label}
        >
          {truncate(node.label, width > 220 ? 28 : 24)}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: color,
            background: `${color}18`,
            border: `1px solid ${color}40`,
            borderRadius: 4,
            padding: '1px 5px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          {label}
        </span>
      </div>

      {/* Summary */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--fg-muted)',
          lineHeight: 1.4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
        }}
        title={node.summary}
      >
        {truncate(node.summary, 72)}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 7,
          alignItems: 'center',
        }}
      >
        {node.importCount > 0 && (
          <span
            style={{
              fontSize: 9,
              color: 'var(--fg-subtle)',
              background: 'var(--bg-overlay)',
              padding: '1px 5px',
              borderRadius: 3,
            }}
          >
            ↓ {node.importCount}
          </span>
        )}
        {node.exportCount > 0 && (
          <span
            style={{
              fontSize: 9,
              color: 'var(--fg-subtle)',
              background: 'var(--bg-overlay)',
              padding: '1px 5px',
              borderRadius: 3,
            }}
          >
            ↑ {node.exportCount}
          </span>
        )}
        {node.lineCount > 0 && (
          <span style={{ fontSize: 9, color: 'var(--fg-subtle)', marginLeft: 'auto' }}>
            {node.lineCount} lines
          </span>
        )}
      </div>

      {/* Instability bar at bottom */}
      {instability !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'var(--bg-overlay)',
            borderRadius: '0 0 10px 10px',
            overflow: 'hidden',
          }}
          title={`Instability: ${instability.toFixed(2)}`}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.round(instability * 100)}%`,
              background: `linear-gradient(90deg, #10b981 0%, #f59e0b 50%, #ef4444 100%)`,
              backgroundSize: '100px 100%',
              backgroundPosition: `${instability * -100 + 100}% 0`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && <NodeTooltip node={node} anchorRef={nodeRef} />}
    </div>
  );
});

FileNode.displayName = 'FileNode';
