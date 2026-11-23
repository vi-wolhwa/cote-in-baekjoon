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
import {
  bracketMatching,
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
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
import { tags as t } from '@lezer/highlight';
import type { EngineId } from '@/shared/languages';
import type { Keymap } from './storage';

/** Colors from docs/design/ide-spec.md §2. */
const theme = EditorView.theme(
  {
    '&': { color: '#eaeaea', backgroundColor: 'transparent', height: '100%' },
    '.cm-scroller': {
      fontFamily: 'Hack, Menlo, Monaco, Consolas, monospace',
      fontSize: '16px',
      lineHeight: '22.4px',
    },
    '.cm-content': { caretColor: '#cdd7e0', padding: '4px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeft: '1px solid #cdd7e0' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#44576c', border: 'none' },
    '.cm-activeLine': { backgroundColor: '#202b3d' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#98a8b9' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#44576c !important',
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: '#44576c',
      color: '#ffffff',
      borderRadius: '2px',
      outline: 'none',
    },
    '.cm-panels': { backgroundColor: '#202b3d', color: '#eaeaea' },
    '.cm-vim-panel': { fontFamily: 'Hack, Menlo, Monaco, Consolas, monospace' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: '#c38fe5' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#e7c547' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#a16a94' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#d27b53' },
  { tag: t.function(t.definition(t.variableName)), color: '#ffeb3b' },
  { tag: t.definition(t.variableName), color: '#4caf50' },
  { tag: [t.local(t.variableName), t.special(t.variableName)], color: '#7aa6da' },
  { tag: [t.propertyName, t.attributeName], color: '#99cc99' },
  { tag: t.tagName, color: '#d54e53' },
  { tag: [t.operator, t.typeName, t.meta, t.standard(t.variableName)], color: '#eaeaea' },
]);

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
  focus(): void;
  destroy(): void;
}

export function createEditor(
  parent: HTMLElement,
  options: { doc: string; keymap: Keymap; engine: EngineId; onChange: (code: string) => void },
): EditorHandle {
  const keymapSlot = new Compartment();
  const languageSlot = new Compartment();
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
        syntaxHighlighting(highlight),
        theme,
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
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
