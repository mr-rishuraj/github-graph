import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { GraphNode } from '../types/index.js';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 90;

// Use Web Worker for large graphs to avoid blocking the main thread
const WORKER_THRESHOLD = 500;

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

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/dagreLayout.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent<{ positions: Record<string, { x: number; y: number }> }>) => {
      worker.terminate();
      const { positions } = e.data;
      resolve(nodes.map(n => {
        const pos = positions[n.id];
        return pos ? { ...n, position: pos } : n;
      }));
    };

    worker.onerror = (err) => {
      worker.terminate();
      // Fall back to synchronous layout
      console.warn('[layout] Worker failed, falling back to sync:', err.message);
      resolve(computeDagreLayout(nodes, edges, direction));
    };

    worker.postMessage({
      nodes: nodes.map(n => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
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

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target, {}, edge.id);
  }

  dagre.layout(g);

  return nodes.map(node => {
    const pos = g.node(node.id);
    if (!pos) return node;
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
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
