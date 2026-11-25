import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/** Renders a host's directory picker: it calls `onSelect` with one absolute directory, and `onClose` when it closes. */
export type DirectoryPickerRenderer = (props: {
  readonly onClose: () => void;
  readonly onSelect: (directory: string) => void;
}) => ReactNode;

/**
 * The host's directory picker, when it has one (desktop). Without it (VS Code has no directory picker Host service) the
 * Additional directories editors can only remove entries.
 */
export const DirectoryPickerContext = createContext<DirectoryPickerRenderer | undefined>(undefined);

export const useDirectoryPicker = (): DirectoryPickerRenderer | undefined => useContext(DirectoryPickerContext);
