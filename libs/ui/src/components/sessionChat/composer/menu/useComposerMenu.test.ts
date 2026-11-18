// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

import { createHostRuntime } from '../../../../createHostRuntime.ts';
import { bindHostRuntime } from '../../../../hostRuntime.ts';
import { useComposerMenu } from './useComposerMenu.ts';
import type { UseComposerMenuArgs } from './useComposerMenu.ts';

import { mockHostLayer } from '../../../../atoms/mockHostLayer.testing.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));

afterEach(cleanup);

const COMMANDS = [
  { isSkill: false, name: 'status' },
  { isSkill: false, name: 'stash' },
  { isSkill: false, name: 'compact' },
];
const ENTRIES = [
  { kind: 'file', path: 'src/app.ts' },
  { kind: 'file', path: 'README.md' },
  { kind: 'file', path: 'img/pic.png' },
] as const;

const setup = (overrides: Partial<UseComposerMenuArgs> = {}) => {
  const state = { draft: '' };
  const setDraft = vi.fn((text: string) => {
    state.draft = text;
  });
  const onMentionOpen = overrides.onMentionOpen ?? vi.fn();
  const hook = renderHook(
    (props: { draft: string }) =>
      useComposerMenu({
        attachImages: () => Promise.resolve(),
        availableCommands: COMMANDS,
        draft: props.draft,
        fsListing: { entries: ENTRIES, status: 'ready' },
        launchTarget: 'codex-acp',
        onClientError: () => undefined,
        onMentionOpen,
        sessionCwd: '/work',
        setDraft,
        ...overrides,
      }),
    { initialProps: { draft: '' } },
  );
  const type = (text: string) => {
    act(() => {
      hook.result.current.onChange({ adjacentToToken: false, cursor: text.length, text });
    });
    hook.rerender({ draft: text });
  };
  return { hook, onMentionOpen, setDraft, state, type };
};

describe('useComposerMenu $ trigger on Claude', () => {
  const claude = {
    availableCommands: [...COMMANDS, { isSkill: true, name: 'caveman' }],
    launchTarget: 'claude-agent-acp',
  } as const;

  it('$ with no matching skill is closed so Enter is not trapped', () => {
    const { hook, type } = setup(claude);
    type('$5');
    assert.strictEqual(hook.result.current.keyHandlers.open, false);
    assert.strictEqual(hook.result.current.commandMenuProps.open, false);
  });

  it('$ with a matching skill opens; / with no match stays open', () => {
    const { hook, type } = setup(claude);
    type('$cav');
    assert.strictEqual(hook.result.current.keyHandlers.open, true);
    assert.strictEqual(hook.result.current.commandMenuProps.open, true);
    type('/zzz');
    assert.strictEqual(hook.result.current.keyHandlers.open, true);
  });
});

describe('useComposerMenu / trigger on Codex mid-draft', () => {
  const codex = {
    availableCommands: [...COMMANDS, { isSkill: true, name: '$caveman' }, { isSkill: true, name: '$stash-skill' }],
    launchTarget: 'codex-acp',
  } as const;

  it('lists only skills past draft start', () => {
    const { hook, type } = setup(codex);
    type('use /st');
    assert.deepStrictEqual(
      hook.result.current.commandMenuProps.matches.map(m => m.command.name),
      ['$stash-skill'],
    );
  });

  it('lists commands and skills at draft start', () => {
    const { hook, type } = setup(codex);
    type('/st');
    assert.deepStrictEqual(
      hook.result.current.commandMenuProps.matches.map(m => m.command.name),
      ['status', 'stash', '$stash-skill'],
    );
  });
});

describe('useComposerMenu', () => {
  it('typing / opens the command menu with matches', () => {
    const { hook, type } = setup();
    assert.strictEqual(hook.result.current.keyHandlers.open, false);
    type('/st');
    assert.strictEqual(hook.result.current.keyHandlers.open, true);
    assert.strictEqual(hook.result.current.commandMenuProps.open, true);
    assert.strictEqual(hook.result.current.mentionMenuProps.open, false);
    assert.deepStrictEqual(
      hook.result.current.commandMenuProps.matches.map(m => m.command.name),
      ['status', 'stash'],
    );
  });

  it('arrow keys move focus and clamp at both ends', () => {
    const { hook, type } = setup();
    type('/st');
    const down = () => {
      act(() => {
        hook.result.current.keyHandlers.onArrowDown();
      });
    };
    const up = () => {
      act(() => {
        hook.result.current.keyHandlers.onArrowUp();
      });
    };
    assert.strictEqual(hook.result.current.commandMenuProps.focusedIndex, 0);
    up();
    assert.strictEqual(hook.result.current.commandMenuProps.focusedIndex, 0);
    down();
    assert.strictEqual(hook.result.current.commandMenuProps.focusedIndex, 1);
    down();
    assert.strictEqual(hook.result.current.commandMenuProps.focusedIndex, 1);
    up();
    assert.strictEqual(hook.result.current.commandMenuProps.focusedIndex, 0);
  });

  it('selecting inserts the command invocation and closes', () => {
    const { hook, setDraft, type } = setup();
    type('/st');
    act(() => {
      hook.result.current.keyHandlers.onArrowDown();
    });
    act(() => {
      hook.result.current.keyHandlers.onSelect();
    });
    assert.strictEqual(setDraft.mock.lastCall?.[0], '/stash ');
    assert.strictEqual(hook.result.current.syncCursorRef.current, 7);
    assert.strictEqual(hook.result.current.commandMenuProps.open, false);
    assert.strictEqual(hook.result.current.keyHandlers.open, false);
  });

  it('typing @ opens the mention menu filtering fs entries', () => {
    const { hook, type } = setup();
    type('@app');
    assert.strictEqual(hook.result.current.mentionMenuProps.open, true);
    assert.strictEqual(hook.result.current.commandMenuProps.open, false);
    assert.deepStrictEqual(
      hook.result.current.mentionMenuProps.matches.map(m => m.entry.path),
      ['src/app.ts'],
    );
  });

  it('Escape and space dismiss close the menu', () => {
    const { hook, type } = setup();
    type('/st');
    act(() => {
      hook.result.current.keyHandlers.onDismiss();
    });
    assert.strictEqual(hook.result.current.keyHandlers.open, false);
    type('@a');
    assert.strictEqual(hook.result.current.keyHandlers.open, true);
    act(() => {
      hook.result.current.keyHandlers.onSpaceDismiss();
    });
    assert.strictEqual(hook.result.current.keyHandlers.open, false);
  });

  it('close() resets the menu and focus', () => {
    const { hook, type } = setup();
    type('/st');
    act(() => {
      hook.result.current.keyHandlers.onArrowDown();
    });
    act(() => {
      hook.result.current.close();
    });
    assert.strictEqual(hook.result.current.commandMenuProps.open, false);
    assert.strictEqual(hook.result.current.commandMenuProps.open, false);
    type('/st');
    assert.strictEqual(hook.result.current.commandMenuProps.focusedIndex, 0);
  });

  it('selecting a mention inserts the markdown link and closes', () => {
    const { hook, setDraft, type } = setup();
    type('@app');
    act(() => {
      hook.result.current.keyHandlers.onSelect();
    });
    const draft = setDraft.mock.lastCall?.[0] ?? '';
    assert.strictEqual(draft.includes('[@app.ts]'), true);
    assert.strictEqual(draft.includes('/work/src/app.ts'), true);
    assert.strictEqual(hook.result.current.keyHandlers.open, false);
  });

  it('selecting an image-file mention attaches it by path and removes the trigger text', () => {
    const attachImages = vi.fn(() => Promise.resolve());
    const { hook, setDraft, type } = setup({ attachImages });
    type('@pic');
    act(() => {
      hook.result.current.keyHandlers.onSelect();
    });
    assert.deepStrictEqual(attachImages.mock.lastCall, [{ _tag: 'Paths', paths: ['/work/img/pic.png'] }]);
    assert.strictEqual(setDraft.mock.lastCall?.[0], ' ');
    assert.strictEqual(hook.result.current.keyHandlers.open, false);
  });

  it('onMentionOpen fires once on @, not on query change, again after reopen, never for /', () => {
    const { hook, onMentionOpen, type } = setup();
    type('@');
    assert.strictEqual(vi.mocked(onMentionOpen).mock.calls.length, 1);
    type('@sr');
    assert.strictEqual(vi.mocked(onMentionOpen).mock.calls.length, 1);
    act(() => {
      hook.result.current.keyHandlers.onDismiss();
    });
    type('@');
    assert.strictEqual(vi.mocked(onMentionOpen).mock.calls.length, 2);
  });

  it('onMentionOpen does not fire for the command menu', () => {
    const { onMentionOpen, type } = setup();
    type('/st');
    assert.strictEqual(vi.mocked(onMentionOpen).mock.calls.length, 0);
  });
});
