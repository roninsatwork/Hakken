/**
 * Route params a page can read straight away with `use()`.
 *
 * Next hands a page its route params as a promise, and the pages unwrap them
 * with React's `use()`. A plain resolved promise still suspends on first render,
 * so every page test would have to wrap the page in a boundary and await it —
 * and a test that has to model suspense in order to click a button ends up
 * asserting the test harness rather than the screen.
 *
 * React reads a thenable that already carries `status: "fulfilled"` without
 * suspending at all, which is exactly what a test wants: the page renders once,
 * synchronously, with its params in hand.
 */
export function routeParams<T extends object>(value: T): Promise<T> {
  const thenable = Promise.resolve(value) as Promise<T> & {
    status: "fulfilled";
    value: T;
  };
  thenable.status = "fulfilled";
  thenable.value = value;
  return thenable;
}
