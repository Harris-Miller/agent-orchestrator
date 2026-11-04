import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { AsyncResult } from 'effect/reactivity';
import { FileText } from 'lucide-react';
import type { FC } from 'react';

import { openFileSupportedAtom } from '../../atoms/boundHarnessAtoms.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { openChatLink } from '../../host/openChatLink.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';
import { chatLinkHandlers } from './useChatLinkProps.ts';

/** Plan file of a Claude `ExitPlanMode` call; a link where the host can open files, plain text otherwise. */
export const PlanFileBanner: FC<{ readonly cwd: string; readonly path: string }> = ({ cwd, path }) => {
  const supported = AsyncResult.getOrElse(useAtomValue(openFileSupportedAtom), () => false);
  const linkProps = supported
    ? chatLinkHandlers(() => {
        hostRunPromise(openChatLink({ cwd, kind: 'path', path })).catch(() => undefined);
      })
    : undefined;

  return (
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.75, minWidth: 0 }}>
      <LucideMuiIcon icon={FileText} sx={{ fontSize: 14 }} />
      <Box component="span" sx={{ fontWeight: 600 }}>
        Plan
      </Box>
      <Tooltip title={path}>
        <Box
          component="span"
          {...linkProps}
          sx={{
            cursor: linkProps === undefined ? 'text' : 'pointer',
            direction: 'rtl',
            minWidth: 0,
            overflow: 'hidden',
            textAlign: 'left',
            textDecoration: linkProps === undefined ? 'none' : 'underline',
            textOverflow: 'ellipsis',
            userSelect: 'text',
            whiteSpace: 'nowrap',
          }}
        >
          {/* LRM keeps the leading "/" from being reordered by rtl ellipsis-at-start */}
          {`‎${path}`}
        </Box>
      </Tooltip>
    </Box>
  );
};
