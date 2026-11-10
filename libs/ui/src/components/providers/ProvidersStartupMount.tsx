/**
 * Startup Providers modal (compact matrix). Shown on every launch while "Show Providers on startup" is on, after
 * the Node prerequisite and settings barriers. Closing it never unmounts providers.
 */
import { useAtom } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Fragment, useState } from 'react';
import type { FC } from 'react';

import { showProvidersOnStartupAtom } from '../../atoms/boundHarnessAtoms.ts';
import { overallStatus, STATUS_META } from '../../host/providerView.ts';

import { ProviderItem } from './ProvidersSettingsPane.tsx';
import { VscodeExtensionRow } from './VscodeExtensionRow.tsx';
import { ProviderEnabledSwitch, ProviderHelp, ProviderPrimaryAction, useProviderControls } from './providerUi.tsx';

export const ProvidersStartupMount: FC = () => {
  const { dialog, providers, request } = useProviderControls();
  const [showOnStartup, setShowOnStartup] = useAtom(showProvidersOnStartupAtom);
  // Settings are loaded before this mounts (ProviderBootstrapGate), so the initial value is the stored preference.
  // Decided once per launch; "Don't show me again" flips the stored value only.
  const [open, setOpen] = useState(showOnStartup);

  if (!open) {
    return null;
  }
  return (
    <>
      <Dialog fullWidth maxWidth="sm" open>
        <DialogTitle>Providers</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }} variant="body2">
            Enable the providers you want. Missing runtimes are downloaded on request.
          </Typography>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
            {providers.map((provider, index) => (
              <Fragment key={provider.id}>
                <Box sx={{ borderColor: 'divider', borderTop: index === 0 ? 0 : 1, px: 2, py: 1.5 }}>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 2, justifyContent: 'space-between' }}>
                    <ProviderItem provider={provider} />
                    <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, gap: 1 }}>
                      <ProviderPrimaryAction provider={provider} request={request} />
                      <ProviderEnabledSwitch provider={provider} request={request} />
                    </Stack>
                  </Stack>
                  {STATUS_META[overallStatus(provider)].startupHelp ? (
                    <Box sx={{ mt: 1.25, pl: 4.5 }}>
                      <ProviderHelp dense provider={provider} />
                    </Box>
                  ) : null}
                </Box>
              </Fragment>
            ))}
            <VscodeExtensionRow />
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={!showOnStartup}
                onChange={event => {
                  setShowOnStartup(!event.target.checked);
                }}
                size="small"
              />
            }
            label="Don't show me again"
          />
          <Button
            onClick={() => {
              setOpen(false);
            }}
            variant="contained"
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </>
  );
};
