import { useState } from "react";

import type { ContractRow } from "./db";

/**
 * Contracts written to replace one another, gathered into one block, newest
 * first. A refinanced deal is the same client and the same car, and reading
 * it as two unrelated rows halfway down a list tells the staff nothing.
 */
export function chains(rows: ContractRow[]): ContractRow[][] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const rootOf = (row: ContractRow): number => {
    let current = row;
    // A chain is short; the bound is only so a row pointing at itself, or a
    // pair pointing at each other, cannot hang the list.
    for (let step = 0; step < rows.length; step++) {
      const parent = current.refinanced_from ? byId.get(current.refinanced_from) : undefined;
      if (!parent) break;
      current = parent;
    }
    return current.id;
  };

  const groups = new Map<number, ContractRow[]>();
  for (const row of rows) {
    const key = rootOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()];
}

/** One line of a contract list: the contract, and where it sits in its block. */
export interface ChainRow {
  contract: ContractRow;
  /** How many contracts the deal has been written on, this one included. */
  times: number;
  /** 0 for the contract in force; the rest are the ones it replaced. */
  index: number;
  /** Its place in the deal counting from the first contract signed. */
  ordinal: number;
  /** Whether the block below the newest contract is unfolded. */
  open: boolean;
  /** Set only while a block of more than one row is showing. */
  className?: string;
}

/**
 * Contract lists show the deal as it stands now: a refinanced one is a single
 * row saying how many times it has been written, and the contracts it replaced
 * are there to be unfolded when someone asks for them.
 */
export function useChains(contracts: ContractRow[]): {
  rows: ChainRow[];
  toggle: (id: number) => void;
} {
  const [open, setOpen] = useState<number[]>([]);

  const rows = chains(contracts).flatMap((group) => {
    const unfolded = open.includes(group[0].id);
    const shown = unfolded ? group : group.slice(0, 1);
    return shown.map((contract, index) => ({
      contract,
      times: group.length,
      index,
      // The list runs newest first, so the oldest contract is number one.
      ordinal: group.length - index,
      open: unfolded,
      className:
        shown.length > 1
          ? `chain${index === shown.length - 1 ? " chain-end" : ""}`
          : undefined,
    }));
  });

  const toggle = (id: number) =>
    setOpen((ids) => (ids.includes(id) ? ids.filter((old) => old !== id) : [...ids, id]));

  return { rows, toggle };
}
