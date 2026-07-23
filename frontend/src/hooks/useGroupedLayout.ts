import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { GraphNode } from '../types/index.js';
import { graphEdgesToFlowEdges } from './useGraphLayout.js';

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xfffffff;
  }
  return hash % 360;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function folderColor(folder: string): string {
  return hslToHex(stringToHue(folder), 70, 55);
}

type EdgeInput = { id: string; source: string; target: string; relation: string; specifiers: string[] };

export function buildGroupedLayout(
  filteredNodes: GraphNode[],
  filteredEdges: EdgeInput[],
  hiddenFolders: Set<string>
): { flowNodes: Node[]; flowEdges: Edge[] } {
  void hiddenFolders; // already pre-filtered before calling

  const folderMap = new Map<string, GraphNode[]>();
  for (const n of filteredNodes) {
    const folder = n.folder || '';
    if (!folderMap.has(folder)) folderMap.set(folder, []);
    folderMap.get(folder)!.push(n);
  }

  const groupFolders = [...folderMap.entries()].filter(
    ([f, ns]) => ns.length >= 2 && f !== '' && !hiddenFolders.has(f)
  );
  const groupedFolderSet = new Set(groupFolders.map(([f]) => f));

  const FOLDER_NODE_W = 320;
  const FOLDER_NODE_H = 200;
  const FILE_W = 220;
  const FILE_H = 90;
  const FILE_PAD = 20;

  // Layout files within each group (simple grid)
  const folderLayouts = new Map<string, { x: number; y: number }[]>();
  for (const [folder, nodes] of groupFolders) {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    folderLayouts.set(
      folder,
      nodes.map((_, i) => ({
        x: (i % cols) * (FILE_W + FILE_PAD) + FILE_PAD,
        y: Math.floor(i / cols) * (FILE_H + FILE_PAD) + 36 + FILE_PAD,
      }))
    );
  }

  // Compute folder group sizes
  const folderSizes = new Map<string, { w: number; h: number }>();
  for (const [folder, nodes] of groupFolders) {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / cols);
    folderSizes.set(folder, {
      w: cols * (FILE_W + FILE_PAD) + FILE_PAD * 2,
      h: rows * (FILE_H + FILE_PAD) + 50 + FILE_PAD * 2,
    });
  }

  // Top-level dagre graph — folders as super-nodes
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });

  const getSuperNodeId = (n: GraphNode): string =>
    groupedFolderSet.has(n.folder) ? `folder:${n.folder}` : n.id;

  const superNodeIds = new Set<string>();
  for (const n of filteredNodes) {
    const sid = getSuperNodeId(n);
    if (!superNodeIds.has(sid)) {
      superNodeIds.add(sid);
      if (sid.startsWith('folder:')) {
        const size = folderSizes.get(sid.slice(7)) ?? { w: FOLDER_NODE_W, h: FOLDER_NODE_H };
        g.setNode(sid, { width: size.w, height: size.h });
      } else {
        g.setNode(sid, { width: FILE_W, height: FILE_H });
      }
    }
  }

  const superEdgeSet = new Set<string>();
  for (const e of filteredEdges) {
    const srcNode = filteredNodes.find(n => n.id === e.source);
    const tgtNode = filteredNodes.find(n => n.id === e.target);
    if (!srcNode || !tgtNode) continue;
    const src = getSuperNodeId(srcNode);
    const tgt = getSuperNodeId(tgtNode);
    if (src === tgt) continue;
    const key = `${src}-->${tgt}`;
    if (!superEdgeSet.has(key)) {
      superEdgeSet.add(key);
      g.setEdge(src, tgt, {}, key);
    }
  }

  dagre.layout(g);

  const flowNodes: Node[] = [];

  for (const [folder, nodes] of groupFolders) {
    const sid = `folder:${folder}`;
    const pos = g.node(sid);
    if (!pos) continue;
    const size = folderSizes.get(folder) ?? { w: FOLDER_NODE_W, h: FOLDER_NODE_H };
    const color = folderColor(folder);

    flowNodes.push({
      id: sid,
      type: 'group',
      position: { x: pos.x - size.w / 2, y: pos.y - size.h / 2 },
      style: { width: size.w, height: size.h },
      data: { label: folder, folderPath: folder, fileCount: nodes.length, color } as Record<string, unknown>,
    });

    const layouts = folderLayouts.get(folder) ?? [];
    nodes.forEach((n, i) => {
      const lpos = layouts[i] ?? { x: 0, y: 36 };
      flowNodes.push({
        id: n.id,
        type: 'fileNode',
        parentId: sid,
        extent: 'parent' as const,
        position: { x: lpos.x, y: lpos.y },
        data: n as unknown as Record<string, unknown>,
      });
    });
  }

  for (const n of filteredNodes) {
    if (groupedFolderSet.has(n.folder)) continue;
    const pos = g.node(n.id);
    if (!pos) continue;
    flowNodes.push({
      id: n.id,
      type: 'fileNode',
      position: { x: pos.x - FILE_W / 2, y: pos.y - FILE_H / 2 },
      data: n as unknown as Record<string, unknown>,
    });
  }

  return { flowNodes, flowEdges: graphEdgesToFlowEdges(filteredEdges) };
}

export async function buildGroupedLayoutAsync(
  filteredNodes: GraphNode[],
  filteredEdges: EdgeInput[],
  hiddenFolders: Set<string>
): Promise<{ flowNodes: Node[]; flowEdges: Edge[] }> {
  // For small graphs, run synchronously
  if (filteredNodes.length < 300) {
    return buildGroupedLayout(filteredNodes, filteredEdges, hiddenFolders);
  }
  // For large graphs, use the async dagre worker for the outer layout
  // The inner per-folder grid layouts are fast and stay synchronous
  // Just wrap in a Promise to yield the thread briefly
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(buildGroupedLayout(filteredNodes, filteredEdges, hiddenFolders));
    }, 0);
  });
}
