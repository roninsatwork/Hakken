"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  ReactFlow, 
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
import { ArrowLeft, Save, Plus, Play, Bot } from "lucide-react";
import Link from "next/link";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { AgentEditorModal } from "@/src/ui/components/workflows/AgentEditorModal";

const nodeTypes: NodeTypes = {
  agentNode: AgentNode as any,
};

export default function WorkflowCanvas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  
  const workflow = useQuery((api as any).workflows.get, { id });
  const allAgents = useQuery(api.agents.list) || [];
  
  const updateWorkflow = useMutation((api as any).workflows.updateWorkflow);
  const createInlineAgent = useMutation((api as any).agents.createInlineAgent);
  const deleteAgent = useMutation(api.agents.deleteAgent);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isAddNodeModalOpen, setIsAddNodeModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<any>(null);

  const onNodeDoubleClick = useCallback((event: any, node: any) => {
    if (node.type === 'agentNode') {
      setEditingNode(node);
    }
  }, []);

  const onNodesDelete = useCallback(
    (deletedNodes: any[]) => {
      deletedNodes.forEach((node) => {
        // Only delete the Agent from the DB if it is an isolated Sandbox Agent
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

  const handleCreateInlineAgent = async () => {
    if (!workflow) return;
    setIsAddNodeModalOpen(false);
    try {
      const newAgentId = await createInlineAgent({ workflowId: workflow._id as any });
      const newNode = {
        id: `agent-${newAgentId}-${Date.now()}`,
        type: 'agentNode',
        position: { x: 150 + Math.random() * 50, y: 150 + Math.random() * 50 },
        data: { 
          label: "Sandbox Agent",
          modelId: "gemini-3.1-flash-preview", 
          _agentId: newAgentId,
          isInline: true,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setEditingNode(newNode);
    } catch (e) {
      console.error(e);
      alert("Failed to initialize inline sandbox node");
    }
  };

  useEffect(() => {
    if (workflow && isInitializing) {
      if (workflow.nodes && workflow.nodes !== "[]") {
        try { setNodes(JSON.parse(workflow.nodes)); } catch(e){}
      }
      if (workflow.edges && workflow.edges !== "[]") {
        try { setEdges(JSON.parse(workflow.edges)); } catch(e){}
      }
      setIsInitializing(false);
    }
  }, [workflow, isInitializing, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const handleSave = async () => {
    if (!workflow) return;
    setIsSaving(true);
    try {
      await updateWorkflow({
        id: workflow._id as any,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges)
      });
    } catch(e) {
      console.error(e);
      alert("Failed to save workflow");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAgentNode = (agent: any) => {
    const newNode = {
      id: `agent-${agent._id}-${Date.now()}`,
      type: 'agentNode',
      position: { x: 150 + Math.random() * 50, y: 150 + Math.random() * 50 },
      data: { 
        label: agent.name, 
        avatar: agent.avatar,
        modelId: agent.modelId,
        inputSchema: agent.inputSchema,
        outputSchema: agent.outputSchema,
        _agentId: agent._id 
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setIsAddNodeModalOpen(false);
  };

  if (!workflow) return <div className="p-8 text-secondary">Loading canvas...</div>;

  return (
    <div className="flex flex-col h-full bg-background rounded-l-[32px] overflow-hidden -m-8 mr-0" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-dim bg-sidebar/50 backdrop-blur-3xl z-10">
        <div className="flex items-center gap-4">
          <Link href="/admin/workflows" className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{workflow.name}</h1>
            <span className="text-[11px] text-muted tracking-widest uppercase">{workflow.triggerType} TRIGGER</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsAddNodeModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-sidebar border border-border-dim text-foreground font-medium hover:bg-foreground/5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Agent</span>
          </button>
          
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-1.5 rounded-[10px] text-[13px] bg-brand text-brand-foreground font-medium hover:bg-brand/90 transition-all shadow-xl shadow-brand/20 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? "Saving..." : "Save Graph"}</span>
          </button>

          <div className="w-px h-6 bg-border-dim mx-1" />

          <button 
            onClick={() => alert("Manual run execution functionality will hook into the orchestrator agent.")}
            className="flex items-center gap-2 px-4 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/20"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Manual Run</span>
          </button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 w-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onNodeDoubleClick={onNodeDoubleClick}
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

      {/* Add Agent Modal */}
      <SonaeModal
        isOpen={isAddNodeModalOpen}
        onClose={() => setIsAddNodeModalOpen(false)}
        title="Add Agent to Workflow"
      >
        <p className="text-secondary mb-4 text-[13px]">Select an autonomous agent to perform tasks in this workflow.</p>
        
        <button
          type="button"
          onClick={handleCreateInlineAgent}
          className="w-full py-4 rounded-[12px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all flex items-center justify-center gap-2 shadow-xl shadow-foreground/20 text-[14px] mb-4"
        >
          <Bot className="w-5 h-5" />
          Create Custom Sandbox Agent
        </button>

        <div className="flex items-center gap-4 mb-4">
          <div className="h-px bg-border-dim flex-1" />
          <span className="text-[10px] uppercase tracking-widest text-muted">Or Choose Pre-built</span>
          <div className="h-px bg-border-dim flex-1" />
        </div>

        <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto custom-scrollbar">
          {allAgents.length === 0 ? (
            <div className="text-center py-6 text-muted text-[13px]">No agents available. Go to the Agents tab to create one.</div>
          ) : (
            allAgents.map((agent: any) => (
              <button
                key={agent._id}
                onClick={() => handleAddAgentNode(agent)}
                className="flex items-center gap-3 p-3 text-left rounded-[12px] border border-border-dim hover:border-brand/40 hover:bg-brand/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-card border border-border-dim flex items-center justify-center text-foreground shrink-0 overflow-hidden">
                  {agent.avatar ? (
                    <img src={agent.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Bot className="w-5 h-5 text-brand" />
                  )}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-medium text-[14px] text-foreground group-hover:text-brand transition-colors truncate">
                    {agent.name}
                  </span>
                  <span className="text-[11px] text-secondary truncate">
                    {agent.description || "No description"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </SonaeModal>

      <AgentEditorModal 
        node={editingNode} 
        onClose={() => setEditingNode(null)} 
        onUpdateNode={handleUpdateNodeData} 
      />
    </div>
  );
}
