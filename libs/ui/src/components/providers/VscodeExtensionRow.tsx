/**
 * Desktop-only "VS Code extension" row for the startup Providers modal and Settings > Providers: Install / Update,
 * manual steps when VS Code has no CLI. Renders nothing when the feature is unavailable (see `loadVscodeExtensionStatus`).
 */
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Check } from 'lucide-react';
import type { FC } from 'react';
import { Cause } from 'effect';
import { AsyncResult } from 'effect/reactivity';

import { installVscodeExtensionAtomFn, vscodeExtensionStatusAtom } from '../../atoms/boundHarnessAtoms.ts';
import type { VscodeExtensionStatus } from '../../host/vscodeExtension.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { CommandSnippet } from './providerUi.tsx';

export const useVscodeExtensionStatus = (): VscodeExtensionStatus =>
  AsyncResult.getOrElse(useAtomValue(vscodeExtensionStatusAtom), (): VscodeExtensionStatus => ({ _tag: 'Hidden' }));

/** Install / Update with the CLI's error or the "Reload Window" success note. */
export const useInstallVscodeExtension = () => {
  const result = useAtomValue(installVscodeExtensionAtomFn);
  const install = useAtomSet(installVscodeExtensionAtomFn);
  return {
    error: AsyncResult.isFailure(result) ? Cause.pretty(result.cause) : undefined,
    install: () => {
      install(undefined);
    },
    installed: AsyncResult.isSuccess(result),
    installing: result.waiting,
  };
};

const describe = (status: Exclude<VscodeExtensionStatus, { readonly _tag: 'Hidden' }>): string => {
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

export const RELOAD_WINDOW_NOTE = 'Reload Window in open VS Code windows to activate it.';

export const VscodeExtensionRow: FC = () => {
  const status = useVscodeExtensionStatus();
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
            {installed ? `Installed v${version}. ${RELOAD_WINDOW_NOTE}` : describe(status)}
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
      {status._tag === 'ManualInstall' ? (
        <Stack spacing={1} sx={{ mt: 1.25 }}>
          <Typography color="text.secondary" variant="body2">
            The VS Code command line tool was not found. In VS Code open Extensions → … → Install from VSIX… and pick:
          </Typography>
          <CommandSnippet command={status.bundled.path} />
        </Stack>
      ) : null}
      {error === undefined ? null : (
        <Alert severity="error" sx={{ mt: 1.25, whiteSpace: 'pre-wrap' }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};
