import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import type { FC } from 'react';

export const EditablePlugin: FC<{ readonly disabled: boolean }> = ({ disabled }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return null;
};
