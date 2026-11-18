/** Measured px of the right pane's pieces (dense MenuItem, Options row pitch per kind, headers + paddings + divider). */
const REASONING_ROW = 28.5;
const OPTION_ROW_HEIGHT = { select: 48, switch: 28 } as const;
const HEADERS_AND_PADDING = 78;
/** Search box above the model list. */
const SEARCH_BOX = 41;

const MIN_REASONING = 5;
const MIN_OPTIONS = 3;
const MAX_BEFORE_GROWING = MIN_REASONING + MIN_OPTIONS;

/** A rendered Options row: a Switch or a (taller) Select. Rows that render nothing are not counted. */
export type OptionRowKind = keyof typeof OPTION_ROW_HEIGHT;

/**
 * Height of the Reasoning + Options pane. Reserves room for the common 5 Reasoning choices and 3 Options (the first
 * three rows by kind, padded with switches); only grows past that when the two together exceed 8 rows.
 */
export const pickerPaneHeight = (reasoningCount: number, optionKinds: readonly OptionRowKind[]): number => {
  const grows = reasoningCount + optionKinds.length > MAX_BEFORE_GROWING;
  const reasoning = grows ? reasoningCount : MIN_REASONING;
  const reserved = grows ? optionKinds : optionKinds.slice(0, MIN_OPTIONS);
  const padding = grows ? 0 : Math.max(0, MIN_OPTIONS - reserved.length) * OPTION_ROW_HEIGHT.switch;
  const options = reserved.reduce((sum, kind) => sum + OPTION_ROW_HEIGHT[kind], padding);
  return HEADERS_AND_PADDING + reasoning * REASONING_ROW + options;
};

/** The model list never adds height: it scrolls inside what the right pane needs. */
export const modelListMaxHeight = (paneHeight: number): number => paneHeight - SEARCH_BOX;
