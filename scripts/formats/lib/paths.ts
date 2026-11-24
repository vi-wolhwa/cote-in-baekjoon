/**
 * Maps README paths in a repository tree to Baekjoon problem ids.
 * The id comes from the README's folder name, e.g.
 * `백준/Silver/1260. DFS와 BFS/README.md`, `boj/1260/README.md`, `BOJ_1260_DFS와BFS/README.md`.
 * A guessed id is only a candidate: the README content is checked later
 * (`readmeMatchesId`) before anything is kept.
 */

const README = /(^|\/)readme\.md$/i;

/** Problem id guessed from a README path, or null. */
export function problemIdFromPath(path: string): number | null {
  if (!README.test(path)) return null;
  const parts = path.split('/');
  const folder = parts[parts.length - 2];
  if (folder === undefined) return null;
  const match = /^(?:boj|baekjoon|백준|b|p)?[ ._#-]*(\d{4,5})(?:$|[^\d])/i.exec(folder.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return id >= 1000 && id <= 99999 ? id : null;
}

export interface TreeEntry {
  path: string;
  type: string;
}

/** README paths per problem id (all ids, or only `wanted` ones when given). */
export function indexTree(entries: TreeEntry[], wanted?: Set<number>): Map<number, string[]> {
  const index = new Map<number, string[]>();
  for (const entry of entries) {
    if (entry.type !== 'blob') continue;
    const id = problemIdFromPath(entry.path);
    if (id === null || (wanted && !wanted.has(id))) continue;
    const list = index.get(id) ?? [];
    list.push(entry.path);
    index.set(id, list);
  }
  return index;
}

/** raw.githubusercontent.com URL for a file at a commit, with each segment encoded. */
export function rawUrl(repo: string, sha: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${sha}/${encodePath(path)}`;
}

/** Human-facing github.com URL for the same file. */
export function blobUrl(repo: string, sha: string, path: string): string {
  return `https://github.com/${repo}/blob/${sha}/${encodePath(path)}`;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
