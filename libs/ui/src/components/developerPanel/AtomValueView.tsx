/** Developer panel rendering of one Atom value, in the form that fits its kind (see {@link classifyValue}). */
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Cause, Option } from 'effect';
import type { FC, ReactNode } from 'react';

import {
  asyncResultState,
  bigintText,
  classifyValue,
  constructorName,
  dateIso,
  functionName,
  hiddenCount,
  hiddenItemsText,
  limitItems,
  MAX_DEPTH,
} from '../../atoms/atomValue.ts';
import type { ClassifiedValue } from '../../atoms/atomValue.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';

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

/** First items with their position; position is the identity of a snapshot row. */
const indexed = <A,>(items: readonly A[]): readonly { readonly index: number; readonly item: A }[] =>
  limitItems(items).shown.map((item, index) => ({ index, item }));

const More: FC<{ readonly total: number }> = ({ total }) =>
  hiddenCount(total) > 0 ? <Mono muted>{hiddenItemsText(hiddenCount(total))}</Mono> : null;

/** One-line text for kinds shown inline; undefined for containers. */
const inlineText = (classified: ClassifiedValue): string | undefined => {
  switch (classified.kind) {
    case 'string':
      return `"${classified.value}"`;
    case 'date':
      return dateIso(classified.value);
    case 'function':
      return `ƒ ${functionName(classified.value)}`;
    case 'bigint':
      return bigintText(classified.value);
    case 'boolean':
    case 'null':
    case 'number':
    case 'symbol':
    case 'undefined':
      return String(classified.value);
    default:
      return undefined;
  }
};

/** Short one-line text for a collapsed row, or undefined when the kind has no useful one-liner. */
export const atomValuePreview = (value: unknown): string | undefined => {
  const text = inlineText(classifyValue(value));
  return text !== undefined && text.length > 60 ? `${text.slice(0, 60)}…` : text;
};

export const AtomValueView: FC<{ readonly depth?: number; readonly value: unknown }> = ({ depth = 0, value }) => {
  const classified = classifyValue(value);
  const next = depth + 1;
  const text = inlineText(classified);
  if (text !== undefined) {
    if (classified.kind === 'boolean') {
      return <Chip color={classified.value ? 'success' : 'default'} label={text} size="small" />;
    }
    return (
      <Mono muted={classified.kind === 'null' || classified.kind === 'undefined' || classified.kind === 'function'}>
        {text}
      </Mono>
    );
  }
  if (depth >= MAX_DEPTH) {
    return <Mono muted>…</Mono>;
  }
  switch (classified.kind) {
    case 'option':
      return Option.isSome(classified.value) ? (
        <Stack direction="row" spacing={1} useFlexGap>
          <Chip label="Some" size="small" />
          <AtomValueView depth={next} value={classified.value.value} />
        </Stack>
      ) : (
        <Chip label="None" size="small" variant="outlined" />
      );
    case 'async-result': {
      const result = classified.value;
      const state = asyncResultState(result);
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
          {result._tag === 'Success' ? <AtomValueView depth={next} value={result.value} /> : null}
          {result._tag === 'Failure' ? <Pre>{Cause.pretty(result.cause)}</Pre> : null}
        </Stack>
      );
    }
    case 'cause':
      return <Pre>{Cause.pretty(classified.value)}</Pre>;
    case 'error':
      return <Mono>{`${classified.value.name}: ${classified.value.message}`}</Mono>;
    case 'array': {
      const items = classified.value;
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
      const items = [...classified.value];
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
      const entries = [...classified.value];
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
    case 'object': {
      const entries = Object.entries(classified.value);
      const name = constructorName(classified.value);
      if (entries.length === 0) {
        return <Mono muted>{`${name ?? ''}{}`}</Mono>;
      }
      return (
        <Group
          depth={depth}
          summary={`${name === undefined ? '' : `${name} `}{…} ${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`}
        >
          {indexed(entries).map(({ item: [key, entry] }) => (
            <Row key={key} label={key}>
              <AtomValueView depth={next} value={entry} />
            </Row>
          ))}
          <More total={entries.length} />
        </Group>
      );
    }
    default:
      return null;
  }
};
