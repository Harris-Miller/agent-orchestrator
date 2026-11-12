import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import type { FC, RefObject } from 'react';

export const FocusEndApiPlugin: FC<{ readonly focusEndRef: RefObject<(() => void) | null> }> = ({ focusEndRef }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    focusEndRef.current = () => {
      editor.focus(undefined, { defaultSelection: 'rootEnd' });
    };
    return () => {
      focusEndRef.current = null;
    };
  }, [editor, focusEndRef]);

  return null;
};
