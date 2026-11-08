// PROTOTYPE — throwaway. Question: what should replace the big "Create New Session" button at the top of the nav rail?
// Four variants of the nav rail header + create-session area, switchable via `?variant=A|B|C|D` on `/`.
// Search / filter / bell affordances are visual stubs. Do not merge to main.
import { useAtomSet } from '@effect/atom-react';
import { directoryBasename, ensureVirtualSessionAtomFn, LucideMuiIcon, PanelHeader, ShowArchivedToggle } from '@lib/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  Folder,
  FolderPlus,
  ListFilter,
  PanelLeftClose,
  Plus,
  RotateCw,
  Search,
  SquarePen,
} from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { CreateSessionDirectoryPicker } from './CreateSessionDirectoryPicker.tsx';

export const NEW_SESSION_VARIANTS = [
  { key: 'A', name: 'Nav list (Claude)' },
  { key: 'B', name: 'Title + compose row (Codex)' },
  { key: 'C', name: 'Search toolbar (T3)' },
  { key: 'D', name: 'Split button + recent folders' },
] as const;

type VariantProps = {
  readonly onClose: () => void;
  readonly onReload: () => void;
  /** Most recent cwds first (from Session History groups). */
  readonly recentCwds: readonly string[];
};

const useCreate = () => {
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const [pickerOpen, setPickerOpen] = useState(false);
  const create = (cwd?: string) => {
    ensureVirtualSession(cwd === undefined ? undefined : { cwd, patchCwdIfSelectedVirtual: true }).catch(
      () => undefined,
    );
  };
  const picker = pickerOpen ? (
    <CreateSessionDirectoryPicker onClose={() => setPickerOpen(false)} onSelectDirectory={cwd => create(cwd)} />
  ) : null;
  return { create, openPicker: () => setPickerOpen(true), picker };
};

const ReloadButton: FC<{ readonly onReload: () => void }> = ({ onReload }) => (
  <Tooltip title="Reload sessions">
    <IconButton aria-label="Reload sessions" onClick={onReload} size="small">
      <LucideMuiIcon fontSize="small" icon={RotateCw} />
    </IconButton>
  </Tooltip>
);

const NavRow: FC<{ readonly icon: LucideIcon; readonly label: string; readonly onClick: () => void }> = ({
  icon,
  label,
  onClick,
}) => (
  <ListItemButton onClick={onClick} sx={{ borderRadius: 1, py: 0.75 }}>
    <ListItemIcon sx={{ color: 'text.secondary', minWidth: 32 }}>
      <LucideMuiIcon fontSize="small" icon={icon} />
    </ListItemIcon>
    <ListItemText primary={label} slotProps={{ primary: { variant: 'body2' } }} />
  </ListItemButton>
);

/** A — Claude: no header title; a quiet vertical nav list of verbs. "New" is just the first row. */
const VariantA: FC<VariantProps> = ({ onClose, onReload }) => {
  const { create, openPicker, picker } = useCreate();
  return (
    <>
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.5, px: 1, py: 1 }}>
        <Tooltip title="Close session history panel">
          <IconButton onClick={onClose} size="small">
            <LucideMuiIcon fontSize="small" icon={PanelLeftClose} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <ShowArchivedToggle />
        <ReloadButton onReload={onReload} />
      </Box>
      <Box sx={{ px: 1, pb: 1 }}>
        <NavRow icon={Plus} label="New session" onClick={() => create()} />
        <NavRow icon={FolderPlus} label="New session in folder…" onClick={openPicker} />
        <NavRow icon={Search} label="Search" onClick={() => undefined} />
      </Box>
      {picker}
    </>
  );
};

/** B — Codex: app title as header w/ icon actions; single "New session" compose row; "Projects" label leads the list. */
const VariantB: FC<VariantProps> = ({ onClose, onReload }) => {
  const { create, picker } = useCreate();
  return (
    <>
      <PanelHeader
        beforeClose={
          <>
            <ShowArchivedToggle />
            <ReloadButton onReload={onReload} />
            <IconButton size="small">
              <LucideMuiIcon fontSize="small" icon={Search} />
            </IconButton>
          </>
        }
        closeAriaLabel="Close session history panel"
        closeIcon={PanelLeftClose}
        onClose={onClose}
        title={
          <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.5 }}>
            <Typography sx={{ fontWeight: 600 }} variant="h6">
              Agent Orchestrator
            </Typography>
            <LucideMuiIcon fontSize="small" icon={ChevronDown} sx={{ color: 'text.secondary' }} />
          </Box>
        }
      />
      <Box sx={{ px: 1, pt: 1 }}>
        <NavRow icon={SquarePen} label="New session" onClick={() => create()} />
      </Box>
      <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: 2.5, mt: 1, px: 2 }}>
        Projects
      </ListSubheader>
      {picker}
    </>
  );
};

/** C — T3: no button at all. Search field owns the row; create actions are icons beside it. */
const VariantC: FC<VariantProps> = ({ onClose, onReload }) => {
  const { create, openPicker, picker } = useCreate();
  return (
    <>
      <PanelHeader
        closeAriaLabel="Close session history panel"
        closeIcon={PanelLeftClose}
        onClose={onClose}
        title="Sessions"
        titleEnd={
          <>
            <ShowArchivedToggle />
            <ReloadButton onReload={onReload} />
          </>
        }
      />
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.25, px: 1.5, py: 1 }}>
        <LucideMuiIcon fontSize="small" icon={Search} sx={{ color: 'text.secondary', mr: 0.75 }} />
        <InputBase placeholder="Search" sx={{ flex: 1, fontSize: '0.9rem', minWidth: 0 }} />
        <Tooltip title="Filter">
          <IconButton size="small">
            <LucideMuiIcon fontSize="small" icon={ListFilter} />
          </IconButton>
        </Tooltip>
        <Tooltip title="New session in folder…">
          <IconButton onClick={openPicker} size="small">
            <LucideMuiIcon fontSize="small" icon={FolderPlus} />
          </IconButton>
        </Tooltip>
        <Tooltip title="New session">
          <IconButton onClick={() => create()} size="small">
            <LucideMuiIcon fontSize="small" icon={SquarePen} />
          </IconButton>
        </Tooltip>
      </Box>
      {picker}
    </>
  );
};

/** D — Keeps a prominent button but makes it a split button: main = new session, caret = pick a recent folder. */
const VariantD: FC<VariantProps> = ({ onClose, onReload, recentCwds }) => {
  const { create, openPicker, picker } = useCreate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const pick = (action: () => void) => () => {
    setAnchor(null);
    action();
  };
  return (
    <>
      <PanelHeader
        closeAriaLabel="Close session history panel"
        closeIcon={PanelLeftClose}
        onClose={onClose}
        title="Sessions"
        titleEnd={
          <>
            <ShowArchivedToggle />
            <ReloadButton onReload={onReload} />
          </>
        }
      />
      <Box sx={{ p: 1.5 }}>
        <ButtonGroup fullWidth size="small" variant="outlined">
          <Button onClick={() => create()} startIcon={<LucideMuiIcon icon={Plus} />} sx={{ textTransform: 'none' }}>
            New session
          </Button>
          <Button
            aria-label="New session in…"
            onClick={event => setAnchor(event.currentTarget)}
            sx={{ flex: '0 0 40px' }}
          >
            <LucideMuiIcon fontSize="small" icon={ChevronDown} />
          </Button>
        </ButtonGroup>
        <Menu anchorEl={anchor} onClose={() => setAnchor(null)} open={anchor !== null}>
          <ListSubheader sx={{ lineHeight: 2.5 }}>Recent folders</ListSubheader>
          {recentCwds.slice(0, 5).map(cwd => (
            <MenuItem key={cwd} onClick={pick(() => create(cwd))}>
              <ListItemIcon>
                <LucideMuiIcon fontSize="small" icon={Folder} />
              </ListItemIcon>
              <ListItemText primary={directoryBasename(cwd)} secondary={cwd} />
            </MenuItem>
          ))}
          <Divider />
          <MenuItem onClick={pick(openPicker)}>
            <ListItemIcon>
              <LucideMuiIcon fontSize="small" icon={FolderPlus} />
            </ListItemIcon>
            Choose folder…
          </MenuItem>
        </Menu>
      </Box>
      <Divider />
      {picker}
    </>
  );
};

export const NewSessionHeaderPrototype: FC<VariantProps & { readonly variant: string }> = ({ variant, ...props }) => {
  if (variant === 'B') return <VariantB {...props} />;
  if (variant === 'C') return <VariantC {...props} />;
  if (variant === 'D') return <VariantD {...props} />;
  return <VariantA {...props} />;
};
