import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { SettingsCategoryId } from '../settings/settingsCategories.ts';

import { AppearanceSettingsPane } from './AppearanceSettingsPane.tsx';
import { GeneralSettingsPane } from './GeneralSettingsPane.tsx';
import { ProvidersSettingsPane } from './ProvidersSettingsPane.tsx';

/** Shared Settings category pane body (host shells supply chrome). */
export const SettingsCategoryContent: FC<{ readonly category: SettingsCategoryId }> = ({ category }) => {
  if (category === 'appearance') {
    return <AppearanceSettingsPane />;
  }
  if (category === 'general') {
    return <GeneralSettingsPane />;
  }
  if (category === 'providers') {
    return <ProvidersSettingsPane />;
  }
  return (
    <>
      <Typography variant="h6">Coming soon</Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
        Placeholder category <code>{category}</code> — reserved for growth.
      </Typography>
    </>
  );
};
