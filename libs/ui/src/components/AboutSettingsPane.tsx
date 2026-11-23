import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import type { FC } from 'react';

import { SettingsRow, SettingsSection } from './SettingsSection.tsx';
import { useOpenExternalUrl } from './useOpenExternalUrl.ts';

export const GITHUB_REPO_URL = 'https://github.com/Harris-Miller/agent-orchestrator';

/** Settings → About: project links. */
export const AboutSettingsPane: FC = () => {
  const { error, open } = useOpenExternalUrl(GITHUB_REPO_URL);

  return (
    <SettingsSection title="About">
      <SettingsRow
        below={error === undefined ? null : <Alert severity="error">{error}</Alert>}
        description="Source code, issues, and releases."
        title="GitHub"
      >
        <Button
          onClick={() => {
            open().catch(() => undefined);
          }}
          variant="outlined"
        >
          View on GitHub
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
};
