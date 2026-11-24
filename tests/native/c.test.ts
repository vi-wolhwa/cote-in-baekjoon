/**
 * C glue on gcc, as Baekjoon compiles C11 (`gcc -O2 -std=gnu11 -lm`). The browser runs the
 * same glue as C99 with clang (tests/solution-run.test.ts).
 */
import { C_EXT } from './c-ext';
import { nativeSuite, type CaseName } from './harness';

export const C_CODE: Record<Exclude<CaseName, keyof typeof C_EXT>, string> = {
  ab: `int solution(int a, int b) {
    return a + b;
}`,
  sort: `int cmp(const void* x, const void* y) {
    long long a = *(const long long*)x, b = *(const long long*)y;
    return (a > b) - (a < b);
}

long long* solution(int n, long long arr[], size_t arr_len, size_t* ret_len) {
    qsort(arr, arr_len, sizeof(long long), cmp);
    *ret_len = arr_len;
    return arr;
}`,
  grid: `bool solution(int n, int m, const char* board[], size_t board_rows) {
    for (size_t i = 0; i < board_rows; i++)
        if (strchr(board[i], '#')) return true;
    return false;
}`,
  lines: `double solution(const char* title, long long nums[], size_t nums_len, int k, int** rows,
                size_t rows_rows, size_t rows_cols[]) {
    long long s = 0;
    for (size_t i = 0; i < nums_len; i++) s += nums[i];
    for (size_t i = 0; i < rows_rows; i++)
        for (size_t j = 0; j < rows_cols[i]; j++) s += rows[i][j];
    return (double)s / strlen(title);
}`,
  words: `char* solution(const char* name, long long a, long long b) {
    char* r = (char*)malloc(strlen(name) + 32);
    sprintf(r, "%s:%lld", name, a + b);
    return r;
}`,
  transpose: `int** solution(int n, int m, int** g, size_t g_rows, size_t g_cols, size_t* ret_rows,
               size_t** ret_cols) {
    int** t = (int**)malloc(sizeof(int*) * g_cols);
    *ret_cols = (size_t*)malloc(sizeof(size_t) * g_cols);
    for (size_t j = 0; j < g_cols; j++) {
        t[j] = (int*)malloc(sizeof(int) * g_rows);
        (*ret_cols)[j] = g_rows;
        for (size_t i = 0; i < g_rows; i++) t[j][i] = g[i][j];
    }
    *ret_rows = g_cols;
    return t;
}`,
  blocks: `char** solution(int a, int b, const char* names[], size_t names_len, long long** rows,
                size_t rows_rows, size_t rows_cols[], size_t* ret_len) {
    char** out = (char**)malloc(sizeof(char*) * (names_len + rows_rows));
    size_t k = 0;
    for (size_t i = names_len; i-- > 0;) out[k++] = (char*)names[i];
    for (size_t i = 0; i < rows_rows; i++) {
        long long s = 0;
        for (size_t j = 0; j < rows_cols[i]; j++) s += rows[i][j];
        out[k] = (char*)malloc(32);
        sprintf(out[k++], "%lld", s);
    }
    *ret_len = k;
    return out;
}`,
  commands: `int solution(int n, int m, const char*** cmds, size_t cmds_rows, size_t cmds_cols[],
             double w[], size_t w_len) {
    int p = 0;
    for (size_t i = 0; i < cmds_rows; i++)
        if (cmds_cols[i] > 0 && strcmp(cmds[i][0], "push") == 0) p++;
    return p * 10 + (int)(w[0] + w[1]);
}`,
  noInput: `char** solution(size_t* ret_len) {
    char** out = (char**)malloc(sizeof(char*) * 2);
    out[0] = " *";
    out[1] = "***";
    *ret_len = 2;
    return out;
}`,
  untilEof: `char** solution(int n, int** pairs, size_t pairs_rows, size_t pairs_cols, const char* names[],
                size_t names_len, size_t* ret_len) {
    char** out = (char**)malloc(sizeof(char*) * (pairs_rows + names_len));
    size_t k = 0;
    for (size_t i = 0; i < pairs_rows; i++) {
        out[k] = (char*)malloc(16);
        sprintf(out[k++], "%d", pairs[i][0] + pairs[i][1]);
    }
    for (size_t i = 0; i < names_len; i++) out[k++] = (char*)names[i];
    *ret_len = k;
    return out;
}`,
  untilDot: `int solution(int nums[], size_t nums_len, const char* texts[], size_t texts_len) {
    return (nums[0] + nums[1]) * 10 + (int)texts_len;
}`,
  emptyThenEof: `long long solution(int n, int arr[], size_t arr_len, long long rest[], size_t rest_len) {
    long long s = 0;
    for (size_t i = 0; i < rest_len; i++) s += rest[i];
    return s;
}`,
  caseLabel: `int solution(int a, int b) {
    return a + b;
}`,
  scenario: `int* solution(int n, int arr[], size_t arr_len, size_t* ret_len) {
    *ret_len = arr_len;
    return arr;
}`,
};

nativeSuite(
  'c',
  {
    file: 'solution.c',
    build: [['gcc', '-O2', '-std=gnu11', '-o', 'main', 'solution.c', '-lm']],
    run: ['./main'],
  },
  { ...C_CODE, ...C_EXT },
);
