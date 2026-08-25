"use client";

import { useCallback, useState, use } from "react";
import type { DragEvent } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  NodeProps,
  NodeTypes
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode, type AgentNodeType } from "@/src/ui/components/workflows/AgentNode";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/components/screens/Button";
import { AgentEditorModal } from "@/src/ui/components/workflows/AgentEditorModal";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowLeft, Play, Save, Loader2, Plus } from "lucide-react";
import { GenericNode } from "@/src/ui/components/workflows/GenericNode";
import { WorkflowSidebar } from "@/src/ui/components/workflows/WorkflowSidebar";
import { ConfigDrawer } from "@/src/ui/components/workflows/ConfigDrawer";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import type {
  UpdatableWorkflowNodeData,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowNodeType,
  WorkflowTriggerType,
} from "@/src/ui/components/workflows/types";

type WorkflowDoc = Doc<"workflows">;

type FlowCanvasWithProviderProps = {
  workflow: WorkflowDoc;
  isSaving: boolean;
  isRunning: boolean;
  feedbackMessage: string;
  handleSave: (nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[]) => Promise<void>;
  handleManualRun: () => Promise<void>;
};

function parseWorkflowNodesJson(serialized?: string): WorkflowCanvasNode[] {
  if (!serialized || serialized === "[]") return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? (parsed as WorkflowCanvasNode[]) : [];
  } catch {
    return [];
  }
}

function parseWorkflowEdgesJson(serialized?: string): WorkflowCanvasEdge[] {
  if (!serialized || serialized === "[]") return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? (parsed as WorkflowCanvasEdge[]) : [];
  } catch {
    return [];
  }
}

function GenericWorkflowNode({ data, type }: NodeProps<WorkflowCanvasNode>) {
  return <GenericNode data={data} type={(type || "actionNode") as WorkflowNodeType} />;
}

function AgentWorkflowNode(props: NodeProps<WorkflowCanvasNode>) {
  return <AgentNode {...(props as unknown as NodeProps<AgentNodeType>)} />;
}

const nodeTypes: NodeTypes = {
  agentNode: AgentWorkflowNode,
  triggerNode: GenericWorkflowNode,
  actionNode: GenericWorkflowNode,
  logicNode: GenericWorkflowNode,
  codeNode: GenericWorkflowNode,
  databaseNode: GenericWorkflowNode,
  waitNode: GenericWorkflowNode,
  approvalNode: GenericWorkflowNode,
  iteratorNode: GenericWorkflowNode,
  mergeNode: GenericWorkflowNode,
  emailNode: GenericWorkflowNode,
};

function FlowCanvasWithProvider({ workflow, isSaving, isRunning, feedbackMessage, handleSave, handleManualRun }: FlowCanvasWithProviderProps) {
  const t = useTranslations('admin.workflows.designer');
  const deleteAgent = useMutation(api.agents.deleteAgent);

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowCanvasNode>(parseWorkflowNodesJson(workflow.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowCanvasEdge>(parseWorkflowEdgesJson(workflow.edges));
  const [isManualRunModalOpen, setIsManualRunModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<WorkflowCanvasNode | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: WorkflowCanvasNode = {
        id: `${type}-${Date.now()}`,
        type: type as WorkflowNodeType,
        position,
        data: { label },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onNodesDelete = useCallback(
    (deletedNodes: WorkflowCanvasNode[]) => {
      deletedNodes.forEach((node) => {
        if (node.type === 'agentNode' && node.data?.isInline && node.data?._agentId) {
          deleteAgent({ id: node.data._agentId }).catch(console.error);
        }
      });
    },
    [deleteAgent]
  );

  const handleUpdateNodeData = (nodeId: string, newData: UpdatableWorkflowNodeData) => {
    setNodes(nds => nds.map(n => {
      if (n.id === nodeId) {
        return { ...n, data: newData };
      }
      return n;
    }));
  };

  return (
    <div className="flex flex-col h-full bg-background rounded-l-[32px] overflow-hidden -m-8 mr-0" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-dim bg-sidebar/50 backdrop-blur-3xl z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/admin/workflows" className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{workflow.name}</h1>
            <span className="text-[11px] text-muted tracking-widest uppercase">{t('header.trigger', { type: workflow.triggerType })}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
           <WriteButton
              onClick={() => handleSave(nodes, edges)}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-1.5 rounded-[10px] text-[13px] bg-brand text-brand-foreground font-medium hover:bg-brand/90 transition-all shadow-xl shadow-brand/20 disabled:opacity-50"
           >
              <Save className="w-4 h-4" />
              <span>{isSaving ? t('header.saving') : t('header.saveGraph')}</span>
           </WriteButton>
           <Button
              variant="primary"
              onClick={handleManualRun}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-1.5 text-[13px] shadow-foreground/20"
           >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>{isRunning ? t('header.dispatching') : t('header.manualRun')}</span>
           </Button>
        </div>
      </div>

	      <div className="flex w-full flex-1 relative">
          {feedbackMessage && (
            <div className="absolute top-4 left-1/2 z-20 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] font-medium text-red-400 backdrop-blur-xl">
              {feedbackMessage}
            </div>
          )}
	        <div className="flex-1 h-full w-full custom-react-flow react-flow-wrapper" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodesDelete={onNodesDelete}
            onNodeDoubleClick={(_, node) => {
              setEditingNode(node);
              setIsSidebarOpen(false);
            }}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
            className="bg-background"
          >
            <Background gap={24} size={2} color="#ffffff10" />
            <Controls className="!bg-card !border-border-dim !fill-foreground [&>button]:!border-border-dim [&>button]:hover:!bg-foreground/5" />
          </ReactFlow>
        </div>

        <WorkflowSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        {/* Floating Library Toggle Button right */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
           <Button
              variant="quiet"
              onClick={() => {
                 setIsSidebarOpen(true);
                 setEditingNode(null);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-sidebar text-foreground hover:bg-foreground/5 shadow-xl"
           >
              <Plus className="w-4 h-4" />
              <span>{t('library.title')}</span>
           </Button>
        </div>

        {/* Manual Run Modal */}
        <SonaeModal
          isOpen={isManualRunModalOpen}
          onClose={() => setIsManualRunModalOpen(false)}
          title={t('runModal.title')}
        >
          <p className="text-secondary mb-6 text-[13px]">{t('runModal.description')}</p>
          <div className="flex justify-end gap-3">
            <Button
              variant="primary"
              onClick={() => setIsManualRunModalOpen(false)}
              className="px-5 shadow-md"
            >
              {t('runModal.acknowledge')}
            </Button>
          </div>
        </SonaeModal>

        {editingNode?.type === 'agentNode' ? (
          <AgentEditorModal
            node={editingNode}
            allNodes={nodes}
            edges={edges}
            onClose={() => setEditingNode(null)}
            onUpdateNode={handleUpdateNodeData}
          />
        ) : (
          <ConfigDrawer
            node={editingNode}
            allNodes={nodes}
            edges={edges}
            onClose={() => setEditingNode(null)}
            onUpdateNode={handleUpdateNodeData}
          />
        )}
      </div>
    </div>
  );
}

export default function WorkflowCanvas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const workflowId = id as Id<"workflows">;
  const t = useTranslations('admin.workflows.designer');

  const workflow = useQuery(api.workflows.get, { id: workflowId });
  const updateWorkflow = useMutation(api.workflows.updateWorkflow);
  const runWorkflow = useMutation(api.workflows.triggerManualRun);

  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const handleSave = async (nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[]) => {
	    if (!workflow) return;
	    setIsSaving(true);
    setFeedbackMessage("");
    
    // Phase 5: Graph Validation (DFS Cycle Detection)
    const hasCycle = () => {
      const graph = new Map<string, string[]>();
      nodes.forEach((n) => graph.set(n.id, []));
      edges.forEach((e) => {
        graph.get(e.source)?.push(e.target);
      });

      const visited = new Set<string>();
      const recStack = new Set<string>();

      const isCyclic = (nodeId: string) => {
        if (recStack.has(nodeId)) return true;
        if (visited.has(nodeId)) return false;

        visited.add(nodeId);
        recStack.add(nodeId);

        const children = graph.get(nodeId) || [];
        for (const childId of children) {
          if (isCyclic(childId)) return true;
        }

        recStack.delete(nodeId);
        return false;
      };

      for (const node of nodes) {
        if (isCyclic(node.id)) return true;
      }
      return false;
    };

	    if (hasCycle()) {
	      setFeedbackMessage("Cycle Detected: Infinite loops are not supported. Please use the Iterator (Loop) node for iteration instead of routing edges backwards.");
	      setIsSaving(false);
	      return;
    }

    try {
      const triggerNode = nodes.find((n) => n.type === 'triggerNode');
      const triggerType: WorkflowTriggerType = triggerNode?.data?._triggerType || 'MANUAL';

      await updateWorkflow({
        id: workflow._id,
        triggerType,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges)
      });
	    } catch (e) {
	      console.error(e);
	      setFeedbackMessage(t('alerts.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualRun = async () => {
	    if (!workflow) return;
	    setIsRunning(true);
    setFeedbackMessage("");
    try {
      await runWorkflow({ id: workflow._id });
      setIsRunning(false);
	    } catch (e) {
	      console.error(e);
	      setFeedbackMessage(t('alerts.dispatchFailed'));
	      setIsRunning(false);
    }
  };

  if (!workflow) return <div className="p-8 text-secondary">{t('loading')}</div>;

  return (
    <ReactFlowProvider>
       <FlowCanvasWithProvider 
          workflow={workflow} 
	          isSaving={isSaving}
	          isRunning={isRunning}
            feedbackMessage={feedbackMessage}
	          handleSave={handleSave}
          handleManualRun={handleManualRun} 
       />
    </ReactFlowProvider>
  );
}
