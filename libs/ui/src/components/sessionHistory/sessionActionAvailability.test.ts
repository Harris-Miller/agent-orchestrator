import { describe, expect, it } from 'vitest';
import { sessionActionAvailability } from './sessionActionAvailability.ts';
import type { SessionActionAvailabilityInput } from './sessionActionAvailability.ts';

const base: SessionActionAvailabilityInput = {
  archived: false,
  canRename: true,
  capabilities: { sessionArchive: true, sessionClose: true, sessionRename: true },
  entryUnavailable: false,
  pinsLoaded: true,
  sessionActive: true,
  unavailable: false,
  usablePhase: true,
};

describe('sessionActionAvailability', () => {
  it('offers every action on an available, active session', () => {
    const actions = sessionActionAvailability(base);
    expect(actions.unarchive).toBeUndefined();
    expect(actions.close).toEqual({ disabled: false });
    expect(actions.rename).toEqual({ disabled: false });
    expect(actions.archive).toEqual({ disabled: false });
    expect(actions.pin).toEqual({ disabled: false });
    expect(actions.delete).toEqual({ disabled: false });
  });

  it('offers only Unarchive, Pin and Delete on an archived entry', () => {
    const actions = sessionActionAvailability({ ...base, archived: true });
    expect(actions.unarchive).toEqual({ disabled: false });
    expect(actions.close).toBeUndefined();
    expect(actions.rename).toBeUndefined();
    expect(actions.archive).toBeUndefined();
  });

  it('hides actions the agent does not support', () => {
    const actions = sessionActionAvailability({
      ...base,
      capabilities: { sessionArchive: false, sessionClose: false, sessionRename: false },
    });
    expect(actions.close).toBeUndefined();
    expect(actions.rename).toBeUndefined();
    expect(actions.archive).toBeUndefined();
  });

  it('hides Rename without a rename handler or for an unavailable entry', () => {
    expect(sessionActionAvailability({ ...base, canRename: false }).rename).toBeUndefined();
    expect(sessionActionAvailability({ ...base, entryUnavailable: true }).rename).toBeUndefined();
  });

  it('disables Close unless the session is active, and the rest while unavailable; Pin only waits for pins', () => {
    const inactive = sessionActionAvailability({ ...base, sessionActive: false });
    expect(inactive.close).toEqual({ disabled: true });
    const unavailable = sessionActionAvailability({
      ...base,
      pinsLoaded: false,
      unavailable: true,
      usablePhase: false,
    });
    expect(unavailable.archive).toEqual({ disabled: true });
    expect(unavailable.delete).toEqual({ disabled: true });
    expect(unavailable.rename).toEqual({ disabled: true });
    expect(unavailable.pin).toEqual({ disabled: true });
    expect(sessionActionAvailability({ ...base, unavailable: true }).pin).toEqual({ disabled: false });
  });
});
