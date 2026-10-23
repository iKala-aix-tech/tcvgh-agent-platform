import { useCallback, useMemo } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge,
  applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange, type NodeProps,
} from "@xyflow/react";
import type { FlowEdge, FlowNode, NodeType } from "../types";

const KINDS: { type: NodeType; label: string }[] = [
  { type: "llm", label: "＋ LLM 步驟" },
  { type: "condition", label: "＋ 條件判斷" },
  { type: "tool", label: "＋ 連接器動作" },
  { type: "approval", label: "＋ 人工核准" },
  { type: "output", label: "＋ 回覆" },
];

function GenericNode({ data, type }: NodeProps) {
  const kind = String(type);
  return (
    <div className={`node ${kind}`}>
      {kind !== "input" && <Handle type="target" position={Position.Left} />}
      <div className="kind">{kind}</div>
      <div>{String((data as Record<string, unknown>).label ?? kind)}</div>
      {kind === "condition" ? (
        <>
          <Handle type="source" id="true" position={Position.Right} style={{ top: "35%" }} />
          <Handle type="source" id="false" position={Position.Right} style={{ top: "70%" }} />
          <div className="hint">true ↗ / false ↘</div>
        </>
      ) : kind !== "output" ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

interface Props {
  flow: { nodes: FlowNode[]; edges: FlowEdge[] };
  onChange: (flow: { nodes: FlowNode[]; edges: FlowEdge[] }) => void;
  onSelect: (n: FlowNode | null) => void;
}

/** Drag & drop canvas. Nodes/edges are stored exactly as the backend interpreter reads them. */
export default function Canvas({ flow, onChange, onSelect }: Props) {
  const nodeTypes = useMemo(() => Object.fromEntries(["input", "llm", "condition", "tool", "approval", "output"].map((t) => [t, GenericNode])), []);
  const nodes = flow.nodes as unknown as Node[];
  const edges = flow.edges as unknown as Edge[];

  const onNodesChange = useCallback((c: NodeChange[]) => onChange({ ...flow, nodes: applyNodeChanges(c, nodes) as unknown as FlowNode[] }), [flow, nodes, onChange]);
  const onEdgesChange = useCallback((c: EdgeChange[]) => onChange({ ...flow, edges: applyEdgeChanges(c, edges) as unknown as FlowEdge[] }), [flow, edges, onChange]);
  const onConnect = useCallback((c: Connection) => onChange({ ...flow, edges: addEdge({ ...c, id: `e-${c.source}-${c.target}-${c.sourceHandle ?? ""}` }, edges) as unknown as FlowEdge[] }), [flow, edges, onChange]);

  const add = (type: NodeType) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
    const node: FlowNode = { id, type, position: { x: 200 + Math.random() * 200, y: 80 + Math.random() * 240 }, data: { label: type } };
    onChange({ ...flow, nodes: [...flow.nodes, node] });
  };

  return (
    <>
      <div className="palette">{KINDS.map((k) => <button key={k.type} onClick={() => add(k.type)}>{k.label}</button>)}</div>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        onNodeClick={(_, n) => onSelect(n as unknown as FlowNode)} onPaneClick={() => onSelect(null)}
        fitView deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background gap={16} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </>
  );
}
