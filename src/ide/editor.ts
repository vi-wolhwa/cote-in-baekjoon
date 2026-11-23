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
import { bracketMatching, indentUnit } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { emacs } from '@replit/codemirror-emacs';
import { vim } from '@replit/codemirror-vim';
import type { EngineId } from '@/shared/languages';
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

function languageExtension(engine: EngineId): Extension {
  if (engine === 'python') return python();
  if (engine === 'cpp') return cpp();
  if (engine === 'java') return java();
  return javascript();
}

export interface EditorHandle {
  getCode(): string;
  setCode(code: string): void;
  setKeymap(name: Keymap): void;
  setLanguage(engine: EngineId): void;
  setTheme(theme: Theme): void;
  focus(): void;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  options: {
    doc: string;
    keymap: Keymap;
    engine: EngineId;
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
        highlightActiveLine(),
        drawSelection(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        EditorView.lineWrapping,
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        languageSlot.of(languageExtension(options.engine)),
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
    setLanguage: (engine) =>
      view.dispatch({ effects: languageSlot.reconfigure(languageExtension(engine)) }),
    setTheme: (theme) => view.dispatch({ effects: themeSlot.reconfigure(editorTheme(theme)) }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
