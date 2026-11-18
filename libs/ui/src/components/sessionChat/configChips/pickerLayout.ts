/** Rough px sizes of the right pane's pieces (dense MenuItem, Options row + gap, headers, paddings). */
const REASONING_ROW = 32;
const OPTION_ROW = 40;
const HEADERS_AND_PADDING = 40 + 8 + 1 + 32 + 16;
/** Search box above the model list. */
const SEARCH_BOX = 41;

const MIN_REASONING = 5;
const MIN_OPTIONS = 3;
const MAX_BEFORE_GROWING = MIN_REASONING + MIN_OPTIONS;

/**
 * Height of the Reasoning + Options pane. Reserves room for the common 5 Reasoning choices and 3 Options; only
 * grows past that when the two together exceed 8 rows.
 */
export const pickerPaneHeight = (reasoningCount: number, optionCount: number): number => {
  const [reasoning, options] =
    reasoningCount + optionCount > MAX_BEFORE_GROWING ? [reasoningCount, optionCount] : [MIN_REASONING, MIN_OPTIONS];
  return HEADERS_AND_PADDING + reasoning * REASONING_ROW + options * OPTION_ROW;
};

/** The model list never adds height: it scrolls inside what the right pane needs. */
export const modelListMaxHeight = (paneHeight: number): number => paneHeight - SEARCH_BOX;
