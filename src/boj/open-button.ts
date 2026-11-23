/**
 * "코딩테스트" on a Baekjoon problem page (PRD F1). It goes into Baekjoon's problem
 * menu (`ul.problem-menu`), between "N번" and "제출", as a navy pill that matches the
 * menu's height. When the menu is missing but the title is there, it goes after the title
 * instead, so a menu change alone never hides the button. Styles: open-button.css.
 *
 * The page DOM is untrusted: only its structure and the menu's link targets are read.
 */
export const OPEN_BUTTON_ID = 'cib-open-ide';
export const OPEN_ITEM_ID = 'cib-open-ide-item';
export const OPEN_LABEL = '코딩테스트';

export type OpenButtonPlace = 'menu' | 'title';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Adds the button and returns where it went. Returns undefined when the page has no
 * problem title (the IDE could not read the problem) or the button is already there.
 */
export function insertOpenButton(doc: Document, onOpen: () => void): OpenButtonPlace | undefined {
  const title = doc.querySelector('#problem_title');
  if (!title || doc.getElementById(OPEN_BUTTON_ID)) return undefined;

  const menu = doc.querySelector('ul.problem-menu');
  const items = menu ? [...menu.children].filter((c) => c.tagName === 'LI') : [];
  if (menu && items.length > 0) {
    const item = doc.createElement('li');
    item.id = OPEN_ITEM_ID;
    item.append(createButton(doc, onOpen, 'menu'));
    const submit = items.find((li) =>
      /\/submit\//.test(li.querySelector('a')?.getAttribute('href') ?? ''),
    );
    if (submit) submit.before(item);
    else items[0]?.after(item);
    return 'menu';
  }

  // No menu: the end of the title line, after Baekjoon's problem labels.
  const heading = title.closest('h1, h2, h3') ?? title.parentElement ?? title;
  heading.append(createButton(doc, onOpen, 'title'));
  return 'title';
}

function createButton(doc: Document, onOpen: () => void, place: OpenButtonPlace) {
  const link = doc.createElement('a');
  link.id = OPEN_BUTTON_ID;
  link.href = '#';
  link.setAttribute('role', 'button');
  link.title = '코딩테스트 풀이 화면에서 풀기';
  link.dataset.place = place;
  const label = doc.createElement('span');
  label.textContent = OPEN_LABEL;
  link.append(createIcon(doc), label);
  link.addEventListener('click', (e) => {
    e.preventDefault();
    onOpen();
  });
  // A link answers Enter by itself; role="button" promises Space too.
  link.addEventListener('keydown', (e) => {
    if (e.key !== ' ') return;
    e.preventDefault();
    onOpen();
  });
  return link;
}

/** 14px terminal mark: a blue ">" and a white "_". Decorative. */
function createIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({
    width: '14',
    height: '14',
    viewBox: '0 0 14 14',
    fill: 'none',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  })) {
    svg.setAttribute(k, v);
  }
  const chevron = doc.createElementNS(SVG_NS, 'path');
  chevron.setAttribute('d', 'M2.5 3.5L6 7l-3.5 3.5');
  chevron.setAttribute('stroke', '#5AA2FF');
  const underscore = doc.createElementNS(SVG_NS, 'path');
  underscore.setAttribute('d', 'M7.5 10.5h4');
  underscore.setAttribute('stroke', '#FFFFFF');
  svg.append(chevron, underscore);
  return svg;
}
