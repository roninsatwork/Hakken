import {
  act,
  fireEvent,
  renderWithProviders as render,
  screen,
  waitFor,
} from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ViewState } from "./engine/FirstPersonGame";
import FirstPersonCanvas from "./FirstPersonCanvas";

const mock = vi.hoisted(() => ({
  callbacks: null as null | {
    onUpdate: (state: ViewState) => void;
    onReady: () => void;
    onGraphicsError: () => void;
  },
  dispose: vi.fn(),
  start: vi.fn(),
  setMuted: vi.fn(),
  setVolume: vi.fn(),
  setQuality: vi.fn(),
  canvases: [] as HTMLCanvasElement[],
}));
vi.mock("./engine/FirstPersonGame", () => ({
  FirstPersonGame: class {
    constructor(
      canvas: HTMLCanvasElement,
      _level: unknown,
      callbacks: NonNullable<typeof mock.callbacks>,
    ) {
      mock.callbacks = callbacks;
      mock.canvases.push(canvas);
      queueMicrotask(() => callbacks.onReady());
    }
    start = mock.start;
    resume = vi.fn();
    pause = vi.fn();
    dispose = mock.dispose;
    setMuted = mock.setMuted;
    setVolume = mock.setVolume;
    setQuality = mock.setQuality;
    setReducedMotion = vi.fn();
  },
}));
const snapshot: ViewState = {
  status: "playing",
  seconds: 4,
  seals: 0,
  treasure: false,
  alarms: 0,
  score: 0,
  dashCooldown: 0,
  threat: 0,
  spiritSeconds: 0,
  spiritCollected: false,
  knockouts: 0,
  x: 0,
  y: 0,
  yaw: 0,
  collected: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.canvases = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("finishes all four districts, keeps settings, and offers replay with the total result", async () => {
  render(<FirstPersonCanvas />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Enter the district" }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Graphics" }), {
    target: { value: "quiet" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Mute sound" }));
  fireEvent.change(screen.getByRole("slider", { name: "Sound volume" }), {
    target: { value: "38" },
  });
  for (let i = 0; i < 4; i++) {
    act(() => mock.callbacks!.onUpdate({ ...snapshot, status: "playing" }));
    expect(
      screen.getByRole("button", { name: /District 1\s*Lantern Courtyard/ }),
    ).toBeDisabled();
    act(() =>
      mock.callbacks!.onUpdate({
        ...snapshot,
        status: "escaped",
        seals: 3,
        score: 5000 + i * 100,
        collected: [0, 1, 2],
      }),
    );
    if (i < 3) {
      fireEvent.click(screen.getByRole("button", { name: "Next district" }));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Enter the district" }),
        ).toBeEnabled(),
      );
      expect(screen.getByRole("combobox", { name: "Graphics" })).toHaveValue(
        "quiet",
      );
      expect(screen.getByRole("slider", { name: "Sound volume" })).toHaveValue(
        "38",
      );
      expect(
        screen.getByRole("button", { name: "Enable sound" }),
      ).toBeInTheDocument();
    }
  }
  expect(screen.getByText("All four districts escaped")).toBeInTheDocument();
  expect(screen.getByText(/20,600 points/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Play again" })).toBeEnabled();
  expect(mock.dispose).toHaveBeenCalledTimes(3);
  expect(mock.setQuality).toHaveBeenLastCalledWith("quiet");
});

it("shows power activation, expiry and capture as distinct states", async () => {
  render(<FirstPersonCanvas />);
  await screen.findByRole("button", { name: "Enter the district" });
  act(() => mock.callbacks!.onUpdate(snapshot));
  act(() =>
    mock.callbacks!.onUpdate({
      ...snapshot,
      spiritCollected: true,
      spiritSeconds: 10,
    }),
  );
  expect(screen.getByTestId("pickup-confirmation")).toHaveTextContent(
    "Spirit Power ACTIVE",
  );
  expect(screen.getByTestId("spirit-power-status")).toHaveTextContent("10s");
  act(() =>
    mock.callbacks!.onUpdate({
      ...snapshot,
      seconds: 14,
      spiritCollected: true,
      spiritSeconds: 0,
      knockouts: 2,
    }),
  );
  expect(screen.getByTestId("spirit-power-status")).toHaveTextContent("ENDED");
  expect(screen.getByTestId("spirit-power-status")).toHaveTextContent(
    "2 patrols disabled",
  );
  act(() =>
    mock.callbacks!.onUpdate({
      ...snapshot,
      status: "caught",
      seconds: 15,
      spiritCollected: true,
    }),
  );
  expect(screen.getByText(/Spirit Power had ended/)).toBeInTheDocument();
});

it("retries a graphics failure with a fresh canvas and releases the failed scene", async () => {
  render(<FirstPersonCanvas />);
  await screen.findByRole("button", { name: "Enter the district" });
  const first = mock.canvases[0];
  act(() => mock.callbacks!.onGraphicsError());
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Enter the district" }),
    ).toBeEnabled(),
  );
  expect(mock.dispose).toHaveBeenCalledOnce();
  expect(mock.canvases.at(-1)).not.toBe(first);
});
