/** PROTOTYPE — variant keys for work-region UI exploration. */

export type WorkRegionVariantKey = 'A' | 'B' | 'C';

export const WORK_REGION_VARIANTS = [
  { key: 'A', name: 'Nested accordion (ChatGPT)' },
  { key: 'B', name: 'Timeline spine' },
  { key: 'C', name: 'Chip → bottom sheet' },
] as const satisfies readonly { readonly key: WorkRegionVariantKey; readonly name: string }[];
