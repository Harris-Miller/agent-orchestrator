/** Shared layout for composer / transcript chips (chrome lives on ComposerChipContent only). */
export const baseChipClass =
  'mx-[0.15em] inline-block rounded-[4px] border-0 px-1 py-[0.05em] align-baseline text-[length:inherit] leading-none font-[inherit] whitespace-nowrap select-none';

export const commandChipClass = `${baseChipClass} bg-secondary/8 text-secondary`;

export const markdownLinkChipClass = `${baseChipClass} bg-primary/8 text-primary`;
