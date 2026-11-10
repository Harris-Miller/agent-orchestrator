import { assert, describe, it } from '@effect/vitest';
import { Cause, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';

import { classifyValue, MAX_DEPTH, MAX_ITEMS, toJsonSafe } from './atomValue.ts';

describe('classifyValue', () => {
  it('names the kind of every runtime shape an Atom can hold', () => {
    const cases: readonly (readonly [unknown, string])[] = [
      [null, 'null'],
      [undefined, 'undefined'],
      [true, 'boolean'],
      [1, 'number'],
      [1n, 'bigint'],
      ['a', 'string'],
      [Symbol('s'), 'symbol'],
      [() => 1, 'function'],
      [Option.some(1), 'option'],
      [Option.none(), 'option'],
      [AsyncResult.success(1), 'async-result'],
      [AsyncResult.initial(), 'async-result'],
      [Cause.fail('boom'), 'cause'],
      [[1], 'array'],
      [new Map(), 'map'],
      [new Set(), 'set'],
      [new Date(0), 'date'],
      [new Error('x'), 'error'],
      [{ a: 1 }, 'object'],
      [Object.create(null), 'object'],
    ];
    for (const [value, kind] of cases) {
      assert.strictEqual(classifyValue(value).kind, kind);
    }
  });
});

describe('toJsonSafe', () => {
  it('returns JSON-stringifiable output with tagged containers for non-JSON values', () => {
    const output = toJsonSafe({
      big: 10n,
      date: new Date(0),
      error: new TypeError('bad'),
      fn: function named() {
        return 1;
      },
      map: new Map([['k', 1]]),
      none: Option.none(),
      nan: Number.NaN,
      set: new Set([1, 2]),
      some: Option.some('v'),
      undef: undefined,
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(output)), {
      big: '10n',
      date: { $type: 'Date', iso: '1970-01-01T00:00:00.000Z' },
      error: { $type: 'Error', message: 'bad', name: 'TypeError' },
      fn: '[Function named]',
      map: { $type: 'Map', entries: [['k', 1]] },
      nan: 'NaN',
      none: { $type: 'None' },
      set: { $type: 'Set', values: [1, 2] },
      some: { $type: 'Some', value: 'v' },
      undef: '[undefined]',
    });
  });

  it('renders AsyncResult by state, with the failure Cause as text', () => {
    assert.deepStrictEqual(toJsonSafe(AsyncResult.initial(true)), {
      $type: 'AsyncResult',
      state: 'Initial',
      waiting: true,
    });
    assert.deepStrictEqual(toJsonSafe(AsyncResult.success({ n: 1 })), {
      $type: 'AsyncResult',
      state: 'Success',
      value: { n: 1 },
      waiting: false,
    });
    const failure = toJsonSafe(AsyncResult.fail('nope'));
    assert.strictEqual((failure as { state: string }).state, 'Failure');
    assert.include((failure as { cause: string }).cause, 'nope');
  });

  it('escapes user keys starting with $ so they cannot be mistaken for tags', () => {
    class Point {
      readonly x = 1;
    }
    assert.deepStrictEqual(toJsonSafe({ $type: 'Map', $other: 1, ok: 2 }), { $$other: 1, $$type: 'Map', ok: 2 });
    assert.deepStrictEqual(toJsonSafe(new Point()), { $type: 'Point', x: 1 });
  });

  it('marks circular references but keeps repeated non-circular ones', () => {
    const shared = { n: 1 };
    const loop: Record<string, unknown> = { shared, again: shared };
    loop.self = loop;
    assert.deepStrictEqual(toJsonSafe(loop), { again: { n: 1 }, self: '[Circular]', shared: { n: 1 } });
  });

  it('truncates long collections and deep nesting', () => {
    const long = toJsonSafe(Array.from({ length: MAX_ITEMS + 5 }, (_, i) => i)) as unknown[];
    assert.strictEqual(long.length, MAX_ITEMS + 1);
    assert.strictEqual(long.at(-1), '[… 5 more]');

    let deep: unknown = 'leaf';
    for (let i = 0; i < MAX_DEPTH + 2; i += 1) {
      deep = { next: deep };
    }
    assert.include(JSON.stringify(toJsonSafe(deep)), '[MaxDepth]');
  });
});
