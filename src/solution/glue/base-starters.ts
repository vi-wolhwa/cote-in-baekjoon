/**
 * Starting code for JavaScript, Python, C++ and Java: an empty `solution` with the format's
 * parameters and a return value of the right type.
 */
import type { Format, RetType } from '../dsl';
import { CPP_TYPES } from './cpp';
import { JAVA_TYPES } from './java';

type Style = 'js' | 'python' | 'cpp' | 'java';

/** A value of the return type to start from. */
export function placeholder(style: Style, type: RetType): string {
  const array = type.endsWith('[]');
  switch (style) {
    case 'js':
      return array ? '[]' : type === 'string' ? "''" : type === 'bool' ? 'true' : '0';
    case 'python':
      return array ? '[]' : type === 'string' ? "''" : type === 'bool' ? 'True' : '0';
    case 'cpp':
    case 'java':
      return array ? '{}' : type === 'string' ? '""' : type === 'bool' ? 'true' : '0';
  }
}

export function jsStarter(format: Format): string {
  const names = format.params.map((p) => p.name);
  return `function solution(${names.join(', ')}) {\n    let answer = ${placeholder('js', format.ret.type)};\n    return answer;\n}\n`;
}

export function pythonStarter(format: Format): string {
  const names = format.params.map((p) => p.name);
  return `def solution(${names.join(', ')}):\n    answer = ${placeholder('python', format.ret.type)}\n    return answer\n`;
}

export function cppStarter(format: Format): string {
  const params = format.params.map((p) => `${CPP_TYPES[p.type]} ${p.name}`).join(', ');
  const type = CPP_TYPES[format.ret.type];
  const answer = placeholder('cpp', format.ret.type);
  const init = answer === '{}' ? `${type} answer;` : `${type} answer = ${answer};`;
  return `// 자동 포함: bits/stdc++.h, using namespace std\n\n${type} solution(${params}) {\n    ${init}\n    return answer;\n}\n`;
}

export function javaStarter(format: Format): string {
  const params = format.params.map((p) => `${JAVA_TYPES[p.type]} ${p.name}`).join(', ');
  const type = JAVA_TYPES[format.ret.type];
  const answer = placeholder('java', format.ret.type);
  return `// 자동 포함: java.util.*, java.io.*\n\nclass Solution {\n    public ${type} solution(${params}) {\n        ${type} answer = ${answer};\n        return answer;\n    }\n}\n`;
}
