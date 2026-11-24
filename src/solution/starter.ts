/**
 * Starting code for the solution-function mode: an empty `solution` with the format's
 * parameters and a return value of the right type.
 */
import type { EngineId } from '@/shared/languages';
import type { Format, RetType } from './dsl';
import { CPP_TYPES } from './glue/cpp';
import { JAVA_TYPES } from './glue/java';

function placeholder(engine: EngineId, type: RetType): string {
  const array = type.endsWith('[]');
  switch (engine) {
    case 'js':
      return array ? '[]' : type === 'string' ? "''" : type === 'bool' ? 'true' : '0';
    case 'python':
      return array ? '[]' : type === 'string' ? "''" : type === 'bool' ? 'True' : '0';
    case 'cpp':
      return array ? '{}' : type === 'string' ? '""' : type === 'bool' ? 'true' : '0';
    case 'java':
      return array ? '{}' : type === 'string' ? '""' : type === 'bool' ? 'true' : '0';
  }
}

export function starterCode(engine: EngineId, format: Format): string {
  const names = format.params.map((p) => p.name);
  const ret = format.ret.type;
  const answer = placeholder(engine, ret);
  switch (engine) {
    case 'js':
      return `function solution(${names.join(', ')}) {\n    let answer = ${answer};\n    return answer;\n}\n`;
    case 'python':
      return `def solution(${names.join(', ')}):\n    answer = ${answer}\n    return answer\n`;
    case 'cpp': {
      const params = format.params.map((p) => `${CPP_TYPES[p.type]} ${p.name}`).join(', ');
      const type = CPP_TYPES[ret];
      const init = answer === '{}' ? `${type} answer;` : `${type} answer = ${answer};`;
      return `// bits/stdc++.h와 using namespace std;는 자동으로 붙습니다.\n\n${type} solution(${params}) {\n    ${init}\n    return answer;\n}\n`;
    }
    case 'java': {
      const params = format.params.map((p) => `${JAVA_TYPES[p.type]} ${p.name}`).join(', ');
      const type = JAVA_TYPES[ret];
      return `// java.util.*와 java.io.*는 자동으로 import됩니다.\n\nclass Solution {\n    public ${type} solution(${params}) {\n        ${type} answer = ${answer};\n        return answer;\n    }\n}\n`;
    }
  }
}

/** File tab name in solution-function mode. */
export function solutionFileName(engine: EngineId): string {
  return { js: 'solution.js', python: 'solution.py', cpp: 'solution.cpp', java: 'Solution.java' }[
    engine
  ];
}
