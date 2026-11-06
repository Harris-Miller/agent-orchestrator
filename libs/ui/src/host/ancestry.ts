/** Cycle-safe walk up a parent chain; returns the first id with no known parent. */
export const rootAncestor = (parentOf: (id: string) => string | undefined, id: string): string => {
  const seen = new Set<string>();
  let current = id;
  for (;;) {
    const parent = parentOf(current);
    if (parent === undefined || seen.has(current)) return current;
    seen.add(current);
    current = parent;
  }
};
