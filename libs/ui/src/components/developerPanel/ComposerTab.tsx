/** Live preview of ContentBlock[] the composer draft would send on session/prompt. */
import { useAtomValue } from '@effect/atom-react';
import type { ContentBlock } from '@lib/effect-acp';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import type { FC } from 'react';

import { backendHarnessSnapshotAtom, selectedSessionAtom } from '../../atoms/backendState.atoms.ts';
import { composerAtom } from '../../atoms/composer.atoms.ts';
import { virtualSessionAtom } from '../../atoms/virtualSession.atoms.ts';
import { NO_AGENT_CAPABILITIES } from '../../host/agentCapabilities.ts';
import { promptBlocksFromComposerDraft } from '../../host/draftToContentBlocks.ts';
import { hostRunPromise } from '../../hostRuntime.ts';

const FALLBACK_LAUNCH_TARGET = 'claude-agent-acp' as const;

export const ComposerTab: FC = () => {
  const { attachments, draft, target } = useAtomValue(composerAtom);
  const selectedLaunchTarget = target?.launchTarget;
  const virtualSession = useAtomValue(virtualSessionAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const harness = useAtomValue(backendHarnessSnapshotAtom(selectedLaunchTarget ?? FALLBACK_LAUNCH_TARGET));

  const cwd = target?._tag === 'Virtual' ? virtualSession?.cwd : selectedSession?.cwd;
  const agentCapabilities = selectedLaunchTarget === undefined ? NO_AGENT_CAPABILITIES : harness.agentCapabilities;
  const text = draft.trim();

  const [blocks, setBlocks] = useState<readonly ContentBlock[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    hostRunPromise(
      promptBlocksFromComposerDraft(text, {
        attachments,
        agentCapabilities,
        cwd,
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
  }, [agentCapabilities, attachments, cwd, text]);

  return (
    <Box
      component="pre"
      sx={{
        fontFamily: 'var(--vscode-editor-font-family, monospace)',
        fontSize: 11,
        m: 0,
        p: 2,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {blocks === undefined ? (
        <Typography color="text.secondary" component="span" variant="caption">
          Resolving…
        </Typography>
      ) : (
        JSON.stringify(blocks, null, 2)
      )}
    </Box>
  );
};
