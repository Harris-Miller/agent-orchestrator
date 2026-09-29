import { normalizeInitialize, normalizeSession, UsageCard } from '@lib/ui';
import type {
  AvailableCommand,
  NormalizedCapability,
  NormalizedConfigOption,
  NormalizedMode,
  NormalizedModel,
  SessionSnapshot,
} from '@lib/ui';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC, ReactNode } from 'react';

import { PanelHeader } from '../shared/PanelHeader.tsx';

export const RIGHT_PANEL_WIDTH = 380;

const sectionCardSx = {
  bgcolor: 'background.default',
  borderColor: 'divider',
  p: 1.5,
} as const;

const Section: FC<{ children: ReactNode; pending?: boolean; title: string }> = ({ children, pending, title }) => (
  <Stack spacing={1}>
    <Typography sx={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }} variant="caption">
      {title}
    </Typography>
    {pending === true ? (
      <Typography color="text.secondary" variant="body2">
        Pending…
      </Typography>
    ) : (
      children
    )}
  </Stack>
);

const capabilityGroupLabel = (path: string): string => {
  const [group] = path.split('.');
  switch (group) {
    case 'auth':
      return 'Auth';
    case 'mcpCapabilities':
      return 'MCP';
    case 'promptCapabilities':
      return 'Prompt';
    case 'sessionCapabilities':
      return 'Session';
    default:
      return 'General';
  }
};

const groupCapabilities = (
  capabilities: readonly NormalizedCapability[],
): readonly { readonly group: string; readonly items: readonly NormalizedCapability[] }[] => {
  const groups = new Map<string, NormalizedCapability[]>();

  for (const capability of capabilities) {
    const group = capabilityGroupLabel(capability.path);
    const existing = groups.get(group) ?? [];
    existing.push(capability);
    groups.set(group, existing);
  }

  return [...groups.entries()].map(([group, items]) => ({ group, items }));
};

const capabilityLabel = (path: string): string => path.split('.').at(-1) ?? path;

const OptionChips: FC<{
  readonly currentId?: string;
  readonly options: readonly (NormalizedMode | NormalizedModel)[];
}> = ({ currentId, options }) => {
  if (options.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        None reported
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {options.map(option => {
        const selected = option.id === currentId;
        return (
          <Paper key={option.id} sx={sectionCardSx} variant="outlined">
            <Stack spacing={0.5}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip
                  color={selected ? 'primary' : 'default'}
                  label={option.name}
                  size="small"
                  variant={selected ? 'filled' : 'outlined'}
                />
                {selected ? (
                  <Typography color="primary.main" variant="caption">
                    current
                  </Typography>
                ) : null}
              </Stack>
              <Typography color="text.secondary" sx={{ fontFamily: 'monospace' }} variant="caption">
                {option.id}
              </Typography>
              {option.description !== undefined ? (
                <Typography color="text.secondary" variant="body2">
                  {option.description}
                </Typography>
              ) : null}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
};

const ConfigOptionCard: FC<{ readonly option: NormalizedConfigOption }> = ({ option }) => (
  <Paper sx={sectionCardSx} variant="outlined">
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 600 }} variant="body2">
          {option.name}
        </Typography>
        {option.type !== undefined ? <Chip label={option.type} size="small" variant="outlined" /> : null}
        {option.category !== undefined ? (
          <Chip color="default" label={option.category} size="small" variant="outlined" />
        ) : null}
      </Stack>
      {option.description !== undefined ? (
        <Typography color="text.secondary" variant="body2">
          {option.description}
        </Typography>
      ) : null}
      <Typography variant="body2">
        Current: <strong>{option.currentValue ?? '—'}</strong>
      </Typography>
      {option.choices.length > 0 ? (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          {option.choices.map(choice => (
            <Chip
              color={choice.id === option.currentValue ? 'primary' : 'default'}
              key={choice.id}
              label={choice.name}
              size="small"
              title={choice.description}
              variant={choice.id === option.currentValue ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  </Paper>
);

export const SessionStateContent: FC<{
  readonly availableCommands?: readonly AvailableCommand[];
  readonly initializeResult: unknown;
  readonly selectedModeId?: string;
  readonly selectedModelId?: string;
  readonly session?: SessionSnapshot;
  readonly showSessionDetails: boolean;
}> = ({ availableCommands, initializeResult, selectedModeId, selectedModelId, session, showSessionDetails }) => {
  const initialize = normalizeInitialize(initializeResult);
  const sessionConfiguration =
    session?.sessionConfiguration !== undefined ? normalizeSession(session.sessionConfiguration) : undefined;
  const capabilityGroups = initialize === undefined ? [] : groupCapabilities(initialize.capabilities);

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary" variant="body2">
        Abstracted from initialize, session lifecycle RPCs, available_commands_update, and usage_update.
      </Typography>

      <Divider />

      <Section pending={initialize === undefined} title="Agent">
        {initialize !== undefined ? (
          <Stack spacing={1.5}>
            {initialize.agentInfo !== undefined ? (
              <Paper sx={sectionCardSx} variant="outlined">
                <Stack spacing={0.5}>
                  <Typography sx={{ fontWeight: 600 }} variant="body1">
                    {initialize.agentInfo.title ?? initialize.agentInfo.name}
                  </Typography>
                  <Typography color="text.secondary" sx={{ fontFamily: 'monospace' }} variant="caption">
                    {initialize.agentInfo.name} · v{initialize.agentInfo.version}
                  </Typography>
                  {initialize.protocolVersion !== undefined ? (
                    <Chip label={`protocol v${initialize.protocolVersion}`} size="small" variant="outlined" />
                  ) : null}
                </Stack>
              </Paper>
            ) : null}

            {initialize.authMethods.length > 0 ? (
              <Stack spacing={0.75}>
                <Typography color="text.secondary" variant="caption">
                  Auth methods
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  {initialize.authMethods.map(method => (
                    <Chip key={method.id} label={method.name ?? method.id} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Stack>
            ) : null}

            {initialize.metaExtensions.length > 0 ? (
              <Stack spacing={0.75}>
                <Typography color="text.secondary" variant="caption">
                  Extensions
                </Typography>
                {initialize.metaExtensions.map(extension => (
                  <Box key={extension.key}>
                    <Typography sx={{ fontWeight: 600 }} variant="body2">
                      {extension.key}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      {extension.summary}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : null}
          </Stack>
        ) : null}
      </Section>

      <Divider />

      <Section pending={initialize === undefined} title="Capabilities">
        {initialize !== undefined ? (
          capabilityGroups.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              None reported
            </Typography>
          ) : (
            <Stack spacing={1.25}>
              {capabilityGroups.map(group => (
                <Box key={group.group}>
                  <Typography color="text.secondary" sx={{ mb: 0.75 }} variant="caption">
                    {group.group}
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                    {group.items.map(capability => (
                      <Chip
                        color={capability.enabled ? 'success' : 'default'}
                        key={capability.path}
                        label={capabilityLabel(capability.path)}
                        size="small"
                        title={capability.path}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )
        ) : null}
      </Section>

      {showSessionDetails ? (
        <>
          <Divider />

          <Section pending={sessionConfiguration === undefined} title="Session">
            {sessionConfiguration !== undefined ? (
              <Stack spacing={1.5}>
                {session?.sessionId !== undefined ? (
                  <Chip
                    label={session.sessionId}
                    size="small"
                    sx={{ alignSelf: 'flex-start', fontFamily: 'monospace' }}
                  />
                ) : null}

                <Stack spacing={0.75}>
                  <Typography color="text.secondary" variant="caption">
                    Usage
                  </Typography>
                  {session?.usage === undefined ? (
                    <Typography color="text.secondary" variant="body2">
                      None reported
                    </Typography>
                  ) : (
                    <UsageCard usage={session.usage} />
                  )}
                </Stack>

                <Stack spacing={0.75}>
                  <Typography color="text.secondary" variant="caption">
                    Models
                  </Typography>
                  <OptionChips
                    currentId={selectedModelId ?? sessionConfiguration.models.currentId}
                    options={sessionConfiguration.models.options}
                  />
                </Stack>

                <Stack spacing={0.75}>
                  <Typography color="text.secondary" variant="caption">
                    Modes
                  </Typography>
                  <OptionChips
                    currentId={selectedModeId ?? sessionConfiguration.modes.currentId}
                    options={sessionConfiguration.modes.options}
                  />
                </Stack>

                {sessionConfiguration.configOptions.length > 0 ? (
                  <Stack spacing={0.75}>
                    <Typography color="text.secondary" variant="caption">
                      Config options
                    </Typography>
                    <Stack spacing={1}>
                      {sessionConfiguration.configOptions.map(option => (
                        <ConfigOptionCard key={option.id} option={option} />
                      ))}
                    </Stack>
                  </Stack>
                ) : null}
              </Stack>
            ) : null}
          </Section>

          <Divider />

          <Section pending={availableCommands === undefined} title="Commands">
            {availableCommands !== undefined ? (
              availableCommands.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  None reported
                </Typography>
              ) : (
                <List dense disablePadding>
                  {availableCommands.map(command => (
                    <ListItem disableGutters key={command.name} sx={{ px: 0 }}>
                      <ListItemText
                        primary={command.name}
                        secondary={command.description}
                        slotProps={{
                          primary: { sx: { fontFamily: 'monospace', fontWeight: 600 } },
                          secondary: { sx: { color: 'text.secondary' } },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              )
            ) : null}
          </Section>
        </>
      ) : null}
    </Stack>
  );
};

/** Session State body for the Developer panel tab (same props the right pane used to take). */
export const SessionStateView: FC<{
  readonly initializeResult: unknown;
  readonly session?: SessionSnapshot;
}> = ({ initializeResult, session }) => (
  <SessionStateContent
    availableCommands={session?.availableCommands}
    initializeResult={initializeResult}
    selectedModeId={session?.selectedModeId}
    selectedModelId={session?.selectedModelId}
    session={session}
    showSessionDetails={session?.status === 'active'}
  />
);

/** Empty right-pane placeholder; content TBD. */
export const RightPanelPlaceholder: FC<{
  readonly onClose: () => void;
}> = ({ onClose }) => (
  <Box
    sx={{
      bgcolor: 'background.paper',
      borderColor: 'divider',
      borderLeft: 1,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}
  >
    <PanelHeader closeAriaLabel="Close panel" closeGlyph="›" onClose={onClose} title="Panel" />
  </Box>
);
