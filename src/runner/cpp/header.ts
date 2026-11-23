/**
 * Our own `<bits/stdc++.h>`: libc++ (the library of the bundled clang) has none, but most
 * Baekjoon C++ solutions start with it. Like GCC's, it includes every standard header.
 *
 * Every header here compiles and links for wasm32-wasip1 (checked in tests/cpp-compile).
 * Left out: <csetjmp> (needs wasm exception handling) and <csignal> (wasi has no signals).
 */

const C_HEADERS = [
  'cassert',
  'cctype',
  'cerrno',
  'cfenv',
  'cfloat',
  'cinttypes',
  'climits',
  'clocale',
  'cmath',
  'cstdarg',
  'cstddef',
  'cstdint',
  'cstdio',
  'cstdlib',
  'cstring',
  'ctime',
  'cuchar',
  'cwchar',
  'cwctype',
];

const CXX17_HEADERS = [
  'algorithm',
  'any',
  'array',
  'atomic',
  'bitset',
  'charconv',
  'chrono',
  'codecvt',
  'complex',
  'condition_variable',
  'deque',
  'exception',
  'execution',
  'filesystem',
  'forward_list',
  'fstream',
  'functional',
  'future',
  'initializer_list',
  'iomanip',
  'ios',
  'iosfwd',
  'iostream',
  'istream',
  'iterator',
  'limits',
  'list',
  'locale',
  'map',
  'memory',
  'memory_resource',
  'mutex',
  'new',
  'numeric',
  'optional',
  'ostream',
  'queue',
  'random',
  'ratio',
  'regex',
  'scoped_allocator',
  'set',
  'shared_mutex',
  'sstream',
  'stack',
  'stdexcept',
  'streambuf',
  'string',
  'string_view',
  'system_error',
  'thread',
  'tuple',
  'type_traits',
  'typeindex',
  'typeinfo',
  'unordered_map',
  'unordered_set',
  'utility',
  'valarray',
  'variant',
  'vector',
];

/** Only included when compiling as C++20 or later, like GCC's header does. */
const CXX20_HEADERS = [
  'barrier',
  'bit',
  'compare',
  'concepts',
  'coroutine',
  'format',
  'latch',
  'numbers',
  'ranges',
  'semaphore',
  'source_location',
  'span',
  'stop_token',
  'syncstream',
  'version',
];

export const STDCXX_HEADERS: readonly string[] = [...C_HEADERS, ...CXX17_HEADERS];
export const STDCXX20_HEADERS: readonly string[] = CXX20_HEADERS;

const include = (names: readonly string[]) => names.map((n) => `#include <${n}>`).join('\n');

/** Content of `bits/stdc++.h`. */
export const STDCXX_H = `// <bits/stdc++.h> for the in-browser runner: every standard header.
#ifndef COTE_IN_BAEKJOON_BITS_STDCXX_H
#define COTE_IN_BAEKJOON_BITS_STDCXX_H
${include(STDCXX_HEADERS)}
#if __cplusplus >= 202002L
${include(STDCXX20_HEADERS)}
#endif
#endif
`;
