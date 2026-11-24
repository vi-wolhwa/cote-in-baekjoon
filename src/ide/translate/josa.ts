/**
 * Korean particles after code and math put back into a translation (ADR-0010). The translator
 * chose the particle for its marker (`ZQX1` → 을), not for the real text (`YES` → 를), so the
 * particle right after a kept piece is picked again from how that piece ends when read aloud.
 */

/** Final-consonant (받침) of letter names read in Korean: A 에이 … L 엘, M 엠, N 엔, R 알. */
const LETTER_BATCHIM = new Set(['l', 'm', 'n', 'r']);
/** Digits read in Korean: 0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔 end with a consonant. */
const DIGIT_BATCHIM = new Set(['0', '1', '3', '6', '7', '8']);
/** English words ending in these letters are usually read with a final consonant (sum 섬, list 리스트 no). */
const WORD_BATCHIM = new Set(['m', 'n', 'l', 'k', 'p', 'b', 'g']);

/**
 * Whether a piece of code or math, read aloud, ends with a final consonant; undefined when it
 * cannot be told (then the particle is left as it is). 'rieul' when it ends with ㄹ (for 로).
 */
export function finalSound(text: string): 'vowel' | 'consonant' | 'rieul' | undefined {
  const plain = text
    .replace(/\\[a-zA-Z]+/g, ' ') // TeX commands
    .replace(/[{}$\\^_]/g, ' ')
    .trim();
  const m = /([\p{Script=Hangul}A-Za-z0-9])[^\p{Script=Hangul}A-Za-z0-9]*$/u.exec(plain);
  const last = m?.[1];
  if (!last) return undefined;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    if (jong === 0) return 'vowel';
    return jong === 8 ? 'rieul' : 'consonant';
  }
  if (/[0-9]/.test(last)) {
    if (!DIGIT_BATCHIM.has(last)) return 'vowel';
    return last === '1' || last === '7' || last === '8' ? 'rieul' : 'consonant';
  }
  const word = /[A-Za-z]+$/.exec(plain)?.[0] ?? last;
  const lower = last.toLowerCase();
  // One letter or an all-caps abbreviation is read letter by letter (N 엔, YES 예스).
  if (word.length === 1 || (word === word.toUpperCase() && word.length <= 3 && word !== 'YES')) {
    if (!LETTER_BATCHIM.has(lower)) return 'vowel';
    return lower === 'l' || lower === 'r' ? 'rieul' : 'consonant';
  }
  if (/^(yes|no)$/i.test(word)) return 'vowel';
  if (!WORD_BATCHIM.has(lower)) return 'vowel';
  return lower === 'l' ? 'rieul' : 'consonant';
}

/** [after a consonant, after a vowel] pairs; 으로/로 also takes 로 after ㄹ. */
const PAIRS: [string, string][] = [
  ['이', '가'],
  ['을', '를'],
  ['은', '는'],
  ['과', '와'],
  ['으로', '로'],
];

/** The text after a kept piece with its leading particle fitted to that piece's final sound. */
export function fitParticle(piece: string, after: string): string {
  const sound = finalSound(piece);
  if (!sound) return after;
  for (const [withBatchim, without] of PAIRS) {
    for (const particle of [withBatchim, without]) {
      // Only a particle on its own: followed by a space, punctuation or the end, not a word.
      if (
        !after.startsWith(particle) ||
        /^[\p{Script=Hangul}]/u.test(after.slice(particle.length))
      ) {
        continue;
      }
      const fitted =
        sound === 'vowel' || (withBatchim === '으로' && sound === 'rieul') ? without : withBatchim;
      return fitted + after.slice(particle.length);
    }
  }
  return after;
}
