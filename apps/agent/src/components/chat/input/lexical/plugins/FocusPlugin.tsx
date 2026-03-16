import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

export function FocusPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleFocusEvent = (): void => {
      editor.focus();
    };

    window.addEventListener('focusChatInput', handleFocusEvent);
    return () => {
      window.removeEventListener('focusChatInput', handleFocusEvent);
    };
  }, [editor]);

  return null;
}
