import dagre from '@dagrejs/dagre';

interface WorkerNode { id: string; width: number; height: number; }
interface WorkerEdge { id: string; source: string; target: string; }
interface WorkerInput {
  nodes: WorkerNode[];
  edges: WorkerEdge[];
  direction: 'TB' | 'LR';
}
interface WorkerOutput {
  positions: Record<string, { x: number; y: number }>;
}

self.addEventListener('message', (e: MessageEvent<WorkerInput>) => {
  const { nodes, edges, direction } = e.data;

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100, edgesep: 20, marginx: 40, marginy: 40, ranker: 'network-simplex' });

  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  for (const e of edges) g.setEdge(e.source, e.target, {}, e.id);

  dagre.layout(g);

  const positions: WorkerOutput['positions'] = {};
  for (const n of nodes) {
    const pos = g.node(n.id);
    if (pos) positions[n.id] = { x: pos.x - n.width / 2, y: pos.y - n.height / 2 };
  }

  self.postMessage({ positions } satisfies WorkerOutput);
});
