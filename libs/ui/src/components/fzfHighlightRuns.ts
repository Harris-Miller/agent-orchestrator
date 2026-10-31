export type FzfHighlightRun = {
  readonly bold: boolean;
  readonly highlighted: boolean;
  /** Index of the run's first character within `text.normalize()`. */
  readonly start: number;
  readonly text: string;
};

/** Group consecutive characters with the same highlight/bold state into runs. */
export const fzfHighlightRuns = (
  text: string,
  positions: ReadonlySet<number>,
  boldFrom?: number,
): readonly FzfHighlightRun[] => {
  const normalized = text.normalize();
  const isBold = (index: number): boolean => boldFrom !== undefined && index >= boldFrom;
  const styleChanges = (index: number): boolean =>
    positions.has(index) !== positions.has(index - 1) || isBold(index) !== isBold(index - 1);

  const runs: FzfHighlightRun[] = [];
  let start = 0;
  for (let index = 1; index <= normalized.length; index += 1) {
    if (index === normalized.length || styleChanges(index)) {
      runs.push({
        bold: isBold(start),
        highlighted: positions.has(start),
        start,
        text: normalized.slice(start, index),
      });
      start = index;
    }
  }
  return runs;
};
