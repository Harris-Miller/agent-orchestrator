/**
 * PROTOTYPE variants D–F — A's rail (Sessions | Features, chat primary) combined with C's lineage lanes. They differ in
 * where the lanes live: a view toggle in the main pane (D), a split above chat (E), or a tab in the right panel (F).
 */
import { allotmentSashSx, PANEL_HEADER_HEIGHT } from '@lib/ui';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { useState } from 'react';
import type { FC, ReactNode } from 'react';

import { RealChatPane, SessionPane } from './featuresMissionsShared.tsx';
import type { PrototypeContext } from './featuresMissionsShared.tsx';
import { MissionPanel, RailPane } from './VariantARailTab.tsx';
import type { RailTab } from './VariantARailTab.tsx';
import { Lanes, Legend } from './VariantCLanes.tsx';

const LineageView: FC<{
  readonly ctx: PrototypeContext;
  readonly headerExtra?: ReactNode;
  readonly zoom?: number;
}> = ({ ctx, headerExtra, zoom = 1 }) => (
  <Box sx={{ bgcolor: 'background.default', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <Stack
      direction="row"
      sx={{ alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: 2, minHeight: PANEL_HEADER_HEIGHT, px: 2 }}
    >
      <Typography noWrap sx={{ flex: 1 }} variant="h6">
        {ctx.feature.name}
      </Typography>
      <Legend />
      {headerExtra}
    </Stack>
    {ctx.feature.mission?.state === 'halted' ? (
      <Alert severity="error" sx={{ flexShrink: 0, mx: 2 }}>
        {ctx.feature.mission.haltReason}
      </Alert>
    ) : null}
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {/* `zoom` shrinks the fixed-size lanes to fit a side panel. */}
      <Box sx={{ zoom }}>
        <Lanes ctx={ctx} />
      </Box>
    </Box>
  </Box>
);

/** Rail on the left; `main` and an optional right panel only when the Features tab is showing. */
const Shell: FC<{
  readonly ctx: PrototypeContext;
  readonly main: ReactNode;
  readonly right?: ReactNode;
}> = ({ ctx, main, right }) => {
  const [tab, setTab] = useState<RailTab>('features');
  return (
    <Box sx={theme => ({ ...allotmentSashSx(theme), bgcolor: 'background.default', height: '100%' })}>
      <Allotment>
        <Allotment.Pane minSize={260} preferredSize={340}>
          <RailPane ctx={ctx} onTabChange={setTab} tab={tab} />
        </Allotment.Pane>
        <Allotment.Pane minSize={360}>
          {tab === 'sessions' ? <RealChatPane onClientError={ctx.onClientError} /> : main}
        </Allotment.Pane>
        {tab === 'features' && right !== undefined ? (
          <Allotment.Pane minSize={260} preferredSize={360}>
            {right}
          </Allotment.Pane>
        ) : null}
      </Allotment>
    </Box>
  );
};

const missionPanel = (ctx: PrototypeContext) =>
  ctx.feature.mission === undefined ? undefined : <MissionPanel ctx={ctx} />;

/** D: the main pane flips between Chat and Lineage; clicking a lineage node flips back to its chat. */
export const VariantDToggle: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => {
  const [view, setView] = useState<'chat' | 'lineage'>('lineage');
  const toggle = (
    <ToggleButtonGroup
      exclusive
      onChange={(_event, value: 'chat' | 'lineage' | null) => {
        if (value !== null) setView(value);
      }}
      size="small"
      value={view}
    >
      <ToggleButton value="lineage">Lineage</ToggleButton>
      <ToggleButton value="chat">Chat</ToggleButton>
    </ToggleButtonGroup>
  );
  const openFromLanes: PrototypeContext = {
    ...ctx,
    openSession: session => {
      ctx.openSession(session);
      setView('chat');
    },
  };
  return (
    <Shell
      ctx={ctx}
      main={
        view === 'lineage' ? (
          <LineageView ctx={openFromLanes} headerExtra={toggle} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <Box sx={{ display: 'flex', flexShrink: 0, justifyContent: 'flex-end', px: 2, py: 0.5 }}>{toggle}</Box>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <SessionPane onClientError={ctx.onClientError} session={ctx.focused} />
            </Box>
          </Box>
        )
      }
      right={missionPanel(ctx)}
    />
  );
};

/** E: lineage and chat stacked in the main pane, C-style, with A's Mission panel on the right. */
export const VariantESplit: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => (
  <Shell
    ctx={ctx}
    main={
      <Allotment vertical>
        <Allotment.Pane minSize={120} preferredSize={320}>
          <LineageView ctx={ctx} />
        </Allotment.Pane>
        <Allotment.Pane minSize={200}>
          <Box sx={{ borderColor: 'divider', borderTop: 1, height: '100%' }}>
            <SessionPane onClientError={ctx.onClientError} session={ctx.focused} />
          </Box>
        </Allotment.Pane>
      </Allotment>
    }
    right={missionPanel(ctx)}
  />
);

/** F: chat stays whole; the right panel tabs between Mission and a shrunken lineage (manual Features get it too). */
const SidePanel: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => {
  const hasMission = ctx.feature.mission !== undefined;
  const [tab, setTab] = useState<'lineage' | 'mission'>('mission');
  const shown = hasMission ? tab : 'lineage';
  return (
    <Box sx={{ bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Tabs
        onChange={(_event, value: 'lineage' | 'mission') => {
          setTab(value);
        }}
        sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
        value={shown}
        variant="fullWidth"
      >
        {hasMission ? <Tab label="Mission" value="mission" /> : null}
        <Tab label="Lineage" value="lineage" />
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {shown === 'mission' ? <MissionPanel ctx={ctx} /> : <LineageView ctx={ctx} zoom={0.6} />}
      </Box>
    </Box>
  );
};

export const VariantFSidePanel: FC<{ readonly ctx: PrototypeContext }> = ({ ctx }) => (
  <Shell
    ctx={ctx}
    main={<SessionPane onClientError={ctx.onClientError} session={ctx.focused} />}
    right={<SidePanel ctx={ctx} />}
  />
);
