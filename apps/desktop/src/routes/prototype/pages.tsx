/**
 * PROTOTYPE (Epic #424, assuming #409). The three-page shell is fixed: Sessions (the real app), Workstreams (one
 * plain version), and Orchestration. Three Orchestration Page variants are switchable via `?variant=`. Throwaway
 * route on `prototype/185-28-features-missions`.
 */
import {
  allotmentSashSx,
  LucideMuiIcon,
  PANEL_HEADER_HEIGHT,
  SessionChatBody,
  SessionHeader,
  useClientErrorSnackbar,
} from '@lib/ui';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router';
import { Allotment } from 'allotment';
import { Layers, MessagesSquare, Workflow } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { OrchestrationVariantA } from '../../components/prototype/threePages/OrchestrationVariantA.tsx';
import { OrchestrationVariantB } from '../../components/prototype/threePages/OrchestrationVariantB.tsx';
import { OrchestrationVariantC } from '../../components/prototype/threePages/OrchestrationVariantC.tsx';
import { StatePeek, useStore } from '../../components/prototype/threePages/threePagesShared.tsx';
import { WorkstreamsPage } from '../../components/prototype/threePages/WorkstreamsPage.tsx';
import { PrototypeSwitcher } from '../../components/prototype/PrototypeSwitcher.tsx';
import { WorkbenchNavRail } from '../../components/workbenchNavRail/WorkbenchNavRail.tsx';

const VARIANT_LABELS = {
  A: 'Orchestration: graph first',
  B: 'Orchestration: Orchestrator chat first',
  C: 'Orchestration: control room',
} as const;
type Variant = keyof typeof VARIANT_LABELS;
const isVariant = (value: unknown): value is Variant => typeof value === 'string' && value in VARIANT_LABELS;
const PAGES = ['sessions', 'workstreams', 'orchestration'] as const;
type Page = (typeof PAGES)[number];
const isPage = (value: unknown): value is Page => PAGES.some(page => page === value);

const routeApi = getRouteApi('/prototype/pages');

const PAGE_ICON = { orchestration: Workflow, sessions: MessagesSquare, workstreams: Layers } as const;
const PAGE_LABEL = { orchestration: 'Orchestration', sessions: 'Sessions', workstreams: 'Workstreams' } as const;

const ThreePagesPrototype: FC = () => {
  const { page = 'orchestration', variant = 'A' } = routeApi.useSearch();
  const navigate = useNavigate({ from: '/prototype/pages' });
  const { clientErrorSnackbar, onClientError } = useClientErrorSnackbar();
  const api = useStore();
  const [orchId, setOrchId] = useState(api.store.orchestrations[0]?.id ?? '');
  const orch = api.store.orchestrations.find(candidate => candidate.id === orchId) ?? api.store.orchestrations[0];
  const go = (search: { page?: Page; variant?: Variant }) => {
    navigate({ replace: true, search: current => ({ ...current, ...search }) }).catch(() => undefined);
  };

  return (
    <Box sx={{ bgcolor: 'background.default', display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Stack
        sx={{
          alignItems: 'center',
          bgcolor: 'background.paper',
          borderColor: 'divider',
          borderRight: 1,
          gap: 1,
          py: 1,
          width: 52,
        }}
      >
        {PAGES.map(candidate => (
          <Tooltip key={candidate} placement="right" title={`${PAGE_LABEL[candidate]} Page`}>
            <IconButton
              aria-label={`${PAGE_LABEL[candidate]} Page`}
              onClick={() => {
                go({ page: candidate });
              }}
              sx={{ bgcolor: candidate === page ? 'action.selected' : 'transparent', borderRadius: 1.5 }}
            >
              <LucideMuiIcon
                icon={PAGE_ICON[candidate]}
                sx={{ color: candidate === page ? 'primary.main' : 'text.secondary' }}
              />
            </IconButton>
          </Tooltip>
        ))}
      </Stack>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {page === 'sessions' ? (
          <Box sx={theme => ({ ...allotmentSashSx(theme), height: '100%' })}>
            <Allotment>
              <Allotment.Pane minSize={260} preferredSize={380}>
                <WorkbenchNavRail onClientError={onClientError} onClose={() => undefined} />
              </Allotment.Pane>
              <Allotment.Pane minSize={320}>
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                  <Box
                    sx={{
                      alignItems: 'center',
                      bgcolor: 'background.paper',
                      display: 'flex',
                      flexShrink: 0,
                      height: PANEL_HEADER_HEIGHT,
                      px: 2,
                    }}
                  >
                    <SessionHeader onClientError={onClientError} titleProps={{ variant: 'h6' }} />
                  </Box>
                  <SessionChatBody onClientError={onClientError} />
                </Box>
              </Allotment.Pane>
            </Allotment>
          </Box>
        ) : null}
        {page === 'workstreams' ? <WorkstreamsPage api={api} /> : null}
        {page === 'orchestration' && orch !== undefined ? (
          <>
            {variant === 'A' && <OrchestrationVariantA api={api} onSelect={setOrchId} orch={orch} />}
            {variant === 'B' && <OrchestrationVariantB api={api} onSelect={setOrchId} orch={orch} />}
            {variant === 'C' && <OrchestrationVariantC api={api} onSelect={setOrchId} orch={orch} />}
          </>
        ) : null}
      </Box>
      {page === 'orchestration' ? (
        <PrototypeSwitcher
          current={variant}
          labels={VARIANT_LABELS}
          onChange={next => {
            go({ variant: isVariant(next) ? next : 'A' });
          }}
          onExit={() => {
            navigate({ to: '/' }).catch(() => undefined);
          }}
        />
      ) : null}
      {page === 'sessions' ? null : (
        <StatePeek
          value={
            page === 'workstreams'
              ? { pool: api.store.pool, workstreams: api.store.workstreams }
              : { defaultStopAtMilestones: api.store.defaultStopAtMilestones, selected: orch }
          }
        />
      )}
      {clientErrorSnackbar}
    </Box>
  );
};

export const Route = createFileRoute('/prototype/pages')({
  component: ThreePagesPrototype,
  validateSearch: (search: Record<string, unknown>): { page?: Page; variant?: Variant } => ({
    ...(isPage(search.page) ? { page: search.page } : {}),
    ...(isVariant(search.variant) ? { variant: search.variant } : {}),
  }),
});
