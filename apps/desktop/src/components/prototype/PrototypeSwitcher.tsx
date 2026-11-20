/** PROTOTYPE switcher: floating bottom bar that cycles `?variant=`. Dev builds only. */
import { LucideMuiIcon } from '@lib/ui';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect } from 'react';
import type { FC } from 'react';

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

export const PrototypeSwitcher: FC<{
  readonly current: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly onChange: (variant: string) => void;
  readonly onExit: () => void;
}> = ({ current, labels, onChange, onExit }) => {
  const keys = Object.keys(labels);
  const index = Math.max(0, keys.indexOf(current));
  const step = (delta: number) => {
    onChange(keys[(index + delta + keys.length) % keys.length]);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  if (!import.meta.env.DEV) return null;
  return (
    <Paper
      elevation={8}
      sx={{
        alignItems: 'center',
        bgcolor: 'common.black',
        borderRadius: 999,
        bottom: 16,
        color: 'common.white',
        display: 'flex',
        gap: 1,
        left: '50%',
        position: 'fixed',
        px: 1,
        py: 0.5,
        transform: 'translateX(-50%)',
        zIndex: 'tooltip',
      }}
    >
      <IconButton
        aria-label="Previous variant"
        onClick={() => {
          step(-1);
        }}
        size="small"
        sx={{ color: 'inherit' }}
      >
        <LucideMuiIcon fontSize="small" icon={ChevronLeft} />
      </IconButton>
      <Typography sx={{ minWidth: 200, textAlign: 'center' }} variant="body2">
        {keys[index]} ({labels[keys[index]]})
      </Typography>
      <IconButton
        aria-label="Next variant"
        onClick={() => {
          step(1);
        }}
        size="small"
        sx={{ color: 'inherit' }}
      >
        <LucideMuiIcon fontSize="small" icon={ChevronRight} />
      </IconButton>
      <IconButton
        aria-label="Exit prototype"
        onClick={onExit}
        size="small"
        sx={{ color: 'inherit' }}
        title="Exit prototype"
      >
        <LucideMuiIcon fontSize="small" icon={X} />
      </IconButton>
    </Paper>
  );
};
