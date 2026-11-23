import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, indentUnit } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';

/** Skeleton editor. Theme and keymaps follow docs/design/ide-spec.md in M1. */
export function createEditor(parent: HTMLElement, doc: string) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        bracketMatching(),
        closeBrackets(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        EditorView.lineWrapping,
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        javascript(),
        EditorView.theme(
          {
            '&': { color: '#eaeaea', backgroundColor: 'transparent', height: '100%' },
            '.cm-content': {
              fontFamily: 'Hack, Menlo, Monaco, Consolas, monospace',
              fontSize: '16px',
            },
            '.cm-gutters': { backgroundColor: 'transparent', color: '#44576c', border: 'none' },
            '.cm-activeLine': { backgroundColor: '#202b3d' },
            '&.cm-focused .cm-cursor': { borderLeftColor: '#cdd7e0' },
          },
          { dark: true },
        ),
      ],
    }),
  });
  return {
    getCode: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  };
}
