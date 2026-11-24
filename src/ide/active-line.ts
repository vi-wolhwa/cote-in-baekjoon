/**
 * Current-line highlight that steps aside while text is selected. CodeMirror draws the
 * selection behind the text and the active-line background on the line itself, so a
 * highlighted line hides its own selection; like the coding-test editors we follow, the
 * line is highlighted only when nothing is selected.
 */
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';

const line = Decoration.line({ class: 'cm-activeLine' });

function decorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges = view.state.selection.ranges;
  if (ranges.some((r) => !r.empty)) return builder.finish();
  let last = -1;
  for (const r of ranges) {
    const from = view.lineBlockAt(r.head).from;
    if (from > last) {
      builder.add(from, from, line);
      last = from;
    }
  }
  return builder.finish();
}

export const activeLineWithoutSelection = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged)
        this.decorations = decorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
