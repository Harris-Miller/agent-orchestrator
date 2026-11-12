/** Wire form for a markdown link chip — shared by composer nodes, clipboard, and mention helpers. */
export const markdownLinkText = (label: string, href: string): string => `[${label}](${href})`;
