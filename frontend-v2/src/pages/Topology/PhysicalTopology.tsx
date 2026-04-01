import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from 'react';
import cytoscape from 'cytoscape';
// @ts-expect-error no types for cytoscape-dagre
import dagre from 'cytoscape-dagre';
import { useGetTopologyGraph, useSaveTopologyPositions } from '@/api/topology';
import { useGetVlans } from '@/api/vlans';
import { useGetTaxonomies } from '@/api/taxonomy';
import type { TopologyNode } from '@/api/topology';
import styles from './PhysicalTopology.module.css';

// Guard against HMR double-registration
if (!(cytoscape as unknown as { _dagreRegistered?: boolean })._dagreRegistered) {
  cytoscape.use(dagre);
  (cytoscape as unknown as { _dagreRegistered?: boolean })._dagreRegistered = true;
}

/* ─── helpers ─────────────────────────────────────────────────────────── */

function rankForNode(n: TopologyNode): number {
  if (n.isGateway) return 0;
  if (n.switchRole === 'core') return 1;
  if (n.switchRole === 'edge') return 2;
  if (n.switchRole === 'access') return 3;
  return 4;
}

function shapeForNode(n: TopologyNode): string {
  if (n.isGateway) return 'diamond';
  if (
    n.switchRole === 'core' ||
    n.switchRole === 'edge' ||
    n.switchRole === 'access'
  )
    return 'roundrectangle';
  return 'ellipse';
}

/* ─── public ref handle ───────────────────────────────────────────────── */

export interface PhysicalTopologyHandle {
  exportPng: () => Promise<Blob | null>;
  exportSvg: () => string | null;
  fit: () => void;
}

interface PhysicalTopologyProps {
  siteId: string;
  rackFilter: Set<string> | null;
  switchFilter: string | null;
  vlanFilter: Set<number> | null;
  onNodeClick?: (deviceId: string) => void;
}

const DEFAULT_EDGE_COLOR = '#3a4248';

const PhysicalTopology = forwardRef<
  PhysicalTopologyHandle,
  PhysicalTopologyProps
>(function PhysicalTopology(
  { siteId, rackFilter, switchFilter, vlanFilter, onNodeClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const { data: graph, isLoading } = useGetTopologyGraph(siteId);
  const { data: vlans } = useGetVlans(siteId);
  const { data: taxonomies } = useGetTaxonomies(siteId);
  const savePositions = useSaveTopologyPositions(siteId);

  // Build vlanId (uuid) -> { vlanNumber, color }
  const vlanLookup = useMemo(() => {
    const m = new Map<string, { vlanNumber: number; color: string }>();
    if (!vlans || !taxonomies) return m;
    for (const vlan of vlans) {
      const tax = taxonomies.find(
        (t) => t.category === 'vlan' && t.referenceId === vlan.id,
      );
      m.set(vlan.id, {
        vlanNumber: vlan.vlanId,
        color: tax?.colorHex ?? vlan.color ?? DEFAULT_EDGE_COLOR,
      });
    }
    return m;
  }, [vlans, taxonomies]);

  /* expose ref methods */
  useImperativeHandle(ref, () => ({
    fit() {
      cyRef.current?.fit(undefined, 40);
    },
    exportPng(): Promise<Blob | null> {
      const cy = cyRef.current;
      if (!cy) return Promise.resolve(null);
      const dataUrl: string = cy.png({ full: true, scale: 2 });
      return fetch(dataUrl).then((r) => r.blob());
    },
    exportSvg(): string | null {
      return null;
    },
  }));

  /* ── filter graph data ──────────────────────────────────────────── */
  const filtered = useMemo(() => {
    if (!graph) return null;

    let nodes = graph.nodes;
    let edges = graph.edges;

    // Rack filter: keep nodes in allowed racks + nodes without a rackId (switches, gateways)
    if (rackFilter !== null) {
      const allowed = rackFilter;
      const allowedNodeIds = new Set(
        nodes.filter((n) => !n.rackId || allowed.has(n.rackId)).map((n) => n.id),
      );
      // Keep edges where BOTH endpoints survived the rack filter
      edges = edges.filter(
        (e) => allowedNodeIds.has(e.source) && allowedNodeIds.has(e.target),
      );
      nodes = nodes.filter((n) => allowedNodeIds.has(n.id));
    }

    // Switch filter: keep only the selected switch + its direct neighbors
    if (switchFilter !== null) {
      const directEdges = edges.filter(
        (e) => e.source === switchFilter || e.target === switchFilter,
      );
      const neighborIds = new Set<string>();
      neighborIds.add(switchFilter);
      for (const e of directEdges) {
        neighborIds.add(e.source);
        neighborIds.add(e.target);
      }
      edges = directEdges;
      nodes = nodes.filter((n) => neighborIds.has(n.id));
    }

    // VLAN filter — hide edges whose vlan is not in the set
    if (vlanFilter !== null) {
      edges = edges.filter((e) => {
        if (!e.vlanId) return true;
        const info = vlanLookup.get(e.vlanId);
        if (!info) return true;
        return vlanFilter.has(info.vlanNumber);
      });
    }

    // After edge filtering, only keep nodes that still appear in edges
    const nodeIds = new Set<string>();
    for (const e of edges) {
      nodeIds.add(e.source);
      nodeIds.add(e.target);
    }
    nodes = nodes.filter((n) => nodeIds.has(n.id));

    return { nodes, edges, positions: graph.positions };
  }, [graph, rackFilter, switchFilter, vlanFilter, vlanLookup]);

  const hasNodes = filtered != null && filtered.nodes.length > 0;

  /* ── build / rebuild cytoscape ─────────────────────────────────── */
  useEffect(() => {
    // Cleanup previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    if (!hasNodes || !filtered || !containerRef.current) return;

    const { nodes, edges, positions } = filtered;
    const pinnedIds = new Set(Object.keys(positions));

    const cyNodes: cytoscape.ElementDefinition[] = nodes.map((n) => ({
      group: 'nodes' as const,
      data: {
        id: n.id,
        label: n.label,
        type: n.type,
        switchRole: n.switchRole,
        isGateway: n.isGateway,
        rank: rankForNode(n),
        shape: shapeForNode(n),
        highlighted: switchFilter === n.id,
      },
      ...(pinnedIds.has(n.id)
        ? { position: { x: positions[n.id].x, y: positions[n.id].y } }
        : {}),
    }));

    const cyEdges: cytoscape.ElementDefinition[] = edges.map((e) => {
      let edgeColor = DEFAULT_EDGE_COLOR;
      if (e.vlanId) {
        const info = vlanLookup.get(e.vlanId);
        if (info) edgeColor = info.color;
      }
      return {
        group: 'edges' as const,
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          cableType: e.cableType,
          label: e.label ?? '',
          edgeColor,
        },
      };
    });

    try {
      const cy = cytoscape({
        container: containerRef.current,
        elements: [...cyNodes, ...cyEdges],
        style: [
          {
            selector: 'node',
            style: {
              label: 'data(label)',
              shape: 'data(shape)' as unknown as cytoscape.Css.NodeShape,
              'background-color': '#1a1f24',
              'border-width': 2,
              'border-color': '#2a3038',
              color: '#d4d9dd',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': '11px',
              'font-family': 'Inter, system-ui, sans-serif',
              width: 120,
              height: 40,
              'text-wrap': 'ellipsis',
              'text-max-width': '100px',
              padding: '8px',
            },
          },
          {
            selector: 'node[?isGateway]',
            style: {
              'border-color': '#e2a662',
              'background-color': '#1f2228',
              width: 80,
              height: 80,
            },
          },
          {
            selector: 'node[switchRole="core"]',
            style: {
              'border-color': '#6ea8d9',
              width: 140,
              height: 48,
            },
          },
          {
            selector: 'node[switchRole="edge"]',
            style: {
              'border-color': '#7bc07b',
              width: 130,
              height: 44,
            },
          },
          {
            selector: 'node[switchRole="access"]',
            style: {
              'border-color': '#a882c4',
              width: 120,
              height: 40,
            },
          },
          {
            selector: 'node[?highlighted]',
            style: {
              'border-width': 3,
              'border-color': '#e2a662',
              'background-color': '#262c30',
            },
          },
          {
            selector: 'edge',
            style: {
              width: 2,
              'line-color': 'data(edgeColor)',
              'target-arrow-color': 'data(edgeColor)',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              label: 'data(label)',
              'font-size': '9px',
              color: '#5a6068',
              'text-background-opacity': 1,
              'text-background-color': '#141820',
              'text-background-padding': '2px',
              'font-family': 'Inter, system-ui, sans-serif',
            },
          },
          {
            selector: 'node:active',
            style: {
              'overlay-opacity': 0.08,
              'overlay-color': '#fff',
            },
          },
        ],
        layout:
          pinnedIds.size === nodes.length
            ? { name: 'preset' }
            : ({
                name: 'dagre',
                rankDir: 'TB',
                nodeSep: 50,
                rankSep: 120,
                edgeSep: 15,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                rank: (node: any) => node.data('rank'),
              } as unknown as cytoscape.LayoutOptions),
        minZoom: 0.15,
        maxZoom: 3,
      });

      cyRef.current = cy;

      cy.on('tap', 'node', (evt) => {
        const nodeId = evt.target.id();
        onNodeClick?.(nodeId);
      });

      cy.on('dragfree', 'node', (evt) => {
        const node = evt.target;
        const pos = node.position();
        savePositions.mutate({ [node.id()]: { x: pos.x, y: pos.y } });
      });

      cy.one('layoutstop', () => {
        cy.fit(undefined, 40);
      });
    } catch (err) {
      console.error('[PhysicalTopology] cytoscape init failed:', err);
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, switchFilter, vlanLookup]);

  /* ── render ─────────────────────────────────────────────────────── */
  return (
    <div className={styles.wrapper}>
      {/* Always render the canvas container so the ref is stable */}
      <div
        ref={containerRef}
        className={styles.canvas}
        style={{ display: hasNodes ? undefined : 'none' }}
      />
      {isLoading && (
        <div className={styles.loading}>Loading topology...</div>
      )}
      {!isLoading && !hasNodes && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>&#x2B21;</span>
          <span>No connected devices yet</span>
          <span style={{ fontSize: 11, color: '#444' }}>
            Create connections between devices to see the physical topology
          </span>
        </div>
      )}
    </div>
  );
});

export default PhysicalTopology;
