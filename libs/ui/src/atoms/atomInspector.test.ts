import { assert, describe, it } from '@effect/vitest';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { installAtomDebugBridge, listAtoms } from './atomInspector.ts';
import type { AtomDebugTarget } from './atomInspector.ts';

const labeled = <A>(value: A, label: string) => Atom.make(value).pipe(Atom.withLabel(label), Atom.keepAlive);

describe('listAtoms', () => {
  it('lists registry atoms by label with kind and computed state, sorted', () => {
    const registry = AtomRegistry.make();
    const count = labeled(2, 'count');
    const items = labeled(new Map([['a', 1]]), 'items');
    const derived = Atom.make(get => get(count) + 1).pipe(Atom.withLabel('derived'));
    registry.get(items);
    registry.get(count);
    registry.ensureNode(derived);

    assert.deepStrictEqual(
      listAtoms(registry).map(({ computed, keepAlive, kind, label }) => ({ computed, keepAlive, kind, label })),
      [
        { computed: true, keepAlive: true, kind: 'number', label: 'count' },
        { computed: false, keepAlive: false, kind: 'uncomputed', label: 'derived' },
        { computed: true, keepAlive: true, kind: 'map', label: 'items' },
      ],
    );
  });

  it('names unlabeled atoms from the export-name lookup, else anonymously', () => {
    const registry = AtomRegistry.make();
    const exported = Atom.make('x').pipe(Atom.keepAlive);
    const hidden = Atom.make('y').pipe(Atom.keepAlive);
    registry.get(exported);
    registry.get(hidden);

    const labels = listAtoms(registry, atom => (atom === exported ? 'exportedAtom' : undefined)).map(
      ({ label }) => label,
    );

    assert.include(labels, 'exportedAtom');
    const anonymous = labels.filter(label => label.startsWith('anonymous#'));
    assert.strictEqual(anonymous.length, 1);
    assert.match(anonymous[0] ?? '', /^anonymous#\d+$/);
    assert.deepStrictEqual(
      listAtoms(registry).map(({ label }) => label),
      listAtoms(registry).map(({ label }) => label),
    );
  });
});

describe('installAtomDebugBridge', () => {
  it('reads a JSON-safe value by label, dumps all computed atoms, and rejects unknown labels', () => {
    const registry = AtomRegistry.make();
    registry.get(labeled(new Map([['k', 1]]), 'items'));
    registry.get(labeled(true, 'flag'));
    const target: AtomDebugTarget = {};
    installAtomDebugBridge(registry, target);
    const bridge = target.__HOA__;
    assert.isDefined(bridge);

    assert.deepStrictEqual(JSON.parse(JSON.stringify(bridge?.atoms.get('items'))), {
      $type: 'Map',
      entries: [['k', 1]],
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(bridge?.atoms.dump())), {
      flag: true,
      items: { $type: 'Map', entries: [['k', 1]] },
    });
    assert.throws(() => bridge?.atoms.get('nope'), /No atom labeled "nope".*flag, items/);
    assert.strictEqual(bridge?.registry, registry);
  });

  it('dispose removes its own install but not a newer one', () => {
    const target: AtomDebugTarget = {};
    const first = installAtomDebugBridge(AtomRegistry.make(), target);
    const second = installAtomDebugBridge(AtomRegistry.make(), target);
    const installed = target.__HOA__;

    first();
    assert.strictEqual(target.__HOA__, installed);
    second();
    assert.isUndefined(target.__HOA__);
  });
});
