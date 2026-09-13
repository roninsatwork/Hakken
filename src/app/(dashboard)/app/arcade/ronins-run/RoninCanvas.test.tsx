import {
  act,
  fireEvent,
  renderWithProviders as render,
  screen,
  waitFor,
} from '@/src/test/renderWithProviders';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunResult, Snapshot } from './engine/NightHeistSimulation';
import RoninCanvas from './RoninCanvas';

const mock = vi.hoisted(() => ({
  load: vi.fn(),
  start: vi.fn(),
  dispose: vi.fn(),
  setLabels: vi.fn(),
  callbacks: null as null | {
    onSnapshot: (snapshot: Snapshot) => void;
    onResult: (result: RunResult) => void;
  },
  mounts: 0,
}));
vi.mock('./engine/GameEngine', () => ({
  GameEngine: class {
    constructor(_canvas: unknown, callbacks: typeof mock.callbacks) {
      mock.callbacks = callbacks;
      mock.mounts++;
    }
    load = mock.load;
    start = mock.start;
    dispose = mock.dispose;
    setLabels = mock.setLabels;
    setMuted = vi.fn();
    setVolume = vi.fn();
    pause = vi.fn();
    resume = vi.fn();
    reset = vi.fn();
  },
}));

describe('Night Heist session boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.mounts = 0;
    mock.load.mockResolvedValue(undefined);
  });

  it('waits for the start receipt and keeps the engine across parent updates', async () => {
    let resolve!: () => void;
    const onStart = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const onEscape = vi.fn().mockResolvedValue(undefined);
    const view = render(<RoninCanvas onStart={onStart} onEscape={onEscape} />);
    const start = await screen.findByRole('button', {
      name: /Enter the courtyard/,
    });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledOnce();
    expect(mock.start).not.toHaveBeenCalled();
    await act(async () => resolve());
    expect(mock.start).toHaveBeenCalledOnce();
    view.rerender(<RoninCanvas onStart={vi.fn()} onEscape={vi.fn()} />);
    expect(mock.mounts).toBe(1);
    view.unmount();
    expect(mock.dispose).toHaveBeenCalledOnce();
  });

  it('retains a failed escape result and retries the same result without restarting', async () => {
    const onEscape = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue(undefined);
    render(<RoninCanvas onStart={vi.fn()} onEscape={onEscape} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Enter the courtyard/ })).toBeEnabled(),
    );
    const result: RunResult = {
      outcome: 'escaped',
      elapsedSeconds: 90,
      seals: 3,
      treasure: true,
      alarms: 1,
      score: 5950,
    };
    await act(async () => {
      mock.callbacks!.onSnapshot({
        status: 'escaped',
        seconds: 90,
        seals: 3,
        treasure: true,
        alarms: 1,
        score: 5950,
        dashCooldown: 0,
        spiritSeconds: 0,
        spiritCollected: false,
        knockouts: 0,
        threat: 0,
      });
      mock.callbacks!.onResult(result);
    });
    expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }));
    expect(await screen.findByText(/Escape saved to your workspace/)).toBeInTheDocument();
    expect(onEscape.mock.calls).toEqual([[result], [result]]);
    expect(mock.start).not.toHaveBeenCalled();
  });

  it('shows failed artwork loading and disposes the failed engine before a retry', async () => {
    mock.load.mockRejectedValueOnce(new Error('Missing artwork'));
    render(<RoninCanvas onStart={vi.fn()} onEscape={vi.fn()} />);
    expect(await screen.findByText(/district could not load/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Enter the courtyard/ })).toBeEnabled(),
    );
    expect(mock.dispose).toHaveBeenCalledOnce();
    expect(mock.mounts).toBe(2);
  });
});

it('selects unlocked maps and replaces only the level engine while progress refreshes preserve it', async () => {
  const onLevelChange = vi.fn();
  const props = {
    onStart: vi.fn(),
    onEscape: vi.fn(),
    onLevelChange,
    progress: { unlocked: 2, bests: [6260, null, null, null] },
  };
  const view = render(<RoninCanvas {...props} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Enter the courtyard/ })).toBeEnabled(),
  );
  expect(screen.getByRole('button', { name: 'Canal Docks · Locked' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Night Market · Ready to explore' }));
  expect(onLevelChange).toHaveBeenCalledWith('market');
  const mounts = mock.mounts;
  view.rerender(<RoninCanvas {...props} levelId="market" />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Begin the heist' })).toBeEnabled(),
  );
  expect(mock.mounts).toBe(mounts + 1);
  view.rerender(
    <RoninCanvas
      {...props}
      levelId="market"
      progress={{ unlocked: 2, bests: [6300, null, null, null] }}
    />,
  );
  expect(mock.mounts).toBe(mounts + 1);
});

it('holds advancement on a failed save, then offers the next map after retry', async () => {
  const onLevelChange = vi.fn(),
    onEscape = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  render(<RoninCanvas onStart={vi.fn()} onEscape={onEscape} onLevelChange={onLevelChange} />);
  const result: RunResult = {
    outcome: 'escaped',
    elapsedSeconds: 90,
    seals: 3,
    treasure: true,
    alarms: 1,
    score: 5950,
  };
  await act(async () => {
    mock.callbacks!.onSnapshot({
      status: 'escaped',
      seconds: 90,
      seals: 3,
      treasure: true,
      alarms: 1,
      score: 5950,
      dashCooldown: 0,
      spiritSeconds: 0,
      spiritCollected: false,
      knockouts: 0,
      threat: 0,
    });
    mock.callbacks!.onResult(result);
  });
  expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue to Night Market' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Choose a heist' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Continue to Night Market' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Night Market' }));
  expect(onLevelChange).toHaveBeenCalledExactlyOnceWith('market');
});

it('shows campaign completion after the final saved escape, with replay available', async () => {
  render(
    <RoninCanvas
      levelId="gardens"
      onStart={vi.fn()}
      onEscape={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await act(async () => {
    mock.callbacks!.onSnapshot({
      status: 'escaped',
      seconds: 60,
      seals: 3,
      treasure: true,
      alarms: 1,
      score: 6100,
      dashCooldown: 0,
      spiritSeconds: 0,
      spiritCollected: false,
      knockouts: 0,
      threat: 0,
    });
    mock.callbacks!.onResult({
      outcome: 'escaped',
      elapsedSeconds: 60,
      seals: 3,
      treasure: true,
      alarms: 1,
      score: 6100,
    });
  });
  expect(await screen.findByText('The night is yours')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try another run' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Choose a heist' })).toBeEnabled();
});

it('offers safe retry when the connection leaves a save pending indefinitely', async () => {
  const onEscape = vi
    .fn()
    .mockImplementationOnce(() => new Promise<void>(() => {}))
    .mockResolvedValue(undefined);
  render(<RoninCanvas onStart={vi.fn()} onEscape={onEscape} onLevelChange={vi.fn()} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Enter the courtyard/ })).toBeEnabled(),
  );
  vi.useFakeTimers();
  try {
    await act(async () => {
      mock.callbacks!.onSnapshot({
        status: 'escaped',
        seconds: 60,
        seals: 3,
        treasure: true,
        alarms: 0,
        score: 6150,
        dashCooldown: 0,
        spiritSeconds: 0,
        spiritCollected: false,
        knockouts: 0,
        threat: 0,
      });
      mock.callbacks!.onResult({
        outcome: 'escaped',
        elapsedSeconds: 60,
        seals: 3,
        treasure: true,
        alarms: 0,
        score: 6150,
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole('button', { name: 'Retry saving' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Continue to Night Market' })).toBeDisabled();
  } finally {
    vi.useRealTimers();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }));
  expect(await screen.findByText(/Escape saved to your workspace/)).toBeInTheDocument();
  expect(onEscape).toHaveBeenCalledTimes(2);
  expect(onEscape.mock.calls[0][0]).toBe(onEscape.mock.calls[1][0]);
});

it('explains the separate pickup and shows active, warning, spent and knockout states', async () => {
  mock.load.mockResolvedValue(undefined);
  render(<RoninCanvas onStart={vi.fn()} onEscape={vi.fn()} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Enter the courtyard/ })).toBeEnabled(),
  );
  expect(
    screen.getByText('Green seals open the escape gate. Collect all three.'),
  ).toBeInTheDocument();
  expect(screen.getByText(/Blue flame: 10 seconds/)).toBeInTheDocument();
  const snapshot: Snapshot = {
    status: 'playing',
    seconds: 4,
    seals: 0,
    treasure: false,
    alarms: 0,
    score: 0,
    dashCooldown: 0,
    threat: 0,
    spiritSeconds: 9.3,
    spiritCollected: true,
    knockouts: 1,
  };
  act(() => mock.callbacks!.onSnapshot(snapshot));
  expect(screen.getByTestId('spirit-status')).toHaveTextContent(
    'Spirit Power · Touch patrols to disable them',
  );
  expect(screen.getByRole('progressbar', { name: 'Spirit Power' })).toHaveAttribute(
    'aria-valuenow',
    '10',
  );
  expect(screen.getByText('1 patrol disabled')).toBeInTheDocument();
  act(() =>
    mock.callbacks!.onSnapshot({
      ...snapshot,
      spiritSeconds: 2.5,
      knockouts: 2,
    }),
  );
  expect(screen.getByTestId('spirit-status')).toHaveTextContent(
    'Power ending · Get clear of patrols',
  );
  expect(screen.getByTestId('spirit-status')).toHaveTextContent('3s');
  expect(screen.getByText('2 patrols disabled')).toBeInTheDocument();
  act(() => mock.callbacks!.onSnapshot({ ...snapshot, spiritSeconds: 0, threat: 1 }));
  expect(screen.getByTestId('spirit-status')).toHaveTextContent(
    'Spirit Power spent · Avoid remaining patrols',
  );
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.getByText('Pursuit · Break their line of sight')).toBeInTheDocument();
});
