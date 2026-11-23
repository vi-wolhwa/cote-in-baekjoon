/**
 * Adds java.util.Scanner and java.util.InputMismatchException (sources next to this file) to
 * both class library archives in vendor/teavm-javac/ (#63). TeaVM's class library has no
 * Scanner, which most Baekjoon Java solutions use.
 *
 * javac refuses sources in `java.util` ("package exists in another module"), so the sources
 * are compiled as `cote.util` with the bundled compiler and renamed to `java/util` inside the
 * class files (same length, so the constant pool stays valid).
 *
 * Archive format (gzip): repeated [u16 name length][name][u32 data length][data].
 * Re-running replaces the entries, so the script can run on already patched archives.
 *
 * Usage: node scripts/teavm-classlib/build.ts
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { CompilerExports, TeaVMRuntime } from '../../src/runner/java/teavm';

const ROOT = path.resolve(import.meta.dirname, '../..');
const VENDOR = path.join(ROOT, 'vendor', 'teavm-javac');
const SOURCES = path.join(import.meta.dirname, 'java', 'util');
const ARCHIVES = ['compile-classlib-teavm.bin', 'runtime-classlib-teavm.bin'];

type Entry = [name: string, data: Uint8Array];

function readArchive(gz: Uint8Array): Entry[] {
  const b = Buffer.from(gunzipSync(gz));
  const entries: Entry[] = [];
  let p = 0;
  while (p < b.length) {
    const nameLength = b.readUInt16BE(p);
    const name = b.subarray(p + 2, p + 2 + nameLength).toString('utf8');
    p += 2 + nameLength;
    const dataLength = b.readUInt32BE(p);
    entries.push([name, b.subarray(p + 4, p + 4 + dataLength)]);
    p += 4 + dataLength;
  }
  return entries;
}

function writeArchive(entries: Entry[]): Buffer {
  const parts: Buffer[] = [];
  for (const [name, data] of entries) {
    const n = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(2 + n.length + 4);
    header.writeUInt16BE(n.length, 0);
    n.copy(header, 2);
    header.writeUInt32BE(data.length, 2 + n.length);
    parts.push(header, Buffer.from(data));
  }
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

async function compileLibrary(sdk: Int8Array, classlib: Int8Array): Promise<Entry[]> {
  const runtimeUrl = pathToFileURL(path.join(VENDOR, 'compiler.wasm-runtime.js')).href;
  const { load } = (await import(runtimeUrl)) as TeaVMRuntime;
  const teavm = await load(readFileSync(path.join(VENDOR, 'compiler.wasm')));
  const compiler = (teavm.exports as unknown as CompilerExports).createCompiler();
  compiler.setSdk(sdk);
  compiler.setTeaVMClasslib(classlib);
  const errors: string[] = [];
  compiler.onDiagnostic((d) => {
    if (String(d.severity).toLowerCase() === 'error') {
      errors.push(`${d.fileName}:${d.lineNumber}: ${d.message}`);
    }
  });
  for (const name of readdirSync(SOURCES)
    .filter((n) => n.endsWith('.java'))
    .sort()) {
    const source = readFileSync(path.join(SOURCES, name), 'utf8').replace(
      /^package java\.util;/m,
      'package cote.util;\nimport java.util.*;',
    );
    compiler.addSourceFile(`cote/util/${name}`, source);
  }
  if (!compiler.compile()) throw new Error(`컴파일 실패:\n${errors.join('\n')}`);
  return compiler
    .listOutputFiles()
    .sort()
    .map((name): Entry => {
      const bytes = Buffer.from(compiler.getOutputFile(name));
      // Same-length rename in the constant pool: cote/util/X -> java/util/X.
      const renamed = Buffer.from(
        bytes.toString('latin1').replaceAll('cote/util/', 'java/util/'),
        'latin1',
      );
      return [name.replace(/^cote\/util\//, 'java/util/'), renamed];
    });
}

async function main() {
  const archives = ARCHIVES.map((name) => readFileSync(path.join(VENDOR, name)));
  const [sdk, classlib] = archives.map((b) => new Int8Array(b.buffer, b.byteOffset, b.byteLength));
  if (!sdk || !classlib) throw new Error('archives missing');
  const added = await compileLibrary(sdk, classlib);
  const names = new Set(added.map(([name]) => name));
  ARCHIVES.forEach((name, i) => {
    const kept = readArchive(archives[i] as Buffer).filter(([n]) => !names.has(n));
    writeFileSync(path.join(VENDOR, name), writeArchive([...kept, ...added]));
  });
  console.log(`추가한 클래스: ${[...names].join(', ')}`);

  const sums = readdirSync(VENDOR)
    .filter((n) => /\.(wasm|js|bin)$/.test(n))
    .sort()
    .map(
      (n) =>
        `${createHash('sha256')
          .update(readFileSync(path.join(VENDOR, n)))
          .digest('hex')}  ${n}`,
    );
  writeFileSync(path.join(VENDOR, 'SHA256SUMS'), `${sums.join('\n')}\n`);
  console.log('SHA256SUMS를 갱신했습니다.');
}

await main();
