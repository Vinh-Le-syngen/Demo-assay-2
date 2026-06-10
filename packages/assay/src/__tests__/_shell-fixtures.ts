// Shell-test SOURCE fixtures for assay's own noShells self-tests. These strings deliberately
// contain the very patterns detectShells looks for (static skip, tautology, no-expect) — they are
// the inputs the detector must flag. They live in this non-`.test.` module (so assay's testPattern
// `\.(test|spec)\.(ts|tsx)$` neither discovers nor scans them) precisely so the noShells gate does
// not false-positive on the detector's own test files. Fed to memHost() at runtime by the tests.
export const SHELL_NO_EXPECT = 'it("x", () => { const a = 1 })'
export const SHELL_STATIC_SKIP = 'describe.skip("x", () => { expect(1).toBe(1) })'
export const SHELL_TAUTOLOGY = 'it("x", () => { expect(true).toBe(true) })'
export const SHELL_SNEAKY = 'describe.skip("looks real", () => { it("x", () => { expect(true).toBe(true) }) })'
