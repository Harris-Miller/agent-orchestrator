import {
  filterSettingsCategories,
  LucideMuiIcon,
  RestoreUserSettingsDefaultsControl,
  UserSettingsLoadFailureAlert,
} from '@lib/ui';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

/** VS Code Settings category list (narrow sidebar). */
export const SettingsListPage: FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => filterSettingsCategories(query), [query]);

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
          <LucideMuiIcon fontSize="small" icon={ArrowLeft} />
        </IconButton>
        <Typography sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
          Settings
        </Typography>
        <RestoreUserSettingsDefaultsControl iconFontSize="small" />
      </Stack>

      <UserSettingsLoadFailureAlert />

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
    </Box>
  );
};
