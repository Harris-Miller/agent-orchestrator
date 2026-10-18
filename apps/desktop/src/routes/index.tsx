import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { AgentChatWorkbench } from '../components/AgentChatWorkbench.tsx';
import { PrototypeSwitcher } from '../components/prototype/PrototypeSwitcher.tsx';
import type { WorkRegionVariantKey } from '../components/prototype/workRegion/variants.ts';
import { WORK_REGION_VARIANTS } from '../components/prototype/workRegion/variants.ts';

const formatClientError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

type IndexSearch = {
  readonly variant?: WorkRegionVariantKey;
};

const parseWorkRegionVariant = (value: unknown): undefined | WorkRegionVariantKey => {
  if (value === 'A' || value === 'B' || value === 'C') {
    return value;
  }
  return undefined;
};

export const Route = createFileRoute('/')({
  component: function Index() {
    const [clientError, setClientError] = useState<null | string>(null);
    const { variant } = Route.useSearch();

    return (
      <Box sx={{ height: '100vh', overflow: 'hidden' }}>
        <AgentChatWorkbench
          onClientError={error => {
            setClientError(formatClientError(error));
          }}
          workRegionPrototypeVariant={variant}
        />

        {variant !== undefined ? <PrototypeSwitcher current={variant} variants={[...WORK_REGION_VARIANTS]} /> : null}

        <Snackbar
          anchorOrigin={{ horizontal: 'center', vertical: 'bottom' }}
          autoHideDuration={6000}
          onClose={() => {
            setClientError(null);
          }}
          open={clientError !== null}
        >
          <Alert
            onClose={() => {
              setClientError(null);
            }}
            severity="error"
            sx={{ width: '100%' }}
            variant="filled"
          >
            {clientError}
          </Alert>
        </Snackbar>
      </Box>
    );
  },
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const variant = parseWorkRegionVariant(search.variant);
    return variant === undefined ? {} : { variant };
  },
});
