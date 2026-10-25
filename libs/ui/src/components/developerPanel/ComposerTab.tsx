/** Live preview of ContentBlock[] the composer draft would send on session/prompt. */
import { useAtomValue } from '@effect/atom-react';
import type { ContentBlock } from '@libs/effect-acp';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { backendHarnessStateAtom } from '../../atoms/backendState.atoms.ts';
import { virtualSessionAtom } from '../../atoms/virtualSession.atoms.ts';
import { promptBlocksFromComposerDraft } from '../../host/draftToContentBlocks.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { useSessionChatSurface } from '../sessionChat/useSessionChatSurface.ts';

const FALLBACK_LAUNCH_TARGET = 'claude-agent-acp' as const;

export const ComposerTab: FC = () => {
  const { draft, isVirtual, selectedLaunchTarget, selectedSession } = useSessionChatSurface();
  const virtualSession = useAtomValue(virtualSessionAtom);
  const harness = useAtomValue(backendHarnessStateAtom(selectedLaunchTarget ?? FALLBACK_LAUNCH_TARGET));

  const cwd = isVirtual ? virtualSession?.cwd : selectedSession?.cwd;
  const initializeResult = selectedLaunchTarget === undefined ? undefined : harness.initializeResult;
  const text = draft.trim();

  const [blocks, setBlocks] = useState<readonly ContentBlock[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    hostRunPromise(
      promptBlocksFromComposerDraft(text, {
        cwd,
        initializeResult,
      }),
    )
      .then(next => {
        if (!cancelled) {
          setBlocks(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBlocks(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, initializeResult, text]);

  return (
    <pre className="m-0 p-4 font-mono text-[11px] break-all whitespace-pre-wrap">
      {blocks === undefined ? (
        <span className="text-muted-foreground">Resolving…</span>
      ) : (
        JSON.stringify(blocks, null, 2)
      )}
    </pre>
  );
};
