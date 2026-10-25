import type { FC } from 'react';

import type { SettingsCategoryId } from '../settings/settingsCategories.ts';

import { GeneralSettingsPane } from './GeneralSettingsPane.tsx';
import { ProvidersSettingsPane } from './ProvidersSettingsPane.tsx';
import { ThemeSelect } from './ThemeSelect.tsx';

/** Shared Settings category pane body (host shells supply chrome). */
export const SettingsCategoryContent: FC<{ readonly category: SettingsCategoryId }> = ({ category }) => {
  if (category === 'appearance') {
    return (
      <>
        <h2 className="text-lg font-medium">Appearance</h2>
        <p className="mt-2 mb-4 text-sm text-muted-foreground">Theme preference is stored in User settings.</p>
        <ThemeSelect />
      </>
    );
  }
  if (category === 'general') {
    return <GeneralSettingsPane />;
  }
  if (category === 'providers') {
    return <ProvidersSettingsPane />;
  }
  return (
    <>
      <h2 className="text-lg font-medium">Coming soon</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Placeholder category <code>{category}</code> — reserved for growth.
      </p>
    </>
  );
};
