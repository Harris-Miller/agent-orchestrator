/** The Hub's subagent tools as the Harness answers them: called through `handleHubToolCall` with a real credential. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { configOptionIndexAtom } from '../atoms/backendState.atoms.ts';
import {
  advertise,
  bearerOf,
  CLAUDE,
  CODEX,
  enableProviders,
  freshRegistry,
  installFakeAgent,
  installFakeHub,
} from '../atoms/fakeAgent.testing.ts';
import type { McpReceived } from '../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import { updateHarnessSnapshot } from '../atoms/harnessSnapshot.ts';

import { configOptionIndexFromProbeResponses } from './configOptionIndexFixtures.ts';
import { handleHubToolCall } from './hubSessions.ts';
import { createSession } from './sessionRpc.ts';
import { describeSubagentTargets, MAX_TARGETS_LISTING_CHARS, validateSubagentConfig } from './subagentTargets.ts';

const claudeIndex = configOptionIndexFromProbeResponses('sonnet', {
  opus: {
    configOptions: [
      { currentValue: 'opus', id: 'model', name: 'Model', options: [{ name: 'Opus', value: 'opus' }], type: 'select' },
      {
        currentValue: 'high',
        id: 'effort',
        name: 'Effort',
        options: [
          { name: 'Low', value: 'low' },
          { name: 'High', value: 'high' },
        ],
        type: 'select',
      },
    ],
  },
  sonnet: {
    configOptions: [
      {
        currentValue: 'sonnet',
        id: 'model',
        name: 'Model',
        options: [
          { name: 'Sonnet', value: 'sonnet' },
          { name: 'Opus', value: 'opus' },
        ],
        type: 'select',
      },
    ],
  },
});

/** A Codex caller holding a hub credential, a Claude target set up per `claude`. */
const setup = Effect.fnUntraced(function* (claude: { readonly http: boolean; readonly index?: boolean }) {
  yield* installFakeHub([]);
  const received: McpReceived[] = [];
  yield* installFakeAgent([], { mcp: { received } });
  const registry = yield* freshRegistry;
  const { sessionId } = (yield* createSession(CODEX, '/w')).result;
  advertise(registry, CODEX, {});
  advertise(
    registry,
    CLAUDE,
    claude.http ? { agentCapabilities: { mcpCapabilities: { http: true } } } : { agentCapabilities: {} },
  );
  if (claude.index !== false) {
    registry.set(configOptionIndexAtom(CLAUDE), claudeIndex);
  }
  const list = handleHubToolCall(
    { args: {}, token: bearerOf(received[0].servers), tool: 'list_subagent_targets' },
    { registry },
  ).pipe(Effect.provide(mockHostLayer));
  return { list, registry, sessionId };
});

const parse = (text: string) =>
  JSON.parse(text) as {
    targets: {
      canSpawn: boolean;
      launchTarget: string;
      models: { default: boolean; id: string; options: { id: string; values: unknown[] }[] }[];
    }[];
  };

describe('list_subagent_targets', () => {
  it.effect('lists other usable targets with per-model options, never the caller own target', () =>
    Effect.gen(function* () {
      const { list } = yield* setup({ http: true });
      const result = yield* list;

      assert.isFalse(result.isError);
      const { targets } = parse(result.text);
      assert.deepStrictEqual(
        targets.map(target => target.launchTarget),
        [CLAUDE],
      );
      assert.isTrue(targets[0].canSpawn);
      assert.deepStrictEqual(
        targets[0].models.map(model => [model.id, model.default, model.options.map(option => option.id)]),
        [
          ['sonnet', true, []],
          ['opus', false, ['effort']],
        ],
      );
      assert.deepStrictEqual(targets[0].models[1].options[0].values, ['low', 'high']);
    }),
  );

  it.effect('marks a target whose agent lacks HTTP MCP as canSpawn false', () =>
    Effect.gen(function* () {
      const { list } = yield* setup({ http: false });
      assert.isFalse(parse((yield* list).text).targets[0].canSpawn);
    }),
  );

  it.effect('omits targets that are disabled, not usable yet, or have no Config option index', () =>
    Effect.gen(function* () {
      const { list, registry } = yield* setup({ http: true });
      updateHarnessSnapshot(registry, CLAUDE, current => ({ ...current, phase: 'connecting' }));
      assert.deepStrictEqual(parse((yield* list).text).targets, []);

      updateHarnessSnapshot(registry, CLAUDE, current => ({ ...current, phase: 'ready' }));
      enableProviders(registry, [CODEX]);
      assert.deepStrictEqual(parse((yield* list).text).targets, []);

      enableProviders(registry, [CLAUDE, CODEX]);
      registry.set(configOptionIndexAtom(CLAUDE), undefined);
      assert.deepStrictEqual(parse((yield* list).text).targets, []);
    }),
  );
});

describe('describeSubagentTargets', () => {
  it('truncates an oversize listing with a notice', () => {
    const options = Array.from({ length: 400 }, (_, i) => ({ name: `Model ${i}`, value: `model-${i}` }));
    const models = {
      'model-0': {
        configOptions: [{ currentValue: 'model-0', id: 'model', name: 'Model', options, type: 'select' }],
      },
    };
    const text = describeSubagentTargets([
      {
        canSpawn: true,
        index: configOptionIndexFromProbeResponses('model-0', models),
        label: 'Claude',
        launchTarget: CLAUDE,
      },
    ]);
    assert.include(text, 'truncated');
    assert.isBelow(text.length, MAX_TARGETS_LISTING_CHARS + 200);
  });
});

describe('validateSubagentConfig', () => {
  it('accepts the default model, an advertised model and valid per-model options', () => {
    assert.isUndefined(validateSubagentConfig(claudeIndex, {}));
    assert.isUndefined(validateSubagentConfig(claudeIndex, { model: 'opus', effort: 'low' }));
  });

  it('names the valid choices for an unknown model, option or value', () => {
    assert.include(validateSubagentConfig(claudeIndex, { model: 'gpt-9' }) ?? '', 'Valid models: sonnet, opus');
    assert.include(validateSubagentConfig(claudeIndex, { model: 'opus', speed: 'x' }) ?? '', 'Valid options: effort');
    assert.include(
      validateSubagentConfig(claudeIndex, { model: 'opus', effort: 'max' }) ?? '',
      'Valid values: low, high',
    );
  });

  it('checks options against the chosen model, not the default one', () => {
    assert.include(validateSubagentConfig(claudeIndex, { effort: 'low' }) ?? '', 'Unknown config option "effort"');
  });
});
