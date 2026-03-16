import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

import type { FC } from 'react';

interface TextChangePluginProps {
  readonly onChange: (text: string) => void;
}

export const TextChangePlugin: FC<TextChangePluginProps> = ({ onChange }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerTextContentListener((text) => {
      onChange(text);
    });
  }, [editor, onChange]);

  return null;
};
