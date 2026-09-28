import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { defaultSettings } from '@lib/ao-home';
import {
  confirmSessionDeleteAtom,
  developerModeAtom,
  ProvidersSettingsPane,
  userSettingsAtom,
  userSettingsEditsDisabled,
} from '@lib/ui';
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
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { Cause } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

import { ThemeSelect } from '../../theme/ThemeChoice.tsx';

const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'keyboard', label: 'Keyboard shortcuts' },
  { id: 'providers', label: 'Providers' },
  { id: 'git', label: 'Git' },
  { id: 'connections', label: 'Connections' },
  { id: 'about', label: 'About' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

const BackToApp: FC = () => {
  const navigate = useNavigate();
  return (
    <Button
      onClick={() => {
        navigate({ to: '/' }).catch(() => undefined);
      }}
      startIcon={<ArrowBack />}
      sx={{ justifyContent: 'flex-start' }}
      variant="text"
    >
      Back to app
    </Button>
  );
};

/** Settings page: flat nav rail + placeholder panes. */
export const SettingsPage: FC = () => {
  const settingsResult = useAtomValue(userSettingsAtom);
  const setUserSettings = useAtomSet(userSettingsAtom);
  const confirmSessionDelete = useAtomValue(confirmSessionDeleteAtom);
  const setConfirmSessionDelete = useAtomSet(confirmSessionDeleteAtom);
  const developerMode = useAtomValue(developerModeAtom);
  const setDeveloperMode = useAtomSet(developerModeAtom);
  const editsDisabled = userSettingsEditsDisabled(settingsResult);
  const [category, setCategory] = useState<CategoryId>('general');
  const [query, setQuery] = useState('');
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      return CATEGORIES;
    }
    return CATEGORIES.filter(entry => entry.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderColor: 'divider',
          borderRight: 1,
          display: 'flex',
          flexDirection: 'column',
          width: 260,
        }}
      >
        <Box sx={{ flexShrink: 0, p: 1.5 }}>
          <BackToApp />
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
            sx={{ mt: 1 }}
            value={query}
          />
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', pb: 2, px: 1 }}>
          {filteredItems.map(item => (
            <ListItemButton
              dense
              key={item.id}
              onClick={() => {
                setCategory(item.id);
              }}
              selected={category === item.id}
              sx={{
                borderRadius: 1,
                minHeight: 28,
                py: 0.25,
              }}
            >
              <ListItemText primary={item.label} slotProps={{ primary: { variant: 'body2' } }} />
            </ListItemButton>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0, px: 3, py: 2 }}>
          <Box sx={{ alignItems: 'center', display: 'flex', gap: 2, justifyContent: 'space-between' }}>
            <Typography sx={{ flex: 1 }} variant="h5">
              {CATEGORIES.find(c => c.id === category)?.label ?? 'Settings'}
            </Typography>
            <Button
              disabled={editsDisabled}
              onClick={() => {
                setConfirmRestoreOpen(true);
              }}
              size="small"
              startIcon={<RestartAlt />}
            >
              Restore defaults
            </Button>
          </Box>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {AsyncResult.isFailure(settingsResult) ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {Cause.pretty(settingsResult.cause)}
            </Alert>
          ) : null}
          <Paper sx={{ borderRadius: 2, p: 3 }} variant="outlined">
            {category === 'appearance' ? (
              <>
                <Typography variant="h6">Appearance</Typography>
                <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
                  Theme preference is stored in User settings.
                </Typography>
                <ThemeSelect />
              </>
            ) : category === 'general' ? (
              <>
                <Typography variant="h6">General</Typography>
                <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
                  Session delete confirmation and Developer mode live in User settings.
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={confirmSessionDelete}
                      disabled={editsDisabled}
                      onChange={(_event, checked) => {
                        setConfirmSessionDelete(checked);
                      }}
                    />
                  }
                  label="Confirm before deleting a session"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={developerMode}
                      disabled={editsDisabled}
                      onChange={(_event, checked) => {
                        setDeveloperMode(checked);
                      }}
                    />
                  }
                  label="Developer mode"
                  sx={{ display: 'block', mt: 1 }}
                />
              </>
            ) : category === 'providers' ? (
              <ProvidersSettingsPane />
            ) : (
              <>
                <Typography variant="h6">Coming soon</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
                  Placeholder category <code>{category}</code> — reserved for growth.
                </Typography>
              </>
            )}
          </Paper>
        </Box>
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
