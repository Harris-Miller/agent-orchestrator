import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ArrowLeft, Bot, GitBranch, Info, Keyboard, Menu, Palette, Plug, Search, Settings } from 'lucide-react';
import { useState } from 'react';
import type { FC, ReactNode } from 'react';
import { filterSettingsCategories, settingsCategoryLabel } from '../settings/settingsCategories.ts';
import type { SettingsCategoryId } from '../settings/settingsCategories.ts';
import { PANEL_HEADER_HEIGHT } from '../theme/tokens.ts';
import { IconTooltipButton } from './IconTooltipButton.tsx';
import { LucideMuiIcon } from './LucideMuiIcon.tsx';
import { RestoreUserSettingsDefaultsControl } from './RestoreUserSettingsDefaultsControl.tsx';
import { UserSettingsLoadFailureAlert } from './UserSettingsLoadFailureAlert.tsx';

const icons = {
  general: Settings,
  appearance: Palette,
  keyboard: Keyboard,
  providers: Bot,
  git: GitBranch,
  connections: Plug,
  about: Info,
};

/** Router-independent settings navigation and responsive page chrome. */
export const SettingsShell: FC<{
  readonly category: SettingsCategoryId;
  readonly onSelectCategory: (category: SettingsCategoryId) => void;
  readonly onBack: () => void;
  readonly children: ReactNode;
}> = ({ category, onSelectCategory, onBack, children }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const drawerContent = (
    <>
      <Box
        sx={{
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
          boxSizing: 'border-box',
          display: 'flex',
          flexShrink: 0,
          minHeight: PANEL_HEADER_HEIGHT,
          px: 2,
        }}
      >
        <Typography component="h2" noWrap sx={{ fontWeight: 600 }} variant="subtitle1">
          Settings
        </Typography>
      </Box>
      <Box sx={{ p: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search settings…"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
          }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search settings' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <LucideMuiIcon icon={Search} fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 10 } }}
        />
        <Box component="nav" aria-label="Settings categories">
          {filterSettingsCategories(query).map(item => (
            <ListItemButton
              key={item.id}
              selected={category === item.id}
              aria-current={category === item.id ? 'page' : undefined}
              sx={{ borderRadius: 2 }}
              onClick={() => {
                onSelectCategory(item.id);
                setOpen(false);
              }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <LucideMuiIcon icon={icons[item.id]} fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} slotProps={{ primary: { variant: 'body2' } }} />
            </ListItemButton>
          ))}
        </Box>
      </Box>
    </>
  );
  return (
    <Box sx={{ bgcolor: 'background.default', display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <Drawer
        variant="permanent"
        sx={theme => ({
          display: 'none',
          [theme.breakpoints.up('md')]: { display: 'block' },
          width: 260,
          flexShrink: 0,
          '& .MuiDrawer-paper': { position: 'relative', width: 260, height: '100%', boxSizing: 'border-box', pt: 0 },
        })}
      >
        {drawerContent}
      </Drawer>
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        sx={theme => ({
          display: 'block',
          [theme.breakpoints.up('md')]: { display: 'none' },
          '& .MuiDrawer-paper': { width: 260, pt: 0 },
        })}
      >
        {drawerContent}
      </Drawer>
      <Box sx={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column' }}>
        <Box
          sx={{
            alignItems: 'center',
            boxSizing: 'border-box',
            display: 'flex',
            borderBottom: 1,
            borderColor: 'divider',
            minHeight: PANEL_HEADER_HEIGHT,
            flexShrink: 0,
            px: 1,
            gap: 1,
          }}
        >
          <IconTooltipButton icon={ArrowLeft} label="Back to app" onClick={onBack} />
          <Box sx={theme => ({ display: 'block', [theme.breakpoints.up('md')]: { display: 'none' } })}>
            <IconTooltipButton
              icon={Menu}
              label="Settings categories"
              onClick={() => {
                setOpen(true);
              }}
            />
          </Box>
          <Typography variant="subtitle1" noWrap sx={{ flex: 1, fontWeight: 600 }}>
            {settingsCategoryLabel(category)}
          </Typography>
          <RestoreUserSettingsDefaultsControl />
        </Box>
        <Box
          sx={theme => ({
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            px: 2,
            py: 3,
            [theme.breakpoints.up('md')]: { px: 3 },
          })}
        >
          <Box
            sx={theme => ({ maxWidth: theme.breakpoints.values.md, minWidth: theme.breakpoints.values.xs, mx: 'auto' })}
          >
            <UserSettingsLoadFailureAlert sx={{ mb: 2 }} />
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
