import { assert, describe, it } from '@effect/vitest';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { agentCapabilitiesFrom, clientCapabilitiesFor, NO_AGENT_CAPABILITIES } from './agentCapabilities.ts';
import type { AgentCapabilities } from './agentCapabilities.ts';

const ALL: AgentCapabilities = {
  promptEmbeddedContext: true,
  promptImage: true,
  sessionAdditionalDirectories: true,
  sessionArchive: true,
  sessionClose: true,
  sessionDelete: true,
  sessionFork: true,
  sessionRename: true,
  sessionResume: true,
  steeringSupported: true,
};

const claudeWithAir = {
  _meta: {
    jetbrains: { air: { capabilities: ['sessionIndex', 'sessionArchive', 'sessionRename'], version: 1 } },
    steering: { supported: true },
  },
  agentCapabilities: {
    promptCapabilities: { embeddedContext: true, image: true },
    sessionCapabilities: { additionalDirectories: {}, close: {}, delete: {}, fork: {}, list: {}, resume: {} },
  },
  protocolVersion: 1,
};

const codexWithoutAir = {
  agentCapabilities: {
    promptCapabilities: { embeddedContext: true, image: true },
    sessionCapabilities: { additionalDirectories: {}, close: {}, delete: {}, fork: {}, list: {}, resume: {} },
  },
  protocolVersion: 1,
};

const withSessionCapability = (close: unknown) => ({ agentCapabilities: { sessionCapabilities: { close } } });

describe('agentCapabilitiesFrom sessionAdditionalDirectories', () => {
  const read = (sessionCapabilities: unknown) =>
    agentCapabilitiesFrom('codex-acp', { agentCapabilities: { sessionCapabilities } }).sessionAdditionalDirectories;

  it('is advertised when sessionCapabilities.additionalDirectories is true or an object', () => {
    assert.isTrue(read({ additionalDirectories: true }));
    assert.isTrue(read({ additionalDirectories: {} }));
  });

  it('defaults to not advertised', () => {
    assert.isFalse(read({}));
    assert.isFalse(read({ additionalDirectories: false }));
    assert.isFalse(agentCapabilitiesFrom('codex-acp', undefined).sessionAdditionalDirectories);
    assert.isFalse(NO_AGENT_CAPABILITIES.sessionAdditionalDirectories);
  });
});

describe('agentCapabilitiesFrom', () => {
  const table: readonly (readonly [string, AgentLaunchTarget, unknown, AgentCapabilities])[] = [
    ['Claude with AIR advertises everything', 'claude-agent-acp', claudeWithAir, ALL],
    [
      'Codex without AIR _meta has no archive, rename or steering',
      'codex-acp',
      codexWithoutAir,
      { ...ALL, sessionArchive: false, sessionRename: false, steeringSupported: false },
    ],
    [
      'Antigravity-like list + resume only',
      'antigravity-acp',
      { agentCapabilities: { sessionCapabilities: { list: {}, resume: {} } } },
      { ...NO_AGENT_CAPABILITIES, sessionResume: true },
    ],
    [
      'Cursor advertising resume never resumes',
      'cursor-acp',
      { agentCapabilities: { sessionCapabilities: { resume: {} } } },
      NO_AGENT_CAPABILITIES,
    ],
    ['undefined', 'codex-acp', undefined, NO_AGENT_CAPABILITIES],
    ['null', 'codex-acp', null, NO_AGENT_CAPABILITIES],
    ['a string', 'codex-acp', 'x', NO_AGENT_CAPABILITIES],
    ['an empty object', 'codex-acp', {}, NO_AGENT_CAPABILITIES],
  ];

  it.each(table)('%s', (_name, launchTarget, initializeResult, expected) => {
    assert.deepStrictEqual(agentCapabilitiesFrom(launchTarget, initializeResult), expected);
  });

  it('reads a session capability given as true or any object as supported', () => {
    for (const close of [{}, { future: { x: {} } }, true]) {
      assert.isTrue(
        agentCapabilitiesFrom('codex-acp', withSessionCapability(close)).sessionClose,
        JSON.stringify(close),
      );
    }
  });

  it('reads false, null, a string or an absent session capability as unsupported', () => {
    for (const close of [false, null, 'yes', undefined]) {
      assert.isFalse(agentCapabilitiesFrom('codex-acp', withSessionCapability(close)).sessionClose, String(close));
    }
  });

  it('reads Steering only from top-level _meta.steering.supported === true', () => {
    assert.isTrue(agentCapabilitiesFrom('codex-acp', { _meta: { steering: { supported: true } } }).steeringSupported);
    for (const initializeResult of [
      { _meta: { steering: { supported: 'true' } } },
      { _meta: { steering: { supported: false } } },
      { _meta: { steering: {} } },
      { agentCapabilities: { _meta: { steering: { supported: true } } } },
    ]) {
      assert.isFalse(
        agentCapabilitiesFrom('codex-acp', initializeResult).steeringSupported,
        JSON.stringify(initializeResult),
      );
    }
  });

  it('a malformed field does not affect the others', () => {
    const capabilities = agentCapabilitiesFrom('codex-acp', {
      agentCapabilities: { promptCapabilities: 'garbage', sessionCapabilities: { fork: {} } },
    });
    assert.isFalse(capabilities.promptImage);
    assert.isTrue(capabilities.sessionFork);
  });
});

describe('clientCapabilitiesFor', () => {
  const noEditor = { editorFiles: false };
  const base = {
    elicitation: { form: {}, url: {} },
    session: { configOptions: { boolean: {} } },
    subagents: {},
  };

  it('offers AIR sessionIndex, sessionFailure, loadReplayEnd, recommendedValue and backgroundSubagents to Claude', () => {
    assert.deepStrictEqual(clientCapabilitiesFor('claude-agent-acp', noEditor), {
      ...base,
      _meta: {
        jetbrains: {
          air: {
            capabilities: [
              'sessionIndex',
              'sessionFailure',
              'loadReplayEnd',
              'recommendedValue',
              'backgroundSubagents',
            ],
            version: 1,
          },
        },
      },
    });
  });

  it('offers AIR sessionIndex, sessionFailure and recommendedValue to Codex', () => {
    assert.deepStrictEqual(clientCapabilitiesFor('codex-acp', noEditor), {
      ...base,
      _meta: {
        jetbrains: { air: { capabilities: ['sessionIndex', 'sessionFailure', 'recommendedValue'], version: 1 } },
      },
    });
    assert.notInclude(JSON.stringify(clientCapabilitiesFor('codex-acp', noEditor)), 'loadReplayEnd');
    assert.notInclude(JSON.stringify(clientCapabilitiesFor('codex-acp', noEditor)), 'backgroundSubagents');
  });

  it('offers no AIR _meta to Antigravity and Cursor', () => {
    for (const launchTarget of ['antigravity-acp', 'cursor-acp'] as const) {
      assert.deepStrictEqual(clientCapabilitiesFor(launchTarget, noEditor), base);
    }
  });

  it('advertises fs read and write only when editor files are supported', () => {
    for (const launchTarget of ['claude-agent-acp', 'codex-acp', 'cursor-acp'] as const) {
      assert.deepStrictEqual(clientCapabilitiesFor(launchTarget, { editorFiles: true })?.fs, {
        readTextFile: true,
        writeTextFile: true,
      });
      assert.isUndefined(clientCapabilitiesFor(launchTarget, noEditor)?.fs);
    }
  });
});
