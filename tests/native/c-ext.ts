/** The C solutions of the DSL extension cases (ext-cases.ts), for gcc and the browser's clang. */
import type { EXT_CASES } from './ext-cases';

export const C_EXT: Record<keyof typeof EXT_CASES, string> = {
  exprFlow: `long long solution(int n, int arr[], size_t arr_len, int** g, size_t g_rows, size_t g_cols) {
    long long s = 0;
    for (size_t i = 0; i < arr_len; i++) s += arr[i];
    return s * 100 + (long long)g_rows * 10 + (long long)g_cols;
}`,
  blockCount: `char** solution(int n, int k[], size_t k_len, const char* name[], size_t name_len, int** items, size_t items_rows, size_t items_cols[], size_t* ret_len) {
    char** r = (char**)malloc(sizeof(char*) * (name_len + 1));
    for (size_t i = 0; i < name_len; i++) {
        int s = 0;
        for (size_t j = 0; j < items_cols[i]; j++) s += items[i][j];
        r[i] = (char*)malloc(strlen(name[i]) + 16);
        sprintf(r[i], "%s:%d", name[i], s);
    }
    *ret_len = name_len;
    return r;
}`,
  blockUntil: `int* solution(int m[], size_t m_len, int** vals, size_t vals_rows, size_t vals_cols[], int x[], size_t x_len, int y[], size_t y_len, size_t* ret_len) {
    int* r = (int*)malloc(sizeof(int) * (vals_rows + x_len + 1));
    size_t k = 0;
    for (size_t i = 0; i < vals_rows; i++) {
        int b = vals[i][0];
        for (size_t j = 1; j < vals_cols[i]; j++) if (vals[i][j] > b) b = vals[i][j];
        r[k++] = b;
    }
    for (size_t i = 0; i < x_len; i++) r[k++] = x[i] * y[i];
    *ret_len = k;
    return r;
}`,
  endConds: `long long solution(int n, const char* words[], size_t words_len, int p[], size_t p_len) {
    long long s = 0;
    for (size_t i = 0; i < p_len; i++) s += p[i];
    return n + (long long)words_len * 10 + s * 100;
}`,
  rawLines: `char** solution(const char* t, int n, const char* ls[], size_t ls_len, const char* mid[], size_t mid_len, const char* rest[], size_t rest_len, size_t* ret_len) {
    const char** all[] = {&t, ls, mid, rest};
    size_t lens[] = {1, ls_len, mid_len, rest_len}, k = 0;
    char** r = (char**)malloc(sizeof(char*) * (1 + ls_len + mid_len + rest_len));
    for (int a = 0; a < 4; a++) {
        for (size_t i = 0; i < lens[a]; i++) {
            r[k] = (char*)malloc(strlen(all[a][i]) + 3);
            sprintf(r[k++], "[%s]", all[a][i]);
        }
    }
    *ret_len = k;
    return r;
}`,
};
