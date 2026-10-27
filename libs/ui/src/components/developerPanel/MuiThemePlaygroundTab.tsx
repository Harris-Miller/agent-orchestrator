/**
 * MUI specimen catalog for visual theme review (issue #163).
 * Renders under the active Theme preference — no in-tab theme switcher.
 */
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ChevronDown, Search, Settings } from 'lucide-react';
import { useState } from 'react';
import type { FC, MouseEvent, ReactNode } from 'react';

import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { FieldLabel } from '../FieldLabel.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

const Section: FC<{ readonly children: ReactNode; readonly title: string }> = ({ children, title }) => (
  <Box component="section" sx={{ mb: 4 }}>
    <Typography sx={{ mb: 1.5 }} variant="h3">
      {title}
    </Typography>
    {children}
  </Box>
);

const SpecimenRow: FC<{ readonly children: ReactNode; readonly label?: string }> = ({ children, label }) => (
  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }} useFlexGap>
    {label !== undefined ? (
      <Typography color="text.secondary" sx={{ minWidth: 88 }} variant="caption">
        {label}
      </Typography>
    ) : null}
    {children}
  </Stack>
);

export const MuiThemePlaygroundTab: FC = () => {
  const [selectValue, setSelectValue] = useState('all');
  const [tab, setTab] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [checked, setChecked] = useState(true);
  const [switched, setSwitched] = useState(true);

  const openMenu = (event: MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', px: 2, py: 3 }}>
      <Alert severity="info" sx={{ mb: 3 }} variant="standard">
        MUI specimen catalog under shared desktop chrome. Palette follows active Theme preference. No in-page theme
        switcher.
      </Alert>

      <Section title="Typography">
        <Typography variant="h1">Heading 1</Typography>
        <Typography variant="h2">Heading 2</Typography>
        <Typography variant="h3">Heading 3</Typography>
        <Typography variant="body1">Body1 — The quick brown fox jumps over the lazy dog.</Typography>
        <Typography variant="body2">Body2 — secondary density copy.</Typography>
        <Typography variant="caption">Caption</Typography>
        <Typography sx={{ fontFamily: FONT_FAMILY_MONO, mt: 1 }} variant="body2">
          monospace — SF Mono / Menlo / Consolas
        </Typography>
      </Section>

      <Section title="Button">
        <SpecimenRow label="contained">
          <Button variant="contained">Primary</Button>
          <Button color="secondary" variant="contained">
            Secondary
          </Button>
          <Button disabled variant="contained">
            Disabled
          </Button>
          <Button size="small" variant="contained">
            Small
          </Button>
        </SpecimenRow>
        <SpecimenRow label="outlined">
          <Button variant="outlined">Outlined</Button>
          <Button disabled variant="outlined">
            Disabled
          </Button>
          <Button size="small" variant="outlined">
            Small
          </Button>
        </SpecimenRow>
        <SpecimenRow label="text">
          <Button variant="text">Text</Button>
          <Button size="small" variant="text">
            Small
          </Button>
        </SpecimenRow>
        <SpecimenRow label="group">
          <ButtonGroup variant="outlined">
            <Button>Left</Button>
            <Button>Center</Button>
            <Button>Right</Button>
          </ButtonGroup>
        </SpecimenRow>
        <SpecimenRow label="icon">
          <IconButton aria-label="settings">
            <LucideMuiIcon icon={Settings} />
          </IconButton>
          <IconButton aria-label="settings small" size="small">
            <LucideMuiIcon fontSize="small" icon={Settings} />
          </IconButton>
        </SpecimenRow>
      </Section>

      <Section title="Chip">
        <SpecimenRow>
          <Chip label="Default" />
          <Chip color="primary" label="Primary" />
          <Chip color="success" label="Success" variant="outlined" />
          <Chip color="warning" label="Warning" size="small" />
          <Chip color="error" label="Error" size="small" variant="outlined" />
        </SpecimenRow>
      </Section>

      <Section title="Alert">
        <Stack spacing={1}>
          <Alert severity="info">Standard info</Alert>
          <Alert severity="success">Standard success</Alert>
          <Alert severity="warning">Standard warning</Alert>
          <Alert severity="error">Standard error</Alert>
          <Alert severity="error" variant="filled">
            Filled error (toast path)
          </Alert>
          <Alert severity="info" variant="outlined">
            Outlined info
          </Alert>
        </Stack>
      </Section>

      <Section title="TextField / Select (left labels)">
        <Stack spacing={1.5}>
          <FieldLabel htmlFor="theme-playground-text" label="Name">
            <TextField id="theme-playground-text" placeholder="Placeholder" size="small" sx={{ minWidth: 200 }} />
          </FieldLabel>
          <FieldLabel htmlFor="theme-playground-search" label="Search">
            <TextField
              id="theme-playground-search"
              placeholder="Filter…"
              size="small"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LucideMuiIcon fontSize="small" icon={Search} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ minWidth: 200 }}
            />
          </FieldLabel>
          <FieldLabel htmlFor="theme-playground-helper" label="With help">
            <TextField
              helperText="Helper sits under the control"
              id="theme-playground-helper"
              size="small"
              sx={{ minWidth: 200 }}
            />
          </FieldLabel>
          <FieldLabel id="theme-playground-select-label" label="Launch target">
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select
                aria-labelledby="theme-playground-select-label"
                onChange={event => {
                  setSelectValue(event.target.value);
                }}
                value={selectValue}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="codex">Codex</MenuItem>
                <MenuItem value="claude">Claude</MenuItem>
              </Select>
            </FormControl>
          </FieldLabel>
        </Stack>
      </Section>

      <Section title="Checkbox / Switch / FormControlLabel">
        <SpecimenRow>
          <FormControlLabel
            control={
              <Checkbox
                checked={checked}
                onChange={(_e, next) => {
                  setChecked(next);
                }}
                size="small"
              />
            }
            label="Checkbox"
          />
          <FormControlLabel
            control={
              <Switch
                checked={switched}
                onChange={(_e, next) => {
                  setSwitched(next);
                }}
              />
            }
            label="Switch"
          />
          <FormControlLabel control={<Checkbox disabled size="small" />} label="Disabled" />
        </SpecimenRow>
      </Section>

      <Section title="Tabs">
        <Tabs
          onChange={(_e, value: number) => {
            setTab(value);
          }}
          value={tab}
        >
          <Tab label="RPC wire" />
          <Tab label="Session State" />
          <Tab label="Playground" />
        </Tabs>
        <Typography color="text.secondary" sx={{ mt: 1 }} variant="body2">
          Active tab index: {tab}
        </Typography>
      </Section>

      <Section title="List / MenuItem density">
        <Paper sx={{ maxWidth: 320 }} variant="outlined">
          <List dense disablePadding>
            <ListItemButton selected>
              <ListItemIcon>
                <LucideMuiIcon fontSize="small" icon={Settings} />
              </ListItemIcon>
              <ListItemText primary="Selected row" secondary="Secondary line" />
            </ListItemButton>
            <ListItemButton>
              <ListItemIcon>
                <LucideMuiIcon fontSize="small" icon={Search} />
              </ListItemIcon>
              <ListItemText primary="Default row" />
            </ListItemButton>
          </List>
        </Paper>
        <Box sx={{ mt: 1.5 }}>
          <Button onClick={openMenu} size="small" variant="outlined">
            Open menu
          </Button>
          <Menu
            anchorEl={menuAnchor}
            onClose={() => {
              setMenuAnchor(null);
            }}
            open={menuAnchor !== null}
          >
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
              }}
            >
              Menu item one
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
              }}
            >
              Menu item two
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
              }}
            >
              Destructive
            </MenuItem>
          </Menu>
        </Box>
      </Section>

      <Section title="Accordion">
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<LucideMuiIcon fontSize="small" icon={ChevronDown} />}>
            <Typography variant="body2">Folder group</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography color="text.secondary" variant="body2">
              Theme supplies gutters / elevation / divider defaults so call sites drop local sx.
            </Typography>
          </AccordionDetails>
        </Accordion>
        <Accordion>
          <AccordionSummary expandIcon={<LucideMuiIcon fontSize="small" icon={ChevronDown} />}>
            <Typography variant="body2">Collapsed</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2">Details</Typography>
          </AccordionDetails>
        </Accordion>
      </Section>

      <Section title="Progress / Skeleton">
        <SpecimenRow label="linear">
          <Box sx={{ flex: 1, maxWidth: 280 }}>
            <LinearProgress value={62} variant="determinate" />
          </Box>
        </SpecimenRow>
        <SpecimenRow label="circular">
          <CircularProgress size={20} />
          <CircularProgress size={28} />
        </SpecimenRow>
        <SpecimenRow label="skeleton">
          <Skeleton height={28} variant="rounded" width={180} />
          <Skeleton height={28} variant="circular" width={28} />
        </SpecimenRow>
      </Section>

      <Section title="Table">
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow hover>
                <TableCell>session-1</TableCell>
                <TableCell>idle</TableCell>
              </TableRow>
              <TableRow hover>
                <TableCell>session-2</TableCell>
                <TableCell>running</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Section>

      <Section title="Paper / Tooltip / Dialog">
        <SpecimenRow>
          <Paper sx={{ p: 1.5 }} variant="outlined">
            <Typography variant="body2">Outlined paper</Typography>
          </Paper>
          <Tooltip title="Tooltip specimen">
            <Button size="small" variant="outlined">
              Hover me
            </Button>
          </Tooltip>
          <Button
            onClick={() => {
              setDialogOpen(true);
            }}
            size="small"
            variant="contained"
          >
            Open dialog
          </Button>
        </SpecimenRow>
        <Dialog
          onClose={() => {
            setDialogOpen(false);
          }}
          open={dialogOpen}
        >
          <DialogTitle>Delete session?</DialogTitle>
          <DialogContent>
            <DialogContentText>Dialog title/content/actions padding is part of the chrome pass.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setDialogOpen(false);
              }}
              variant="outlined"
            >
              Cancel
            </Button>
            <Button
              color="error"
              onClick={() => {
                setDialogOpen(false);
              }}
              variant="contained"
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Section>
    </Box>
  );
};
