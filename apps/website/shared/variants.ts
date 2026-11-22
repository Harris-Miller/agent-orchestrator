/** PROTOTYPE (#435) — the variant list. Browser-safe (imported by the switcher). */
export const VARIANTS = [{ key: 'c', name: 'A nav + B landing' }] as const;

export type VariantKey = (typeof VARIANTS)[number]['key'];
