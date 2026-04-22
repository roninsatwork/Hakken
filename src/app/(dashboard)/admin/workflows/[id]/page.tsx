"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
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
  NodeTypes
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode } from "@/src/ui/components/workflows/AgentNode";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { AgentEditorModal } from "@/src/ui/components/workflows/AgentEditorModal";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowLeft, Bot, Play, Save, Loader2, Plus } from "lucide-react";
import { GenericNode } from "@/src/ui/components/workflows/GenericNode";
import { WorkflowSidebar } from "@/src/ui/components/workflows/WorkflowSidebar";
import { ConfigDrawer } from "@/src/ui/components/workflows/ConfigDrawer";

const nodeTypes: NodeTypes = {
  agentNode: AgentNode as any,
  triggerNode: GenericNode as any,
  actionNode: GenericNode as any,
  logicNode: GenericNode as any,
  codeNode: GenericNode as any,
  databaseNode: GenericNode as any,
  waitNode: GenericNode as any,
  approvalNode: GenericNode as any,
  iteratorNode: GenericNode as any,
  mergeNode: GenericNode as any,
  emailNode: GenericNode as any,
};

function FlowCanvasWithProvider({ workflow, isSaving, isRunning, handleSave, handleManualRun }: any) {
  const t = useTranslations('admin.workflows.designer');
  const deleteAgent = useMutation(api.agents.deleteAgent);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>(workflow.nodes !== "[]" ? JSON.parse(workflow.nodes) : []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>(workflow.edges !== "[]" ? JSON.parse(workflow.edges) : []);
  const [isManualRunModalOpen, setIsManualRunModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: any) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: any) => {
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

      const newNode = {
        id: `${type}-${Date.now()}`,
        type,
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
    (deletedNodes: any[]) => {
      deletedNodes.forEach((node) => {
        if (node.type === 'agentNode' && node.data?.isInline && node.data?._agentId) {
          deleteAgent({ id: node.data._agentId }).catch(console.error);
        }
      });
    },
    [deleteAgent]
  );

  const handleUpdateNodeData = (nodeId: string, newData: any) => {
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
           <button
              onClick={() => handleSave(nodes, edges)}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-1.5 rounded-[10px] text-[13px] bg-brand text-brand-foreground font-medium hover:bg-brand/90 transition-all shadow-xl shadow-brand/20 disabled:opacity-50"
           >
              <Save className="w-4 h-4" />
              <span>{isSaving ? t('header.saving') : t('header.saveGraph')}</span>
           </button>
           <button
              onClick={handleManualRun}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/20 disabled:opacity-50"
           >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>{isRunning ? t('header.dispatching' as any) : t('header.manualRun')}</span>
           </button>
        </div>
      </div>

      <div className="flex w-full flex-1 relative">
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
           <button
              onClick={() => {
                 setIsSidebarOpen(true);
                 setEditingNode(null);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-sidebar text-foreground font-medium hover:bg-foreground/5 transition-all shadow-xl border border-border-dim"
           >
              <Plus className="w-4 h-4" />
              <span>Node Library</span>
           </button>
        </div>

        {/* Manual Run Modal */}
        <SonaeModal
          isOpen={isManualRunModalOpen}
          onClose={() => setIsManualRunModalOpen(false)}
          title={t('runModal.title')}
        >
          <p className="text-secondary mb-6 text-[13px]">{t('runModal.description')}</p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsManualRunModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-md shadow-foreground/10 text-sm"
            >
              {t('runModal.acknowledge')}
            </button>
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
  const t = useTranslations('admin.workflows.designer');

  const workflow = useQuery((api as any).workflows.get, { id });
  const updateWorkflow = useMutation((api as any).workflows.updateWorkflow);
  const runWorkflow = useMutation((api as any).workflows.triggerManualRun);

  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const handleSave = async (nodes: any, edges: any) => {
    if (!workflow) return;
    setIsSaving(true);
    
    // Phase 5: Graph Validation (DFS Cycle Detection)
    const hasCycle = () => {
      const graph = new Map();
      nodes.forEach((n: any) => graph.set(n.id, []));
      edges.forEach((e: any) => {
        if (graph.has(e.source)) graph.get(e.source).push(e.target);
      });

      const visited = new Set();
      const recStack = new Set();

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
      alert("Cycle Detected: Infinite Loops are not supported.\n\nPlease use the Iterator (Loop) node for iteration instead of routing edges backwards.");
      setIsSaving(false);
      return;
    }

    try {
      const triggerNode = nodes.find((n: any) => n.type === 'triggerNode');
      const triggerType = triggerNode?.data?._triggerType || 'MANUAL';

      await updateWorkflow({
        id: workflow._id as any,
        triggerType: triggerType,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges)
      });
    } catch (e) {
      console.error(e);
      alert(t('alerts.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualRun = async () => {
    if (!workflow) return;
    setIsRunning(true);
    try {
      await runWorkflow({ id: workflow._id as any });
      setIsRunning(false);
    } catch (e) {
      console.error(e);
      alert(t('alerts.dispatchFailed' as any));
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
          handleSave={handleSave} 
          handleManualRun={handleManualRun} 
       />
    </ReactFlowProvider>
  );
}
