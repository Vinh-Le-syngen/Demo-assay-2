# Week 3 — Presenter Notes
## `@sys/errors` & `@sys/release` · ~30 min

These are your **spoken instructions** — what to say, what to open, what to type, what to skip.
Keep this file open on a second screen or phone while presenting.

---

## Before You Start — Setup Checklist

Do these **before the call starts**, not during:

```
□ Terminal open, working directory: E:/Demo-assay-2
□ Two tabs ready in terminal:
    Tab 1 — will run release CLI commands
    Tab 2 — will run errors test
□ Editor open, these files pinned as tabs (in order):
    packages/errors/src/core.ts
    packages/errors/src/__tests__/core.test.ts
    packages/errors/docs/sample-registry.json
    packages/release/src/decide.ts
    packages/release/src/node-host.ts
    .releases/sets/baseline-2026.06.0.json   (won't exist yet — create it in step 7a)
□ Browser tab: open docs/week3-presentation-errors-release.md (rendered)
□ Run once to confirm everything works:
    node packages/release/dist/cli.js set create --name baseline
    pnpm --filter @sys/errors test
```

**Font size:** bump your editor and terminal to at least 18pt before the call. People on small screens can't read 13pt code.

---

## Timing Map

| Section | Time | Running total |
|---|---|---|
| Opening | 1 min | 1 min |
| `@sys/errors` — domain + problem | 3 min | 4 min |
| `@sys/errors` — contract check | 4 min | 8 min |
| `@sys/errors` — function walk-through | 4 min | 12 min |
| `@sys/errors` — tests + artifact | 3 min | 15 min |
| `@sys/release` — domain + pipeline | 3 min | 18 min |
| `@sys/release` — contract check (fast) | 2 min | 20 min |
| `@sys/release` — decide() + findings | 2 min | 22 min |
| `@sys/release` — live demo | 4 min | 26 min |
| Connecting the dots | 2 min | 28 min |
| Lessons from my week | 2 min | 30 min |

**Time trap:** the `alertPlan` function is interesting and you'll want to go deep — resist. Two examples max then move on.

---

## Opening (1 min)

Say:
> "Today's two packages sit at opposite ends of the error lifecycle. `@sys/errors` defines what errors *mean* — what's retryable, who gets woken up. `@sys/release` defines what a valid shipment *is* — and whether a consumer is actually running what they claim. Both make the same architectural bet: put the vocabulary in data, not code. I'll show you what that looks like in practice."

Don't start with definitions. Start with the bet.

---

---

## Part 1 — `@sys/errors` (15 min)

---

### Step 1 — The problem (3 min)

**Say:**
> "Before `@sys/errors`, every `catch` block made its own call on retryability. Somewhere in the codebase, someone wrote `if (err.code === 'ETIMEDOUT') retry()`. Twelve times. In twelve different files. Change the retryability of a database timeout? Find all twelve."

> "The fail-closed question is the important one: if you get an error you've *never seen before*, should you retry it? The safe answer is no. But scattered `catch` blocks don't have a safe default — they have no default."

> "What `@sys/errors` does is make the vocabulary a registry. Every code has a declared `retryable` field. `isRetryable` returns `false` for anything not in the registry. Unknown errors fail closed, by design."

**Show** (`packages/errors/src/core.ts`, scroll to line 51–53):
```typescript
export function isRetryable(registry: ErrorRegistry, code: string): boolean {
  return lookup(registry, code)?.retryable ?? false
}
```

Point at the `?? false` and say:
> "That `?? false` is a deliberate design decision, not a coincidence. Unknown code, unknown retryability — don't retry."

**Don't** explain the full `ErrorSpec` type yet. Save that for the contract check.

---

### Step 2 — Code shape + vocabulary as data (still in step 1)

**Show** the anatomy in the presentation doc (the `AUTH.TOKEN.INVALID_SIGNATURE` breakdown).

**Say:**
> "Codes follow `DOMAIN.AREA.CONDITION`. All uppercase, dot-separated. The domain vocabulary — `RT`, `INT`, `AUTH` — is declared per registry. One engine serves a substrate registry and a product registry simultaneously. Changing error taxonomy means changing JSON, not redeploying code."

---

### Step 3 — Contract check (4 min)

Open `packages/errors/src/core.ts`. You'll navigate to specific lines.

**Rule 1 — defineRegistry** (line 41):

Scroll to line 41. Say:
> "Composition root — `defineRegistry`. Runs the Zod schema at load time. If your registry has a malformed code or a missing required field, you find out when the server starts, not when the first error hits."

Show lines 21–38 (the two schemas). Say:
> "Two schemas — one for the spec, one for the registry. Both are exported, so downstream packages can import and run them directly."

**Rule 3 — zero app imports** (lines 1–16):

Scroll to the top. Say:
> "Three imports. Zod. `@sys/telemetry` — type-only, for the event contract. And the local types file. No product code, no stdlib, no Node APIs. This runs in any runtime."

**Rules 4 and 5** — say quickly:
> "Ships three entry points via tsup — index, core, types — ESM plus CJS. Classified in taxonomy as governance primary, observability secondary. All five rules pass."

**Time check:** you should be at ~8 min here.

---

### Step 4 — Walk three functions (4 min)

#### `validateRegistry` — show the source

Open `packages/errors/src/core.ts`, scroll to line 81.

**Say:**
> "This is the one you'd wire into CI. It returns a list of issues — empty means clean, non-empty means something is wrong with your registry definition. Six categories."

Read the six check types from the source (lines 90–107) out loud, but don't read the code — just the names:
> "Malformed code shape. Domain mismatch — the prefix doesn't match the declared domain. Off-vocabulary domain. Duplicate. Deprecated code with no successor. Successor pointing to a non-existent code."

**Say:**
> "That last one — `replacedBy` pointing to a non-existent code — is the kind of thing you discover when you refactor and delete the successor but forget to update the deprecated code. The validator catches it."

#### `alertPlan` — show with an example

Stay in `core.ts`, scroll to line 122.

**Say:**
> "Alert routing. Rules are evaluated in order — exact code match wins first, then prefix match, then domain match, then policy default, then no route and suppressed. First match wins."

Open `packages/errors/src/__tests__/core.test.ts`, scroll to line 95 (the policy setup). Walk one example:

**Say:**
> "This policy says: `INT.STRIPE.DECLINED` specifically → suppress. Anything starting with `RT.` → pager, fatal severity. `AUTH` domain → slack-security. Everything else → slack-ops."

Point at the `alertPlan` call on line 107–110 and say:
> "RT.DB.TIMEOUT hits the prefix rule. Gets pager, gets fatal. The rule overrides the spec's severity — the spec said 'error', the rule says 'fatal'. Rule wins."

**Don't** walk all five test cases. Two examples max.

#### `toTelemetryEvent` — one sentence

**Say:**
> "The third key function — `toTelemetryEvent` — converts an error occurrence into a `@sys/telemetry` event, domain 'error'. Unknown codes still emit, marked `registered: false`. The observability spine sees every error whether or not it's in the registry."

You don't need to show the source.

---

### Step 5 — Tests + artifact (3 min)

**Switch to** `packages/errors/src/__tests__/core.test.ts`.

**Say:**
> "Sixteen original test cases. Five describe blocks — each maps exactly to one public function. I ran these, they pass."

Scroll down past line 151 to the new `validateRegistry — gap coverage` describe block.

**Say:**
> "These three cases are the artifact — the small PR from this study. The interesting one is the middle one."

Read the comment aloud (line with `// A → B → A`):
> "Circular `replacedBy` chain. A is deprecated, succeeded by B. B is deprecated, succeeded by A. Both codes exist, so `validateRegistry` sees no dangling successors — it returns empty. The test doesn't say 'this is correct'. It says 'this is the current behaviour' — the comment documents it as a gap. That distinction matters."

**Say:**
> "The third case confirms that `defineRegistry` rejects structurally invalid input — passing `codes: 'not-an-array'` throws a ZodError. That's the Zod gate working. Worth pinning."

**Demo** (`packages/errors`):

Switch to terminal Tab 2. Run:
```bash
pnpm --filter @sys/errors test
```

Expected output:
```
Tests  19 passed (19)
```

Say:
> "19 passing. 16 original plus 3 new."

---

---

## Part 2 — `@sys/release` (12 min)

---

### Step 6 — The distinction + the forgery scenario (3 min)

**Say:**
> "One sentence: Changesets handles version bumps. `@sys/release` handles proving you shipped what you said you shipped."

> "Here's the problem. Qarar vendors `@sys` packages as tarballs during the publishing window — the time after Changesets rewrites ranges but before the packages appear on the registry. So the dep looks like this:"

Write or show:
```json
"@sys/canon": "file:vendor/sys-canon-1.0.0.tgz"
```

> "The filename says `1.0.0`. The `sys.lock.json` claims `1.0.0`. But inside the tarball — inside the packed `package/package.json` — someone accidentally bundled `0.9.0`. Old code ships. No error. Nothing in the CI catches it, because nothing was cracking the tarball open."

> "`@sys/release adoption validate` cracks it open."

**Show** `packages/release/src/node-host.ts`, line 59–65:
```typescript
readTarballManifest(relPath: string): TarballManifest | null {
  // ...
  const out = execFileSync('tar', ['-xOf', p, 'package/package.json'], {
```

**Say:**
> "One line. `tar -xOf <path> package/package.json`. Reads only the manifest inside the tarball without unpacking the whole thing. Then adoption validation compares that internal version to what the lock claims."

---

### Step 7 — Contract check (2 min, fast)

Open `packages/release/src/decide.ts`.

**Say:**
> "Contract check — fast version. `defineRelease()` is in `src/config.ts`. Empty Zod schema — the seam IS the config. Zod schemas in `src/schemas.ts` — calendar version regex, semver per package. Zero app imports, ships `dist/` plus a `bin` entry for the CLI. Classified `cross_runtime: true` in taxonomy because JSON schemas ship for Python and bash consumers. All five pass."

**Don't** open the schema file. Move straight to `decide()`.

---

### Step 8 — decide() (2 min)

Stay in `packages/release/src/decide.ts`. Show the whole file — it's 30 lines.

**Say:**
> "This is the whole decision engine. 30 lines. Pure function — no I/O, no time, no state."

Read the three lines aloud (17–21):
```typescript
const blocking = args.findings.some(
  f => f.severity === 'blocker' || (args.strict === true && f.severity === 'warning')
)
const warned   = args.findings.some(f => f.severity === 'warning')
const decision = blocking ? 'deny' : warned ? 'warn' : 'allow'
```

**Say:**
> "Blocker → deny. Warning in strict mode → deny. Warning without strict → warn. Everything else → allow. `--strict` is what CI uses. In strict mode, warnings are blockers. Zero tolerance."

> "The validation functions — adoption, release-set — produce findings. This function folds them into a verdict. That separation is intentional: validation and decision are independent concerns."

---

### Step 9 — Live demo (4 min)

Switch to terminal Tab 1. The commands go in this exact order.

#### 7a — Create the release set (dry run first)

```bash
node packages/release/dist/cli.js set create --name baseline
```

Expected: prints the JSON to stdout. Point at the output and say:
> "27 packages. The version of every `@sys/*` and `@eng/*` package in the workspace, snapshotted at this moment. Calendar version `2026.06.0`. Evidence: `pnpm-check passed`."

> "Notice: no semver. Release sets use `YYYY.MM.N`. This is a snapshot in time, not an API contract."

#### 7b — Save it

```bash
node packages/release/dist/cli.js set create --name baseline --write
```

Expected: `wrote .releases/sets/baseline-2026.06.0.json (27 packages, status: live)`

Open the file in the editor (`.releases/sets/baseline-2026.06.0.json`). Scroll through it briefly.

**Say:**
> "This file is the attestation. It's what gets committed to the repo. Once a set is live, it doesn't change — any change is a new version, `2026.06.1`."

#### 7c — Validate — ALLOW

```bash
node packages/release/dist/cli.js set validate
```

Expected: `ALLOW release_set:baseline@2026.06.0 — 0 finding(s)`

**Say:**
> "Allow. Zero findings. The workspace versions match what's in the set exactly."

#### 7d — Simulate drift → BLOCK

In the editor, open `.releases/sets/baseline-2026.06.0.json`. Find `@sys/errors` in the packages block. Change its version from `"0.0.1"` to `"0.0.2"`. Save.

**Say:**
> "I'm going to simulate what happens if someone bumped a package version without updating the release set. Edit one version — `@sys/errors` from `0.0.1` to `0.0.2`."

Back in the terminal:
```bash
node packages/release/dist/cli.js set validate
```

Expected output (approximate):
```
DENY release_set:baseline@2026.06.0 — 1 finding(s)
  [blocker] release_set_version_mismatch · @sys/errors
            set: 0.0.2 · workspace: 0.0.1
```

**Say:**
> "Deny. One blocker. The set claims 0.0.2, the workspace is still 0.0.1. In CI, this exits 1. The PR doesn't merge."

**Restore the file** — revert `@sys/errors` back to `"0.0.1"` and save. Say nothing, just do it.

---

---

## Connecting the Dots (2 min)

No code to show. Just talk.

**Say:**
> "The governance chain: `checkpoint` gates the git tree — is the branch clean, are you allowed to merge here? `gatekeeper` gates the promotion — did tests pass, is this an allowed edge, does it need human approval? `release` gates the version bundle — do the versions match what was declared, does the tarball contain what its filename claims?"

> "Three consecutive checkpoints before anything ships. Each one is pure — it takes data in, returns a verdict. None of them have side effects."

> "Both packages today make the same bet: put the vocabulary in data. `@sys/errors` puts error retryability and alert routes in a registry. `@sys/release` puts the release bundle in a JSON file. Changing either means changing data under review, not changing code. That's auditable. That's the pattern."

---

## Lessons from My Week (2 min)

These are casual. No notes on screen. Just talk.

The four points to hit (pick whichever resonate most honestly):

1. **The authoritative invariant** — "The `retryable` MUST NOT override rule is correct, but there's no linter that catches a `catch` block that bypasses `isRetryable` and hardcodes `true`. That's a code review concern, not a machine concern. Knowing the difference matters."

2. **Read the design doc first** — "`@sys/release` has a `docs/design.md` that explains the forgery scenario in two paragraphs. If I'd read that first I would have saved an hour of reading adoption validation test cases trying to figure out what problem they were solving."

3. **Gap tests are more valuable than happy-path tests** — "The circular `replacedBy` test doesn't assert a guarantee — it documents a gap. Writing it forced a precise understanding of what `validateRegistry` actually checks versus what someone might assume it checks. That distinction is the point."

4. **One thing to tell Monday-self** — "Read the test file before the source file. Tests show you what the author thought was worth specifying. Source shows you how they implemented it. The order matters."

---

## Handling Questions

**"Why not just use an enum for error codes?"**
> "You could. But an enum is code — it requires a deploy to add a new code. A registry is data — you can add codes without touching the engine. More importantly, one engine serves multiple registries. An enum can't do that."

**"What stops someone from calling `isRetryable` and ignoring the result?"**
> "Nothing. That's a discipline question, not a technical one. The test suite, code review, and the registry being the canonical source all enforce it socially. There's no runtime guard."

**"Why calendar versioning for release sets?"**
> "Release sets are snapshots, not API contracts. Semver communicates breaking changes in an interface — that's not what a release set communicates. `2026.06.0` tells you when it was cut, not what changed. The packages inside have semver; the bundle has calver."

**"Why does `defineRelease` have an empty Zod schema?"**
> "Because there are no scalar config fields for this package. The host seam IS the configuration. The empty schema still runs the Zod validation pass — it's there so the composition root pattern is consistent, not because there's anything to validate yet."

**"Could the tarball check be bypassed?"**
> "Yes, easily — the host is injected. A malicious host implementation could return anything from `readTarballManifest`. But the threat model is accidental mismatch, not deliberate tampering. For the deliberate case, you'd need repo access controls and signed artifacts."

---

## If You Run Long

Cut in this order:
1. Skip the `toTelemetryEvent` explanation — say "converts errors to telemetry events, unknown codes still emit" in one sentence.
2. Skip showing `alertPlan` source — just describe exact/prefix/domain precedence verbally.
3. Compress the contract check for `@sys/release` to one sentence per rule.
4. Skip step 7a (dry run) — go straight to `--write` then validate.

Never cut the drift demo (step 7d). That's the best 30 seconds of the whole talk.

---

## Quick Reference — File Locations

```
packages/errors/src/core.ts
  L19     CODE_RE regex (DOMAIN.AREA.CONDITION pattern)
  L21–32  errorSpecSchema
  L34–38  errorRegistrySchema
  L41–43  defineRegistry()
  L51–53  isRetryable() — the ?? false fail-closed
  L81–108 validateRegistry()
  L122–143 alertPlan()
  L151–183 toTelemetryEvent()

packages/errors/src/__tests__/core.test.ts
  L95–102  alertPlan policy setup
  L107–110 RT.DB.TIMEOUT prefix match example
  L152–185 new gap tests (empty, circular, Zod gate)

packages/release/src/decide.ts
  L16–30   entire decide() function

packages/release/src/node-host.ts
  L59–65   readTarballManifest — the tar shell-out

.releases/sets/baseline-2026.06.0.json
  (created during demo step 7b)
```
