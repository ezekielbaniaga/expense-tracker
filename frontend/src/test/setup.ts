import * as matchers from "vitest-axe/matchers";
import type { AxeMatchers } from "vitest-axe/matchers";
import { expect } from "vitest";

expect.extend(matchers);

// vitest-axe's own types target the old Vi namespace, so Vitest's Matchers is extended here
declare module "vitest" {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> extends AxeMatchers {}
}
