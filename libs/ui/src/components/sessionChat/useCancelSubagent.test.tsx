// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { CODEX } from '../../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../createHostRuntime.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';

const { cancelAtomMock } = vi.hoisted(() => ({ cancelAtomMock: vi.fn() }));

// Only the atom setter is stubbed; the real hook runs.
vi.mock('@effect/atom-react', () => ({ useAtomSet: () => cancelAtomMock }));

bindHostRuntime(createHostRuntime(mockHostLayer));
const { useCancelSubagent } = await import('./useCancelSubagent.ts');

describe('useCancelSubagent', () => {
  it('re-enables and reports the error when the cancel fails', async () => {
    const error = new Error('boom');
    cancelAtomMock.mockRejectedValueOnce(error);
    const onClientError = vi.fn();
    const { result } = renderHook(() => useCancelSubagent(CODEX, 'c1', onClientError));
    act(() => {
      result.current.cancel();
    });
    await waitFor(() => {
      assert.deepStrictEqual(onClientError.mock.calls, [[error]]);
    });
    assert.isFalse(result.current.cancelRequested);
    assert.deepStrictEqual(cancelAtomMock.mock.calls.at(-1), [{ launchTarget: CODEX, sessionId: 'c1' }]);
  });

  it('stays disabled when the cancel succeeds', async () => {
    cancelAtomMock.mockResolvedValueOnce(undefined);
    const onClientError = vi.fn();
    const { result } = renderHook(() => useCancelSubagent(CODEX, 'c1', onClientError));
    await act(async () => {
      result.current.cancel();
      await Promise.resolve();
    });
    assert.isTrue(result.current.cancelRequested);
    assert.strictEqual(onClientError.mock.calls.length, 0);
  });
});
