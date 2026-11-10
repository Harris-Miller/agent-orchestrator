/** Dev state bridge: read-only view of every Atom node in an Atom registry, for the Developer panel and for MCP tools. */
import { Option } from 'effect';
import type { Atom, AtomRegistry } from 'effect/reactivity';

import { classifyValue, toJsonSafe } from './atomValue.ts';
import type { AtomValueKind, JsonValue } from './atomValue.ts';

/** Names an Atom that has no `Atom.withLabel`; may return undefined. */
export type AtomNameOf = (atom: Atom.Atom<unknown>) => string | undefined;

export type AtomSummary = {
  readonly computed: boolean;
  readonly keepAlive: boolean;
  readonly kind: AtomValueKind | 'uncomputed';
  readonly label: string;
};

export type AtomEntry = AtomSummary & {
  /** Undefined until the node is computed; check {@link AtomSummary.computed}. */
  readonly value: unknown;
};

export type AtomDebugBridge = {
  readonly atoms: {
    readonly dump: () => Record<string, JsonValue>;
    readonly get: (label: string) => JsonValue;
    readonly list: () => readonly AtomSummary[];
  };
  readonly registry: AtomRegistry.AtomRegistry;
};

/** Where {@link installAtomDebugBridge} puts the bridge; `window` in apps. */
export type AtomDebugTarget = { __HOA__?: AtomDebugBridge };

declare global {
  interface Window {
    __HOA__?: AtomDebugBridge;
  }
}

const anonymousIds = new WeakMap<object, number>();
let anonymousCount = 0;

const anonymousId = (atom: object): number => {
  const existing = anonymousIds.get(atom);
  if (existing !== undefined) {
    return existing;
  }
  anonymousCount += 1;
  anonymousIds.set(atom, anonymousCount);
  return anonymousCount;
};

/** Reads node values without computing or subscribing, so inspecting never keeps an Atom alive. */
export const listAtoms = (
  registry: AtomRegistry.AtomRegistry,
  nameOf: AtomNameOf = () => undefined,
): readonly AtomEntry[] =>
  [...registry.getNodes().values()]
    .map((node: AtomRegistry.Node<unknown>): AtomEntry => {
      const value = node.valueOption();
      return {
        computed: Option.isSome(value),
        keepAlive: node.atom.keepAlive,
        kind: Option.isSome(value) ? classifyValue(value.value) : 'uncomputed',
        label: node.atom.label?.[0] ?? nameOf(node.atom) ?? `anonymous#${anonymousId(node.atom)}`,
        value: Option.getOrUndefined(value),
      };
    })
    .toSorted((a, b) => a.label.localeCompare(b.label));

/** Puts the bridge on `target` (never replaced if a newer install exists on dispose). Returns dispose. */
export const installAtomDebugBridge = (
  registry: AtomRegistry.AtomRegistry,
  target: AtomDebugTarget,
  nameOf?: AtomNameOf,
): (() => void) => {
  const bridge: AtomDebugBridge = {
    atoms: {
      dump: () =>
        Object.fromEntries(
          listAtoms(registry, nameOf)
            .filter(entry => entry.computed)
            .map(entry => [entry.label, toJsonSafe(entry.value)]),
        ),
      get: label => {
        const entries = listAtoms(registry, nameOf);
        const entry = entries.find(candidate => candidate.label === label);
        if (entry === undefined) {
          throw new Error(`No atom labeled "${label}". Known labels: ${entries.map(e => e.label).join(', ')}`);
        }
        return entry.computed ? toJsonSafe(entry.value) : '[uncomputed]';
      },
      list: () =>
        listAtoms(registry, nameOf).map(({ computed, keepAlive, kind, label }) => ({
          computed,
          keepAlive,
          kind,
          label,
        })),
    },
    registry,
  };
  target.__HOA__ = bridge;
  return () => {
    if (target.__HOA__ === bridge) {
      delete target.__HOA__;
    }
  };
};
