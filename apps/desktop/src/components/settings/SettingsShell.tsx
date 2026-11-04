import {
  filterSettingsCategories,
  isSettingsCategoryId,
  LucideMuiIcon,
  PANEL_HEADER_HEIGHT,
  RestoreUserSettingsDefaultsControl,
  settingsCategoryLabel,
  UserSettingsLoadFailureAlert,
} from '@lib/ui';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Outlet, useMatch, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

const BackToApp: FC = () => {
  const navigate = useNavigate();
  return (
    <Tooltip title="Back to app">
      <IconButton
        aria-label="Back to app"
        onClick={() => {
          navigate({ to: '/' }).catch(() => undefined);
        }}
        size="small"
        sx={{ alignSelf: 'flex-start' }}
      >
        <LucideMuiIcon fontSize="small" icon={ArrowLeft} />
      </IconButton>
    </Tooltip>
  );
};

/** Desktop Settings shell: category rail + route-driven `$category` outlet. */
export const SettingsShell: FC = () => {
  const navigate = useNavigate();
  const categoryMatch = useMatch({ from: '/settings/$category', shouldThrow: false });
  const categoryParam = categoryMatch?.params.category;
  const category = categoryParam !== undefined && isSettingsCategoryId(categoryParam) ? categoryParam : undefined;

  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => filterSettingsCategories(query), [query]);

  return (
    <Box sx={{ bgcolor: 'background.default', display: 'flex', height: '100vh', overflow: 'hidden' }}>
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
                    <LucideMuiIcon fontSize="small" icon={Search} />
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
              key={item.id}
              onClick={() => {
                navigate({ params: { category: item.id }, to: '/settings/$category' }).catch(() => undefined);
              }}
              selected={category === item.id}
            >
              <ListItemText primary={item.label} slotProps={{ primary: { variant: 'body2' } }} />
            </ListItemButton>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
        <Box
          sx={{
            alignItems: 'center',
            borderBottom: 1,
            borderColor: 'divider',
            boxSizing: 'border-box',
            display: 'flex',
            flexShrink: 0,
            gap: 2,
            justifyContent: 'space-between',
            minHeight: PANEL_HEADER_HEIGHT,
            px: 2,
          }}
        >
          <Typography noWrap sx={{ flex: 1 }} variant="h6">
            {category !== undefined ? settingsCategoryLabel(category) : 'Settings'}
          </Typography>
          <RestoreUserSettingsDefaultsControl />
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          <UserSettingsLoadFailureAlert sx={{ mb: 2 }} />
          <Paper sx={{ borderRadius: 2, p: 3 }} variant="outlined">
            <Outlet />
          </Paper>
        </Box>
      </Box>
    </Box>
  );
};
