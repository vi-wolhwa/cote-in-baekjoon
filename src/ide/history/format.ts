/** Times in the '제출 기록' tab (ADR-0012): relative like Baekjoon, exact in the tooltip. */
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026년 11월 25일 14:03:05" in local time, as Baekjoon's tooltip shows it. */
export function fullTime(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "방금", "5분 전", "3시간 전", "2일 전", "4개월 전", "3년 전", like Baekjoon. */
export function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return '방금';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

/** A number and its unit, as a table cell shows them. */
export type Measure = [value: string, unit: string];

/** Memory up to 999,999 KB, then whole MB (Baekjoon reports KB). */
export function memoryMeasure(kb: number): Measure {
  return kb < 1_000_000
    ? [kb.toLocaleString(), 'KB']
    : [Math.round(kb / 1024).toLocaleString(), 'MB'];
}

/** Code length up to 9,999 B, then KB (one decimal under 100 KB), so at most four digits. */
export function lengthMeasure(bytes: number): Measure {
  if (bytes < 10_000) return [bytes.toLocaleString(), 'B'];
  const kb = bytes / 1024;
  return [kb < 100 ? kb.toFixed(1) : Math.round(kb).toLocaleString(), 'KB'];
}

export function timeMeasure(ms: number): Measure {
  return [ms.toLocaleString(), 'ms'];
}
