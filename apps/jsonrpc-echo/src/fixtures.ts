import { Effect } from 'effect';

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = path.join(fileURLToPath(new URL('..', import.meta.url)), 'fixtures');

const FIXTURE_PREFIX = /^\/fixture\s+(\S+)/;

const DEFAULT_FIXTURE = 'simple-reply';

export type PromptBlock = {
  readonly text?: string;
  readonly type?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** First `/fixture <name>` in prompt text selects a fixtures/<name>.jsonl file. */
export const resolveFixtureName = (prompt: readonly PromptBlock[]): string => {
  for (const block of prompt) {
    if (block.type === 'text' && block.text !== undefined) {
      const match = FIXTURE_PREFIX.exec(block.text.trim());
      if (match !== null) {
        return match[1];
      }
    }
  }

  return DEFAULT_FIXTURE;
};

export const promptText = (prompt: readonly PromptBlock[]): string =>
  prompt
    .filter((block): block is { text: string } & PromptBlock => block.type === 'text' && block.text !== undefined)
    .map(block => block.text)
    .join('\n');

/** Replace `{{promptText}}` string leaves with the joined prompt text. */
export const applyPromptTemplate = (value: unknown, templateText: string): unknown => {
  if (value === '{{promptText}}') {
    return templateText;
  }

  if (Array.isArray(value)) {
    return value.map(item => applyPromptTemplate(item, templateText));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, applyPromptTemplate(item, templateText)]),
    );
  }

  return value;
};

/** Parse NDJSON fixture lines into ACP `SessionUpdate` objects. */
export const parseFixtureLines = (text: string): unknown[] => {
  const updates: unknown[] = [];

  for (const [index, line] of text.split('\n').entries()) {
    const trimmed = line.trim();
    if (trimmed !== '' && !trimmed.startsWith('#')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        throw new Error(`fixture line ${String(index + 1)}: invalid JSON`);
      }

      if (!isRecord(parsed) || typeof parsed.sessionUpdate !== 'string') {
        throw new Error(`fixture line ${String(index + 1)}: expected object with sessionUpdate`);
      }

      updates.push(parsed);
    }
  }

  return updates;
};

export const loadFixtureUpdates = (name: string) =>
  Effect.sync(() => {
    const fixturePath = path.join(FIXTURES_DIR, `${name}.jsonl`);

    if (!existsSync(fixturePath)) {
      throw new Error(`fixture not found: ${name}`);
    }

    return parseFixtureLines(readFileSync(fixturePath, 'utf8'));
  });

export const resolveFixtureUpdates = (prompt: readonly PromptBlock[]) =>
  Effect.gen(function* () {
    const name = resolveFixtureName(prompt);
    const template = promptText(prompt);
    const updates = yield* loadFixtureUpdates(name);
    return updates.map(update => applyPromptTemplate(update, template));
  });
