import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { defaultSettings, SETTINGS_CATEGORIES, userSettingsAtom, userSettingsEditsDisabled } from '@lib/ui';
import ArrowBack from '@mui/icons-material/ArrowBack';
import RestartAlt from '@mui/icons-material/RestartAlt';
import Search from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { Cause } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

/** VS Code Settings category list (narrow sidebar). */
export const SettingsListPage: FC = () => {
  const navigate = useNavigate();
  const settingsResult = useAtomValue(userSettingsAtom);
  const setUserSettings = useAtomSet(userSettingsAtom);
  const editsDisabled = userSettingsEditsDisabled(settingsResult);
  const [query, setQuery] = useState('');
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      return SETTINGS_CATEGORIES;
    }
    return SETTINGS_CATEGORIES.filter(entry => entry.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', minHeight: 0, p: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
        <IconButton
          aria-label="Back to Session History"
          onClick={() => {
            navigate({ to: '/' }).catch(() => undefined);
          }}
          size="small"
        >
          <ArrowBack fontSize="small" />
        </IconButton>
        <Typography sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
          Settings
        </Typography>
        <Button
          disabled={editsDisabled}
          onClick={() => {
            setConfirmRestoreOpen(true);
          }}
          size="small"
          startIcon={<RestartAlt fontSize="small" />}
        >
          Restore defaults
        </Button>
      </Stack>

      {AsyncResult.isFailure(settingsResult) ? (
        <Alert severity="error">{Cause.pretty(settingsResult.cause)}</Alert>
      ) : null}

      <TextField
        fullWidth
        onChange={event => {
          setQuery(event.target.value);
        }}
        placeholder="Search settings…"
        size="small"
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        value={query}
      />

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {filteredItems.map(item => (
          <ListItemButton
            dense
            key={item.id}
            onClick={() => {
              navigate({ params: { category: item.id }, to: '/settings/$category' }).catch(() => undefined);
            }}
            sx={{ borderRadius: 1, minHeight: 28, py: 0.25 }}
          >
            <ListItemText primary={item.label} slotProps={{ primary: { variant: 'body2' } }} />
          </ListItemButton>
        ))}
      </Box>

      <Dialog
        onClose={() => {
          setConfirmRestoreOpen(false);
        }}
        open={confirmRestoreOpen}
      >
        <DialogTitle>Reset all preferences to defaults?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This restores User settings to product defaults. Session usage is not affected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setConfirmRestoreOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            onClick={() => {
              setUserSettings(defaultSettings);
              setConfirmRestoreOpen(false);
            }}
            variant="contained"
          >
            Restore defaults
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
