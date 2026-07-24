import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { GraphNode } from '../types/index.js';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 90;
const GRID_GAP_X = 36;
const GRID_GAP_Y = 36;

// Use Web Worker for large graphs to avoid blocking the main thread
const WORKER_THRESHOLD = 500;

/** Place nodes in an adaptive grid starting at `offsetY`. */
function gridLayout(nodes: Node[], offsetY: number, graphWidth: number): Node[] {
  if (nodes.length === 0) return [];
  // Fit as many columns as the connected graph is wide (min 3, max 8)
  const cols = Math.min(
    Math.max(3, Math.round(graphWidth / (NODE_WIDTH + GRID_GAP_X))),
    8
  );
  return nodes.map((n, i) => ({
    ...n,
    position: {
      x: 40 + (i % cols) * (NODE_WIDTH + GRID_GAP_X),
      y: offsetY + Math.floor(i / cols) * (NODE_HEIGHT + GRID_GAP_Y),
    },
  }));
}

/** Split nodes into those referenced by at least one edge vs. true orphans. */
function splitNodes(nodes: Node[], edges: Edge[]): { connected: Node[]; orphans: Node[] } {
  const touched = new Set<string>();
  for (const e of edges) {
    touched.add(e.source);
    touched.add(e.target);
  }
  const connected = nodes.filter(n => touched.has(n.id));
  const orphans   = nodes.filter(n => !touched.has(n.id));
  return { connected, orphans };
}

export async function computeDagreLayoutAsync(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): Promise<Node[]> {
  if (nodes.length === 0) return nodes;

  // Small graphs: run synchronously (faster, avoids worker overhead)
  if (nodes.length < WORKER_THRESHOLD) {
    return computeDagreLayout(nodes, edges, direction);
  }

  const { connected, orphans } = splitNodes(nodes, edges);

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/dagreLayout.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent<{ positions: Record<string, { x: number; y: number }>; bounds: { maxY: number; width: number } }>) => {
      worker.terminate();
      const { positions, bounds } = e.data;

      const laidOutConnected = connected.map(n => {
        const pos = positions[n.id];
        return pos ? { ...n, position: pos } : n;
      });

      const gridOffsetY = bounds.maxY + (orphans.length > 0 ? 80 : 0);
      const laidOutOrphans = gridLayout(orphans, gridOffsetY, bounds.width);

      resolve([...laidOutConnected, ...laidOutOrphans]);
    };

    worker.onerror = (err) => {
      worker.terminate();
      console.warn('[layout] Worker failed, falling back to sync:', err.message);
      resolve(computeDagreLayout(nodes, edges, direction));
    };

    worker.postMessage({
      nodes: connected.map(n => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
      direction,
    });
  });
}

export function computeDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): Node[] {
  if (nodes.length === 0) return nodes;

  const { connected, orphans } = splitNodes(nodes, edges);

  let laidOutConnected: Node[] = connected;
  let maxY = 0;
  let graphWidth = 800;

  if (connected.length > 0) {
    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: direction,
      nodesep: 60,
      ranksep: 100,
      edgesep: 20,
      marginx: 40,
      marginy: 40,
      ranker: 'network-simplex',
    });

    for (const node of connected) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target, {}, edge.id);
    }

    dagre.layout(g);

    laidOutConnected = connected.map(node => {
      const pos = g.node(node.id);
      if (!pos) return node;
      const x = pos.x - NODE_WIDTH / 2;
      const y = pos.y - NODE_HEIGHT / 2;
      if (y + NODE_HEIGHT > maxY) maxY = y + NODE_HEIGHT;
      if (x + NODE_WIDTH > graphWidth) graphWidth = x + NODE_WIDTH;
      return { ...node, position: { x, y } };
    });
  }

  const gridOffsetY = maxY + (orphans.length > 0 ? 80 : 0);
  const laidOutOrphans = gridLayout(orphans, gridOffsetY, graphWidth);

  return [...laidOutConnected, ...laidOutOrphans];
}

export function graphNodesToFlowNodes(graphNodes: GraphNode[]): Node[] {
  return graphNodes.map(n => ({
    id: n.id,
    type: 'fileNode',
    position: { x: 0, y: 0 },
    data: n as unknown as Record<string, unknown>,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));
}

const EDGE_STYLE: Record<string, { stroke: string; dash?: string }> = {
  'imports':        { stroke: 'var(--border)' },
  'dynamic-import': { stroke: '#f59e0b' },
  're-exports':     { stroke: 'var(--accent)', dash: '4 2' },
};

export function graphEdgesToFlowEdges(graphEdges: Array<{ id: string; source: string; target: string; relation: string; specifiers: string[] }>): Edge[] {
  return graphEdges.map(e => {
    const style = EDGE_STYLE[e.relation] ?? EDGE_STYLE['imports'];
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: e.relation === 'dynamic-import',
      data: { relation: e.relation, specifiers: e.specifiers },
      style: {
        stroke: style.stroke,
        strokeWidth: 1.5,
        strokeDasharray: style.dash,
      },
      markerEnd: {
        type: 'arrowclosed' as const,
        color: style.stroke,
      },
    };
  });
}
