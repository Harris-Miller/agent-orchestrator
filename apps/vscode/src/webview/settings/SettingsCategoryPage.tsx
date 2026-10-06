import { isSettingsCategoryId, SettingsCategoryContent, settingsCategoryLabel } from '@lib/ui';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { FC } from 'react';

/** VS Code Settings category detail (narrow sidebar). */
export const SettingsCategoryPage: FC = () => {
  const navigate = useNavigate();
  const { category: categoryParam } = useParams({ from: '/settings/$category' });
  const valid = isSettingsCategoryId(categoryParam);

  useEffect(() => {
    if (!valid) {
      navigate({ to: '/settings' }).catch(() => undefined);
    }
  }, [navigate, valid]);

  if (!valid) {
    return <Alert severity="warning">Unknown settings category.</Alert>;
  }

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', minHeight: 0, overflow: 'auto', p: 1 }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
        <IconButton
          aria-label="Back to Settings"
          onClick={() => {
            navigate({ to: '/settings' }).catch(() => undefined);
          }}
          size="small"
        >
          <ArrowBack fontSize="small" />
        </IconButton>
        <Typography sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
          {settingsCategoryLabel(categoryParam)}
        </Typography>
      </Stack>
      {/* Extra inset: MUI FormControlLabel applies a negative left margin on Switch. */}
      <Box sx={{ minWidth: 0, px: 1.5 }}>
        <SettingsCategoryContent category={categoryParam} />
      </Box>
    </Box>
  );
};
