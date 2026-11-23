/**
 * Strings that Baekjoon's web application firewall is known to reject (HTTP 403) when they
 * appear in submitted source code.
 *
 * The list is adapted from BaekjoonHub `scripts/baekjoon/submitfilter.js` (MIT License,
 * https://github.com/BaekjoonHub/BaekjoonHub, commit db98388, 2026-11-21). The rule numbers
 * are OWASP ModSecurity Core Rule Set ids (941180: node-validator deny list, 941160: NoScript
 * InjectionChecker HTML injection). Entries BaekjoonHub marks as unconfirmed are left out.
 */

/** Case-insensitive literal strings (CRS 941180). */
const LITERALS = [
  'document.cookie',
  'document.write',
  '.parentnode',
  '.innerhtml',
  'window.location',
  '-moz-binding',
  '<!--',
  '-->',
  '<![cdata[',
] as const;

/**
 * HTML-tag-like text such as `<script`, `<style`, `<svg`, `<iframe`, `<form` or `<set<`
 * (CRS 941160), copied from BaekjoonHub as is.
 */
const HTML_TAG_LIKE =
  /<[^\w<>]{0,8}(?:[^<>"'\s]{0,32}:)?[^\w<>]{0,8}\W{0,8}?(?:(?:a\W{0,8}?(?:n\W{0,8}?i\W{0,8}?m\W{0,8}?a\W{0,8}?t\W{0,8}?e|p\W{0,8}?p\W{0,8}?l\W{0,8}?e\W{0,8}?t|u\W{0,8}?d\W{0,8}?i\W{0,8}?o)|b\W{0,8}?(?:i\W{0,8}?n\W{0,8}?d\W{0,8}?i\W{0,8}?n\W{0,8}?g\W{0,8}?s|a\W{0,8}?s\W{0,8}?e|o\W{0,8}?d\W{0,8}?y)|i?\W{0,8}?f\W{0,8}?r\W{0,8}?a\W{0,8}?m\W{0,8}?e|o\W{0,8}?b\W{0,8}?j\W{0,8}?e\W{0,8}?c\W{0,8}?t|i\W{0,8}?m\W{0,8}?a?\W{0,8}?g\W{0,8}?e?|e\W{0,8}?m\W{0,8}?b\W{0,8}?e\W{0,8}?d|p\W{0,8}?a\W{0,8}?r\W{0,8}?a\W{0,8}?m|v\W{0,8}?i\W{0,8}?d\W{0,8}?e\W{0,8}?o|l\W{0,8}?i\W{0,8}?n\W{0,8}?k)[^>\w]|s\W{0,8}?(?:c\W{0,8}?r\W{0,8}?i\W{0,8}?p\W{0,8}?t|t\W{0,8}?y\W{0,8}?l\W{0,8}?e|e\W{0,8}?t[^>\w]|v\W{0,8}?g)|m\W{0,8}?(?:a\W{0,8}?r\W{0,8}?q\W{0,8}?u\W{0,8}?e\W{0,8}?e|e\W{0,8}?t\W{0,8}?a[^>\w])|f\W{0,8}?o\W{0,8}?r\W{0,8}?m)/gi;

/** Longer inputs are not scanned (BaekjoonHub uses the same bound). */
const MAX_SCAN_LENGTH = 64 * 1024;
const MAX_RESULTS = 20;

/**
 * Returns the distinct snippets in `code` that the firewall is likely to block, in order of
 * appearance. Literal matches are reported in lower case as listed above; HTML-tag-like
 * matches are reported as they appear in the code, trimmed.
 */
export function findBlockedPatterns(code: string): string[] {
  if (code.length > MAX_SCAN_LENGTH) return [];
  const hits: { index: number; text: string }[] = [];
  const lower = code.toLowerCase();

  for (const literal of LITERALS) {
    const index = lower.indexOf(literal);
    if (index !== -1) hits.push({ index, text: literal });
  }
  for (const m of code.matchAll(HTML_TAG_LIKE)) {
    hits.push({ index: m.index, text: m[0].trim() });
    if (hits.length > MAX_RESULTS * 2) break;
  }

  hits.sort((a, b) => a.index - b.index);
  return [...new Set(hits.map((h) => h.text))].slice(0, MAX_RESULTS);
}
