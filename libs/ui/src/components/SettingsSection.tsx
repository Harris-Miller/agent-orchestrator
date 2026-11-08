import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC, ReactNode } from 'react';

export const SettingsSectionTitle: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Typography color="text.secondary" sx={{ mb: 1, mt: 3, px: 1 }} component="h2" variant="subtitle2">
    {children}
  </Typography>
);

export const SettingsGroup: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Box
    sx={{
      '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' },
      border: 1,
      borderColor: 'divider',
      borderRadius: 2,
    }}
  >
    {children}
  </Box>
);

export const SettingsRow: FC<{
  readonly below?: ReactNode;
  readonly children?: ReactNode;
  readonly description: ReactNode;
  readonly title: ReactNode;
}> = ({ below, children, description, title }) => (
  <Box sx={{ px: 2.5, py: 2 }}>
    <Stack direction="row" sx={{ alignItems: 'center', gap: 3, flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography color="text.secondary" variant="body2">
          {description}
        </Typography>
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, gap: 1 }}>
        {children}
      </Stack>
    </Stack>
    {below === undefined || below === null ? null : <Box sx={{ mt: 1.5 }}>{below}</Box>}
  </Box>
);

export const SettingsSection: FC<{ readonly title: string; readonly children: ReactNode }> = ({ title, children }) => (
  <Box component="section" sx={{ '&:first-of-type > h2': { mt: 0 } }}>
    <SettingsSectionTitle>{title}</SettingsSectionTitle>
    <SettingsGroup>{children}</SettingsGroup>
  </Box>
);
