import { assert, describe, it } from '@effect/vitest';
import { AtomRegistry } from 'effect/reactivity';
import type { Atom } from 'effect/reactivity';

import { configOptionIndexFromProbeResponses } from '../host/configOptionIndexFixtures.ts';

import {
  clearSelected,
  configOptionIndexAtom,
  selectedAtom,
  selectSession,
  virtualMaterializingAtom,
} from './backendState.atoms.ts';
import { rwFromRegistry } from './virtualBind.ts';
import {
  applyVirtualSessionFolderChurn,
  discardVirtualSession,
  ensureVirtualSession,
  lastCreateDefaultsAtom,
  setVirtualLaunchTarget,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

describe('ensureVirtualSession', () => {
  it('creates empty blob + Selects Virtual when none exists', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    ensureVirtualSession(rw);
    assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
    assert.deepStrictEqual(registry.get(virtualSessionAtom), {
      attachments: [],
      configValues: {},
      cwd: undefined,
      draft: '',
      launchTarget: undefined,
    });
  });

  it('no-ops when already Selected Virtual (Create)', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    ensureVirtualSession(rw, { cwd: '/a' });
    registry.set(virtualSessionAtom, {
      attachments: [],
      configValues: { model: 'x' },
      cwd: '/a',
      draft: 'hello',
      launchTarget: 'codex-acp',
    });
    ensureVirtualSession(rw, { cwd: '/b' });
    assert.strictEqual(registry.get(virtualSessionAtom)?.cwd, '/a');
    assert.strictEqual(registry.get(virtualSessionAtom)?.draft, 'hello');
  });

  it('cwd-group patches cwd when already Selected Virtual', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    ensureVirtualSession(rw, { cwd: '/a' });
    ensureVirtualSession(rw, { cwd: '/b', patchCwdIfSelectedVirtual: true });
    assert.strictEqual(registry.get(virtualSessionAtom)?.cwd, '/b');
  });

  it('re-Selects existing blob without recreating', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    ensureVirtualSession(rw, { cwd: '/proj' });
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
    ensureVirtualSession(rw);
    assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
    assert.strictEqual(registry.get(virtualSessionAtom)?.cwd, '/proj');
  });

  it('seeds from lastCreateDefaults', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    registry.set(lastCreateDefaultsAtom, {
      configValues: { mode: 'default', model: 'sonnet' },
      launchTarget: 'claude-agent-acp',
    });
    ensureVirtualSession(rw);
    const blob = registry.get(virtualSessionAtom);
    assert.strictEqual(blob?.launchTarget, 'claude-agent-acp');
    assert.strictEqual(blob?.configValues.model, 'sonnet');
  });

  it('no-ops while lifecycle in-flight', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    registry.set(virtualMaterializingAtom, true);
    ensureVirtualSession(rw);
    assert.isNull(registry.get(virtualSessionAtom));
    assert.isUndefined(registry.get(selectedAtom));
  });
});

describe('selection in-flight guards', () => {
  it('selectSession / clearSelected no-op while in-flight', () => {
    const registry = AtomRegistry.make();
    const get = Object.assign(((atom: Atom.Atom<unknown>) => registry.get(atom)) as Atom.FnContext, {
      set: <R, W>(atom: Atom.Writable<R, W>, value: W) => {
        registry.set(atom, value);
      },
    });
    registry.set(selectedAtom, { _tag: 'Virtual' });
    registry.set(virtualMaterializingAtom, true);
    selectSession(get, 's1');
    assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
    clearSelected(get);
    assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
  });

  /**
   * Contract: lifecycle lock must be clear once Selected is Session, even if
   * session/prompt is still running — otherwise switch/create stays stuck.
   */
  it('selectSession / ensureVirtual work after lifecycle lock released', () => {
    const registry = AtomRegistry.make();
    const get = Object.assign(((atom: Atom.Atom<unknown>) => registry.get(atom)) as Atom.FnContext, {
      set: <R, W>(atom: Atom.Writable<R, W>, value: W) => {
        registry.set(atom, value);
      },
    });
    const rw = rwFromRegistry(registry);
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
    registry.set(virtualMaterializingAtom, false);

    selectSession(get, 's2');
    assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Session', sessionId: 's2' });

    ensureVirtualSession(rw, { cwd: '/proj' });
    assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
    assert.strictEqual(registry.get(virtualSessionAtom)?.cwd, '/proj');
  });
});

describe('setVirtualLaunchTarget', () => {
  it('hard-resets config; keeps draft + cwd; prefers lastCreateDefaults when LT matches', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    registry.set(
      configOptionIndexAtom('codex-acp'),
      configOptionIndexFromProbeResponses(
        'gpt',
        {
          gpt: {
            configOptions: [
              {
                currentValue: 'gpt',
                id: 'model',
                name: 'Model',
                options: [{ name: 'gpt', value: 'gpt' }],
                type: 'select',
              },
            ],
          },
        },
        [],
      ),
    );
    registry.set(lastCreateDefaultsAtom, {
      configValues: { effort: 'high', model: 'gpt' },
      launchTarget: 'codex-acp',
    });
    registry.set(virtualSessionAtom, {
      attachments: [],
      configValues: { model: 'other' },
      cwd: '/proj',
      draft: 'keep me',
      launchTarget: 'claude-agent-acp',
    });
    setVirtualLaunchTarget(rw, 'codex-acp');
    const blob = registry.get(virtualSessionAtom);
    assert.strictEqual(blob?.draft, 'keep me');
    assert.strictEqual(blob?.cwd, '/proj');
    assert.strictEqual(blob?.launchTarget, 'codex-acp');
    assert.strictEqual(blob?.configValues.model, 'gpt');
  });
});

describe('applyVirtualSessionFolderChurn', () => {
  it('patches cwd + Selects Virtual when next cwd present', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    registry.set(virtualSessionAtom, {
      attachments: [],
      configValues: { model: 'x' },
      cwd: '/old',
      draft: 'd',
      launchTarget: 'codex-acp',
    });
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
    applyVirtualSessionFolderChurn(rw, '/new');
    assert.deepStrictEqual(registry.get(selectedAtom), { _tag: 'Virtual' });
    assert.strictEqual(registry.get(virtualSessionAtom)?.cwd, '/new');
    assert.strictEqual(registry.get(virtualSessionAtom)?.draft, 'd');
  });

  it('discards blob + clears Selected when no cwd', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    ensureVirtualSession(rw, { cwd: '/old' });
    applyVirtualSessionFolderChurn(rw, undefined);
    assert.isNull(registry.get(virtualSessionAtom));
    assert.isUndefined(registry.get(selectedAtom));
  });
});

describe('discardVirtualSession', () => {
  it('clears blob', () => {
    const registry = AtomRegistry.make();
    const rw = rwFromRegistry(registry);
    ensureVirtualSession(rw);
    discardVirtualSession(rw);
    assert.isNull(registry.get(virtualSessionAtom));
  });
});
