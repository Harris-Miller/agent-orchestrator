/**
 * Desktop-only "VS Code extension" row for the startup Providers modal and Settings > Providers: Install / Update,
 * manual steps when VS Code has no CLI. Renders nothing when the feature is unavailable (see `loadVscodeExtensionAvailability`).
 */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Check } from 'lucide-react';
import type { FC } from 'react';

import type { VscodeExtensionAvailability } from '../../host/vscodeExtension.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import {
  ManualInstallSteps,
  RELOAD_WINDOW_NOTE,
  useInstallVscodeExtension,
  useVscodeExtensionAvailability,
} from './vscodeExtensionShared.tsx';

const describeAvailability = (status: Exclude<VscodeExtensionAvailability, { readonly _tag: 'Hidden' }>): string => {
  const { version } = status.bundled;
  if (status._tag === 'ManualInstall') {
    return `Bundled v${version}`;
  }
  switch (status.state) {
    case 'newer-installed':
      return `v${status.installed ?? ''} is installed, newer than the bundled v${version}`;
    case 'not-installed':
      return `Bundled v${version}, not installed`;
    case 'outdated':
      return `v${status.installed ?? ''} installed, v${version} available`;
    case 'up-to-date':
      return `v${version} installed`;
  }
};

export const VscodeExtensionRow: FC = () => {
  const status = useVscodeExtensionAvailability();
  const { error, install, installed, installing } = useInstallVscodeExtension();

  if (status._tag === 'Hidden') {
    return null;
  }
  const { version } = status.bundled;
  const upToDate = status._tag === 'Ready' && status.state === 'up-to-date';

  return (
    <Box sx={{ borderColor: 'divider', borderTop: 1, px: 2, py: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2, justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>VS Code extension</Typography>
          <Typography color="text.secondary" variant="body2">
            {installed ? `Installed v${version}. ${RELOAD_WINDOW_NOTE}` : describeAvailability(status)}
          </Typography>
        </Box>
        {status._tag !== 'Ready' ? null : installing ? (
          <CircularProgress size={16} />
        ) : upToDate || installed ? (
          <LucideMuiIcon icon={Check} sx={{ color: 'success.main', fontSize: 18 }} />
        ) : status.state === 'newer-installed' ? null : (
          <Button onClick={install} size="small" variant="contained">
            {status.state === 'outdated' ? `Update to v${version}` : 'Install'}
          </Button>
        )}
      </Stack>
      {status._tag === 'ManualInstall' || error !== undefined ? (
        <ManualInstallSteps path={status.bundled.path} />
      ) : null}
      {error === undefined ? null : (
        <Alert severity="error" sx={{ mt: 1.25, whiteSpace: 'pre-wrap' }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};
