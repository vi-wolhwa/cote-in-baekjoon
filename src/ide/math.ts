/**
 * Renders TeX in problem statements with the same delimiters Baekjoon uses
 * (ADR-0001). MathJax is bundled and loaded only when a statement has math.
 * SVG output keeps every glyph inline, so no font files are fetched.
 */
import { browserAdaptor } from 'mathjax-full/js/adaptors/browserAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { SVG } from 'mathjax-full/js/output/svg.js';

// 'require' and 'autoload' would try to load code at run time; everything is bundled instead.
const packages = AllPackages.filter((p) => p !== 'require' && p !== 'autoload');

let mathDocument: ReturnType<typeof mathjax.document> | undefined;

function getDocument() {
  if (!mathDocument) {
    RegisterHTMLHandler(browserAdaptor());
    mathDocument = mathjax.document(document, {
      InputJax: new TeX({
        packages,
        inlineMath: [
          ['$', '$'],
          ['\\(', '\\)'],
        ],
        displayMath: [
          ['$$', '$$'],
          ['\\[', '\\]'],
        ],
        processEscapes: true,
        tags: 'ams',
        // Same as Baekjoon: neutralize macros that can inject classes, styles or links.
        macros: { class: ' ', style: ' ', href: ' ' },
      }),
      OutputJax: new SVG({ fontCache: 'global' }),
      ignoreHtmlClass: 'no-mathjax',
    });
  }
  return mathDocument;
}

export function typeset(element: HTMLElement) {
  const doc = getDocument();
  doc
    .findMath({ elements: [element] })
    .compile()
    .getMetrics()
    .typeset()
    .updateDocument();
  doc.clear();
}
