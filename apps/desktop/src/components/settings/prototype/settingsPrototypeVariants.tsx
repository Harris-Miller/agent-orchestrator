/**
 * PROTOTYPE — Winning settings UI (Variant A): dense category rail + grouped cards on `/settings`.
 * Verdict: A over B (row list) and C (inspector). Dense left nav per review.
 * Persistence (~/.agent-orchestrator) still open — in-memory stub state only.
 */

import ArrowBack from '@mui/icons-material/ArrowBack';
import RestartAlt from '@mui/icons-material/RestartAlt';
import Search from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

type PrototypeSettingsState = {
  readonly confirmDeleteSession: boolean;
  readonly defaultLaunchTarget: string;
  readonly preventSleepWhileRunning: boolean;
  readonly showBottomPanel: boolean;
  readonly suggestedPrompts: boolean;
  readonly themePreference: string;
};

const DEFAULT_STATE: PrototypeSettingsState = {
  confirmDeleteSession: true,
  defaultLaunchTarget: 'codex-acp',
  preventSleepWhileRunning: false,
  showBottomPanel: false,
  suggestedPrompts: true,
  themePreference: 'system',
};

const CATEGORIES = [
  { group: 'Personal', id: 'general', label: 'General' },
  { group: 'Personal', id: 'appearance', label: 'Appearance' },
  { group: 'Personal', id: 'keyboard', label: 'Keyboard shortcuts' },
  { group: 'Agents', id: 'providers', label: 'Providers' },
  { group: 'Agents', id: 'defaults', label: 'Harness defaults' },
  { group: 'Coding', id: 'git', label: 'Git' },
  { group: 'Coding', id: 'connections', label: 'Connections' },
  { group: 'Other', id: 'about', label: 'About' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

const rowSx = {
  alignItems: 'center',
  display: 'flex',
  gap: 2,
  justifyContent: 'space-between',
} as const;

const StateDump: FC<{ readonly state: PrototypeSettingsState }> = ({ state }) => (
  <Paper
    sx={{
      bgcolor: 'grey.900',
      bottom: 16,
      color: 'grey.100',
      fontFamily: 'monospace',
      fontSize: 11,
      maxHeight: 160,
      overflow: 'auto',
      p: 1,
      position: 'fixed',
      right: 16,
      whiteSpace: 'pre',
      width: 280,
      zIndex: theme => theme.zIndex.tooltip,
    }}
  >
    {`PROTOTYPE state\n${JSON.stringify(state, null, 2)}`}
  </Paper>
);

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

const usePrototypeSettings = () => {
  const [state, setState] = useState(DEFAULT_STATE);
  const patch = (partial: Partial<PrototypeSettingsState>) => {
    setState(prev => ({ ...prev, ...partial }));
  };
  const reset = () => {
    setState(DEFAULT_STATE);
  };
  return { patch, reset, state };
};

const ThemeSelectControl: FC<{
  readonly onChange: (value: string) => void;
  readonly value: string;
}> = ({ onChange, value }) => (
  <FormControl size="small" sx={{ minWidth: 140 }}>
    <Select
      onChange={event => {
        onChange(event.target.value);
      }}
      value={value}
    >
      <MenuItem value="system">System</MenuItem>
      <MenuItem value="light">Light</MenuItem>
      <MenuItem value="dark">Dark</MenuItem>
    </Select>
  </FormControl>
);

/** Codex-like dense category rail + section cards */
export const SettingsPrototypePage: FC = () => {
  const { patch, reset, state } = usePrototypeSettings();
  const [category, setCategory] = useState<CategoryId>('general');
  const [query, setQuery] = useState('');

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, (typeof CATEGORIES)[number][]>();
    for (const entry of CATEGORIES) {
      if (q.length === 0 || entry.label.toLowerCase().includes(q)) {
        const bucket = map.get(entry.group);
        if (bucket === undefined) {
          map.set(entry.group, [entry]);
        } else {
          bucket.push(entry);
        }
      }
    }
    return [...map.entries()];
  }, [query]);

  const showReal = category === 'general' || category === 'appearance';

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
          {filteredGroups.map(([group, items]) => (
            <Box key={group} sx={{ mb: 0.75 }}>
              <Typography color="text.secondary" sx={{ px: 1.5, py: 0.25 }} variant="caption">
                {group}
              </Typography>
              {items.map(item => (
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
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0, px: 3, py: 2 }}>
          <Box sx={rowSx}>
            <Typography variant="h5">{CATEGORIES.find(c => c.id === category)?.label ?? 'Settings'}</Typography>
            <Button onClick={reset} size="small" startIcon={<RestartAlt />}>
              Restore defaults
            </Button>
          </Box>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {showReal ? (
            <Stack spacing={2}>
              <Paper sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 2 }} variant="outlined">
                <Typography sx={{ mb: 1.5 }} variant="h6">
                  Permissions
                </Typography>
                <Stack spacing={2}>
                  <Box sx={rowSx}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>Default permissions</Typography>
                      <Typography color="text.secondary" variant="body2">
                        Placeholder — agent may read and edit files in the session cwd.
                      </Typography>
                    </Box>
                    <Switch checked disabled />
                  </Box>
                  <Box sx={rowSx}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>Confirm session delete</Typography>
                      <Typography color="text.secondary" variant="body2">
                        Ask before permanently deleting a session from the roster.
                      </Typography>
                    </Box>
                    <Switch
                      checked={state.confirmDeleteSession}
                      onChange={(_, checked) => {
                        patch({ confirmDeleteSession: checked });
                      }}
                    />
                  </Box>
                </Stack>
              </Paper>

              <Paper sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 2 }} variant="outlined">
                <Typography sx={{ mb: 1.5 }} variant="h6">
                  General
                </Typography>
                <Stack spacing={2}>
                  <Box sx={rowSx}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>Theme</Typography>
                      <Typography color="text.secondary" variant="body2">
                        Placeholder — today this lives in the chat AppBar ThemeSelect.
                      </Typography>
                    </Box>
                    <ThemeSelectControl
                      onChange={value => {
                        patch({ themePreference: value });
                      }}
                      value={state.themePreference}
                    />
                  </Box>
                  <Box sx={rowSx}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>Show bottom panel</Typography>
                      <Typography color="text.secondary" variant="body2">
                        Placeholder — RPC wire log visibility preference.
                      </Typography>
                    </Box>
                    <Switch
                      checked={state.showBottomPanel}
                      onChange={(_, checked) => {
                        patch({ showBottomPanel: checked });
                      }}
                    />
                  </Box>
                  <Box sx={rowSx}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>Prevent sleep while running</Typography>
                      <Typography color="text.secondary" variant="body2">
                        Placeholder — keep the machine awake during long turns.
                      </Typography>
                    </Box>
                    <Switch
                      checked={state.preventSleepWhileRunning}
                      onChange={(_, checked) => {
                        patch({ preventSleepWhileRunning: checked });
                      }}
                    />
                  </Box>
                  <Box sx={rowSx}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>Suggested prompts</Typography>
                      <Typography color="text.secondary" variant="body2">
                        Placeholder — suggest next steps from project files.
                      </Typography>
                    </Box>
                    <Switch
                      checked={state.suggestedPrompts}
                      onChange={(_, checked) => {
                        patch({ suggestedPrompts: checked });
                      }}
                    />
                  </Box>
                </Stack>
              </Paper>
            </Stack>
          ) : (
            <Paper sx={{ borderRadius: 2, p: 3 }} variant="outlined">
              <Typography variant="h6">Coming soon</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
                Placeholder category <code>{category}</code> — reserved for growth.
              </Typography>
            </Paper>
          )}
        </Box>
      </Box>
      <StateDump state={state} />
    </Box>
  );
};
