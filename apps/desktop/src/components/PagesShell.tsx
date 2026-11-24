import { useAtomValue } from '@effect/atom-react';
import { LucideMuiIcon, workstreamsEnabledAtom } from '@lib/ui';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { useNavigate } from '@tanstack/react-router';
import { Layers, MessagesSquare, Settings } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import { UpdatesIndicatorHost } from './UpdatesIndicatorHost.tsx';

const PAGES = [
  { icon: MessagesSquare, label: 'Sessions Page', page: 'sessions', to: '/' },
  { icon: Layers, label: 'Workstreams Page', page: 'workstreams', to: '/workstreams' },
] as const;

export type Page = (typeof PAGES)[number]['page'] | 'settings';

/** Left page switcher (with the Settings gear at the bottom) beside the active page, including Settings; hidden unless Experimental: Workstreams is on. */
export const PagesShell: FC<{ readonly children: ReactNode; readonly page: Page }> = ({ children, page }) => {
  const enabled = useAtomValue(workstreamsEnabledAtom);
  const navigate = useNavigate();
  return (
    <Box sx={{ bgcolor: 'background.default', display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {enabled ? (
        <Stack
          sx={{
            alignItems: 'center',
            bgcolor: 'background.paper',
            borderColor: 'divider',
            borderRight: 1,
            flexShrink: 0,
            gap: 1,
            py: 1,
            width: 52,
          }}
        >
          {PAGES.map(candidate => (
            <Tooltip key={candidate.page} placement="right" title={candidate.label}>
              <IconButton
                aria-label={candidate.label}
                onClick={() => {
                  navigate({ to: candidate.to }).catch(() => undefined);
                }}
                sx={{ bgcolor: candidate.page === page ? 'action.selected' : 'transparent', borderRadius: 1.5 }}
              >
                <LucideMuiIcon
                  icon={candidate.icon}
                  sx={{ color: candidate.page === page ? 'primary.main' : 'text.secondary' }}
                />
              </IconButton>
            </Tooltip>
          ))}
          <Box sx={{ mt: 'auto' }}>
            <UpdatesIndicatorHost />
          </Box>
          <Tooltip placement="right" title="Settings">
            <IconButton
              aria-label="Settings"
              onClick={() => {
                navigate({ params: { category: 'general' }, to: '/settings/$category' }).catch(() => undefined);
              }}
              sx={{ bgcolor: page === 'settings' ? 'action.selected' : 'transparent', borderRadius: 1.5 }}
            >
              <LucideMuiIcon icon={Settings} sx={{ color: page === 'settings' ? 'primary.main' : 'text.secondary' }} />
            </IconButton>
          </Tooltip>
        </Stack>
      ) : null}
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
};
