import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  insertTab,
} from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { bracketMatching, indentUnit, StreamLanguage } from '@codemirror/language';
import { csharp, kotlin } from '@codemirror/legacy-modes/mode/clike';
import { go } from '@codemirror/legacy-modes/mode/go';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { rust } from '@codemirror/legacy-modes/mode/rust';
import { swift } from '@codemirror/legacy-modes/mode/swift';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { activeLineWithoutSelection } from './active-line';
import { emacs } from '@replit/codemirror-emacs';
import { vim } from '@replit/codemirror-vim';
import type { SyntaxId } from '@/shared/languages';
import type { Theme } from '@/shared/theme';
import { editorBase, editorTheme } from './editor-theme';
import type { Keymap } from './storage';

/** Sublime-style Tab: indent a selection, insert spaces otherwise. Shift-Tab outdents. */
const sublimeTab = keymap.of([
  {
    key: 'Tab',
    run: (view) =>
      view.state.selection.ranges.some((r) => !r.empty) ? indentMore(view) : insertTab(view),
    shift: indentLess,
  },
]);

function keymapExtension(name: Keymap): Extension {
  if (name === 'vim') return vim();
  if (name === 'emacs') return emacs();
  return sublimeTab;
}

/** Submit-only languages use CodeMirror 5 modes (ADR-0007). */
const LEGACY: Partial<Record<SyntaxId, Parameters<typeof StreamLanguage.define>[0]>> = {
  kotlin,
  csharp,
  rust,
  go,
  swift,
  ruby,
};

function languageExtension(syntax: SyntaxId): Extension {
  const legacy = LEGACY[syntax];
  if (legacy) return StreamLanguage.define(legacy);
  if (syntax === 'python') return python();
  if (syntax === 'c' || syntax === 'cpp') return cpp();
  if (syntax === 'java') return java();
  return javascript({ typescript: syntax === 'typescript' });
}

export interface EditorHandle {
  getCode(): string;
  setCode(code: string): void;
  setKeymap(name: Keymap): void;
  setLanguage(syntax: SyntaxId): void;
  setTheme(theme: Theme): void;
  focus(): void;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  options: {
    doc: string;
    keymap: Keymap;
    syntax: SyntaxId;
    theme: Theme;
    onChange: (code: string) => void;
  },
): EditorHandle {
  const keymapSlot = new Compartment();
  const languageSlot = new Compartment();
  const themeSlot = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        // The vim/emacs extensions must come before other keymaps to take priority.
        keymapSlot.of(keymapExtension(options.keymap)),
        lineNumbers(),
        highlightActiveLineGutter(),
        activeLineWithoutSelection,
        drawSelection(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        EditorView.lineWrapping,
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        languageSlot.of(languageExtension(options.syntax)),
        editorBase,
        themeSlot.of(editorTheme(options.theme)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) options.onChange(u.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    getCode: () => view.state.doc.toString(),
    setCode: (code) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }),
    setKeymap: (name) => view.dispatch({ effects: keymapSlot.reconfigure(keymapExtension(name)) }),
    setLanguage: (syntax) =>
      view.dispatch({ effects: languageSlot.reconfigure(languageExtension(syntax)) }),
    setTheme: (theme) => view.dispatch({ effects: themeSlot.reconfigure(editorTheme(theme)) }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
