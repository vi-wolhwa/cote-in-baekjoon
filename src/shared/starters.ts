/**
 * Standard input/output starting code per code group (LanguageInfo.codeGroup): reading stdin
 * the usual Baekjoon way, without solving anything. Every starter compiles as it is.
 */
export const LANGUAGE_STARTERS: Readonly<Record<string, string>> = {
  c: `#include <stdio.h>

int main(void) {

    return 0;
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  python: `import sys
input = sys.stdin.readline

`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));

    }
}
`,
  javascript: `const input = require('fs').readFileSync('/dev/stdin').toString().trim().split('\\n');

`,
  typescript: `const input: string[] = require('fs').readFileSync('/dev/stdin').toString().trim().split('\\n');

`,
  kotlin: `import java.io.*
import java.util.*

fun main() {
    val br = BufferedReader(InputStreamReader(System.\`in\`))

}
`,
  rust: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let mut tokens = input.split_ascii_whitespace();

}
`,
  // Go rejects unused variables and imports, so the starter reads and prints one value.
  go: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	reader := bufio.NewReader(os.Stdin)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	var n int
	fmt.Fscan(reader, &n)
	fmt.Fprintln(writer, n)
}
`,
  swift: `import Foundation

while let line = readLine() {

}
`,
  csharp: `using System;
using System.Collections.Generic;
using System.Linq;

class Program
{
    static void Main()
    {
        string line = Console.ReadLine();

    }
}
`,
  ruby: `line = gets

`,
};
