/** What an Atom can hold, as the Developer panel and the Dev state bridge see it: a kind per runtime shape and a JSON-safe copy. */
import { Cause, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';

import { isRecord } from '../isRecord.ts';

export const MAX_DEPTH = 8;
export const MAX_ITEMS = 100;

/** An Atom value tagged with the kind that decides how it is shown; narrowing on `kind` types `value`. */
export type ClassifiedValue =
  | { readonly kind: 'array'; readonly value: readonly unknown[] }
  | { readonly kind: 'async-result'; readonly value: AsyncResult.AsyncResult<unknown, unknown> }
  | { readonly kind: 'bigint'; readonly value: bigint }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'cause'; readonly value: Cause.Cause<unknown> }
  | { readonly kind: 'date'; readonly value: Date }
  | { readonly kind: 'error'; readonly value: Error }
  | { readonly kind: 'function'; readonly value: { readonly name: string } }
  | { readonly kind: 'map'; readonly value: ReadonlyMap<unknown, unknown> }
  | { readonly kind: 'null'; readonly value: null }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'object'; readonly value: Record<string, unknown> }
  | { readonly kind: 'option'; readonly value: Option.Option<unknown> }
  | { readonly kind: 'set'; readonly value: ReadonlySet<unknown> }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'symbol'; readonly value: symbol }
  | { readonly kind: 'undefined'; readonly value: undefined };

export type AtomValueKind = ClassifiedValue['kind'];

export type JsonValue = boolean | number | string | JsonValue[] | { [key: string]: JsonValue } | null;

export const classifyValue = (value: unknown): ClassifiedValue => {
  if (value === null) {
    return { kind: 'null', value };
  }
  switch (typeof value) {
    case 'bigint':
      return { kind: 'bigint', value };
    case 'boolean':
      return { kind: 'boolean', value };
    case 'function':
      return { kind: 'function', value };
    case 'number':
      return { kind: 'number', value };
    case 'string':
      return { kind: 'string', value };
    case 'symbol':
      return { kind: 'symbol', value };
    case 'undefined':
      return { kind: 'undefined', value };
    default:
      break;
  }
  if (Option.isOption(value)) {
    return { kind: 'option', value };
  }
  if (AsyncResult.isAsyncResult(value)) {
    return { kind: 'async-result', value };
  }
  if (Cause.isCause(value)) {
    return { kind: 'cause', value };
  }
  if (Array.isArray(value)) {
    return { kind: 'array', value: value as readonly unknown[] };
  }
  if (value instanceof Map) {
    return { kind: 'map', value: value as ReadonlyMap<unknown, unknown> };
  }
  if (value instanceof Set) {
    return { kind: 'set', value: value as ReadonlySet<unknown> };
  }
  if (value instanceof Date) {
    return { kind: 'date', value };
  }
  if (value instanceof Error) {
    return { kind: 'error', value };
  }
  return { kind: 'object', value: value as Record<string, unknown> };
};

/** How many of `total` items {@link MAX_ITEMS} leaves out. */
export const hiddenCount = (total: number): number => Math.max(0, total - MAX_ITEMS);

/** First {@link MAX_ITEMS} items and how many were left out. */
export const limitItems = <A>(items: readonly A[]): { readonly hidden: number; readonly shown: readonly A[] } => ({
  hidden: hiddenCount(items.length),
  shown: items.slice(0, MAX_ITEMS),
});

export const hiddenItemsText = (hidden: number): string => `[… ${hidden} more]`;

export const bigintText = (value: bigint): string => `${String(value)}n`;

export const functionName = (value: { readonly name: string }): string => value.name || 'anonymous';

export const dateIso = (value: Date): string => (Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString());

export const asyncResultState = (
  result: AsyncResult.AsyncResult<unknown, unknown>,
): 'Failure' | 'Initial' | 'Success' => {
  if (AsyncResult.isInitial(result)) {
    return 'Initial';
  }
  return AsyncResult.isSuccess(result) ? 'Success' : 'Failure';
};

/** Class name of a non-plain object, else undefined. */
export const constructorName = (value: object): string | undefined => {
  const prototype: unknown = Object.getPrototypeOf(value);
  const constructor = isRecord(prototype) ? prototype.constructor : undefined;
  return typeof constructor === 'function' && constructor.name !== 'Object' ? constructor.name : undefined;
};

/** Keys starting with `$` get one more `$`, so a user key can never collide with a `$type` tag. */
export const escapeKey = (key: string): string => (key.startsWith('$') ? `$${key}` : key);

const capped = <A, B>(items: readonly A[], f: (item: A) => B): (B | string)[] => {
  const { hidden, shown } = limitItems(items);
  const out: (B | string)[] = shown.map(f);
  if (hidden > 0) {
    out.push(hiddenItemsText(hidden));
  }
  return out;
};

const asyncResultJson = (
  result: AsyncResult.AsyncResult<unknown, unknown>,
  walk: (child: unknown) => JsonValue,
): JsonValue => {
  const base = { $type: 'AsyncResult', state: asyncResultState(result), waiting: result.waiting };
  if (AsyncResult.isSuccess(result)) {
    return { ...base, value: walk(result.value) };
  }
  return AsyncResult.isFailure(result) ? { ...base, cause: Cause.pretty(result.cause) } : base;
};

const objectJson = (value: object, walk: (child: unknown) => JsonValue): JsonValue => {
  const { hidden, shown } = limitItems(Object.entries(value));
  const out: Record<string, JsonValue> = {};
  const name = constructorName(value);
  if (name !== undefined) {
    out.$type = name;
  }
  for (const [key, child] of shown) {
    out[escapeKey(key)] = walk(child);
  }
  if (hidden > 0) {
    out['…'] = `${hidden} more`;
  }
  return out;
};

/** Copy of an Atom value that survives `JSON.stringify`: tags Map/Set/Option/AsyncResult/Error, marks cycles, caps depth and size. */
export const toJsonSafe = (value: unknown): JsonValue => {
  const ancestors = new Set<unknown>();
  const walk = (current: unknown, depth: number): JsonValue => {
    const classified = classifyValue(current);
    switch (classified.kind) {
      case 'null':
        return null;
      case 'boolean':
      case 'string':
        return classified.value;
      case 'number':
        return Number.isFinite(classified.value) ? classified.value : String(classified.value);
      case 'bigint':
        return bigintText(classified.value);
      case 'symbol':
        return String(classified.value);
      case 'undefined':
        return '[undefined]';
      case 'function':
        return `[Function ${functionName(classified.value)}]`;
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
      switch (classified.kind) {
        case 'option':
          return Option.isSome(classified.value)
            ? { $type: 'Some', value: child(classified.value.value) }
            : { $type: 'None' };
        case 'async-result':
          return asyncResultJson(classified.value, child);
        case 'cause':
          return { $type: 'Cause', pretty: Cause.pretty(classified.value) };
        case 'array':
          return capped(classified.value, child);
        case 'map':
          return { $type: 'Map', entries: capped([...classified.value], ([k, v]) => [child(k), child(v)]) };
        case 'set':
          return { $type: 'Set', values: capped([...classified.value], child) };
        case 'date':
          return { $type: 'Date', iso: dateIso(classified.value) };
        case 'error':
          return { $type: 'Error', message: classified.value.message, name: classified.value.name };
        case 'object':
          return objectJson(classified.value, child);
      }
    } finally {
      ancestors.delete(current);
    }
  };
  return walk(value, 0);
};
