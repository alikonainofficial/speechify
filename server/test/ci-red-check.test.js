import { expect, it } from "vitest";

// Deliberately failing: proves CI turns red. Reverted in the next commit.
it("fails on purpose to check that CI can fail", () => {
  expect(1 + 1).toBe(3);
});
