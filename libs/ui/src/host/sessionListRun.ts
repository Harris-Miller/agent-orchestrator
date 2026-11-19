import { Cause, Effect } from 'effect';

/** Safety bound on concurrent `session/list` calls (one per Project) on one Backend connection. */
export const SESSION_LIST_CONCURRENCY = 4;

/** One (launch target, cwd) `session/list` as the Harness folds it: pages arrive, then it completes or fails. */
export type SessionListRun = {
  /** A page arrived; merge it into Session History. */
  readonly page: (page: unknown) => void;
  /** Paged to exhaustion: cwd-scoped replace, pin sweep, mark complete. */
  readonly complete: () => Effect.Effect<void>;
  /** The list did not finish (page error, repeated cursor, page cap, interruption): keep rows, mark incomplete. */
  readonly fail: () => void;
};

/**
 * Drives one list. A failure is scoped to this list: it marks the run failed and is logged, never raised, so other
 * lists, other providers and the Harness are unaffected. Interruption is still propagated.
 */
export const runSessionList = <E, R>(
  run: SessionListRun,
  pages: (onPage: (page: unknown) => void) => Effect.Effect<void, E, R>,
) =>
  pages(run.page).pipe(
    Effect.onError(() => Effect.sync(() => run.fail())),
    Effect.andThen(() => run.complete()),
    Effect.catchCause(cause =>
      Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.logWarning('session/list failed', cause),
    ),
  );

/** Runs the given lists with bounded concurrency. Each list's failure stays in that list. */
export const runSessionLists = <E, R>(
  lists: readonly { readonly cwd: string; readonly run: SessionListRun }[],
  pages: (cwd: string, onPage: (page: unknown) => void) => Effect.Effect<void, E, R>,
) =>
  Effect.forEach(lists, ({ cwd, run }) => runSessionList(run, onPage => pages(cwd, onPage)), {
    concurrency: SESSION_LIST_CONCURRENCY,
    discard: true,
  });
