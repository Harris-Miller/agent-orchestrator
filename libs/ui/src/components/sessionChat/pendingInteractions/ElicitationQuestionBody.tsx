import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect } from 'react';
import type { Dispatch, FC, KeyboardEvent, ReactNode, RefObject, SetStateAction } from 'react';

import type { ElicitationFieldView, ElicitationValue, ElicitationValues } from './elicitationFormViews.ts';
import {
  applyDigit,
  checkOther,
  flagMessage,
  selectOption,
  setOtherText,
  toggleOption,
  uncheckOther,
} from './elicitationQuestionNav.ts';

export type SetElicitationValues = Dispatch<SetStateAction<ElicitationValues>>;

const Kbd: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Box
    component="kbd"
    sx={{
      border: 1,
      borderColor: 'divider',
      borderRadius: 0.5,
      color: 'text.secondary',
      fontFamily: 'monospace',
      fontSize: 11,
      mr: 1,
      px: 0.5,
    }}
  >
    {children}
  </Box>
);

/** The digit hint shows only when the question on screen (`view`) takes digits. */
export const KeyHints: FC<{ readonly enter: string; readonly view: ElicitationFieldView | undefined }> = ({
  enter,
  view,
}) => (
  <Typography color="text.secondary" variant="caption">
    {view?.kind === 'single' || view?.kind === 'multi' || view?.kind === 'boolean' ? (
      <>
        <Kbd>1–9</Kbd>select{' '}
      </>
    ) : null}
    <Kbd>Enter</Kbd>
    {enter} <Kbd>Esc</Kbd>cancel
  </Typography>
);

/** Focus the `[data-autofocus]` input under `ref` if any (text/number questions), else the card itself. */
export const useQuestionFocus = (ref: RefObject<HTMLElement | null>, resetKey: unknown) => {
  useEffect(() => {
    const root = ref.current;
    (root?.querySelector<HTMLInputElement>('[data-autofocus]') ?? root)?.focus();
  }, [ref, resetKey]);
};

const focusOther = (root: HTMLElement, name: string) => {
  requestAnimationFrame(() => {
    root.querySelector<HTMLInputElement>(`[data-other="${name}"]`)?.focus();
  });
};

/**
 * Card-scoped (never window-level) so the Composer's contenteditable below keeps its keys. `current` is the
 * question on screen (undefined on the Submit tab); `onEnter` advances or submits.
 */
export const elicitationKeyDown =
  (options: {
    readonly current: ElicitationFieldView | undefined;
    readonly onCancel: () => void;
    readonly onEnter: () => void;
    readonly setValues: SetElicitationValues;
    readonly values: ElicitationValues;
  }) =>
  (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const textInput = target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio';
    const typing = textInput || target instanceof HTMLTextAreaElement || target.isContentEditable;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (typing) event.currentTarget.focus();
      else options.onCancel();
      return;
    }
    // MUI ignores clicks on the selected tab, so Enter there must advance; other buttons keep native Enter.
    const nativeEnter =
      (target instanceof HTMLButtonElement && target.getAttribute('role') !== 'tab') ||
      target instanceof HTMLTextAreaElement;
    if (event.key === 'Enter' && !nativeEnter) {
      event.preventDefault();
      options.onEnter();
      return;
    }
    if (
      !typing &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      options.current !== undefined &&
      /^[1-9]$/.test(event.key)
    ) {
      event.preventDefault();
      const result = applyDigit(options.current, Number(event.key), options.values);
      options.setValues(result.values);
      if (result.focusOther !== undefined) focusOther(event.currentTarget, result.focusOther);
    }
  };

/** "Other" toggle plus its free-text box; focusing the box checks the toggle. Unchecked = text `undefined`. */
const OtherChoice: FC<{
  readonly control: { readonly kind: 'checkbox' } | { readonly groupName: string; readonly kind: 'radio' };
  readonly digit: number;
  readonly name: string;
  readonly onCheck: (checked: boolean) => void;
  readonly onText: (text: string) => void;
  readonly placeholder: string;
  readonly text: ElicitationValue;
}> = ({ control, digit, name, onCheck, onText, placeholder, text }) => (
  <>
    <FormControlLabel
      control={
        control.kind === 'radio' ? (
          <Radio
            checked={text !== undefined}
            name={control.groupName}
            onChange={event => {
              onCheck(event.target.checked);
            }}
          />
        ) : (
          <Checkbox
            checked={text !== undefined}
            onChange={event => {
              onCheck(event.target.checked);
            }}
          />
        )
      }
      label={
        <>
          <Kbd>{digit}</Kbd>Other
        </>
      }
    />
    <TextField
      fullWidth
      onChange={event => {
        onText(event.target.value);
      }}
      onFocus={() => {
        if (text === undefined) onCheck(true);
      }}
      placeholder={placeholder}
      size="small"
      slotProps={{ htmlInput: { 'data-other': name } }}
      sx={{ ml: 4, width: 'calc(100% - 2rem)' }}
      value={typeof text === 'string' ? text : ''}
    />
  </>
);

/** One question's inputs, shared by the compact and tabbed layouts. `flagged` shows its error / "Required" text. */
export const ElicitationQuestionBody: FC<{
  readonly flagged: boolean;
  readonly setValues: SetElicitationValues;
  readonly values: ElicitationValues;
  readonly view: ElicitationFieldView;
}> = ({ flagged, setValues, values, view }) => {
  if (view.kind === 'unsupported') {
    return (
      <Typography color="text.secondary" variant="body2">
        Unsupported field “{view.name}” (type {view.type}) — decline or cancel.
      </Typography>
    );
  }
  const setValue = (value: ElicitationValue) => {
    setValues(current => ({ ...current, [view.name]: value }));
  };
  const value = values[view.name];
  const flag = flagged ? <FormHelperText>{flagMessage(view, values)}</FormHelperText> : null;
  const caption = (
    <>
      {view.caption === undefined ? null : (
        <Typography color="text.secondary" component="span" sx={{ display: 'block' }} variant="caption">
          {view.caption}
        </Typography>
      )}
      {view.label}
    </>
  );

  if (view.kind === 'boolean') {
    return (
      <FormControl error={flagged}>
        <FormControlLabel
          control={
            <Checkbox
              checked={value === true}
              onChange={event => {
                setValue(event.target.checked);
              }}
            />
          }
          label={
            <>
              <Kbd>1</Kbd>
              {caption}
            </>
          }
        />
        {flag}
      </FormControl>
    );
  }

  if (view.kind === 'single') {
    const { other } = view;
    return (
      <FormControl error={flagged}>
        <FormLabel>{caption}</FormLabel>
        <RadioGroup
          name={view.name}
          onChange={event => {
            setValues(current => selectOption(view, event.target.value, current));
          }}
          value={typeof value === 'string' ? value : ''}
        >
          {view.options.map((option, index) => (
            <FormControlLabel
              control={<Radio />}
              key={option.value}
              label={
                <>
                  <Kbd>{index + 1}</Kbd>
                  {option.label}
                </>
              }
              value={option.value}
            />
          ))}
        </RadioGroup>
        {other === undefined ? null : (
          // Outside RadioGroup so its value can't collide with an option; shared `name` keeps keyboard grouping.
          <OtherChoice
            control={{ groupName: view.name, kind: 'radio' }}
            digit={view.options.length + 1}
            name={other.name}
            onCheck={() => {
              setValues(current => checkOther(view, other, current));
            }}
            onText={text => {
              setValues(current => setOtherText(view, other, text, current));
            }}
            placeholder={other.placeholder}
            text={values[other.name]}
          />
        )}
        {flag}
      </FormControl>
    );
  }

  if (view.kind === 'multi') {
    const selected: readonly string[] = Array.isArray(value) ? value : [];
    const { other } = view;
    return (
      <FormControl error={flagged}>
        <FormLabel>{caption}</FormLabel>
        <FormGroup>
          {view.options.map((option, index) => (
            <FormControlLabel
              control={
                <Checkbox
                  checked={selected.includes(option.value)}
                  onChange={() => {
                    setValues(current => toggleOption(view, option.value, current));
                  }}
                />
              }
              key={option.value}
              label={
                <>
                  <Kbd>{index + 1}</Kbd>
                  {option.label}
                </>
              }
            />
          ))}
          {other === undefined ? null : (
            <OtherChoice
              control={{ kind: 'checkbox' }}
              digit={view.options.length + 1}
              name={other.name}
              onCheck={checked => {
                setValues(current => (checked ? checkOther(view, other, current) : uncheckOther(other, current)));
              }}
              onText={text => {
                setValues(current => setOtherText(view, other, text, current));
              }}
              placeholder={other.placeholder}
              text={values[other.name]}
            />
          )}
        </FormGroup>
        {flag}
      </FormControl>
    );
  }

  const numeric = view.kind === 'number' || view.kind === 'integer';
  return (
    <TextField
      error={flagged}
      fullWidth
      helperText={flagged ? flagMessage(view, values) : undefined}
      label={caption}
      onChange={event => {
        const raw = event.target.value;
        setValue(numeric ? (raw === '' ? undefined : Number(raw)) : raw);
      }}
      size="small"
      slotProps={{ htmlInput: { 'data-autofocus': true }, inputLabel: { shrink: true } }}
      type={numeric ? 'number' : view.secret ? 'password' : 'text'}
      value={value ?? ''}
    />
  );
};
