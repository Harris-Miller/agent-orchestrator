import { useAtomSet } from '@effect/atom-react';
import { hostThemeAtom, observeVscodeTheme, readVscodeTheme } from '@lib/ui';
import { useEffect } from 'react';
import type { FC } from 'react';

/** Keeps the Host theme current as the user switches VS Code color theme; renders nothing. */
export const VscodeThemeSync: FC = () => {
  const setHostTheme = useAtomSet(hostThemeAtom);

  useEffect(() => {
    // Re-read once on attach so a change between the module-load read and this effect is not missed.
    setHostTheme(readVscodeTheme(document));
    return observeVscodeTheme(document, () => {
      setHostTheme(readVscodeTheme(document));
    });
  }, [setHostTheme]);

  return null;
};
