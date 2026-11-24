/**
 * C# glue on .NET 8 (`dotnet build -c Release`); see harness.ts. The project file is what
 * `dotnet new console` makes (implicit usings and nullable on), written by the test instead
 * of running the slow template command. global.json picks the .NET 8 SDK (its compiler)
 * even when the runner has newer SDKs.
 */
import { nativeSuite } from './harness';

const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
`;
const GLOBAL_JSON = '{ "sdk": { "version": "8.0.100", "rollForward": "latestFeature" } }\n';

const cls = (body: string) => `public class Solution {\n    ${body}\n}`;

nativeSuite(
  'csharp',
  {
    file: 'Main.cs',
    build: [
      [
        process.execPath,
        '-e',
        `const fs = require('fs'); fs.writeFileSync('Main.csproj', ${JSON.stringify(CSPROJ)}); fs.writeFileSync('global.json', ${JSON.stringify(GLOBAL_JSON)})`,
      ],
      ['dotnet', '--version'],
      ['dotnet', 'build', '-c', 'Release', '-o', 'out', '--nologo', '-v', 'q'],
    ],
    run: ['dotnet', 'out/Main.dll'],
  },
  {
    ab: cls('public int solution(int a, int b) {\n        return a + b;\n    }'),
    sort: cls(
      'public long[] solution(int n, long[] arr) {\n        long[] r = (long[])arr.Clone();\n        Array.Sort(r);\n        return r;\n    }',
    ),
    grid: cls(
      "public bool solution(int n, int m, char[][] board) {\n        return board.Any(r => r.Contains('#'));\n    }",
    ),
    lines: cls(
      'public double solution(string title, long[] nums, int k, int[][] rows) {\n        long s = nums.Sum() + rows.Sum(r => (long)r.Sum());\n        return (double)s / title.Length;\n    }',
    ),
    words: cls(
      'public string solution(string name, long a, long b) {\n        return name + ":" + (a + b);\n    }',
    ),
    transpose: cls(
      'public int[][] solution(int n, int m, int[][] g) {\n        int[][] r = new int[m][];\n        for (int j = 0; j < m; j++) {\n            r[j] = new int[n];\n            for (int i = 0; i < n; i++) r[j][i] = g[i][j];\n        }\n        return r;\n    }',
    ),
    blocks: cls(
      'public string[] solution(int a, int b, string[] names, long[][] rows) {\n        return Enumerable.Reverse(names).Concat(rows.Select(r => r.Sum().ToString())).ToArray();\n    }',
    ),
    commands: cls(
      'public int solution(int n, int m, string[][] cmds, double[] w) {\n        return cmds.Count(c => c[0] == "push") * 10 + (int)(w[0] + w[1]);\n    }',
    ),
    noInput: cls('public string[] solution() {\n        return new[] { " *", "***" };\n    }'),
    untilEof: cls(
      'public string[] solution(int n, int[][] pairs, string[] names) {\n        return pairs.Select(p => (p[0] + p[1]).ToString()).Concat(names).ToArray();\n    }',
    ),
    untilDot: cls(
      'public int solution(int[] nums, string[] texts) {\n        return (nums[0] + nums[1]) * 10 + texts.Length;\n    }',
    ),
    emptyThenEof: cls(
      'public long solution(int n, int[] arr, long[] rest) {\n        return rest.Sum();\n    }',
    ),
    caseLabel: cls('public int solution(int a, int b) {\n        return a + b;\n    }'),
    scenario: cls('public int[] solution(int n, int[] arr) {\n        return arr;\n    }'),
    exprFlow: cls(
      'public long solution(int n, int[] arr, int[][] g) {\n        return (long)arr.Sum() * 100 + g.Length * 10 + g[0].Length;\n    }',
    ),
    blockCount: cls(
      'public string[] solution(int n, int[] k, string[] name, int[][] items) {\n        return name.Select((s, i) => s + ":" + items[i].Sum()).ToArray();\n    }',
    ),
    blockUntil: cls(
      'public int[] solution(int[] m, int[][] vals, int[] x, int[] y) {\n        return vals.Select(r => r.Max()).Concat(x.Select((a, i) => a * y[i])).ToArray();\n    }',
    ),
    endConds: cls(
      'public long solution(int n, string[] words, int[] p) {\n        return n + words.Length * 10L + p.Sum() * 100L;\n    }',
    ),
    rawLines: cls(
      'public string[] solution(string t, int n, string[] ls, string[] mid, string[] rest) {\n        return new[] { t }.Concat(ls).Concat(mid).Concat(rest).Select(s => "[" + s + "]").ToArray();\n    }',
    ),
  },
);
