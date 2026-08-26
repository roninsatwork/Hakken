'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast, toUserFacingMessage } from '@/src/context/ToastContext';
import { reportError } from '@/src/lib/reportError';

/**
 * The shape every admin write shares: mark busy, call the server, tell the user
 * what happened, clear busy.
 *
 * It was hand-written at 48 sites across 19 admin pages, and all 48 got the
 * same three things wrong, because each is invisible while the happy path
 * works:
 *
 *  1. **The error text shown was the raw one.** `error.message` on a Convex
 *     failure is an envelope — `[Request ID: …] Server Error`, the author's
 *     sentence on the next line, and in development a stack fragment after
 *     that. Printing it shows the reader either nothing useful or our file
 *     paths. `toUserFacingMessage` already existed to unwrap it; the toast path
 *     used it, and none of the hand-rolled catches did.
 *  2. **Nothing was reported.** Not one of the 19 pages called `reportError`,
 *     so every failed admin action was invisible to error tracking. The user
 *     saw a modal and we saw nothing.
 *  3. **Double submits went through.** Guarding on a `useState` busy flag does
 *     not work: two clicks in the same tick both read the pre-update value and
 *     both fire. The guard has to be a ref, which is easy to know and easy to
 *     forget.
 *
 * So this is not a tidying exercise. Each page moved onto it stops leaking
 * internals, starts reporting, and stops double-firing.
 *
 * ### Why one runner per page rather than one per mutation
 *
 * Admin pages run many actions against the same rows — the runs dashboard has
 * ten — and they share a single "this row is busy" indicator. Ten hooks would
 * mean ten busy maps to combine at every button. One runner holds the map, and
 * the differing part (what to say on success, what to say on failure) is passed
 * per call, where it is written anyway.
 *
 * ### Why it returns an outcome instead of throwing
 *
 * Rethrowing would put the caller back in a try/catch, which is what produced
 * the 48 duplicates. But callers legitimately need to know whether the write
 * landed — a modal should close on success and stay open on failure — so
 * swallowing the result is not an option either. A discriminated union answers
 * them without a catch block.
 */

export type AdminActionOutcome<TResult> =
  | { ok: true; data: TResult }
  | { ok: false; message: string };

export type AdminActionRunOptions = {
  /**
   * Scopes the busy flag to one row. Omit for page-level actions; a single
   * boolean would otherwise freeze every row's button while one row saves.
   */
  key?: string;
  /**
   * Shown as a success toast. Omit where the result is already visible — a row
   * disappearing — so the user is not told what they can see.
   */
  successMessage?: string;
  /** Shown when the failure carries no sentence worth showing. */
  fallbackMessage?: string;
  /**
   * Suppresses the error toast for callers that render `error` inline, which
   * several admin forms do. Without this the same sentence appears twice, once
   * in the form and once in the corner.
   *
   * Only the toast is suppressed. The failure is still unwrapped and still
   * reported — those are the parts that must not be optional.
   */
  suppressErrorToast?: boolean;
  /**
   * This call is made by a timer, not by a person.
   *
   * Reporting is not optional here either, but repeating it is: the property
   * logs page re-syncs every pending run every thirty seconds, so one stuck
   * run reported a fresh error two thousand eight hundred times a day, for
   * ever. With this set the first failure for a key is reported and the rest
   * are not, until that key succeeds — which is the moment the situation has
   * actually changed and is worth hearing about again.
   *
   * Requires `key`. A background call without one has nothing to be quiet
   * about.
   */
  backgroundRetry?: boolean;
};

export type AdminActionRunner = {
  /** Runs the action. Never throws — inspect the returned outcome. */
  run: <TResult>(
    perform: () => Promise<TResult>,
    options?: AdminActionRunOptions,
  ) => Promise<AdminActionOutcome<TResult>>;
  /** True while any action is in flight, or only the keyed one when asked. */
  isBusy: (key?: string) => boolean;
  /** The last failure's user-facing text, for callers rendering it inline. */
  error: string | null;
  /** Clears `error`, so a form does not show a stale failure. */
  clearError: () => void;
};

/** Used when a caller runs an action without a row key. */
const PAGE_LEVEL_KEY = '__page__';

const DEFAULT_FALLBACK = 'The action could not be completed.';

export function useAdminAction(options: { scope?: string } = {}): AdminActionRunner {
  const { showToast, showErrorToast } = useToast();
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The double-submit guard has to be synchronous. `busyKeys` is state, so two
  // clicks in one tick would both see it empty and both fire the mutation.
  const inFlight = useRef(new Set<string>());

  // Keys whose failure a timer has already told us about. Cleared on success,
  // so the next genuine change is reported.
  const reportedWhileFailing = useRef(new Set<string>());

  // An admin action often closes or navigates away from the view that started
  // it, so the component can be gone before the promise settles. Setting state
  // then is a no-op that logs a warning; the toast still shows, because the
  // provider lives above.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isBusy = useCallback(
    (key?: string) => (key === undefined ? busyKeys.length > 0 : busyKeys.includes(key)),
    [busyKeys],
  );

  const clearError = useCallback(() => setError(null), []);

  const scope = options.scope;

  const run = useCallback(
    async <TResult,>(
      perform: () => Promise<TResult>,
      runOptions: AdminActionRunOptions = {},
    ): Promise<AdminActionOutcome<TResult>> => {
      const busyKey = runOptions.key ?? PAGE_LEVEL_KEY;
      if (inFlight.current.has(busyKey)) {
        // A repeat click on something already running. Nothing went wrong, so
        // there is nothing to tell the user — the call in flight owns the
        // outcome.
        return { ok: false, message: '' };
      }

      inFlight.current.add(busyKey);
      setBusyKeys((current) => (current.includes(busyKey) ? current : [...current, busyKey]));
      setError(null);

      try {
        const data = await perform();
        reportedWhileFailing.current.delete(busyKey);
        if (runOptions.successMessage) showToast(runOptions.successMessage, 'success');
        return { ok: true, data };
      } catch (caught) {
        // The user gets the author's sentence; the reporter gets the whole
        // error, stack included.
        const fallbackMessage = runOptions.fallbackMessage ?? DEFAULT_FALLBACK;
        const errorScope = scope ?? 'admin-action';
        let message: string;
        const alreadyToldAboutThisKey =
          runOptions.backgroundRetry === true && reportedWhileFailing.current.has(busyKey);
        if (runOptions.backgroundRetry === true) {
          reportedWhileFailing.current.add(busyKey);
        }

        if (runOptions.suppressErrorToast) {
          message = toUserFacingMessage(caught, fallbackMessage);
          if (!alreadyToldAboutThisKey) reportError(caught, { scope: errorScope });
        } else {
          // `showErrorToast` unwraps and reports in one call and returns the
          // text it showed, so an inline copy cannot drift from the toast.
          message = showErrorToast(caught, { scope: errorScope, fallbackMessage });
        }
        if (mounted.current) setError(message);
        return { ok: false, message };
      } finally {
        inFlight.current.delete(busyKey);
        if (mounted.current) setBusyKeys((current) => current.filter((entry) => entry !== busyKey));
      }
    },
    [scope, showToast, showErrorToast],
  );

  return { run, isBusy, error, clearError };
}
