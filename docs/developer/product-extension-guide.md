# Product Extension Guide

This guide describes the intended extension points for building future products on top of the Sonae core. Use it before copying patterns from a random page, because many surfaces have shared primitives or backend contracts that preserve tenancy, auditability, and provider neutrality.

## Platform Layers

Sonae is organized around these layers:

- App shell: `src/app/(dashboard)/layout.tsx`, `src/ui/components/layout/SidebarNavigation.tsx`, `src/ui/components/layout/Header.tsx`, and `src/ui/components/layout/FluidWorkspace.tsx`.
- Admin shell: `src/app/(dashboard)/admin/layout.tsx` plus reusable admin UI in `src/app/(dashboard)/admin/_components`.
- Convex backend: public queries/mutations/actions in `convex/*.ts`, shared business logic in service files, auth guards in `convex/authz.ts`, and generated API bindings in `convex/_generated`.
- AI runtime: model selection in `convex/aiModelService.ts`, model records in `convex/aiModels.ts`, shared provider adapters in `convex/aiProviderRegistry.ts`, and provider-specific code such as `convex/vertexProviderService.ts`. Some current runtime paths still call Vertex helpers directly after model resolution; use `docs/developer/ai-provider-tool-extension.md` before assuming a path is provider-neutral.
- Workflow runtime: graph validation in `convex/utils/workflowTypes.ts`, execution helpers in `convex/workflowRuntimeService.ts`, scheduling in `convex/workflowRuntime.ts`, and visual editor types in `src/ui/components/workflows/types.ts`.
- Integrations and tools: global tool metadata in `aiTools`, agent bindings in `agentTools`, declarations/execution guards in `convex/aiToolExecutionService.ts`, and admin management under `src/app/(dashboard)/admin/ai/tools`.
- Tenant settings: system branding/settings in `convex/settings.ts` and `convex/settingsService.ts`, consumed on the frontend through `src/context/SystemSettingsContext.tsx`.

Keep new work inside the layer that owns the behavior. A route should not contain business rules that belong in Convex services, and a provider adapter should not leak vendor-specific request shapes into app or admin pages.

## Add A New Admin Section

Use this path when adding a super-admin or platform-admin feature.

1. Add the route under `src/app/(dashboard)/admin/<section>/page.tsx`.
2. Take the table, header, form fields, and confirmation modal from the screen kit in `src/ui/components/screens/` before writing any of them locally. `docs/developer/screen-kit.md` describes the parts and the build checks that enforce them.
3. Keep backend reads/writes in Convex queries and mutations. Use `requireSuperAdmin`, `requireCurrentUser`, or the relevant auth helper inside the Convex handler.
4. Add the route to the admin tree in `src/ui/components/layout/SidebarNavTrees.tsx` and add matching translation keys in both `messages/en.json` and `messages/it.json`.
5. Preserve the admin pagination standard: use `TABLE_PAGE_SIZE` from `src/ui/components/screens/pagination.ts`, which is 15 rows per page, unless the product requirement explicitly says otherwise.
6. Add a focused unit test for reusable logic or UI and extend Playwright route coverage when the new page is high value.

Minimal page shape. The header sits above the table, not inside it, and the table comes from `DataTable` whole rather than assembled from the kit's loose parts — `scripts/check-screen-kit.mjs` fails the build on either mistake:

```tsx
"use client";

import { useState } from "react";
import { Boxes } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";

export default function AdminExamplePage() {
  const [page, setPage] = useState(1);
  const examples = useQuery(api.examples.listExamples, { page, pageSize: TABLE_PAGE_SIZE });

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Boxes className="h-6 w-6 text-brand" />}
        title="Example"
        description="Manage example records."
      />

      <DataTable
        rows={examples?.items}
        rowKey={(example) => example._id}
        empty={{
          icon: <Boxes className="h-8 w-8 text-muted/30" />,
          label: "No examples yet.",
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: examples?.totalPages ?? 1,
          totalCount: examples?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: examples === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "name", header: "Name", cell: (example) => example.name },
        ]}
      />
    </div>
  );
}
```

For a create or edit dialog, build the body from the field helpers in `src/ui/components/screens/ModalForm.tsx` — `ModalField`, `ModalTextAreaField`, `ModalFormError`, and `ModalFormActions` — and use `ConfirmationModal` from `src/ui/components/screens/ConfirmationModal.tsx` for anything destructive.

Backend shape:

```ts
export const listExamples = query({
  args: { page: v.number(), pageSize: v.number() },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");
    // Query, filter, and paginate here or through a service helper.
  },
});
```

## Add A New Workflow Node Type

Workflow changes need both editor and runtime support. Do not add a visual node that the runtime cannot safely parse.

1. Add or narrow the node type and config shape in `src/ui/components/workflows/types.ts`.
2. Add backend config parsing and validation in `convex/workflowRuntimeService.ts` or `convex/utils/workflowTypes.ts`.
3. Add the runtime behavior in `convex/workflowRuntime.ts` or call a pure helper from `convex/workflowRuntimeService.ts`.
4. Add the node's field set as a new panel in whichever of the three panel files it belongs to — `ConfigDrawerEntryPanels.tsx` for how a workflow starts and what it runs, `ConfigDrawerDataPanels.tsx` for shaping and routing what passes through, `ConfigDrawerHumanPanels.tsx` for waiting on a person — then render it for the new node type from the panel switch in `src/ui/components/workflows/ConfigDrawer.tsx`. Add visual rendering through `src/ui/components/workflows/GenericNode.tsx` or a dedicated node component.
5. Update tests in `convex/workflowRuntimeService.test.ts` and `convex/utils/workflowTypes.test.ts` for valid and invalid config.

Small config-reader example:

```ts
export type TransformConfig = {
  template?: string;
};

function isTransformConfig(value: unknown): value is TransformConfig {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getTransformConfig(nodeData: WorkflowNodeData): TransformConfig {
  const config = nodeData._transformConfig ?? {};
  if (!isTransformConfig(config)) {
    throw new Error("Transform node config must be a JSON object.");
  }
  return config;
}
```

Runtime outputs should be JSON strings and may include `_system` commands only when scheduling, halt, merge, iterator, or other structural runtime behavior is intentional.

## Add A New AI Tool

Tools are platform-controlled capabilities that may be exposed to agents. Treat tool schemas, model tool calls, and tool results as untrusted.

1. Create the tool metadata through the admin UI at `/admin/ai/tools` or the `convex/aiTools.ts` mutations.
2. Set `handlerMapping` to the backend execution mapping that will be normalized by `normalizeToolFunctionName`.
3. Define the input schema as a JSON object and validate it in `convex/aiToolExecutionService.ts`.
4. Re-check role and tenant boundaries before executing the tool. Use `assertCanExecuteTool` and target-company checks for tenant-scoped tools.
5. Bind the tool to agents through `agentTools`, not by hardcoding tool access in a provider request.
6. Return tool output through `buildToolResultPayload` or `buildToolFailureResult`.

Tool declaration example:

```ts
const declaration = buildProviderToolDeclaration({
  name: "Create Support Ticket",
  description: "Creates a tenant-scoped support ticket.",
  handlerMapping: "support.createTicket",
  requiredRole: "ADMIN",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      companyId: { type: "string" },
    },
    required: ["title", "companyId"],
  },
});
```

Never execute a tool only because a model asked for it. Normalize the tool call, validate args, fetch the configured tool, check access, then execute.

## Add A New Model Or Provider

Model records are data. Provider adapters are code. Keep that boundary intact.

1. Add model records through `convex/aiModels.ts` or a provider sync action. Runtime code should resolve models through `resolveModelForExecution`.
2. Keep model selection and default handling in `convex/aiModelService.ts`.
3. Add provider-specific client setup in a dedicated adapter service, following `convex/vertexProviderService.ts`.
4. Pass provider-neutral requests into the adapter boundary for new runtime work. Do not import provider SDKs inside React components, route handlers, or generic runtime services; existing direct Vertex runtime paths should be treated as implementation debt, not a pattern to copy.
5. Update `docs/developer/ai-provider-tool-extension.md` if the provider introduces new adapter rules.
6. Add service tests for model fallback, disabled/default behavior, and any provider-specific normalization.

Provider-neutral call shape:

```ts
const modelId = await ctx.runQuery(internal.aiModels.resolveModelForExecution, {
  requestedModelId: args.modelId,
});

// Provider adapter receives normalized prompts, model id, tool declarations, and generation config.
```

## Customize Branding And Navigation

Product branding is configuration-first.

1. Use system settings for product name, logos, theme colors, fonts, and diagnostic route visibility. Defaults live in `convex/settingsService.ts`.
2. Read settings through `useSystemSettings()` rather than hardcoding the platform name in app shell UI.
3. Add new sidebar routes to the matching tree in `SidebarNavTrees.tsx` only after the route exists and the role/tenant behavior is clear.
4. Add labels to both locale dictionaries.
5. Keep temporary demo routes behind `diagnosticRoutingEnabled` or an explicit product flag.

Branding checklist:

- `platformName`
- `brandColorHex`
- `logoUrlLight`
- `logoUrlDark`
- light/dark theme tokens
- route visibility flags such as `diagnosticRoutingEnabled`

## Package A Vertical App Starter

Use `docs/operator/vertical-app-packaging-checklist.md` when turning Sonae into a customer-specific or vertical starter.

Packaging should happen in this order:

1. Configure product identity through system settings and locale dictionaries.
2. Choose or extend an agent archetype in `convex/agentTemplates.ts` and build the starter agents from the guided builder.
3. Replace demo knowledge and seed data with clearly marked vertical-specific sample data.
4. Configure auth, providers, connectors, and model defaults outside source control.
5. Run `npm run setup:validate` locally and `npm run setup:validate -- --profile=production` for production handoff.
6. Run release gates, System Health, and the fresh-deployment smoke checklist before activating customer-facing agents.

Avoid editing core runtime files for product copy, navigation labels, model choices, or seed data unless the extension point is genuinely missing.

## Extension Safety Checklist

Before committing a new product extension:

- Confirm tenant access is scoped in Convex, not only in React.
- Confirm admin mutations prevent privilege escalation.
- Confirm locale dictionaries remain in parity.
- Confirm new admin tables default to 15 rows per page.
- Confirm no native browser dialogs were introduced.
- Confirm AI model choices are resolved from stored configuration.
- Confirm new workflow node config has parser tests.
- Confirm high-value routes have Playwright smoke coverage.
