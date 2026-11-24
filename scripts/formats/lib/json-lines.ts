/**
 * `{ "v": 1, "formats": { ... } }` with one problem per line, so data diffs show which problems
 * changed. Both data files are generated or edited by script, so Prettier leaves them alone.
 */
export function formatsFile(formats: Record<string, unknown>): string {
  const rows = Object.entries(formats).map(
    ([id, f]) => `${JSON.stringify(id)}:${JSON.stringify(f)}`,
  );
  return `{"v":1,"formats":{\n${rows.join(',\n')}\n}}\n`;
}
