import type { FC } from 'react';

import type { SettingsCategoryId } from '../settings/settingsCategories.ts';

import { GeneralSettingsPane } from './GeneralSettingsPane.tsx';
import { ProvidersSettingsPane } from './ProvidersSettingsPane.tsx';
import { SettingsSectionIntro } from './settingsChrome.tsx';
import { ThemeSelect } from './ThemeSelect.tsx';

/** Shared Settings category pane body (host shells supply chrome). */
export const SettingsCategoryContent: FC<{ readonly category: SettingsCategoryId }> = ({ category }) => {
  if (category === 'appearance') {
    return (
      <>
        <SettingsSectionIntro title="Appearance">Theme preference is stored in User settings.</SettingsSectionIntro>
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
    <SettingsSectionIntro title="Coming soon">
      Placeholder category <code>{category}</code> — reserved for growth.
    </SettingsSectionIntro>
  );
};
