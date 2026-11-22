import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  AgentLaunchTargetIcon,
  agentLaunchTargetLabel,
  composerAtom,
  enabledLaunchTargetsAtom,
  launchTargetAvailabilityAtom,
  LucideMuiIcon,
  patchVirtualSessionAtomFn,
  projectDisplayAtom,
  projectsAtom,
  projectsLoadedAtom,
  setVirtualLaunchTargetAtomFn,
  virtualSessionAtom,
} from '@lib/ui';
import type { AgentLaunchTarget } from '@lib/ui';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { FolderOpen } from 'lucide-react';
import type { FC } from 'react';

const selectableSx = (selected: boolean, theme: Theme) =>
  ({
    bgcolor: selected ? 'action.selected' : 'background.paper',
    border: 1,
    borderColor: selected ? 'primary.main' : 'divider',
    transition: theme.transitions.create('border-color'),
    '&:hover:not(:disabled)': { borderColor: 'primary.main' },
    '&:disabled': { opacity: 0.6 },
  }) as const;

const ProjectPill: FC<{
  readonly cwd: string;
  readonly disabled: boolean;
  readonly onPick: (cwd: string) => void;
  readonly selected: boolean;
}> = ({ cwd, disabled, onPick, selected }) => {
  const { label, parentCaption } = useAtomValue(projectDisplayAtom(cwd));
  return (
    <ButtonBase
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => {
        onPick(cwd);
      }}
      sx={theme => ({
        ...selectableSx(selected, theme),
        alignItems: 'center',
        borderRadius: 99,
        gap: 0.75,
        px: 1.5,
        py: 0.5,
      })}
      type="button"
    >
      <LucideMuiIcon icon={FolderOpen} sx={{ fontSize: 14 }} />
      <Typography component="span" variant="body2">
        {label}
      </Typography>
      {parentCaption === undefined ? null : (
        <Typography color="text.secondary" component="span" variant="caption">
          {parentCaption}
        </Typography>
      )}
    </ButtonBase>
  );
};

export type NewSessionLauncherViewProps = {
  readonly cwd: string | undefined;
  readonly disabled: boolean;
  readonly launchTarget: AgentLaunchTarget | undefined;
  readonly onPickProject: (cwd: string) => void;
  readonly onPickTarget: (launchTarget: AgentLaunchTarget) => void;
  readonly projects: readonly string[];
  /** False until projects have loaded; the empty hint is withheld so it cannot flash at startup. */
  readonly projectsLoaded: boolean;
  readonly targets: readonly AgentLaunchTarget[];
  /** Targets the composer can launch (usable); others are disabled. Defaults to all `targets`. */
  readonly usableTargets?: readonly AgentLaunchTarget[];
  readonly unavailableReasons?: Readonly<Partial<Record<AgentLaunchTarget, string>>>;
};

/** Presentational part, kept prop-driven so it renders without atoms. */
export const NewSessionLauncherView: FC<NewSessionLauncherViewProps> = ({
  cwd,
  disabled,
  launchTarget,
  onPickProject,
  onPickTarget,
  projects,
  projectsLoaded,
  usableTargets,
  targets,
  unavailableReasons,
}) => (
  <Box
    sx={{
      alignItems: 'center',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      pt: '12vh',
      px: 2,
      textAlign: 'center',
    }}
  >
    <Box>
      <Typography variant="h4">What are we building?</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }} variant="body1">
        Pick an agent and a project, then describe the work below.
      </Typography>
    </Box>
    <Box aria-label="Agent" role="group" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center' }}>
      {targets.map(target => (
        <ButtonBase
          aria-pressed={launchTarget === target}
          disabled={disabled || (usableTargets !== undefined && !usableTargets.includes(target))}
          key={target}
          onClick={() => {
            onPickTarget(target);
          }}
          sx={theme => ({
            ...selectableSx(launchTarget === target, theme),
            alignItems: 'center',
            borderRadius: 2,
            flexDirection: 'column',
            gap: 1,
            justifyContent: 'center',
            minWidth: 112,
            px: 2,
            py: 1.75,
          })}
          type="button"
        >
          <AgentLaunchTargetIcon launchTarget={target} size={32} />
          <Typography component="span" variant="body2">
            {agentLaunchTargetLabel(target)}
          </Typography>
          {usableTargets !== undefined &&
          !usableTargets.includes(target) &&
          unavailableReasons?.[target] !== undefined ? (
            <Typography color="text.secondary" component="span" sx={{ maxWidth: 112 }} variant="caption">
              {unavailableReasons[target]}
            </Typography>
          ) : null}
        </ButtonBase>
      ))}
    </Box>
    {projects.length === 0 ? (
      projectsLoaded ? (
        <Typography color="text.secondary" variant="body2">
          No projects yet. Use “Choose Project” above the prompt.
        </Typography>
      ) : null
    ) : (
      <Box
        aria-label="Project"
        role="group"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          justifyContent: 'center',
          maxHeight: 160,
          maxWidth: 560,
          overflow: 'auto',
        }}
      >
        {projects.map(project => (
          <ProjectPill
            cwd={project}
            disabled={disabled}
            key={project}
            onPick={onPickProject}
            selected={cwd === project}
          />
        ))}
      </Box>
    )}
  </Box>
);

export const NewSessionLauncher: FC<{ readonly onClientError: (error: unknown) => void }> = ({ onClientError }) => {
  const virtual = useAtomValue(virtualSessionAtom);
  const targets = useAtomValue(enabledLaunchTargetsAtom);
  const projects = useAtomValue(projectsAtom);
  const projectsLoaded = useAtomValue(projectsLoadedAtom);
  const { locked } = useAtomValue(composerAtom);
  const { reasons, usable } = useAtomValue(launchTargetAvailabilityAtom);
  const setLaunchTarget = useAtomSet(setVirtualLaunchTargetAtomFn, { mode: 'promise' });
  const patchVirtual = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });

  return (
    <NewSessionLauncherView
      cwd={virtual?.cwd}
      disabled={locked || virtual == null}
      launchTarget={virtual?.launchTarget}
      onPickProject={cwd => {
        if (cwd === virtual?.cwd) return;
        patchVirtual({ cwd }).catch(onClientError);
      }}
      onPickTarget={target => {
        if (target === virtual?.launchTarget) return;
        setLaunchTarget(target).catch(onClientError);
      }}
      projects={projects}
      projectsLoaded={projectsLoaded}
      usableTargets={usable}
      targets={targets}
      unavailableReasons={reasons}
    />
  );
};
