/** What an Atom can hold, as the Developer panel and the Dev state bridge see it: a kind per runtime shape and a JSON-safe copy. */
import { Cause, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';

import { isRecord } from '../isRecord.ts';

export const MAX_DEPTH = 8;
export const MAX_ITEMS = 100;

export type AtomValueKind =
  | 'array'
  | 'async-result'
  | 'bigint'
  | 'boolean'
  | 'cause'
  | 'date'
  | 'error'
  | 'function'
  | 'map'
  | 'null'
  | 'number'
  | 'object'
  | 'option'
  | 'set'
  | 'string'
  | 'symbol'
  | 'undefined';

export type JsonValue = boolean | number | string | JsonValue[] | { [key: string]: JsonValue } | null;

export const classifyValue = (value: unknown): AtomValueKind => {
  if (value === null) {
    return 'null';
  }
  const type = typeof value;
  if (type !== 'object') {
    return type;
  }
  if (Option.isOption(value)) {
    return 'option';
  }
  if (AsyncResult.isAsyncResult(value)) {
    return 'async-result';
  }
  if (Cause.isCause(value)) {
    return 'cause';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value instanceof Map) {
    return 'map';
  }
  if (value instanceof Set) {
    return 'set';
  }
  if (value instanceof Date) {
    return 'date';
  }
  if (value instanceof Error) {
    return 'error';
  }
  return 'object';
};

const capped = <A, B>(items: readonly A[], f: (item: A) => B): (B | string)[] => {
  const out: (B | string)[] = items.slice(0, MAX_ITEMS).map(f);
  if (items.length > MAX_ITEMS) {
    out.push(`[… ${items.length - MAX_ITEMS} more]`);
  }
  return out;
};

const constructorName = (value: object): string | undefined => {
  const prototype: unknown = Object.getPrototypeOf(value);
  const constructor = isRecord(prototype) ? prototype.constructor : undefined;
  return typeof constructor === 'function' && constructor.name !== 'Object' ? constructor.name : undefined;
};

const asyncResultJson = (
  result: AsyncResult.AsyncResult<unknown, unknown>,
  walk: (child: unknown) => JsonValue,
): JsonValue => {
  const base = { $type: 'AsyncResult', waiting: result.waiting };
  if (AsyncResult.isInitial(result)) {
    return { ...base, state: 'Initial' };
  }
  if (AsyncResult.isSuccess(result)) {
    return { ...base, state: 'Success', value: walk(result.value) };
  }
  return { ...base, cause: Cause.pretty(result.cause), state: 'Failure' };
};

const objectJson = (value: object, walk: (child: unknown) => JsonValue): JsonValue => {
  const entries = Object.entries(value);
  const out: Record<string, JsonValue> = {};
  const name = constructorName(value);
  if (name !== undefined) {
    out.$type = name;
  }
  for (const [key, child] of entries.slice(0, MAX_ITEMS)) {
    out[key] = walk(child);
  }
  if (entries.length > MAX_ITEMS) {
    out['…'] = `${entries.length - MAX_ITEMS} more`;
  }
  return out;
};

/** Copy of an Atom value that survives `JSON.stringify`: tags Map/Set/Option/AsyncResult/Error, marks cycles, caps depth and size. */
export const toJsonSafe = (value: unknown): JsonValue => {
  const ancestors = new Set<unknown>();
  const walk = (current: unknown, depth: number): JsonValue => {
    switch (classifyValue(current)) {
      case 'null':
        return null;
      case 'boolean':
      case 'string':
        return current as boolean | string;
      case 'number':
        return Number.isFinite(current) ? (current as number) : String(current);
      case 'bigint':
        return `${String(current)}n`;
      case 'symbol':
        return String(current);
      case 'undefined':
        return '[undefined]';
      case 'function':
        return `[Function ${(current as { name: string }).name || 'anonymous'}]`;
      default:
        break;
    }
    if (depth >= MAX_DEPTH) {
      return '[MaxDepth]';
    }
    if (ancestors.has(current)) {
      return '[Circular]';
    }
    ancestors.add(current);
    try {
      const child = (next: unknown): JsonValue => walk(next, depth + 1);
      switch (classifyValue(current)) {
        case 'option':
          return Option.isSome(current as Option.Option<unknown>)
            ? { $type: 'Some', value: child((current as Option.Some<unknown>).value) }
            : { $type: 'None' };
        case 'async-result':
          return asyncResultJson(current as AsyncResult.AsyncResult<unknown, unknown>, child);
        case 'cause':
          return { $type: 'Cause', pretty: Cause.pretty(current as Cause.Cause<unknown>) };
        case 'array':
          return capped(current as unknown[], child);
        case 'map':
          return {
            $type: 'Map',
            entries: capped([...(current as Map<unknown, unknown>)], ([k, v]) => [child(k), child(v)]),
          };
        case 'set':
          return { $type: 'Set', values: capped([...(current as Set<unknown>)], child) };
        case 'date': {
          const time = (current as Date).getTime();
          return { $type: 'Date', iso: Number.isNaN(time) ? 'Invalid Date' : new Date(time).toISOString() };
        }
        case 'error': {
          const { message, name } = current as Error;
          return { $type: 'Error', message, name };
        }
        default:
          return objectJson(current as object, child);
      }
    } finally {
      ancestors.delete(current);
    }
  };
  return walk(value, 0);
};
