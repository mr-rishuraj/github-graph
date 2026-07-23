import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

interface FolderNodeData {
  label: string;
  folderPath: string;
  fileCount: number;
  color: string;
}

export const FolderNode = memo(({ data }: NodeProps) => {
  const d = data as unknown as FolderNodeData;
  const color = d.color ?? '#388bfd';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `${color}08`,
        border: `1.5px solid ${color}35`,
        borderRadius: 12,
        padding: '10px 14px',
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    >
      {/* Folder label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1.5 1.5H10.5C11.33 3.5 12 4.17 12 5v4.5C12 10.33 11.33 11 10.5 11h-8C1.67 11 1 10.33 1 9.5V3.5z"
            fill={color}
            opacity="0.7"
          />
        </svg>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: color,
            fontFamily: 'SFMono-Regular, Consolas, monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 200,
          }}
          title={d.folderPath}
        >
          {d.folderPath}
        </span>
        <span
          style={{
            fontSize: 10,
            color: `${color}90`,
            background: `${color}15`,
            border: `1px solid ${color}30`,
            borderRadius: 4,
            padding: '1px 5px',
            flexShrink: 0,
            marginLeft: 2,
          }}
        >
          {d.fileCount}
        </span>
      </div>
    </div>
  );
});

FolderNode.displayName = 'FolderNode';
