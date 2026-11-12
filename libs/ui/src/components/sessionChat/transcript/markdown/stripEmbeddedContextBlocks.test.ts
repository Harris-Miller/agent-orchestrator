import { assert, describe, it } from '@effect/vitest';

import {
  prepareChatMarkdownText,
  stripEmbeddedContextBlocks,
  stripIdeSelectionBlocks,
  stripSystemReminderBlocks,
} from './stripEmbeddedContextBlocks.ts';

describe('stripEmbeddedContextBlocks', () => {
  it('removes context body so only surrounding prompt remains', () => {
    const input = [
      'Explain to me what the 2 dependencies in [@package.json](file:///tmp/package.json)',
      '<context ref="file:///tmp/package.json">',
      '{',
      '  "name": "acp-adapter-resources",',
      '  "dependencies": { "@agentclientprotocol/codex-acp": "1.8.0" }',
      '}',
      '',
      '</context>',
      'are for',
    ].join('\n');

    assert.strictEqual(
      stripEmbeddedContextBlocks(input),
      'Explain to me what the 2 dependencies in [@package.json](file:///tmp/package.json) are for',
    );
  });

  it('removes multiple context blocks', () => {
    assert.strictEqual(
      stripEmbeddedContextBlocks('a <context ref="x">one</context> b <context>two</context> c'),
      'a b c',
    );
  });

  it('leaves text without context tags unchanged', () => {
    assert.strictEqual(stripEmbeddedContextBlocks('plain [@file](file:///x) text'), 'plain [@file](file:///x) text');
  });
});

describe('stripSystemReminderBlocks', () => {
  it('removes system-reminder body so only the user prompt remains', () => {
    const input = [
      '<system-reminder>',
      'The user started this session without choosing a project folder.',
      "Never ask the user to pick a folder in the app's UI — use the tools.",
      '</system-reminder>',
      '',
      'Where does the narwal bacon?',
    ].join('\n');

    assert.strictEqual(stripSystemReminderBlocks(input), 'Where does the narwal bacon?');
  });

  it('removes multiple system-reminder blocks', () => {
    assert.strictEqual(
      stripSystemReminderBlocks('a <system-reminder>one</system-reminder> b <system-reminder>two</system-reminder> c'),
      'a b c',
    );
  });

  it('leaves text without system-reminder tags unchanged', () => {
    assert.strictEqual(stripSystemReminderBlocks('plain user prompt'), 'plain user prompt');
  });
});

describe('stripIdeSelectionBlocks', () => {
  it('removes ide_selection body so only the user prompt remains', () => {
    const input = [
      '<ide_selection>The user selected the lines 28 to 28 from /Users/hmiller/Projects/dwf/dwf-client/apps/dc-client/rsbuild.config.mts:',
      'PROXY_DEBUG',
      'This may or may not be related to the current task.</ide_selection>I have the dev server running, using the chrome-devtools MCP server, start an new instance of chrome. Then hold while I will authenticate into the locally running app for you',
    ].join('\n');

    assert.strictEqual(
      stripIdeSelectionBlocks(input),
      'I have the dev server running, using the chrome-devtools MCP server, start an new instance of chrome. Then hold while I will authenticate into the locally running app for you',
    );
  });

  it('removes multiple ide_selection blocks', () => {
    assert.strictEqual(
      stripIdeSelectionBlocks('a <ide_selection>one</ide_selection> b <ide_selection>two</ide_selection> c'),
      'a b c',
    );
  });

  it('leaves text without ide_selection tags unchanged', () => {
    assert.strictEqual(stripIdeSelectionBlocks('plain user prompt'), 'plain user prompt');
  });
});

describe('prepareChatMarkdownText', () => {
  it('strips context and keeps @-prefixed FS labels', () => {
    const input = [
      'Explain what the two dependencies in [@package.json](file:///tmp/package.json)',
      '<context ref="file:///tmp/package.json">',
      '{ "name": "acp-adapter-resources" }',
      '</context>',
      'are for',
    ].join('\n');

    assert.strictEqual(
      prepareChatMarkdownText(input),
      'Explain what the two dependencies in [@package.json](file:///tmp/package.json) are for',
    );
  });

  it('strips system-reminder and context together', () => {
    const input = [
      '<system-reminder>',
      'Scratch workspace instructions…',
      '</system-reminder>',
      '',
      'Look at [@notes.md](file:///tmp/notes.md)',
      '<context ref="file:///tmp/notes.md">',
      'hello',
      '</context>',
      'please',
    ].join('\n');

    assert.strictEqual(prepareChatMarkdownText(input), 'Look at [@notes.md](file:///tmp/notes.md) please');
  });

  it('strips ide_selection so only the user prompt remains', () => {
    const input =
      '<ide_selection>The user selected lines 1 to 2 from /tmp/a.ts:\nfoo</ide_selection>Please fix the bug';

    assert.strictEqual(prepareChatMarkdownText(input), 'Please fix the bug');
  });
});
