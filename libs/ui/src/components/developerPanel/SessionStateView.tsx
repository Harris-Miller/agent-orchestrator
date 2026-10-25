import type { FC, ReactNode } from 'react';

import type {
  NormalizedCapability,
  NormalizedConfigOption,
  NormalizedMode,
  NormalizedModel,
  SessionSnapshot,
} from '../../host/acpSessionBootstrap.ts';
import { normalizeInitialize, normalizeSession } from '../../host/acpSessionBootstrap.ts';
import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';
import { UsageCard } from '../sessionChat/UsageCard.tsx';
import { Badge } from '../ui/badge.tsx';

const Section: FC<{ children: ReactNode; pending?: boolean; title: string }> = ({ children, pending, title }) => (
  <div className="flex flex-col gap-2">
    <p className="text-xs font-semibold tracking-wide uppercase">{title}</p>
    {pending === true ? <p className="text-sm text-muted-foreground">Pending…</p> : children}
  </div>
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
    return <p className="text-sm text-muted-foreground">None reported</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map(option => {
        const selected = option.id === currentId;
        return (
          <div className="rounded-md border border-border bg-background p-3" key={option.id}>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge variant={selected ? 'default' : 'outline'}>{option.name}</Badge>
                {selected ? <span className="text-xs text-primary">current</span> : null}
              </div>
              <p className="font-mono text-xs text-muted-foreground">{option.id}</p>
              {option.description !== undefined ? (
                <p className="text-sm text-muted-foreground">{option.description}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ConfigOptionCard: FC<{ readonly option: NormalizedConfigOption }> = ({ option }) => (
  <div className="rounded-md border border-border bg-background p-3">
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{option.name}</p>
        <Badge variant="outline">{option.type}</Badge>
        {option.category !== undefined ? <Badge variant="outline">{option.category}</Badge> : null}
      </div>
      {option.description !== undefined ? <p className="text-sm text-muted-foreground">{option.description}</p> : null}
      <p className="text-sm">
        Current:{' '}
        <strong>
          {option.currentValue === undefined
            ? '—'
            : option.type === 'boolean'
              ? String(option.currentValue)
              : option.currentValue}
        </strong>
      </p>
      {option.type === 'select' && option.choices.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {option.choices.map(choice => (
            <Badge
              key={choice.id}
              title={choice.description}
              variant={choice.id === option.currentValue ? 'default' : 'outline'}
            >
              {choice.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  </div>
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
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Abstracted from initialize, session lifecycle RPCs, available_commands_update, and usage_update.
      </p>
      <div className="h-px bg-border" />

      <Section pending={initialize === undefined} title="Agent">
        {initialize !== undefined ? (
          <div className="flex flex-col gap-3">
            {initialize.agentInfo !== undefined ? (
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex flex-col gap-1">
                  <p className="font-semibold">{initialize.agentInfo.title ?? initialize.agentInfo.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {initialize.agentInfo.name} · v{initialize.agentInfo.version}
                  </p>
                  {initialize.protocolVersion !== undefined ? (
                    <Badge className="self-start" variant="outline">
                      protocol v{initialize.protocolVersion}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}

            {initialize.authMethods.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">Auth methods</p>
                <div className="flex flex-wrap gap-1">
                  {initialize.authMethods.map(method => (
                    <Badge key={method.id} variant="outline">
                      {method.name ?? method.id}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {initialize.metaExtensions.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">Extensions</p>
                {initialize.metaExtensions.map(extension => (
                  <div key={extension.key}>
                    <p className="text-sm font-semibold">{extension.key}</p>
                    <p className="text-sm text-muted-foreground">{extension.summary}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Section>

      <div className="h-px bg-border" />

      <Section pending={initialize === undefined} title="Capabilities">
        {initialize !== undefined ? (
          capabilityGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">None reported</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {capabilityGroups.map(group => (
                <div key={group.group}>
                  <p className="mb-1.5 text-xs text-muted-foreground">{group.group}</p>
                  <div className="flex flex-wrap gap-1">
                    {group.items.map(capability => (
                      <Badge
                        className={capability.enabled ? 'border-primary text-primary' : undefined}
                        key={capability.path}
                        title={capability.path}
                        variant="outline"
                      >
                        {capabilityLabel(capability.path)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </Section>

      {showSessionDetails ? (
        <>
          <div className="h-px bg-border" />

          <Section pending={sessionConfiguration === undefined} title="Session">
            {sessionConfiguration !== undefined ? (
              <div className="flex flex-col gap-3">
                {session?.sessionId !== undefined ? (
                  <Badge className="self-start font-mono" variant="outline">
                    {session.sessionId}
                  </Badge>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">Usage</p>
                  {session?.usage === undefined ? (
                    <p className="text-sm text-muted-foreground">None reported</p>
                  ) : (
                    <UsageCard usage={session.usage} />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">Models</p>
                  <OptionChips
                    currentId={selectedModelId ?? sessionConfiguration.models.currentId}
                    options={sessionConfiguration.models.options}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">Modes</p>
                  <OptionChips
                    currentId={selectedModeId ?? sessionConfiguration.modes.currentId}
                    options={sessionConfiguration.modes.options}
                  />
                </div>

                {sessionConfiguration.configOptions.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-muted-foreground">Config options</p>
                    <div className="flex flex-col gap-2">
                      {sessionConfiguration.configOptions.map(option => (
                        <ConfigOptionCard key={option.id} option={option} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Section>

          <div className="h-px bg-border" />

          <Section pending={availableCommands === undefined} title="Commands">
            {availableCommands !== undefined ? (
              availableCommands.length === 0 ? (
                <p className="text-sm text-muted-foreground">None reported</p>
              ) : (
                <div>
                  {availableCommands.map(command => (
                    <div className="py-1" key={command.name}>
                      <p className="font-mono text-sm font-semibold">{command.name}</p>
                      {command.description !== undefined ? (
                        <p className="text-sm text-muted-foreground">{command.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </Section>
        </>
      ) : null}
    </div>
  );
};

/** Session State body for the Developer panel tab. */
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
