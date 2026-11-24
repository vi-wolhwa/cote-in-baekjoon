/**
 * A submission's code, read-only, with the editor's line numbers, theme and syntax colours
 * (제출 기록, ADR-0012). Text can be selected and copied; nothing can be typed.
 */
import { lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'preact/hooks';
import type { SyntaxId } from '@/shared/languages';
import type { Theme } from '@/shared/theme';
import { languageExtension } from '../editor';
import { editorBase, editorTheme } from '../editor-theme';

export function CodeView({
  code,
  syntax,
  theme,
}: {
  code: string;
  syntax: SyntaxId | undefined;
  theme: Theme;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorState.tabSize.of(4),
          ...(syntax ? [languageExtension(syntax)] : []),
          editorBase,
          editorTheme(theme),
        ],
      }),
    });
    return () => view.destroy();
  }, [code, syntax, theme]);
  return <div class="code-view no-mathjax" ref={host} data-testid="history-code" />;
}
