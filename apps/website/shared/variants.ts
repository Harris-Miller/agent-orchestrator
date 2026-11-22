/** PROTOTYPE (#435) — the variant list. Browser-safe (imported by the switcher). */
export const VARIANTS = [
  { key: 'a', name: 'Docs-first' },
  { key: 'b', name: 'Product story' },
  { key: 'c', name: 'Terminal landing' },
] as const;

export type VariantKey = (typeof VARIANTS)[number]['key'];
