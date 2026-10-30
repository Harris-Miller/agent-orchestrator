import { assert, describe, it } from '@effect/vitest';

import { isLaunchTargetEnabled } from './agentLaunchTarget.ts';

declare const process: {
  env: {
    [key: string]: string | undefined;
    AO_ANTIGRAVITY_BETA?: string;
    AO_CURSOR_BETA?: string;
  };
};

describe('isLaunchTargetEnabled', () => {
  it('always enables non-beta launch targets', () => {
    assert.isTrue(isLaunchTargetEnabled('codex-acp'));
    assert.isTrue(isLaunchTargetEnabled('claude-agent-acp'));
  });

  it('enables antigravity-acp only when AO_ANTIGRAVITY_BETA is true', () => {
    const prev = process.env.AO_ANTIGRAVITY_BETA;
    try {
      process.env.AO_ANTIGRAVITY_BETA = 'true';
      assert.isTrue(isLaunchTargetEnabled('antigravity-acp'));
      process.env.AO_ANTIGRAVITY_BETA = 'false';
      assert.isFalse(isLaunchTargetEnabled('antigravity-acp'));
      delete process.env.AO_ANTIGRAVITY_BETA;
      assert.isFalse(isLaunchTargetEnabled('antigravity-acp'));
    } finally {
      if (prev === undefined) {
        delete process.env.AO_ANTIGRAVITY_BETA;
      } else {
        process.env.AO_ANTIGRAVITY_BETA = prev;
      }
    }
  });

  it('enables cursor-acp only when AO_CURSOR_BETA is true', () => {
    const prev = process.env.AO_CURSOR_BETA;
    try {
      process.env.AO_CURSOR_BETA = 'true';
      assert.isTrue(isLaunchTargetEnabled('cursor-acp'));
      process.env.AO_CURSOR_BETA = '';
      assert.isFalse(isLaunchTargetEnabled('cursor-acp'));
      delete process.env.AO_CURSOR_BETA;
      assert.isFalse(isLaunchTargetEnabled('cursor-acp'));
    } finally {
      if (prev === undefined) {
        delete process.env.AO_CURSOR_BETA;
      } else {
        process.env.AO_CURSOR_BETA = prev;
      }
    }
  });
});
