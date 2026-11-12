import { catppuccinLatteIcons } from './catppuccinLatteIcons.ts';
import { catppuccinMochaIcons } from './catppuccinMochaIcons.ts';
import { originalIcons } from './originalIcons.ts';
import type { FileIconPackId } from './packId.ts';

const PACKS: Record<FileIconPackId, Readonly<Record<string, string>>> = {
  'catppuccin-latte': catppuccinLatteIcons,
  'catppuccin-mocha': catppuccinMochaIcons,
  original: originalIcons,
};

export const getPackSvg = (packId: FileIconPackId, key: string): string | undefined => PACKS[packId][key];

export const svgToDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
