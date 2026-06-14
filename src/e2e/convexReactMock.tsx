"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { getFunctionName } from "convex/server";

type E2ERole = "super-admin" | "company-admin" | "user";
type FunctionReference = Parameters<typeof getFunctionName>[0];

const now = 1_717_200_000_000;
const companyId = "company_e2e";
const superAdminId = "user_e2e_super_admin";
const userId = "user_e2e";

const settings = {
  platformName: "Sonae E2E",
  brandColorHex: "#8b5cf6",
  headingFontFamily: "Inter",
  bodyFontFamily: "Inter",
  fontSizeBase: "100%",
  borderRadius: "12px",
};

const companyFixture = {
  _id: companyId,
  _creationTime: now,
  name: "E2E Company",
  description: "Deterministic company workspace for e2e coverage.",
  systemPrompt: "Keep responses tenant-safe for E2E Company.",
  createdAt: now,
  updatedAt: now,
};

const models = Array.from({ length: 18 }, (_, index) => ({
  _id: `model_e2e_${index + 1}`,
  _creationTime: now + index,
  modelId: index === 0 ? "e2e-primary-model" : `e2e-model-${index + 1}`,
  displayName: index === 0 ? "E2E Primary Model" : `E2E Model ${index + 1}`,
  isDefault: index === 0,
  isEnabled: index < 16,
  providerKey: "google",
  providerModelId: index === 0 ? "e2e-primary-model" : `e2e-model-${index + 1}`,
  inputTokenCostGBP: 0.000001,
  outputTokenCostGBP: 0.000003,
}));

const modelProviders = [
  {
    _id: "provider_google",
    _creationTime: now,
    providerKey: "google",
    displayName: "Google Vertex AI",
    isEnabled: true,
  },
];

const inviteTemplateFixture = {
  _id: "invite_template_e2e",
  _creationTime: now,
  subject: "Join E2E Company on Sonae",
  headline: "Your workspace is ready",
  body: "Use this invitation to join the deterministic E2E workspace.",
  ctaText: "Join Workspace",
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const modelDefaultUseCases = [
  "chat",
  "fast-chat",
  "reasoning",
  "agent",
  "workflow",
  "report",
  "router",
  "title",
  "transcription",
  "embedding",
];

const workflowId = "workflow_e2e";
const createdWorkflowId = "workflow_e2e_created";
const widgetId = "widget_e2e";
const movementId = "movement_e2e_roll_down";

const rules = [
  {
    _id: "rule_e2e_global",
    _creationTime: now,
    name: "Global Safety Rule",
    trigger: "Every prompt",
    content: "Keep responses tenant-safe.",
    priority: 10,
    isActive: true,
    scope: "GLOBAL",
    createdAt: now,
  },
];

const analytics = {
  aggregates: {
    aggregationType: "day",
    activeUsers: 4,
    mau: 4,
    mrr: 2400,
    totalCostGBP: 12.34567,
    totalInputTokens: 12000,
    totalMessages: 42,
    totalOutputTokens: 9000,
    totalTokens: 21000,
  },
  modelDistribution: [{ name: "E2E Primary Model", value: 42, cost: 12.34 }],
  planDistribution: [{ planId: "plan_pro_e2e", name: "Pro", companies: 2, mrr: 2400 }],
  systemIntegrity: { totalProvisionedCompanies: 2 },
  timeline: [
    { date: "2026-06-01", cost: 6.12, messages: 21, tokens: 10000 },
    { date: "2026-06-02", cost: 6.22, messages: 21, tokens: 11000 },
  ],
  topAgents: [{ id: "agent_e2e", name: "E2E Assistant", cost: 4.2, messages: 12 }],
  topCompanies: [{ id: companyId, name: "E2E Company", cost: 8.1, messages: 24 }],
  topUsers: [{ id: userId, name: "E2E User", email: "user.e2e@example.com", cost: 2.1, messages: 6 }],
};

const movementFrames = Array.from({ length: 2 }, (_, frameIndex) => ({
  timestamp: frameIndex * 33,
  landmarks: Array.from({ length: 33 }, (_, landmarkIndex) => ({
    x: 0.2 + (landmarkIndex % 8) * 0.08,
    y: 0.18 + Math.floor(landmarkIndex / 8) * 0.16,
    z: frameIndex * 0.01,
    visibility: 0.95,
  })),
  worldLandmarks: Array.from({ length: 33 }, (_, landmarkIndex) => ({
    x: (landmarkIndex % 8) * 0.04,
    y: Math.floor(landmarkIndex / 8) * 0.05,
    z: frameIndex * 0.01,
    visibility: 0.95,
  })),
}));

const movementFixture = {
  _id: movementId,
  _creationTime: now,
  title: "E2E Roll Down",
  difficulty: "Beginner",
  poseData: JSON.stringify({
    schemaVersion: 1,
    capturedAt: now,
    fps: 30,
    frames: movementFrames,
  }),
  poseDataFormat: "storage-json-v1",
  frameCount: movementFrames.length,
  durationMs: 67,
  captureFps: 30,
  schemaVersion: 1,
  createdAt: now,
  updatedAt: now,
};

function workflowFixture(id = workflowId, name = "E2E Workflow") {
  return {
    _id: id,
    _creationTime: now,
    companyId,
    name,
    description: "Route smoke workflow",
    triggerType: "MANUAL",
    isActive: true,
    nodes: JSON.stringify([
      {
        id: "trigger-node",
        type: "triggerNode",
        position: { x: 120, y: 120 },
        data: { label: "Manual Trigger", _triggerType: "MANUAL" },
      },
    ]),
    edges: "[]",
    createdAt: now,
    updatedAt: now,
  };
}

function getCookie(name: string) {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

function getRole(): E2ERole | null {
  const role = getCookie("sonae_e2e_auth");
  if (role === "super-admin" || role === "company-admin" || role === "user") return role;
  return null;
}

function getCurrentUser() {
  const role = getRole();
  if (!role) return null;

  if (role === "super-admin") {
    return {
      _id: superAdminId,
      _creationTime: now,
      email: "super.e2e@example.com",
      name: "E2E Super Admin",
      role: "SUPER_ADMIN",
      createdAt: now,
    };
  }

  return {
    _id: userId,
    _creationTime: now,
    companyId,
    email: role === "company-admin" ? "admin.e2e@example.com" : "user.e2e@example.com",
    name: role === "company-admin" ? "E2E Company Admin" : "E2E User",
    phone: "+1555010000",
    role: role === "company-admin" ? "ADMIN" : "USER",
    createdAt: now,
  };
}

function pageData<T>(data: T[], page = 1, pageSize = 15) {
  const start = (page - 1) * pageSize;
  return {
    data: data.slice(start, start + pageSize),
    page,
    pageSize,
    totalCount: data.length,
    totalPages: Math.max(1, Math.ceil(data.length / pageSize)),
  };
}

function readThreadMessages(threadId: string) {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(`sonae:e2e:thread:${threadId}`);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeThreadMessages(threadId: string, content: string) {
  if (typeof window === "undefined") return;
  const messages = [
    {
      _id: `${threadId}_user`,
      _creationTime: now,
      content,
      createdAt: now,
      role: "user",
      threadId,
    },
    {
      _id: `${threadId}_assistant`,
      _creationTime: now + 1,
      content: "E2E assistant response ready.",
      createdAt: now + 1,
      role: "assistant",
      threadId,
    },
  ];
  window.localStorage.setItem(`sonae:e2e:thread:${threadId}`, JSON.stringify(messages));
}

function functionPath(functionReference: FunctionReference) {
  try {
    return getFunctionName(functionReference);
  } catch {
    return "";
  }
}

function subscribeToHydration(onStoreChange: () => void) {
  queueMicrotask(onStoreChange);
  return () => {};
}

function getHydratedClientSnapshot() {
  return true;
}

function getHydratedServerSnapshot() {
  return false;
}

function useHasHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    getHydratedClientSnapshot,
    getHydratedServerSnapshot,
  );
}

export class ConvexReactClient {
  constructor(url: string) {
    void url;
  }
}

export function ConvexProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function ConvexProviderWithAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useQuery(functionReference: FunctionReference, args?: unknown): unknown {
  const path = functionPath(functionReference);
  const queryArgs = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const hasHydrated = useHasHydrated();

  if (path === "users:getMe") return hasHydrated ? getCurrentUser() : undefined;
  if (path === "settings:get") return settings;
  if (path === "system:getAnalyticsId") return null;
  if (path === "aiModels:getModels") return models;
  if (path === "aiModels:getActiveModels") {
    const useCase = typeof queryArgs.useCase === "string" ? queryArgs.useCase : undefined;
    return models.filter((model) => {
      if (!model.isEnabled) return false;
      if (!useCase || !("supportedUseCases" in model) || !Array.isArray(model.supportedUseCases)) return true;
      return model.supportedUseCases.includes(useCase);
    });
  }
  if (path === "aiModels:getProviders") return modelProviders;
  if (path === "aiModels:getOffsetPaginatedModels") {
    const searchTerm = String(queryArgs.searchTerm || "").toLowerCase();
    const statusFilter = queryArgs.statusFilter;
    const providerFilter = String(queryArgs.providerFilter || "all");
    const filtered = models.filter((model) => {
      const matchesSearch = !searchTerm || model.displayName.toLowerCase().includes(searchTerm) || model.modelId.includes(searchTerm);
      const matchesStatus =
        statusFilter === "active" ? model.isEnabled : statusFilter === "inactive" ? !model.isEnabled : true;
      const matchesProvider = providerFilter === "all" || model.providerKey === providerFilter;
      return matchesSearch && matchesStatus && matchesProvider;
    });
    return pageData(filtered, Number(queryArgs.page || 1), Number(queryArgs.pageSize || 15));
  }
  if (path === "aiRules:getOffsetPaginatedRules") {
    const searchTerm = String(queryArgs.searchTerm || "").toLowerCase();
    const filtered = searchTerm ? rules.filter((rule) => rule.name.toLowerCase().includes(searchTerm)) : rules;
    return pageData(filtered, Number(queryArgs.page || 1), Number(queryArgs.pageSize || 15));
  }
  if (path === "invites:getActiveTemplate") return inviteTemplateFixture;
  if (path === "invites:getInvitesByCompany") return [];
  if (path === "aiTools:getTools") {
    return [
      {
        _id: "tool_e2e",
        _creationTime: now,
        name: "Rightmove Connector",
        description: "Property search connector",
        handlerMapping: "rightmove.search",
        requiredRole: "ADMIN",
        inputSchema: '{"type":"object","properties":{}}',
        sideEffectLevel: "READ",
        confirmationRequired: false,
        isActive: true,
        provider: "apify",
      },
    ];
  }
  if (path === "companies:getCompanies") {
    return [{ ...companyFixture, userCount: 2 }];
  }
  if (path === "companies:getCompanyById") {
    return queryArgs.id === companyId ? companyFixture : null;
  }
  if (path === "companies:getCompanyOptions") {
    return [{ _id: companyId, name: companyFixture.name }];
  }
  if (path === "aiModels:getCompanyModelDefaults") {
    const primaryModel = models[0];

    return {
      companyId,
      useCases: modelDefaultUseCases,
      defaults: modelDefaultUseCases.map((useCase) => ({
        useCase,
        companyDefault: null,
        globalDefault: {
          _id: `default_${useCase}`,
          modelId: primaryModel.modelId,
          providerKey: primaryModel.providerKey,
          fallbackModelId: undefined,
          updatedAt: now,
          model: {
            modelId: primaryModel.modelId,
            providerKey: primaryModel.providerKey,
            providerModelId: primaryModel.providerModelId,
            displayName: primaryModel.displayName,
            isEnabled: primaryModel.isEnabled,
          },
        },
      })),
    };
  }
  if (path === "widgets:getWidgetsByCompany") {
    return [
      {
        _id: widgetId,
        _creationTime: now,
        companyId,
        name: "E2E Website Bot",
        isActive: true,
        isGlobal: false,
        allowedDomains: ["example.com"],
        themeGreeting: "Welcome to the E2E widget.",
        themePrimaryColor: "#2563eb",
        themeLogoUrl: "",
        themePlaceholder: "Ask the E2E assistant...",
        enableSounds: false,
        showPopupPreview: false,
        requireName: false,
        requireEmail: true,
        enableGreeting: true,
        conversationStarters: ["What can you help with?"],
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
  if (path === "widgets:getPrimaryWidgetByCompany" || path === "widgets:getPrimaryGlobalWidget") {
    return {
      _id: widgetId,
      _creationTime: now,
      companyId: path === "widgets:getPrimaryGlobalWidget" ? undefined : companyId,
      name: path === "widgets:getPrimaryGlobalWidget" ? "E2E Global Widget" : "E2E Website Bot",
      isActive: true,
      isGlobal: path === "widgets:getPrimaryGlobalWidget",
      allowedDomains: ["example.com"],
      themeGreeting: "Welcome to the E2E widget.",
      themePrimaryColor: "#2563eb",
      themeLogoUrl: "",
      themePlaceholder: "Ask the E2E assistant...",
      enableSounds: false,
      showPopupPreview: false,
      requireName: false,
      requireEmail: true,
      enableGreeting: true,
      conversationStarters: ["What can you help with?"],
      createdAt: now,
      updatedAt: now,
    };
  }
  if (path === "plans:getActivePlans" || path === "plans:getPlans") {
    return [{ _id: "plan_e2e", _creationTime: now, name: "Pro", description: "E2E plan", priceGBP: 99, messageLimit: 1000, isActive: true, createdAt: now }];
  }
  if (path === "plans:getMyCompanyPlanStatus") {
    return { planName: "Pro", messagesUsed: 42, messageLimit: 1000, isUnlimited: false };
  }
  if (path === "workflows:list") {
    return [workflowFixture()];
  }
  if (path === "workflows:get") {
    const id = String(queryArgs.id || workflowId);
    return workflowFixture(id, id === createdWorkflowId ? "Phase 6 Workflow" : "E2E Workflow");
  }
  if (path === "scheduler:getSchedules") {
    return [
      {
        _id: "schedule_e2e",
        _creationTime: now,
        companyId,
        name: "E2E Morning Schedule",
        workflowId,
        workflowName: "E2E Workflow",
        targetName: "E2E Workflow",
        intervalStr: JSON.stringify({
          version: 2,
          kind: "recurring",
          cadence: "daily",
          timeLocal: "09:00",
          timezone: "UTC",
        }),
        cronExpression: "0 9 * * *",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
  if (path === "scheduler:getWorkflowExecutions") {
    return [
      {
        _id: "execution_e2e",
        _creationTime: now,
        workflowId,
        workflowName: "E2E Workflow",
        startedByName: "E2E Super Admin",
        triggerType: "MANUAL",
        status: "SUCCESS",
        state: "Completed deterministic browser journey",
        startedAt: now,
        completedAt: now + 1000,
        createdAt: now,
      },
    ];
  }
  if (path === "analytics:getGlobalAnalytics" || path === "analytics:getCompanyMetrics" || path === "analytics:getGlobalInventoryMetrics") return analytics;
  if (path === "movements:get") {
    return queryArgs.id === movementId ? movementFixture : null;
  }
  if (path === "movements:getFileUrl") {
    return null;
  }
  if (path === "chat:getThreads") {
    return [{ _id: "thread_e2e_seed", _creationTime: now, title: "E2E Conversation", createdAt: now, updatedAt: now }];
  }
  if (path === "chat:getMessages") return readThreadMessages(String(queryArgs.threadId || "thread_e2e_seed"));
  if (path === "chatAdmin:getAdminThreadMessages") return readThreadMessages(String(queryArgs.threadId || "thread_e2e_seed"));
  if (path === "knowledge:getThreadDocuments") return [];
  if (path.endsWith(":get") || path.endsWith(":list") || path.includes("getAll") || path.includes("getPending")) return [];

  return [];
}

export function useMutation(functionReference: FunctionReference) {
  const path = functionPath(functionReference);
  return async (args?: Record<string, unknown>) => {
    if (path === "chat:createThread") {
      const threadId = `thread_e2e_${Date.now()}`;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`sonae:e2e:thread:${threadId}`, JSON.stringify([]));
      }
      return threadId;
    }
    if (path === "workflows:createWorkflow") return createdWorkflowId;
    if (path === "chat:sendMessage") {
      writeThreadMessages(String(args?.threadId || "thread_e2e_seed"), String(args?.content || ""));
      return true;
    }
    if (path.includes("generateUploadUrl")) return "data:application/json,{}";
    return args?.id || args?._id || true;
  };
}

export function useAction(functionReference: FunctionReference) {
  void functionReference;
  return async () => true;
}

export function usePaginatedQuery(functionReference: FunctionReference, args?: unknown) {
  const path = functionPath(functionReference);
  const queryArgs = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;

  if (path === "users:getPaginatedUsers") {
    return {
      results: [
        { _id: superAdminId, _creationTime: now, name: "E2E Super Admin", email: "super.e2e@example.com", role: "SUPER_ADMIN", createdAt: now },
        { _id: userId, _creationTime: now, name: "E2E User", email: "user.e2e@example.com", role: "USER", companyId, createdAt: now },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "companies:getPaginatedCompanies") {
    return {
      results: [{ ...companyFixture, userCount: 2 }],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "agents:getPaginatedAgents") {
    return {
      results: [{ _id: "agent_e2e", _creationTime: now, name: "E2E Assistant", modelId: "e2e-primary-model", isActive: true, createdAt: now, updatedAt: now }],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "workflows:getPaginatedWorkflows") {
    return {
      results: [workflowFixture()],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "movements:getPaginated") {
    const searchTerm = String(queryArgs.searchTerm || "").toLowerCase();
    const results = searchTerm && !movementFixture.title.toLowerCase().includes(searchTerm)
      ? []
      : [movementFixture];

    return {
      results,
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "aiTools:getPaginatedTools") {
    return {
      results: [
        {
          _id: "tool_e2e",
          _creationTime: now,
          name: "Rightmove Connector",
          description: "Property search connector",
          handlerMapping: "rightmove.search",
          requiredRole: "ADMIN",
          inputSchema: '{"type":"object","properties":{}}',
          sideEffectLevel: "READ",
          confirmationRequired: false,
          isActive: true,
          version: 1,
          updatedAt: now,
          createdAt: now,
          createdBy: superAdminId,
        },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "plans:getPaginatedPlans") {
    return {
      results: [
        {
          _id: "plan_e2e",
          _creationTime: now,
          name: "Pro",
          description: "E2E plan",
          priceGBP: 99,
          messageLimit: 1000,
          isActive: true,
          createdAt: now,
        },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }
  if (path === "chatAdmin:getPaginatedThreads" || path === "chatAdmin:getPaginatedCompanyThreads") {
    return {
      results: [
        {
          _id: "thread_e2e_seed",
          _creationTime: now,
          companyId,
          title: "E2E Conversation",
          createdAt: now,
          updatedAt: now,
          user: { name: "E2E User", email: "user.e2e@example.com", image: "https://api.dicebear.com/7.x/notionists/svg" },
        },
      ],
      status: "Exhausted",
      loadMore: async () => {},
      isLoading: false,
    };
  }

  return {
    results: pageData([], Number(queryArgs.page || 1), Number(queryArgs.pageSize || 15)).data,
    status: "Exhausted",
    loadMore: async () => {},
    isLoading: false,
  };
}
