import type { GraphData, GraphNode, GraphEdge, DiffGraphData, DiffStatus } from '../types/index.js';

function hasNodeChanged(a: GraphNode, b: GraphNode): boolean {
  const importsA = new Set(a.imports.map(i => i.source));
  const importsB = new Set(b.imports.map(i => i.source));
  const exportsA = new Set(a.exports.map(e => e.name));
  const exportsB = new Set(b.exports.map(e => e.name));
  if (importsA.size !== importsB.size || exportsA.size !== exportsB.size) return true;
  for (const s of importsA) if (!importsB.has(s)) return true;
  for (const e of exportsA) if (!exportsB.has(e)) return true;
  return false;
}

function stableEdgeKey(edge: GraphEdge, pathById: Map<string, string>): string {
  const src = pathById.get(edge.source) ?? edge.source;
  const tgt = pathById.get(edge.target) ?? edge.target;
  return `${src}→${tgt}:${edge.relation}`;
}

export function computeDiff(graphA: GraphData, graphB: GraphData): DiffGraphData {
  const pathByIdA = new Map(graphA.nodes.map(n => [n.id, n.path]));
  const pathByIdB = new Map(graphB.nodes.map(n => [n.id, n.path]));

  const nodeByPathA = new Map(graphA.nodes.map(n => [n.path, n]));
  const nodeByPathB = new Map(graphB.nodes.map(n => [n.path, n]));

  const nodeStatus: Record<string, DiffStatus> = {};
  let added = 0, removed = 0, changed = 0, unchanged = 0;

  // branchB nodes
  for (const nodeB of graphB.nodes) {
    const nodeA = nodeByPathA.get(nodeB.path);
    if (!nodeA) { nodeStatus[nodeB.id] = 'added'; added++; }
    else if (hasNodeChanged(nodeA, nodeB)) { nodeStatus[nodeB.id] = 'changed'; changed++; }
    else { nodeStatus[nodeB.id] = 'unchanged'; unchanged++; }
  }

  // removed nodes (only in branchA)
  const removedNodes: GraphNode[] = [];
  for (const nodeA of graphA.nodes) {
    if (!nodeByPathB.has(nodeA.path)) {
      nodeStatus[nodeA.id] = 'removed';
      removedNodes.push(nodeA);
      removed++;
    }
  }

  // Edge diff
  const edgeKeysA = new Map(graphA.edges.map(e => [stableEdgeKey(e, pathByIdA), e.id]));
  const edgeKeysB = new Map(graphB.edges.map(e => [stableEdgeKey(e, pathByIdB), e.id]));

  const edgeStatus: Record<string, DiffStatus> = {};
  for (const e of graphB.edges) {
    const key = stableEdgeKey(e, pathByIdB);
    edgeStatus[e.id] = edgeKeysA.has(key) ? 'unchanged' : 'added';
  }

  const removedEdges: GraphEdge[] = [];
  for (const e of graphA.edges) {
    const key = stableEdgeKey(e, pathByIdA);
    if (!edgeKeysB.has(key)) {
      edgeStatus[e.id] = 'removed';
      removedEdges.push(e);
    }
  }

  return {
    ...graphB,
    nodes: [...graphB.nodes, ...removedNodes],
    edges: [...graphB.edges, ...removedEdges],
    diff: {
      nodeStatus,
      edgeStatus,
      removedNodes,
      removedEdges,
      meta: {
        branchA: graphA.meta.branch,
        branchB: graphB.meta.branch,
        added, removed, changed, unchanged,
      },
    },
  };
}
