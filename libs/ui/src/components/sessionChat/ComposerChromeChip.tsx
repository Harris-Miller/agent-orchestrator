import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import { styled } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type { FC, MouseEvent, ReactNode } from 'react';

type ChipStyleProps = {
  readonly active?: boolean;
  readonly disabled?: boolean;
};

const composerChromeChipStyle = ({ active = false, disabled = false, theme }: { theme: Theme } & ChipStyleProps) => ({
  alignItems: 'center',
  backgroundColor: active ? theme.palette.action.selected : 'transparent',
  border: 'none',
  borderRadius: 999,
  color: theme.palette.text.secondary,
  display: 'inline-flex',
  font: 'inherit',
  fontSize: 13,
  gap: theme.spacing(0.5),
  opacity: disabled ? 0.5 : 1,
  padding: theme.spacing(0.5, 1),
});

const ComposerChromeChipButton = styled('button', {
  shouldForwardProp: prop => prop !== 'active',
})<ChipStyleProps>(({ active = false, disabled = false, theme }) => ({
  ...composerChromeChipStyle({ active, disabled, theme }),
  '&:hover': disabled ? undefined : { backgroundColor: theme.palette.action.hover },
  cursor: disabled ? 'default' : 'pointer',
}));

const ComposerChromeChipSpan = styled('span', {
  shouldForwardProp: prop => prop !== 'active' && prop !== 'disabled',
})<ChipStyleProps>(({ active = false, disabled = false, theme }) => ({
  ...composerChromeChipStyle({ active, disabled, theme }),
  cursor: 'default',
}));

/** Pill chip used by composer / handoff Config chrome. */
export const ComposerChromeChip: FC<{
  readonly active?: boolean;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly interactive?: boolean;
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
}> = ({ active, children, disabled = false, interactive = true, onClick }) => {
  if (!interactive) {
    return (
      <ComposerChromeChipSpan active={active} aria-disabled={disabled || undefined} disabled={disabled}>
        {children}
      </ComposerChromeChipSpan>
    );
  }

  return (
    <ComposerChromeChipButton
      active={active}
      disabled={disabled}
      onClick={disabled || onClick === undefined ? undefined : onClick}
      type="button"
    >
      {children}
      <KeyboardArrowDown sx={{ fontSize: 16, opacity: 0.7 }} />
    </ComposerChromeChipButton>
  );
};
