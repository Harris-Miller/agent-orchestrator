import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { ThemeSelect } from './ThemeSelect.tsx';

/** Settings → Appearance: Theme preference stored in User settings. */
export const AppearanceSettingsPane: FC = () => (
  <>
    <Typography variant="h6">Appearance</Typography>
    <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
      Theme preference is stored in User settings.
    </Typography>
    <ThemeSelect />
  </>
);
