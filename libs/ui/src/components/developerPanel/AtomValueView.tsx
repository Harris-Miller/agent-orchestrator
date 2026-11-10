/** Developer panel rendering of one Atom value, in the form that fits its kind (see {@link classifyValue}). */
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Cause, Option } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { FC, ReactNode } from 'react';

import { classifyValue, MAX_DEPTH, MAX_ITEMS } from '../../atoms/atomValue.ts';
import type { AtomValueKind } from '../../atoms/atomValue.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';

const INLINE_KINDS: ReadonlySet<AtomValueKind> = new Set([
  'bigint',
  'boolean',
  'date',
  'function',
  'null',
  'number',
  'string',
  'symbol',
  'undefined',
]);

const monoSx = { fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem', wordBreak: 'break-all' } as const;

const Mono: FC<{ readonly children: ReactNode; readonly muted?: boolean }> = ({ children, muted = false }) => (
  <Typography
    color={muted ? 'text.secondary' : 'text.primary'}
    component="span"
    sx={{ ...monoSx, whiteSpace: 'pre-wrap' }}
    variant="body2"
  >
    {children}
  </Typography>
);

const Pre: FC<{ readonly children: ReactNode }> = ({ children }) => (
  <Box component="pre" sx={{ ...monoSx, m: 0, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
    {children}
  </Box>
);

const Group: FC<{ readonly children: ReactNode; readonly depth: number; readonly summary: string }> = ({
  children,
  depth,
  summary,
}) => (
  <Box component="details" open={depth === 0}>
    <Box component="summary" sx={{ ...monoSx, cursor: 'pointer' }}>
      {summary}
    </Box>
    <Stack spacing={0.5} sx={{ borderColor: 'divider', borderLeft: 1, ml: 0.5, pl: 1.5, pt: 0.5 }}>
      {children}
    </Stack>
  </Box>
);

const Row: FC<{ readonly children: ReactNode; readonly label: ReactNode }> = ({ children, label }) => (
  <Stack direction="row" spacing={1} useFlexGap>
    <Box sx={{ flexShrink: 0 }}>{typeof label === 'string' ? <Mono muted>{label}</Mono> : label}</Box>
    <Box sx={{ minWidth: 0 }}>{children}</Box>
  </Stack>
);

/** First {@link MAX_ITEMS} items with their position; position is the identity of a snapshot row. */
const indexed = <A,>(items: readonly A[]): readonly { readonly index: number; readonly item: A }[] =>
  items.slice(0, MAX_ITEMS).map((item, index) => ({ index, item }));

const More: FC<{ readonly total: number }> = ({ total }) =>
  total > MAX_ITEMS ? <Mono muted>{`… ${total - MAX_ITEMS} more`}</Mono> : null;

const inlineText = (value: unknown, kind: AtomValueKind): string => {
  switch (kind) {
    case 'string':
      return `"${String(value)}"`;
    case 'date':
      return Number.isNaN((value as Date).getTime()) ? 'Invalid Date' : (value as Date).toISOString();
    case 'function':
      return `ƒ ${(value as { name: string }).name || 'anonymous'}`;
    case 'bigint':
      return `${String(value)}n`;
    default:
      return String(value);
  }
};

/** Short one-line text for a collapsed row, or undefined when the kind has no useful one-liner. */
export const atomValuePreview = (value: unknown): string | undefined => {
  const kind = classifyValue(value);
  if (!INLINE_KINDS.has(kind)) {
    return undefined;
  }
  const text = inlineText(value, kind);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
};

export const AtomValueView: FC<{ readonly depth?: number; readonly value: unknown }> = ({ depth = 0, value }) => {
  const kind = classifyValue(value);
  const next = depth + 1;
  if (INLINE_KINDS.has(kind)) {
    if (kind === 'boolean') {
      return <Chip color={value === true ? 'success' : 'default'} label={String(value)} size="small" />;
    }
    return (
      <Mono muted={kind === 'null' || kind === 'undefined' || kind === 'function'}>{inlineText(value, kind)}</Mono>
    );
  }
  if (depth >= MAX_DEPTH) {
    return <Mono muted>…</Mono>;
  }
  switch (kind) {
    case 'option':
      return Option.isSome(value as Option.Option<unknown>) ? (
        <Stack direction="row" spacing={1} useFlexGap>
          <Chip label="Some" size="small" />
          <AtomValueView depth={next} value={(value as Option.Some<unknown>).value} />
        </Stack>
      ) : (
        <Chip label="None" size="small" variant="outlined" />
      );
    case 'async-result': {
      const result = value as AsyncResult.AsyncResult<unknown, unknown>;
      const state = AsyncResult.isInitial(result) ? 'Initial' : AsyncResult.isSuccess(result) ? 'Success' : 'Failure';
      return (
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={0.5} useFlexGap>
            <Chip
              color={state === 'Success' ? 'success' : state === 'Failure' ? 'error' : 'default'}
              label={state}
              size="small"
            />
            {result.waiting ? <Chip label="waiting" size="small" variant="outlined" /> : null}
          </Stack>
          {AsyncResult.isSuccess(result) ? <AtomValueView depth={next} value={result.value} /> : null}
          {AsyncResult.isFailure(result) ? <Pre>{Cause.pretty(result.cause)}</Pre> : null}
        </Stack>
      );
    }
    case 'cause':
      return <Pre>{Cause.pretty(value as Cause.Cause<unknown>)}</Pre>;
    case 'error': {
      const { message, name } = value as Error;
      return <Mono>{`${name}: ${message}`}</Mono>;
    }
    case 'array': {
      const items = value as readonly unknown[];
      if (items.length === 0) {
        return <Mono muted>[]</Mono>;
      }
      return (
        <Group depth={depth} summary={`Array(${items.length})`}>
          {indexed(items).map(({ index, item }) => (
            <Row key={index} label={`${index}`}>
              <AtomValueView depth={next} value={item} />
            </Row>
          ))}
          <More total={items.length} />
        </Group>
      );
    }
    case 'set': {
      const items = [...(value as ReadonlySet<unknown>)];
      return (
        <Group depth={depth} summary={`Set(${items.length})`}>
          {indexed(items).map(({ index, item }) => (
            <AtomValueView depth={next} key={index} value={item} />
          ))}
          <More total={items.length} />
        </Group>
      );
    }
    case 'map': {
      const entries = [...(value as ReadonlyMap<unknown, unknown>)];
      return (
        <Group depth={depth} summary={`Map(${entries.length})`}>
          {indexed(entries).map(({ index, item: [key, entry] }) => (
            <Row key={index} label={typeof key === 'string' ? key : <AtomValueView depth={next} value={key} />}>
              <AtomValueView depth={next} value={entry} />
            </Row>
          ))}
          <More total={entries.length} />
        </Group>
      );
    }
    default: {
      const entries = Object.entries(value as object);
      if (entries.length === 0) {
        return <Mono muted>{'{}'}</Mono>;
      }
      return (
        <Group depth={depth} summary={`{…} ${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`}>
          {entries.slice(0, MAX_ITEMS).map(([key, entry]) => (
            <Row key={key} label={key}>
              <AtomValueView depth={next} value={entry} />
            </Row>
          ))}
          <More total={entries.length} />
        </Group>
      );
    }
  }
};
