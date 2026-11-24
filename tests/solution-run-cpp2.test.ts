/** The other half of the C++ cases (tests/solution-run-cpp.test.ts), run in parallel with it. */
import { runCases } from './helpers/solution-run-shared';

runCases(['cpp'], { index: 1, of: 2 });
