/**
 * Words in an input description that name an array (#115, #124): "간선" → edges,
 * "높이" → heights. What a value measures comes first ("통나무의 높이" → heights, "도로의
 * 길이" → roads), then the things themselves. Names avoid DSL reserved words (`map`, `list`).
 */

/** What the values are: checked first, so "각 집을 칠하는 비용" → costs. */
const VALUES: [RegExp, string][] = [
  [/높이|(?<![가-힣])키(?:가|를|는|의|\s|$)/, 'heights'],
  [/점수|득점|성적/, 'scores'],
  [/비용|요금/, 'costs'],
  [/가격|주가/, 'prices'],
  [/무게|중량/, 'weights'],
  [/득표|투표|의견/, 'votes'],
  [/순열/, 'perm'],
  [/약수/, 'divisors'],
  [/부모/, 'parents'],
  [/명령/, 'commands'],
  [/연산|방법/, 'ops'],
  [/쿼리|질의|질문/, 'queries'],
  [/구간/, 'ranges'],
  [/좌표|(?<!정|끝)점의|(?<!정|끝)점이/, 'points'],
  [/위치/, 'positions'],
  [/시간/, 'times'],
];

/** What the values belong to. */
const THINGS: [RegExp, string][] = [
  [/간선|연결/, 'edges'],
  [/도로|(?<![가-힣])길(?!이)/, 'roads'],
  [/버스/, 'buses'],
  [/다리/, 'bridges'],
  [/카드/, 'cards'],
  [/동전/, 'coins'],
  [/주사위/, 'dice'],
  [/친구/, 'friends'],
  [/학생|원생/, 'students'],
  [/도시/, 'cities'],
  [/건물/, 'buildings'],
  [/강의/, 'lectures'],
  [/과제|작업/, 'tasks'],
  [/회의/, 'meetings'],
  [/나무/, 'trees'],
  [/계단/, 'steps'],
  [/상자|박스/, 'boxes'],
  [/물건|물품|보석/, 'items'],
  [/책/, 'books'],
  [/파일/, 'files'],
  [/통화/, 'calls'],
  [/자리|좌석/, 'seats'],
  [/쌍/, 'pairs'],
  [/단어|문자열/, 'words'],
  [/이름/, 'names'],
  [/제목/, 'titles'],
  [/미로/, 'maze'],
  [/지도|격자|보드|판|맵|배치|그림|칸/, 'board'],
  [/종이/, 'paper'],
  [/행렬/, 'matrix'],
  [/표(?![가-힣])|표에/, 'table'],
  [/수열|정수|수가|수를|숫자/, 'arr'],
];

/** Names of 2D cells, used as they are for character grids. */
export const GRID_CUES = new Set(['board', 'maze', 'paper', 'table', 'matrix']);
/** Names that fit rows of a few numbers each ("a b c" per edge). */
export const ROW_CUES = new Set([
  'edges',
  'roads',
  'buses',
  'bridges',
  'points',
  'queries',
  'ranges',
  'pairs',
  'friends',
  'ops',
  'commands',
  'lectures',
  'tasks',
  'meetings',
  'items',
  'students',
  'cities',
]);

/**
 * The array name a sentence suggests, if any. Rows (`rows`) are named after things first:
 * a row "a b c" of a road network is an edge even when c is its cost.
 */
export function cueName(sentence: string, rows = false, cells = true): string | undefined {
  for (const [re, name] of rows ? [...THINGS, ...VALUES] : [...VALUES, ...THINGS]) {
    if (!cells && GRID_CUES.has(name)) continue;
    if (re.test(sentence)) return name;
  }
  return undefined;
}
