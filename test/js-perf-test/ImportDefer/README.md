# ImportDefer benchmark

Synthetic benchmark for the **import defer** proposal (`import defer * as ns from "..."`),
enabled by the `--js-defer-import-eval` flag. It demonstrates, from multiple angles, where
deferring a module's evaluation until first use wins, by how much, and where it regresses.

Without `--js-defer-import-eval`, `import defer` is a syntax error. With the flag, plain
`import` still works, so each scenario ships an **eager control** (`import * as`) and a
**deferred arm** (`import defer * as`) that differ only in the import keyword.

## Running locally

Run from **inside this directory** — relative specifiers inside `Realm.eval` resolve
relative to the process cwd, and the perf harness (`tools/run_perf.py`) already runs d8
with the suite path as cwd:

```
cd test/js-perf-test/ImportDefer
../../../out/arm64.release/d8 --allow-natives-syntax --js-defer-import-eval wallclock.js
../../../out/arm64.release/d8 --allow-natives-syntax --js-defer-import-eval run.js
```

The fixtures self-check (the `__sideEffect` assertions and `m.value !== 190 * iterations`)
and throw on failure, so a clean run that prints the expected score lines is a pass.

## Two drivers, two score conventions

The `(Score)` suffix is just the generic token the perf harness regex captures — it does
**not** mean "points". Each driver uses a different unit and direction:

| Driver         | Unit          | Direction       | Measures                                  |
|----------------|---------------|-----------------|-------------------------------------------|
| `wallclock.js` | ms (`units: "ms"`) | **lower** is better | one-time load/evaluation cost           |
| `run.js`       | ops/sec (`score`)  | **higher** is better | steady-state per-access cost            |

Absolute numbers are machine- and run-dependent and noisy. The signal is always the
**eager-vs-deferred comparison within a single run**, not the absolute value. Float tails
like `1.5330000000000013` are subtraction artifacts — read them as `~1.53 ms`.

### `wallclock.js` — how the ms score is produced

`measure()` → `loadOnce()` times one load: create a **fresh `Realm`** (empty per-context
module map, so the graph re-evaluates every time), `t0 = performance.now()`, run
`import(<entrypoint>)` + `%PerformMicrotaskCheckpoint()` (which resolves the whole graph
synchronously), then `tLoad = performance.now() - t0`. `measure()` discards 5 warmup loads,
times 30 more, and reports the **median `tLoad`**. Parse+compile happens for both eager and
deferred (bytecode is not deferred), so **eager − deferred isolates the skipped evaluation
cost**.

Lines beginning with `#` are human-readable annotations; the harness regex ignores them, so
they never become a dashboard metric.

## The arms

| Arm           | Driver     | What it shows                                                        | Expectation |
|---------------|------------|---------------------------------------------------------------------|-------------|
| NsNoAccess    | wallclock  | Heavy module imported but the namespace is **never read**           | Deferred ≫ faster — evaluation skipped entirely (the headline win) |
| Latency       | wallclock  | Module used, but only after a startup milestone; score = time **to the milestone** | Deferred reaches the milestone much faster; the `# total` note shows totals ≈ equal — defer **moves** the cost to first use, it doesn't remove it |
| LargeBytecode | wallclock  | **Compile-bound** dependency: large top-level bytecode (~1MB), trivial to evaluate (body behind a runtime-false guard) | Deferred is **barely** faster — `import defer` skips evaluation only, while parsing/bytecode generation happen eagerly even when deferred. The cost is in compilation, which defer does *not* save: the "defer bytecode generation" opportunity. |
| AlwaysUsed    | wallclock  | Defer, then access the namespace **immediately** at top level       | Roughly equal / direction-only: defer evaluates anyway and gains nothing, paying a tiny deferred-namespace setup cost that is below measurement noise (defer's worst case) |
| HotAccess     | run        | Deferred namespace read in a tight loop                             | Deferred **similar** ops/sec — the first read on a `JSDeferredModuleNamespace` pays a guard check, but once IC is installed, the overhead should be 0 |

## Files

```
run.js                    BenchmarkSuite throughput driver (HotAccess arms)
wallclock.js              fresh-Realm wall-clock driver (NsNoAccess/Latency/LargeBytecode/AlwaysUsed)

heavy-loop.js             leaf: expensive top-level loop + __sideEffect flag (NsNoAccess/Latency/AlwaysUsed)
heavy-toplevel.js         leaf: large top-level -> large bytecode (LargeBytecode)
light-leaf.js             cheap control leaf
value.js                  mutable-export module (mirrors legacy Modules/value.js) for HotAccess

ns-no-access-eager.js  / ns-no-access-defer.js
latency-eager.js       / latency-defer.js
large-bytecode-eager.js/ large-bytecode-defer.js
alwaysused-eager.js    / alwaysused-defer.js
hotaccess-eager.js     / hotaccess-defer.js
```

## Perf-harness registration

This suite has its **own standalone config**, `test/js-perf-test/ImportDefer.json` (it is
deliberately *not* part of the bulk `JSTests1..5.json` grouping, so it only runs when a
runner/bot is pointed at `ImportDefer.json` explicitly — mirroring `ClassFields.json`,
`RegExp.json`, etc.). Structure: a root `ImportDefer` node holding the shared flags
(`--allow-natives-syntax --js-defer-import-eval`) and `base.js`, with two child runnables:

- `Throughput` → `run.js`, `units: "score"` (ops/sec, higher is better)
- `WallClock`  → `wallclock.js`, `units: "ms"` (load time, lower is better)

Run the whole suite through the harness with:

```
tools/run_perf.py --arch arm64 --binary-override-path out/arm64.release/d8 \
  test/js-perf-test/ImportDefer.json
```
