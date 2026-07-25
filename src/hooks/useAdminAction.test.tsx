import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/src/context/ToastContext';
import { setErrorReporter, type ErrorReport } from '@/src/lib/reportError';
import { useAdminAction } from './useAdminAction';

/**
 * These assert the three defects the hook exists to fix, not its ergonomics.
 * Each was present at all 48 hand-rolled call sites, and each is invisible
 * while the happy path works — which is why they survived so long.
 */

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

/** Captures what reaches the error-reporting funnel. */
function captureReports() {
  const reports: ErrorReport[] = [];
  const restore = setErrorReporter((report) => reports.push(report));
  return { reports, restore };
}

/** A promise the test resolves by hand, to hold an action mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  setErrorReporter(undefined);
  vi.restoreAllMocks();
});

describe('useAdminAction', () => {
  it('returns the result on success', async () => {
    const perform = vi.fn().mockResolvedValue({ id: 'run_1' });
    const { result } = renderHook(() => useAdminAction(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.run(perform);
    });

    expect(perform).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: true, data: { id: 'run_1' } });
    expect(result.current.error).toBeNull();
  });

  it('shows the author sentence, not the raw Convex envelope', async () => {
    // What the hand-rolled catches showed the user was `error.message`, which
    // for a Convex failure carries a request-id prefix and, in development, a
    // stack fragment on the following lines.
    const perform = vi.fn().mockRejectedValue(
      new Error(
        '[Request ID: 9f2c] Server Error\nUncaught Error: Activation blocked: run an eval first.\n'
        + '    at handler (../convex/agents.ts:214:11)',
      ),
    );
    const { result } = renderHook(() => useAdminAction(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.run(perform);
    });

    expect(outcome).toEqual({ ok: false, message: 'Activation blocked: run an eval first.' });
    expect(result.current.error).toBe('Activation blocked: run an eval first.');
    // The parts that must not reach a person.
    expect(result.current.error).not.toContain('Request ID');
    expect(result.current.error).not.toContain('convex/agents.ts');
  });

  it('reports every failure to the error funnel', async () => {
    // None of the 19 pages did this, so a failing admin action produced no
    // signal at all — the user saw a modal and we saw nothing.
    const { reports } = captureReports();
    const perform = vi.fn().mockRejectedValue(new Error('Delete blocked: record in use.'));
    const { result } = renderHook(() => useAdminAction({ scope: 'admin-agent-runs' }), { wrapper });

    await act(async () => {
      await result.current.run(perform);
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].scope).toBe('admin-agent-runs');
    expect(reports[0].message).toContain('Delete blocked');
  });

  it('reports the full error even though the user sees only the first line', async () => {
    // The cleaned message is for the reader; the reporter needs the stack to be
    // worth having. Sending the cleaned text to both would lose the diagnosis.
    const { reports } = captureReports();
    const error = new Error('[Request ID: 9f2c] Server Error\nUncaught Error: Nope.');
    error.stack = 'Error: Nope.\n    at handler (../convex/agents.ts:214:11)';
    const { result } = renderHook(() => useAdminAction(), { wrapper });

    await act(async () => {
      await result.current.run(() => Promise.reject(error));
    });

    expect(result.current.error).toBe('Nope.');
    expect(reports[0].stack).toContain('convex/agents.ts');
  });

  it('ignores a second click while the first is still running', async () => {
    // The guard cannot be state: two clicks in the same tick both read the
    // pre-update value, so both would fire the mutation.
    const gate = deferred<string>();
    const perform = vi.fn().mockReturnValue(gate.promise);
    const { result } = renderHook(() => useAdminAction(), { wrapper });

    await act(async () => {
      void result.current.run(perform, { key: 'row_1' });
      void result.current.run(perform, { key: 'row_1' });
      await Promise.resolve();
    });

    expect(perform).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve('done');
      await gate.promise;
    });
  });

  it('lets a different row run while one is busy', async () => {
    // A single boolean would freeze every row's button while one row saves.
    const gate = deferred<string>();
    const perform = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue('ok');
    const { result } = renderHook(() => useAdminAction(), { wrapper });

    await act(async () => {
      void result.current.run(perform, { key: 'row_1' });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isBusy('row_1')).toBe(true));
    expect(result.current.isBusy('row_2')).toBe(false);

    await act(async () => {
      await result.current.run(perform, { key: 'row_2' });
    });

    expect(perform).toHaveBeenCalledTimes(2);

    await act(async () => {
      gate.resolve('done');
      await gate.promise;
    });
  });

  it('clears the busy flag when the action fails', async () => {
    // A stuck spinner leaves the row permanently un-actionable, and the user's
    // only recovery is a page reload.
    const perform = vi.fn().mockRejectedValue(new Error('Nope.'));
    const { result } = renderHook(() => useAdminAction(), { wrapper });

    await act(async () => {
      await result.current.run(perform, { key: 'row_1' });
    });

    expect(result.current.isBusy('row_1')).toBe(false);
    expect(result.current.isBusy()).toBe(false);
  });

  it('falls back to the given message when the error carries no sentence', async () => {
    const perform = vi.fn().mockRejectedValue(new Error('[Request ID: 9f2c] Server Error'));
    const { result } = renderHook(() => useAdminAction(), { wrapper });

    await act(async () => {
      await result.current.run(perform, { fallbackMessage: 'The run could not be cancelled.' });
    });

    expect(result.current.error).toBe('The run could not be cancelled.');
  });

  it('drops a stale failure when the next attempt starts', async () => {
    // Otherwise a form shows the previous error while the retry is in flight,
    // which reads as the retry having already failed.
    const perform = vi.fn()
      .mockRejectedValueOnce(new Error('Nope.'))
      .mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useAdminAction(), { wrapper });

    await act(async () => {
      await result.current.run(perform);
    });
    expect(result.current.error).toBe('Nope.');

    await act(async () => {
      void result.current.run(perform);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('does not set state after the component unmounts', async () => {
    // Admin actions routinely close the view that started them, so the promise
    // often settles after the component is gone.
    const gate = deferred<string>();
    const { result, unmount } = renderHook(() => useAdminAction(), { wrapper });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    let settled: Promise<unknown> | undefined;
    await act(async () => {
      settled = result.current.run(() => gate.promise);
      await Promise.resolve();
    });

    unmount();

    await act(async () => {
      gate.resolve('done');
      await settled;
    });

    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('useAdminAction inline-error mode', () => {
  it('still reports when the toast is suppressed', async () => {
    // The toast is the optional part; unwrapping and reporting are not. A form
    // that renders the message itself must not thereby become invisible to
    // error tracking — that was the original defect.
    const { reports } = captureReports();
    const { result } = renderHook(() => useAdminAction({ scope: 'admin-skills' }), { wrapper });

    await act(async () => {
      await result.current.run(
        () => Promise.reject(new Error('[Request ID: 1] Server Error\nUncaught Error: Name taken.')),
        { suppressErrorToast: true },
      );
    });

    expect(result.current.error).toBe('Name taken.');
    expect(reports).toHaveLength(1);
    expect(reports[0].scope).toBe('admin-skills');
  });
});
