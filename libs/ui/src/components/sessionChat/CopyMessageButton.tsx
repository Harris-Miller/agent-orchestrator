import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import { writeTextToClipboard } from '../../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

const COPIED_MS = 1500;

/** Icon-only "Copy message" control; `getText` is read at click time so streaming text is current. */
export const CopyMessageButton: FC<{ readonly getText: () => string }> = ({ getText }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const label = copied ? 'Copied' : 'Copy message';
  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        onClick={() => {
          hostRunPromise(writeTextToClipboard(getText()))
            .then(() => {
              setCopied(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => {
                setCopied(false);
              }, COPIED_MS);
            })
            .catch(() => undefined);
        }}
        size="small"
        sx={{ color: 'text.secondary' }}
      >
        <LucideMuiIcon icon={copied ? Check : Copy} sx={{ fontSize: 14 }} />
      </IconButton>
    </Tooltip>
  );
};
