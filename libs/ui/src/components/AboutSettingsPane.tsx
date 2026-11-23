import { OpenUrl } from '@lib/context-services';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Effect } from 'effect';
import { useCallback, useState } from 'react';
import type { FC } from 'react';

import { hostRuntime } from '../hostRuntime.ts';

export const GITHUB_REPO_URL = 'https://github.com/Harris-Miller/agent-orchestrator';

/** Settings → About: project links. */
export const AboutSettingsPane: FC = () => {
  const [openError, setOpenError] = useState<string | undefined>(undefined);

  const openRepo = useCallback(async () => {
    setOpenError(undefined);
    const exit = await hostRuntime.runPromiseExit(
      Effect.gen(function* () {
        const openUrl = yield* OpenUrl;
        yield* openUrl.open(GITHUB_REPO_URL);
      }),
    );
    if (exit._tag === 'Failure') {
      setOpenError(`Could not open the browser. Visit ${GITHUB_REPO_URL}`);
    }
  }, []);

  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="h6">About</Typography>
      <Button
        onClick={() => {
          openRepo().catch(() => undefined);
        }}
        variant="outlined"
      >
        View on GitHub
      </Button>
      {openError === undefined ? null : <Alert severity="error">{openError}</Alert>}
    </Stack>
  );
};
