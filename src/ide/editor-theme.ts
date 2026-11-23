/**
 * Editor colors for the dark and light themes (docs/design/ide-spec.md §2 and §9). The
 * editor switches between them through a Compartment, so the document, cursor and undo
 * history stay as they are.
 */
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import type { Theme } from '@/shared/theme';

const MONO = 'Hack, Menlo, Monaco, Consolas, monospace';

/** Font and spacing, the same in both themes. */
export const editorBase = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': { fontFamily: MONO, fontSize: '16px', lineHeight: '22.4px' },
  '.cm-content': { padding: '4px 0' },
  '.cm-gutters': { border: 'none' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    borderRadius: '2px',
    outline: 'none',
  },
  '.cm-vim-panel': { fontFamily: MONO },
});

const darkTheme = EditorView.theme(
  {
    '&': { color: '#eaeaea', backgroundColor: 'transparent' },
    '.cm-content': { caretColor: '#cdd7e0' },
    '.cm-cursor, .cm-dropCursor': { borderLeft: '1px solid #cdd7e0' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#44576c' },
    '.cm-activeLine': { backgroundColor: '#202b3d' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#98a8b9' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#44576c !important',
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: '#44576c',
      color: '#ffffff',
    },
    '.cm-panels': { backgroundColor: '#202b3d', color: '#eaeaea' },
  },
  { dark: true },
);

const darkHighlight = HighlightStyle.define([
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

const lightTheme = EditorView.theme(
  {
    '&': { color: '#000000', backgroundColor: '#ffffff' },
    '.cm-content': { caretColor: '#000000' },
    '.cm-cursor, .cm-dropCursor': { borderLeft: '1px solid #000000' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#98a8b9' },
    '.cm-activeLine': { backgroundColor: '#f4f4f8' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#44576c' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#d7e2eb !important',
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: '#d7e2eb',
      color: '#000000',
    },
    '.cm-panels': { backgroundColor: '#f7f7fb', color: '#263747' },
  },
  { dark: false },
);

/** Measured: keyword, function/definition name, string. The rest: CodeMirror's classic light colors. */
const lightHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: '#9c27b0' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#2a00ff' },
  { tag: t.number, color: '#116644' },
  { tag: [t.bool, t.null, t.atom], color: '#221199' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#aa5500' },
  {
    tag: [t.function(t.definition(t.variableName)), t.definition(t.variableName)],
    color: '#0000ff',
  },
  {
    tag: [t.local(t.variableName), t.special(t.variableName), t.typeName, t.className],
    color: '#0055aa',
  },
  { tag: [t.propertyName, t.attributeName], color: '#000000' },
  { tag: t.tagName, color: '#117700' },
  { tag: [t.operator, t.meta, t.standard(t.variableName), t.variableName], color: '#000000' },
]);

export function editorTheme(theme: Theme): Extension {
  return theme === 'light'
    ? [lightTheme, syntaxHighlighting(lightHighlight)]
    : [darkTheme, syntaxHighlighting(darkHighlight)];
}
