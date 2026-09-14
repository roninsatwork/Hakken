import { sample } from "./model.mjs";
export function frontendTest(e, entities) {
  return `import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import messages from "@/messages/en.json";
import { AccessLevelProvider } from "@/src/ui/components/screens/AccessLevel";
import { EntityEditor } from "./EntityEditor";
import { ToastProvider } from "@/src/context/ToastContext";
vi.mock("@/src/lib/reportError", () => ({ reportError: vi.fn() }));
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref).endsWith(":create") ? mocks.create : mocks.update,
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
${e.fields
  .filter((f) => f.target)
  .map((f) => {
    const target = entities.find((x) => x.table === f.target);
    return `    if (getFunctionName(ref) === "${target.table}:list") return { page: [{ _id: "related", ${target.labelField}: "Related" }], isDone: true, continueCursor: "" };
    if (getFunctionName(ref) === "${target.table}:get") return { _id: "related", ${target.labelField}: "Related" };`;
  })
  .join("\n")}
    void ref;
    return undefined;
  },
}));
const copy = messages.admin.${e.table};
const input = {
${e.fields.map((f) => `  ${f.name}: ${f.target ? `"related" as Id<"${f.target}">` : sample(f)},`).join("\n")}
};
function view(role: string = "ADMIN", record?: Doc<"${e.table}">) {
  const onClose = vi.fn(); const onSaved = vi.fn();
  const result = render(<NextIntlClientProvider locale="en" messages={messages}><ToastProvider><AccessLevelProvider role={role}>
    <EntityEditor record={record} onClose={onClose} onSaved={onSaved} />
  </AccessLevelProvider></ToastProvider></NextIntlClientProvider>);
  return { ...result, onClose, onSaved };
}
function fill() {
${e.fields.map((f) => (f.type === "boolean" ? `  fireEvent.click(screen.getByLabelText(copy.columns.${f.name}));` : `  fireEvent.change(screen.getByLabelText(copy.columns.${f.name}), { target: { value: ${f.target ? '"related"' : `String(input.${f.name})`} } });`)).join("\n")}
}
beforeEach(() => { vi.resetAllMocks(); mocks.create.mockResolvedValue("record"); mocks.update.mockResolvedValue("record"); });
describe("${e.table} editor", () => {
  test("submits typed values and keeps the form open on failure for retry", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Save rejected"));
    const { onSaved } = view(); fill();
    fireEvent.click(screen.getByRole("button", { name: copy.actions.save }));
    await screen.findByText("Save rejected");
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(input);
    fireEvent.click(screen.getByRole("button", { name: copy.actions.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });
  test("does not expose editing controls to a read-only viewer", () => {
    view("READ_ONLY");
    expect(screen.queryByRole("button", { name: copy.actions.save })).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  test("edits the existing record with its opened revision", async () => {
    const record: Doc<"${e.table}"> = { ...input, _id: "record" as Id<"${e.table}">, companyId: "company" as Id<"companies">,
      _creationTime: 0, createdAt: 0, updatedAt: 0, revision: 3 };
    const { onSaved } = view("ADMIN", record);
    fireEvent.change(screen.getByLabelText(copy.columns.${e.labelField}), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: copy.actions.save }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.update).toHaveBeenCalledWith({ ...input, ${e.labelField}: "Changed", id: "record", expectedRevision: 3 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
`;
}
