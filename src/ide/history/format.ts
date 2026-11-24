/** Times in the '제출 기록' tab (ADR-0012): absolute and relative. */
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-25 14:03" in local time. */
export function absoluteTime(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "방금", "5분 전", "3시간 전", "2일 전", then the date. */
export function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return '방금';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return absoluteTime(at).slice(0, 10);
}
