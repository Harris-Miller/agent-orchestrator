import { assert, describe, it } from '@effect/vitest';

import { agentLaunchTargetLabel } from '../../../host/agentLaunchTarget.ts';

import { composerPlaceholder } from './composerPlaceholder.ts';

describe('composerPlaceholder', () => {
  it('falls back without a launch target', () => {
    assert.strictEqual(composerPlaceholder(undefined, true), 'Choose an agent, then write a prompt…');
    assert.strictEqual(composerPlaceholder(undefined, false), 'Select a session…');
  });

  it('mentions skills only for Codex', () => {
    assert.strictEqual(
      composerPlaceholder('codex-acp', false),
      `Ask ${agentLaunchTargetLabel('codex-acp')} anything. @ files, $ skills, / commands`,
    );
    assert.strictEqual(
      composerPlaceholder('claude-agent-acp', true),
      `Ask ${agentLaunchTargetLabel('claude-agent-acp')} anything. @ files, / commands`,
    );
  });
});
