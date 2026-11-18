// @vitest-environment happy-dom
import { RegistryContext } from '@effect/atom-react';
import { assert, describe, it } from '@effect/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { backendHarnessSnapshotAtom } from '../../atoms/backendState.atoms.ts';
import { connectFakeAgent } from '../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../createHostRuntime.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { ConfirmSessionDeleteDialog } = await import('./ConfirmSessionDeleteDialog.tsx');

const target = { cwd: '/proj', launchTarget: 'codex-acp' as const, sessionId: 's1', title: 'Old' };

afterEach(cleanup);

const renderDialog = (onCancel: () => void, onClientError: (error: unknown) => void) => {
  const registry = AtomRegistry.make();
  updateHarnessSnapshot(registry, 'codex-acp', snapshot => ({
    ...snapshot,
    phase: 'ready',
    sessionHistory: [target],
  }));
  render(
    <RegistryContext.Provider value={registry}>
      <ConfirmSessionDeleteDialog onCancel={onCancel} onClientError={onClientError} target={target} />
    </RegistryContext.Provider>,
  );
  return registry;
};

describe('ConfirmSessionDeleteDialog is optimistic', () => {
  it.effect('closes and drops the History entry without waiting for session/delete', () =>
    Effect.gen(function* () {
      yield* connectFakeAgent('codex-acp', { agent: { 'session/delete': () => Effect.never } });
      const onCancel = vi.fn();
      const onClientError = vi.fn();
      const registry = renderDialog(onCancel, onClientError);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      assert.strictEqual(onCancel.mock.calls.length, 1);
      assert.strictEqual(onClientError.mock.calls.length, 0);
      assert.deepStrictEqual(registry.get(backendHarnessSnapshotAtom('codex-acp')).sessionHistory, []);
      registry.dispose();
    }).pipe(Effect.scoped),
  );

  it.effect('reports a failed session/delete through onClientError after the dialog closed', () =>
    Effect.gen(function* () {
      yield* connectFakeAgent('codex-acp', { agent: { 'session/delete': () => Effect.fail('delete-fail') } });
      const onCancel = vi.fn();
      const onClientError = vi.fn();
      const registry = renderDialog(onCancel, onClientError);

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      assert.strictEqual(onCancel.mock.calls.length, 1);
      yield* Effect.promise(() =>
        waitFor(() => {
          assert.strictEqual(onClientError.mock.calls.length, 1);
        }),
      );
      registry.dispose();
    }).pipe(Effect.scoped),
  );
});
