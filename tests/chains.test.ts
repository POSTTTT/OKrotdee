import { describe, expect, it } from "vitest";

import { chains } from "../src/chains";
import type { ContractRow } from "../src/db";

/** Only the fields the grouping reads; the rest never enters into it. */
const row = (id: number, refinanced_from: number | null = null) =>
  ({ id, refinanced_from }) as ContractRow;

describe("grouping refinanced contracts", () => {
  it("keeps a contract and the one it replaced together", () => {
    const groups = chains([row(2, 1), row(1), row(3)]);
    expect(groups.map((g) => g.map((c) => c.id))).toEqual([[2, 1], [3]]);
  });

  it("gathers a chain of three under the deal it started as", () => {
    const groups = chains([row(3, 2), row(2, 1), row(1)]);
    expect(groups.map((g) => g.map((c) => c.id))).toEqual([[3, 2, 1]]);
  });

  it("stands a contract alone when the one it replaced is filtered out", () => {
    const groups = chains([row(2, 1), row(4, 3)]);
    expect(groups.map((g) => g.map((c) => c.id))).toEqual([[2], [4]]);
  });

  it("does not hang on rows pointing at each other", () => {
    const groups = chains([row(1, 2), row(2, 1)]);
    expect(groups.flat()).toHaveLength(2);
  });
});
