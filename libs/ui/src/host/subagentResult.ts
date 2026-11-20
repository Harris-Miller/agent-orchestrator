/**
 * The Subagent result (glossary): the one text shape the Hub's subagent tools hand back for a Spawned subagent session,
 * and the only durable trace of it in the parent's transcript (ADR 0013). A `<subagent …>` element around the child's
 * final message; a still-running entry with no message is self-closing. Built and parsed only here.
 */
import { MCP_SERVER_NAME } from '@lib/hub/protocol';

import type { ConfigOptionValues } from './configProbe.ts';

export type SubagentResultStatus = 'cancelled' | 'completed' | 'failed' | 'running';

export type SubagentResult = {
  /** The child's final message (or failure cause / hint for a running child); empty when there is none. */
  readonly body: string;
  /** The child's applied Config option values (not display labels). */
  readonly config: ConfigOptionValues;
  readonly description: string;
  readonly id: string;
  readonly launchTarget: string;
  readonly status: SubagentResultStatus;
  readonly task: string;
};

const STATUSES: readonly string[] = ['cancelled', 'completed', 'failed', 'running'] satisfies SubagentResultStatus[];

const ESCAPES: readonly (readonly [string, string])[] = [
  ['&', '&amp;'],
  ['"', '&quot;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
];

const escapeAttribute = (value: string): string =>
  ESCAPES.reduce((text, [raw, escaped]) => text.replaceAll(raw, escaped), value);

// Unescapes in reverse so `&amp;lt;` reads back as `&lt;`.
const unescapeAttribute = (value: string): string =>
  [...ESCAPES].reverse().reduce((text, [raw, escaped]) => text.replaceAll(escaped, raw), value);

// Body closing tags are escaped as `<\/subagent` (an existing `<\/subagent` gains another backslash) so the body
// cannot end the element early; the parser reverses it.
const escapeBody = (body: string): string => body.replaceAll(/<(\\*)\/subagent/g, '<$1\\/subagent');
const unescapeBody = (body: string): string => body.replaceAll(/<\\(\\*)\/subagent/g, '<$1/subagent');

export const buildSubagentResult = (result: SubagentResult): string => {
  const attributes = Object.entries({
    id: result.id,
    status: result.status,
    launchTarget: result.launchTarget,
    description: result.description,
    config: JSON.stringify(result.config),
    task: result.task,
  })
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(' ');
  return result.body === '' && result.status === 'running'
    ? `<subagent ${attributes} />`
    : `<subagent ${attributes}>\n${escapeBody(result.body)}\n</subagent>`;
};

const ELEMENT = /<subagent((?:\s+[A-Za-z]+="[^"]*")+)\s*(?:\/>|>\n?([\s\S]*?)\n?<\/subagent>)/g;
const ATTRIBUTE = /([A-Za-z]+)="([^"]*)"/g;

const parseConfig = (text: string | undefined): ConfigOptionValues => {
  try {
    const parsed: unknown = JSON.parse(text ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean | string] => {
        return typeof entry[1] === 'string' || typeof entry[1] === 'boolean';
      }),
    );
  } catch {
    return {};
  }
};

/** Every well-formed Subagent result in `text`, in order; text without any gives `[]`. */
export const parseSubagentResults = (text: string): readonly SubagentResult[] => {
  const results: SubagentResult[] = [];
  for (const [, rawAttributes, body] of text.matchAll(ELEMENT)) {
    const attributes = new Map<string, string>();
    for (const [, name, value] of rawAttributes.matchAll(ATTRIBUTE)) {
      attributes.set(name, unescapeAttribute(value));
    }
    const id = attributes.get('id');
    const status = attributes.get('status');
    const launchTarget = attributes.get('launchTarget');
    if (id !== undefined && launchTarget !== undefined && status !== undefined && STATUSES.includes(status)) {
      results.push({
        body: unescapeBody(body ?? ''),
        config: parseConfig(attributes.get('config')),
        description: attributes.get('description') ?? '',
        id,
        launchTarget,
        status: status as SubagentResultStatus,
        task: attributes.get('task') ?? '',
      });
    }
  }
  return results;
};

/**
 * Whether a tool call's title names the Hub's `spawn_subagent` / `wait_subagent`. The live Codex title is
 * `Tool: hoa-hub/spawn_subagent`, a replayed one the bare function name (`mcp__hoa_hub__spawn_subagent`), Claude's
 * `mcp__hoa-hub__spawn_subagent`.
 */
const HUB_SUBAGENT_TOOL = new RegExp(
  `${MCP_SERVER_NAME.replaceAll(/[^a-z0-9]+/gi, '[^a-z0-9]+')}[^a-z0-9]+(?:spawn|wait)_subagent$`,
  'i',
);

export const isHubSubagentToolTitle = (title: string): boolean => HUB_SUBAGENT_TOOL.test(title);
