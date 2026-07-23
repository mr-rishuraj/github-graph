import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { GraphData, GraphNode, ActiveFilters, DiffGraphData } from '../types/index.js';
import { FILE_TYPE_COLORS } from '../types/index.js';
import { FileNode } from './nodes/FileNode.js';
import { FolderNode } from './nodes/FolderNode.js';
import { Sidebar } from './Sidebar.js';
import { SearchBar } from './SearchBar.js';
import { FilterPanel } from './FilterPanel.js';
import { StatsPanel } from './StatsPanel.js';
import { NodeContextMenu } from './NodeContextMenu.js';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal.js';
import { BottomSheet } from './BottomSheet.js';
import { MobileBottomBar } from './MobileBottomBar.js';
import { computeDagreLayout, computeDagreLayoutAsync, graphNodesToFlowNodes, graphEdgesToFlowEdges } from '../hooks/useGraphLayout.js';
import { buildGroupedLayoutAsync } from '../hooks/useGroupedLayout.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Download, Layers, FileJson, Share2 } from 'lucide-react';

const NODE_TYPES: NodeTypes = { fileNode: FileNode, group: FolderNode };

interface GraphCanvasProps {
  data: GraphData;
  diffMode?: boolean;
  diffData?: DiffGraphData['diff'];
}

const DEFAULT_FILTERS: ActiveFilters = {
  showTests: true,
  showStyles: true,
  showAssets: false,
  showConfigs: false,
  types: new Set([
    'page', 'component', 'hook', 'context', 'utility', 'api', 'layout', 'style', 'test', 'unknown',
  ]),
  activeEdgeTypes: new Set(['imports', 'dynamic-import', 're-exports'] as const),
};


function GraphCanvasInner({ data, diffMode, diffData }: GraphCanvasProps) {
  const { fitView, setCenter, getNode } = useReactFlow();
  const isMobile = useIsMobile();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dismissedLargeGraphWarning, setDismissedLargeGraphWarning] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ActiveFilters>(DEFAULT_FILTERS);
  const [layoutDir, setLayoutDir] = useState<'TB' | 'LR'>('TB');
  const [groupByFolder, setGroupByFolder] = useState(false);
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [hiddenFolders, setHiddenFolders] = useState<Set<string>>(new Set());
  const [highlightPathFrom, setHighlightPathFrom] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [diffFilter, setDiffFilter] = useState<'all' | 'added' | 'removed' | 'changed'>('all');

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<'graph' | 'search' | 'filter' | 'stats' | 'diff'>('graph');

  // Debounce filters to avoid triggering expensive dagre layout on every keystroke/click
  const debouncedFilters = useDebounce(filters, 60);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    nodePath: string;
  } | null>(null);

  // Filtered graph nodes/edges — uses debounced filters for layout (avoids thrashing dagre)
  const { filteredNodes, filteredEdges } = useMemo(() => {
    const visibleNodes = data.nodes.filter(n => {
      if (!debouncedFilters.types.has(n.type)) return false;
      if (hiddenNodes.has(n.id)) return false;
      if (n.folder && hiddenFolders.has(n.folder)) return false;
      // Diff filter
      if (diffMode && diffData && diffFilter !== 'all') {
        const status = diffData.nodeStatus[n.id] ?? 'unchanged';
        if (status !== diffFilter) return false;
      }
      return true;
    });
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = data.edges.filter(e =>
      visibleIds.has(e.source) &&
      visibleIds.has(e.target) &&
      debouncedFilters.activeEdgeTypes.has(e.relation)
    );
    return { filteredNodes: visibleNodes, filteredEdges: visibleEdges };
  }, [data, debouncedFilters, hiddenNodes, hiddenFolders, diffMode, diffData, diffFilter]);

  // Clear selection when the selected node gets filtered out — keep it when still visible
  useEffect(() => {
    if (!selectedNodeId) return;
    if (!filteredNodes.some(n => n.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [filteredNodes, selectedNodeId]);

  // Count by type for filter panel
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<string, number>> = {};
    for (const n of data.nodes) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    }
    return counts;
  }, [data.nodes]);

  // Build and layout the flow graph — async worker for large graphs, sync for small
  const [isLayoutComputing, setIsLayoutComputing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (groupByFolder) {
        try {
          const { flowNodes, flowEdges } = await buildGroupedLayoutAsync(filteredNodes, filteredEdges, hiddenFolders);
          if (!cancelled) { setNodes(flowNodes); setEdges(flowEdges); }
        } catch {
          // fallback to flat layout
          const rawNodes = graphNodesToFlowNodes(filteredNodes);
          const rawEdges = graphEdgesToFlowEdges(filteredEdges);
          const laid = computeDagreLayout(rawNodes, rawEdges, layoutDir);
          if (!cancelled) { setNodes(laid); setEdges(rawEdges); }
        }
      } else {
        const rawNodes = graphNodesToFlowNodes(filteredNodes);
        const rawEdges = graphEdgesToFlowEdges(filteredEdges);
        if (rawNodes.length > 500) setIsLayoutComputing(true);
        try {
          const laid = await computeDagreLayoutAsync(rawNodes, rawEdges, layoutDir);
          if (!cancelled) { setNodes(laid); setEdges(rawEdges); }
        } finally {
          if (!cancelled) setIsLayoutComputing(false);
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [filteredNodes, filteredEdges, layoutDir, groupByFolder, hiddenFolders, setNodes, setEdges]);

  // Fit view once layout is ready
  const handleInit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 100);
  }, [fitView]);

  // "Show only connected" — hide all nodes not connected to target
  const handleShowOnlyConnected = useCallback((id: string) => {
    const connectedIds = new Set<string>([id]);
    for (const e of data.edges) {
      if (e.source === id) connectedIds.add(e.target);
      if (e.target === id) connectedIds.add(e.source);
    }
    const toHide = data.nodes
      .filter(n => !connectedIds.has(n.id))
      .map(n => n.id);
    setHiddenNodes(new Set(toHide));
  }, [data.edges, data.nodes]);

  // Highlight path from node (BFS from source to target when next click happens)
  const handleHighlightPathFrom = useCallback((id: string) => {
    setHighlightPathFrom(id);
    // Compute reachable nodes from this source via BFS
    const reachable = new Set<string>([id]);
    const queue = [id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const e of data.edges) {
        if (e.source === cur && !reachable.has(e.target)) {
          reachable.add(e.target);
          queue.push(e.target);
        }
      }
    }
    setHighlightedIds(reachable);
  }, [data.edges]);

  // Apply highlight/dim overlays to nodes
  const displayNodes = useMemo(() => {
    const hasHighlight = highlightedIds.size > 0;
    const hasSelected = selectedNodeId !== null;

    let activeIds = new Set<string>(highlightedIds);
    if (hasSelected) {
      activeIds.add(selectedNodeId);
      for (const e of filteredEdges) {
        if (e.source === selectedNodeId) activeIds.add(e.target);
        if (e.target === selectedNodeId) activeIds.add(e.source);
      }
    }

    const anyActive = activeIds.size > 0;

    return nodes.map(n => {
      // Don't apply dim/highlight to group nodes
      if (n.type === 'group') return n;

      // Diff mode: inject diffStatus
      if (diffMode && diffData) {
        const status = diffData.nodeStatus[n.id] ?? 'unchanged';
        return {
          ...n,
          data: {
            ...n.data,
            isHighlighted: anyActive && activeIds.has(n.id),
            isDimmed: anyActive && !activeIds.has(n.id),
            isSelected: n.id === selectedNodeId,
            diffStatus: status,
          },
          selected: n.id === selectedNodeId,
        };
      }

      return {
        ...n,
        data: {
          ...n.data,
          isHighlighted: anyActive && activeIds.has(n.id),
          isDimmed: anyActive && !activeIds.has(n.id),
          isSelected: n.id === selectedNodeId,
        },
        selected: n.id === selectedNodeId,
      };
    });
  }, [nodes, highlightedIds, selectedNodeId, filteredEdges, diffMode, diffData]);

  // Suppress unused variable warning for hasHighlight
  void (highlightedIds.size > 0);

  // Edge highlighting
  const displayEdges = useMemo(() => {
    if (!selectedNodeId) return edges;

    const REL_COLORS: Record<string, string> = {
      'imports': '#388bfd',
      'dynamic-import': '#f59e0b',
      're-exports': '#8b5cf6',
    };

    return edges.map(e => {
      const connected = e.source === selectedNodeId || e.target === selectedNodeId;
      const relColor = REL_COLORS[(e.data as Record<string, unknown>)?.relation as string ?? 'imports'] ?? '#388bfd';
      return {
        ...e,
        style: {
          ...e.style,
          stroke: connected ? relColor : 'var(--bg-overlay)',
          strokeWidth: connected ? 2 : 1,
          opacity: connected ? 1 : 0.15,
        },
        markerEnd: connected
          ? { type: 'arrowclosed' as const, color: relColor }
          : { type: 'arrowclosed' as const, color: 'var(--bg-overlay)' },
        animated: connected && (e.data as Record<string, unknown>)?.relation === 'dynamic-import',
      };
    });
  }, [edges, selectedNodeId]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === 'group') return; // don't select folder groups
    if (highlightPathFrom !== null) {
      // Second click in highlight path mode — find path between the two nodes
      setHighlightPathFrom(null);
    }
    setSelectedNodeId(prev => (prev === node.id ? null : node.id));
  }, [highlightPathFrom]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setHighlightedIds(new Set());
    setContextMenu(null);
    if (highlightPathFrom !== null) {
      setHighlightPathFrom(null);
    }
  }, [highlightPathFrom]);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'group') return;
    event.preventDefault();
    const nodeData = data.nodes.find(n => n.id === node.id);
    if (!nodeData) return;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
      nodePath: nodeData.path,
    });
  }, [data.nodes]);

  const focusNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    const flowNode = getNode(id);
    if (flowNode) {
      setCenter(
        (flowNode.position.x ?? 0) + (flowNode.measured?.width ?? 220) / 2,
        (flowNode.position.y ?? 0) + (flowNode.measured?.height ?? 90) / 2,
        { duration: 600, zoom: 1.2 }
      );
    }
  }, [getNode, setCenter]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setHighlightedIds(new Set());
        setHighlightPathFrom(null);
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(v => !v);
        return;
      }

      if (e.key === 'f' || (e.metaKey && e.shiftKey && e.key === 'F') || (e.ctrlKey && e.shiftKey && e.key === 'F')) {
        e.preventDefault();
        fitView({ padding: 0.1, duration: 400 });
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        if (selectedNodeId) {
          setHiddenNodes(prev => new Set([...prev, selectedNodeId]));
          setSelectedNodeId(null);
        }
        return;
      }

      // Arrow navigation between nodes
      if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && selectedNodeId) {
        e.preventDefault();
        const outgoing = data.edges.find(edge => edge.source === selectedNodeId);
        if (outgoing) focusNode(outgoing.target);
        return;
      }

      if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && selectedNodeId) {
        e.preventDefault();
        const incoming = data.edges.find(edge => edge.target === selectedNodeId);
        if (incoming) focusNode(incoming.source);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, fitView, focusNode, data.edges]);

  // Highlight all nodes in a circular dependency cycle and focus the first one
  const handleFocusCycle = useCallback((paths: string[]) => {
    const cycleIds = new Set<string>();
    for (const p of paths) {
      const node = data.nodes.find(n => n.path === p);
      if (node) cycleIds.add(node.id);
    }
    setHighlightedIds(cycleIds);
    const first = data.nodes.find(n => n.path === paths[0]);
    if (first) focusNode(first.id);
  }, [data.nodes, focusNode]);

  // Export JSON
  const handleExportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `${data.meta.owner}-${data.meta.repo}-graph.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, [data]);

  // Export PNG
  const handleExportPng = useCallback(async () => {
    const renderer = document.querySelector('.react-flow__renderer') as HTMLElement;
    if (!renderer) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(renderer, {
        backgroundColor: 'var(--bg-canvas)',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${data.meta.owner}-${data.meta.repo}-graph.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export PNG failed:', err);
    }
  }, [data.meta]);

  // Export Mermaid
  const handleExportMermaid = useCallback(() => {
    const MAX_NODES = 150;
    const visibleNodes = filteredNodes.slice(0, MAX_NODES);
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = filteredEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const nodeLines = visibleNodes.map(n =>
      `  ${sanitize(n.id)}["${n.label}\\n${n.type}"]`
    );
    const edgeLines = visibleEdges.map(e => {
      const arrow = e.relation === 're-exports' ? '-.->': '-->';
      return `  ${sanitize(e.source)} ${arrow} ${sanitize(e.target)}`;
    });
    const truncationNote = filteredNodes.length > MAX_NODES
      ? `\n  %% Note: truncated to ${MAX_NODES} of ${filteredNodes.length} nodes`
      : '';

    const mermaid = `%%{init: {'theme': 'dark'}}%%\ngraph TD\n${nodeLines.join('\n')}\n${edgeLines.join('\n')}${truncationNote}`;
    const blob = new Blob([mermaid], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = `${data.meta.owner}-${data.meta.repo}.mmd`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, [filteredNodes, filteredEdges, data.meta]);

  const selectedNodeData = selectedNodeId
    ? (data.nodes.find(n => n.id === selectedNodeId) ?? null)
    : null;

  const handleToggleFolder = useCallback((folder: string) => {
    setHiddenFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  const hasCircularDeps = data.meta.circularDeps.length > 0;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', paddingBottom: isMobile ? 56 : 0 }}>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeContextMenu={handleNodeContextMenu}
        onInit={handleInit}
        fitView
        minZoom={0.05}
        maxZoom={3}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: 'var(--border)', strokeWidth: 1.5 },
        }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg-canvas)' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--bg-overlay)"
        />
        <Controls
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}
        />
        <MiniMap
          style={{
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
          maskColor="rgba(0,0,0,0.6)"
          nodeColor={n => {
            if (n.type === 'group') return '#388bfd20';
            return FILE_TYPE_COLORS[(n.data as unknown as GraphNode).type] ?? '#4b5563';
          }}
        />
      </ReactFlow>

      {/* Layout computing indicator (large graphs only) */}
      {isLayoutComputing && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 12,
            color: 'var(--fg-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #388bfd', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          Computing layout...
        </div>
      )}

      {/* Large-graph performance warning */}
      {data.nodes.length > 2000 && !dismissedLargeGraphWarning && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            background: '#f59e0b18',
            border: '1px solid #f59e0b40',
            borderRadius: 8,
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
            color: '#f59e0b',
            fontWeight: 500,
            maxWidth: 480,
          }}
        >
          <span>Warning: Large graph ({data.nodes.length.toLocaleString()} nodes) — use filters to improve performance</span>
          <button
            onClick={() => setDismissedLargeGraphWarning(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0 }}
          >
            x
          </button>
        </div>
      )}

      {/* Diff filter row — desktop only; on mobile it's in the bottom sheet */}
      {diffMode && !isMobile && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', gap: 4 }}>
          {(['all', 'added', 'removed', 'changed'] as const).map(f => (
            <button key={f} onClick={() => setDiffFilter(f)}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: diffFilter === f ? '#388bfd' : 'var(--bg-surface)',
                border: `1px solid ${diffFilter === f ? '#388bfd' : 'var(--border)'}`,
                color: diffFilter === f ? '#fff' : 'var(--fg-muted)', cursor: 'pointer' }}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Edge legend / Diff legend */}
      {diffMode ? (
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? 76 : 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            gap: 10,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 14px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}
        >
          {[
            { color: '#10b981', label: 'Added' },
            { color: '#ef4444', label: 'Removed' },
            { color: '#f59e0b', label: 'Changed' },
            { color: 'var(--fg-subtle)', label: 'Unchanged' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
              <span style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? 76 : 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            gap: 14,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 14px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}
        >
          {([
            { color: 'var(--border)', dash: undefined, label: 'imports', animated: false },
            { color: '#388bfd', dash: '4 2', label: 're-exports', animated: false },
            { color: '#f59e0b', dash: undefined, label: 'dynamic', animated: true },
          ] as const).map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="28" height="10">
                <line
                  x1="2" y1="5" x2="26" y2="5"
                  stroke={item.color}
                  strokeWidth="1.5"
                  strokeDasharray={item.dash}
                />
                <polygon points="24,2 28,5 24,8" fill={item.color} />
              </svg>
              <span style={{ fontSize: 10, color: 'var(--fg-subtle)', fontWeight: 500 }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Desktop overlays — hidden on mobile */}
      {!isMobile && (
        <>
          <SearchBar
            key={data.meta.repoUrl}
            nodes={data.nodes}
            onHighlight={setHighlightedIds}
            onFocusNode={focusNode}
          />
          <StatsPanel meta={data.meta} nodes={data.nodes} onFocusCycle={handleFocusCycle} />
          <FilterPanel
            filters={filters}
            counts={typeCounts}
            onChange={setFilters}
            nodes={data.nodes}
            hiddenFolders={hiddenFolders}
            onToggleFolder={handleToggleFolder}
          />
        </>
      )}

      {/* Mobile overlays */}
      {isMobile && (
        <>
          <MobileBottomBar
            activeTab={mobileTab}
            onTabChange={setMobileTab}
            hasCircularDeps={hasCircularDeps}
            diffMode={!!diffMode}
          />
          {mobileTab === 'search' && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, padding: 12, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              <SearchBar
                key={data.meta.repoUrl}
                nodes={data.nodes}
                onHighlight={setHighlightedIds}
                onFocusNode={(id) => { focusNode(id); setMobileTab('graph'); }}
              />
            </div>
          )}
          <BottomSheet open={mobileTab === 'filter'} onClose={() => setMobileTab('graph')} title="Filters" height="75vh">
            <div style={{ padding: 12 }}>
              <FilterPanel
                filters={filters}
                counts={typeCounts}
                onChange={setFilters}
                nodes={data.nodes}
                hiddenFolders={hiddenFolders}
                onToggleFolder={handleToggleFolder}
              />
            </div>
          </BottomSheet>
          <BottomSheet open={mobileTab === 'stats'} onClose={() => setMobileTab('graph')} title="Stats" height="80vh">
            <div style={{ padding: 12 }}>
              <StatsPanel meta={data.meta} nodes={data.nodes} onFocusCycle={handleFocusCycle} />
            </div>
          </BottomSheet>
          {diffMode && (
            <BottomSheet open={mobileTab === 'diff'} onClose={() => setMobileTab('graph')} title="Diff Filter" height="auto">
              <div style={{ padding: '8px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-subtle)' }}>Show only files with a specific change status</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {([
                    { f: 'all', label: 'All Files', color: '#388bfd' },
                    { f: 'added', label: '+ Added', color: '#10b981' },
                    { f: 'removed', label: '- Removed', color: '#ef4444' },
                    { f: 'changed', label: '~ Changed', color: '#f59e0b' },
                  ] as const).map(({ f, label, color }) => (
                    <button
                      key={f}
                      onClick={() => { setDiffFilter(f); setMobileTab('graph'); }}
                      style={{
                        padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        background: diffFilter === f ? `${color}20` : 'var(--bg-overlay)',
                        border: `1.5px solid ${diffFilter === f ? color : 'var(--border)'}`,
                        color: diffFilter === f ? color : 'var(--fg-muted)', cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </BottomSheet>
          )}
        </>
      )}

      {/* Toolbar: Layout + Group + Export */}
      <div
        className="graph-toolbar"
        style={{
          position: 'absolute',
          bottom: isMobile ? 96 : 40,
          right: 16,
          zIndex: 10,
          display: 'flex',
          gap: 4,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Group by folder */}
        <button
          onClick={() => setGroupByFolder(v => !v)}
          title="Group by folder"
          style={{
            background: groupByFolder ? 'var(--bg-surface)' : 'var(--bg-surface)',
            border: `1px solid ${groupByFolder ? '#388bfd' : 'var(--border)'}`,
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            color: groupByFolder ? '#388bfd' : 'var(--fg-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Layers size={12} />
          Folders
        </button>

        {/* Export PNG */}
        <button
          onClick={handleExportPng}
          title="Export as PNG"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
          className="hover:border-[#388bfd] hover:text-[#388bfd]"
        >
          <Download size={12} />
          PNG
        </button>

        {/* Export JSON */}
        <button
          onClick={handleExportJson}
          title="Export graph data as JSON"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
          className="hover:border-[#388bfd] hover:text-[#388bfd]"
        >
          <FileJson size={12} />
          JSON
        </button>

        {/* Export Mermaid */}
        <button
          onClick={handleExportMermaid}
          title="Export as Mermaid diagram (.mmd)"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
          className="hover:border-[#388bfd] hover:text-[#388bfd]"
        >
          <Share2 size={12} />
          Mermaid
        </button>

        {/* Layout direction */}
        {(['TB', 'LR'] as const).map(dir => (
          <button
            key={dir}
            onClick={() => setLayoutDir(dir)}
            style={{
              background: layoutDir === dir ? '#388bfd' : 'var(--bg-surface)',
              border: `1px solid ${layoutDir === dir ? '#388bfd' : 'var(--border)'}`,
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              color: layoutDir === dir ? '#fff' : 'var(--fg-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            {dir === 'TB' ? 'Vertical' : 'Horizontal'}
          </button>
        ))}

        {/* Reset hidden nodes */}
        {hiddenNodes.size > 0 && (
          <button
            onClick={() => setHiddenNodes(new Set())}
            style={{
              background: '#ef444418',
              border: '1px solid #ef444440',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              color: '#f87171',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            Show {hiddenNodes.size} hidden
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          nodePath={contextMenu.nodePath}
          onClose={() => setContextMenu(null)}
          onFocusNode={focusNode}
          onShowOnlyConnected={handleShowOnlyConnected}
          onHideNode={id => {
            setHiddenNodes(prev => new Set([...prev, id]));
            setSelectedNodeId(null);
          }}
          onResetHidden={() => setHiddenNodes(new Set())}
          onHighlightPathFrom={handleHighlightPathFrom}
        />
      )}

      {/* Right sidebar */}
      {selectedNodeData && (
        <Sidebar
          node={selectedNodeData}
          allNodes={data.nodes}
          allEdges={data.edges}
          onClose={() => setSelectedNodeId(null)}
          onNodeClick={focusNode}
          repoMeta={{ owner: data.meta.owner, repo: data.meta.repo, branch: data.meta.branch }}
          isMobile={isMobile}
          diffStatus={diffMode && diffData ? (diffData.nodeStatus[selectedNodeData.id] ?? 'unchanged') : undefined}
        />
      )}

      {/* Keyboard shortcut help button */}
      <button
        onClick={() => setShowShortcuts(true)}
        title="Keyboard shortcuts (?)"
        style={{
          position: 'absolute',
          bottom: isMobile ? 136 : 90,
          right: 16,
          zIndex: 10,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--fg-subtle)',
          fontWeight: 700,
          transition: 'all 0.15s',
        }}
        className="hover:border-[#388bfd] hover:text-[#388bfd]"
      >
        ?
      </button>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      {/* Highlight path mode indicator */}
      {highlightPathFrom && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            background: '#388bfd18',
            border: '1px solid #388bfd40',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12,
            color: '#388bfd',
            fontWeight: 600,
          }}
        >
          Showing reachable paths from selected node — click another node or Esc to cancel
        </div>
      )}
    </div>
  );
}

export function GraphCanvas({ data, diffMode, diffData }: GraphCanvasProps) {
  return (
    <GraphCanvasInner data={data} diffMode={diffMode} diffData={diffData} />
  );
}
