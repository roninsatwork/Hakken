import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { DropArea } from "./DropArea";

const file = (name: string) => new File(["x"], name, { type: "text/markdown" });

describe("DropArea", () => {
  it("says what to drop and offers a button to choose instead", () => {
    render(<DropArea title="Drop files here" hint="Markdown or a zip" chooseFilesLabel="Choose files" onFiles={() => {}} />);

    expect(screen.getByText("Drop files here")).toBeInTheDocument();
    expect(screen.getByText("Markdown or a zip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeInTheDocument();
  });

  it("hands over dropped files, all of them only when it takes several", () => {
    const onFiles = vi.fn();
    const { container, rerender } = render(<DropArea title="Drop" chooseFilesLabel="Choose" onFiles={onFiles} />);
    const area = () => container.querySelector('[data-part="drop-area"]') as HTMLElement;

    fireEvent.drop(area(), { dataTransfer: { files: [file("a.md"), file("b.md")] } });
    expect(onFiles).toHaveBeenLastCalledWith([expect.objectContaining({ name: "a.md" })]);

    rerender(<DropArea title="Drop" chooseFilesLabel="Choose" multiple onFiles={onFiles} />);
    fireEvent.drop(area(), { dataTransfer: { files: [file("a.md"), file("b.md")] } });
    expect(onFiles.mock.lastCall?.[0]).toHaveLength(2);
  });

  it("hands over files chosen with the button's picker", () => {
    const onFiles = vi.fn();
    const { container } = render(<DropArea layout="row" title="Drop" chooseFilesLabel="Choose" multiple onFiles={onFiles} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(input, { target: { files: [file("notes.md")] } });
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: "notes.md" })]);
  });

  it("takes nothing while switched off, and nothing when nothing came", () => {
    const onFiles = vi.fn();
    const { container } = render(<DropArea title="Drop" chooseFilesLabel="Choose" multiple disabled onFiles={onFiles} />);
    const area = container.querySelector('[data-part="drop-area"]') as HTMLElement;

    fireEvent.drop(area, { dataTransfer: { files: [file("a.md")] } });
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose" })).toBeDisabled();
  });

  it("puts what comes first on a row before its button", () => {
    render(<DropArea layout="row" title="Drop" chooseFilesLabel="Choose" leading={<span>Reading</span>} onFiles={() => {}} />);

    const leading = screen.getByText("Reading");
    expect(leading.compareDocumentPosition(screen.getByRole("button", { name: "Choose" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
