import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { SettingsCategoryId } from '../settings/settingsCategories.ts';

import { GeneralSettingsPane } from './GeneralSettingsPane.tsx';
import { ProvidersPrototype } from './providersPrototype/ProvidersPrototype.tsx';
import { ThemeSelect } from './ThemeSelect.tsx';

/** Shared Settings category pane body (host shells supply chrome). */
export const SettingsCategoryContent: FC<{ readonly category: SettingsCategoryId }> = ({ category }) => {
  if (category === 'appearance') {
    return (
      <>
        <Typography variant="h6">Appearance</Typography>
        <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
          Theme preference is stored in User settings.
        </Typography>
        <ThemeSelect />
      </>
    );
  }
  if (category === 'general') {
    return <GeneralSettingsPane />;
  }
  if (category === 'providers') {
    // PROTOTYPE (#175): swap back to <ProvidersSettingsPane /> once a variant is picked.
    return <ProvidersPrototype />;
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
