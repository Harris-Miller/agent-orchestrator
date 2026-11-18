import { assert, describe, it } from '@effect/vitest';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { installDevStateBridge, listAtoms } from './atomInspector.ts';
import type { DevStateBridgeTarget } from './atomInspector.ts';

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

  it('marks Atoms with neither a label nor an export name as internal', () => {
    const registry = AtomRegistry.make();
    const exported = Atom.make('x').pipe(Atom.keepAlive);
    registry.get(exported);
    registry.get(Atom.make('y').pipe(Atom.keepAlive));
    registry.get(labeled('z', 'named'));

    const internal = listAtoms(registry, atom => (atom === exported ? 'exportedAtom' : undefined))
      .filter(entry => entry.internal)
      .map(({ label }) => label);

    assert.strictEqual(internal.length, 1);
    assert.match(internal[0] ?? '', /^anonymous#\d+$/);
  });

  it('keeps labels unique so a label addresses exactly one atom', () => {
    const registry = AtomRegistry.make();
    registry.get(labeled(1, 'dup'));
    registry.get(labeled(2, 'dup'));
    registry.get(labeled(3, 'dup'));

    assert.deepStrictEqual(
      listAtoms(registry).map(({ label }) => label),
      ['dup', 'dup (2)', 'dup (3)'],
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

describe('installDevStateBridge', () => {
  it('reads a JSON-safe value by label, lists all computed values, and rejects unknown labels', () => {
    const registry = AtomRegistry.make();
    registry.get(labeled(new Map([['k', 1]]), 'items'));
    registry.get(labeled(true, 'flag'));
    registry.ensureNode(Atom.make(() => 1).pipe(Atom.withLabel('derived')));
    const target: DevStateBridgeTarget = {};
    installDevStateBridge(registry, target);
    const bridge = target.__HOA__;
    assert.isDefined(bridge);

    assert.deepStrictEqual(JSON.parse(JSON.stringify(bridge.atoms.get('items'))), {
      $type: 'Map',
      entries: [['k', 1]],
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(bridge.atoms.values())), {
      flag: true,
      items: { $type: 'Map', entries: [['k', 1]] },
    });
    assert.deepStrictEqual(bridge.atoms.get('derived'), { $type: 'Uncomputed' });
    assert.throws(() => bridge.atoms.get('nope'), /No atom labeled "nope".*derived, flag, items/);
    assert.isUndefined((bridge as { registry?: unknown } | undefined)?.registry);
  });

  it('leaves internal Atoms out of list() and values() unless asked, but get() still reaches them', () => {
    const registry = AtomRegistry.make();
    registry.get(labeled(1, 'named'));
    const hidden = Atom.make(2).pipe(Atom.keepAlive);
    registry.get(hidden);
    const target: DevStateBridgeTarget = {};
    installDevStateBridge(registry, target);
    const atoms = target.__HOA__?.atoms;
    const anonymous = atoms?.list({ includeInternal: true }).find(entry => entry.internal)?.label ?? '';

    assert.deepStrictEqual(
      atoms?.list().map(({ label }) => label),
      ['named'],
    );
    assert.deepStrictEqual(atoms?.values(), { named: 1 });
    assert.strictEqual(atoms?.list({ includeInternal: true }).length, 2);
    assert.deepStrictEqual(atoms?.values({ includeInternal: true }), { [anonymous]: 2, named: 1 });
    assert.strictEqual(atoms?.get(anonymous), 2);
  });

  it('dispose removes its own install but not a newer one', () => {
    const target: DevStateBridgeTarget = {};
    const first = installDevStateBridge(AtomRegistry.make(), target);
    const second = installDevStateBridge(AtomRegistry.make(), target);
    const installed = target.__HOA__;

    first();
    assert.strictEqual(target.__HOA__, installed);
    second();
    assert.isUndefined(target.__HOA__);
  });
});
