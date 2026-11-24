/**
 * The Subagent result (glossary): the one text shape the Hub's subagent tools hand back for a Spawned subagent session,
 * and the only durable trace of it in the parent's transcript (ADR 0013). A `<subagent …>` element around the child's
 * final message; a still-running entry with no message is self-closing. Built and parsed only here.
 */
import { MCP_SERVER_NAME } from '@lib/hub/protocol';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
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

/** A Subagent result whose launch target is a known one (validated once, where the reducer stores results). */
export type KnownSubagentResult = Omit<SubagentResult, 'launchTarget'> & { readonly launchTarget: AgentLaunchTarget };

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
const escapeBody = (body: string, tag = 'subagent'): string =>
  // `</tag` preceded by any run of backslashes after `<`: `<\\*/tag` → one more backslash.
  body.replaceAll(new RegExp(`<(\\\\*)/${tag}`, 'g'), `<$1\\/${tag}`);
// Reverse: `<\\+/tag` → one backslash fewer.
const unescapeBody = (body: string, tag = 'subagent'): string =>
  body.replaceAll(new RegExp(`<\\\\(\\\\*)/${tag}`, 'g'), `<$1/${tag}`);

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

export type SubagentReportStatus = Exclude<SubagentResultStatus, 'running'>;

/** A parsed Subagent report: the second persisted contract, the user message that hands a background child's outcome to its parent. */
export type SubagentReport = {
  readonly body: string;
  readonly description: string;
  readonly id: string;
  readonly status: SubagentReportStatus;
  readonly task: string;
};

const isReportStatus = (status: string): status is SubagentReportStatus =>
  status === 'cancelled' || status === 'completed' || status === 'failed';

const REPORT_TAG = 'subagent-report';

/** One line: a newline would blur where the header ends and the body begins. */
const oneLine = (value: string): string => value.replaceAll(/\s*\n\s*/g, ' ');

/** The Subagent report text; built and parsed only here. Description and task are flattened to one line. */
export const buildSubagentReportText = (report: SubagentReport): string =>
  `<subagent-report id="${escapeAttribute(report.id)}" status="${report.status}">\nsubagent: ${oneLine(report.description)}\ntask: ${oneLine(report.task)}\n\n${escapeBody(report.body, REPORT_TAG)}\n</subagent-report>`;

const REPORT = new RegExp(
  `<${REPORT_TAG}\\s+id="([^"]*)"\\s+status="([^"]*)"\\s*>\\nsubagent: ([^\\n]*)\\ntask: ([^\\n]*)\\n\\n([\\s\\S]*?)\\n</${REPORT_TAG}>`,
  'g',
);

/** Whether `text` contains the opening report tag: such a user message's text is verbatim, never image-lifted. */
export const opensSubagentReport = (text: string): boolean => text.includes(`<${REPORT_TAG}`);

/** Whether `text` holds an opening and a closing report tag: a cheap gate so partial streamed text is not parsed. */
export const hasSubagentReport = (text: string): boolean =>
  text.includes(`<${REPORT_TAG}`) && text.includes(`</${REPORT_TAG}`);

/** Every well-formed Subagent report in `text`, in order; malformed ones or other statuses are skipped. CRLF is tolerated. */
export const parseSubagentReports = (text: string): readonly SubagentReport[] =>
  [...text.replaceAll('\r\n', '\n').matchAll(REPORT)].flatMap(([, id, status, description, task, body]) =>
    isReportStatus(status)
      ? [
          {
            body: unescapeBody(body, REPORT_TAG),
            description,
            id: unescapeAttribute(id),
            status,
            task,
          },
        ]
      : [],
  );
