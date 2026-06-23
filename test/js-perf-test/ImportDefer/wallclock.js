// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Wall-clock driver for the ImportDefer benchmark. Each timed iteration
// loads a scenario entrypoint into a FRESH Realm, so the per-context
// module map is empty and the module graph re-evaluates every time.
// Parse+compile happens for both eager and deferred arms (bytecode is
// not deferred today), so the eager-minus-deferred delta isolates the
// skipped EVALUATION cost.
//
// NOTE: relative specifiers inside Realm.eval resolve relative to cwd,
// so this driver must be run from test/js-perf-test/ImportDefer/.
d8.file.execute('../base.js');

function median(a) {
  a = a.slice().sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

// One fresh-Realm load. `postImport`, if set, is a string eval'd in the
// child realm AFTER the load is timed (used to trigger a deferred access).
function loadOnce(specifier, postImport) {
  const idx = Realm.create();
  Realm.eval(idx, "globalThis.__sideEffect = 0;");
  const t0 = performance.now();
  Realm.eval(idx,
      "globalThis.__p = import(" + JSON.stringify(specifier) +
      ").then(m => { globalThis.__m = m; });");
  %PerformMicrotaskCheckpoint();   // graph fully resolves synchronously here
  const tLoad = performance.now() - t0;
  let tFull = tLoad;
  if (postImport) {
    Realm.eval(idx, postImport);
    tFull = performance.now() - t0;
  }
  const sideEffect = Realm.eval(idx, "globalThis.__sideEffect | 0");
  Realm.dispose(idx);
  return { tLoad, tFull, sideEffect };
}

function measure(specifier, opts) {
  opts = opts || {};
  const warmup = opts.warmup === undefined ? 5 : opts.warmup;
  const N = opts.N === undefined ? 30 : opts.N;
  const postImport = opts.postImport || null;
  for (let i = 0; i < warmup; i++) loadOnce(specifier, postImport);
  const loads = [], fulls = [];
  let sideEffect = null;
  for (let i = 0; i < N; i++) {
    const r = loadOnce(specifier, postImport);
    loads.push(r.tLoad);
    fulls.push(r.tFull);
    sideEffect = r.sideEffect;
  }
  return { load: median(loads), full: median(fulls), sideEffect };
}

function report(name, score) {
  print(name + '-ImportDeferWallClock(Score): ' + score);
}

function note(msg) {
  print('# ' + msg);
}

// --- NsNoAccess: heavy module's only use site is never reached ---
// Expectation: deferred MUCH faster (evaluation skipped entirely).
{
  const e = measure('./ns-no-access-eager.js');
  const d = measure('./ns-no-access-defer.js');
  if (e.sideEffect !== 1) throw new Error('NsNoAccess: eager arm skipped eval');
  if (d.sideEffect !== 0) throw new Error('NsNoAccess: deferred arm evaluated');
  report('NsNoAccessEager', e.load);
  report('NsNoAccessDefer', d.load);
  note('NsNoAccess eager-defer delta (ms, eval skipped) = ' + (e.load - d.load));
}

// --- Latency: module used, but only after a startup milestone ---
// Expectation: deferred reaches the milestone (load) faster; total (full)
// converges once finish() forces the deferred evaluation.
{
  const e = measure('./latency-eager.js', { postImport: "globalThis.__m.finish()" });
  const d = measure('./latency-defer.js', { postImport: "globalThis.__m.finish()" });
  if (e.sideEffect !== 1) throw new Error('Latency: eager arm skipped eval');
  if (d.sideEffect !== 1) throw new Error('Latency: deferred arm never evaluated after finish()');
  report('LatencyEager', e.load);
  report('LatencyDefer', d.load);
  note('Latency milestone delta (ms, eager-defer) = ' + (e.load - d.load));
  note('Latency total eager=' + e.full + ' defer=' + d.full + ' (expected ~equal)');
}

// --- LargeBytecode: compile-bound module (defer does NOT help) ---
// heavy-toplevel.js is a COMPILE-bound module: a large top-level body that
// is expensive to parse + generate bytecode for, but trivial to evaluate
// (the body sits behind a runtime-false guard, so it is compiled but never
// run). The point of this arm is the inversion of the others: because
// `import defer` skips EVALUATION only -- not parsing/bytecode generation,
// which happen eagerly even for a deferred module -- the deferred arm here
// is barely faster than eager. The cost lives in compilation, which is not
// deferred today. This is the "defer bytecode generation" opportunity.
//
// Bytecode note (manual, run with --module --print-bytecode):
//   heavy-toplevel.js top-level Bytecode length = 409649 bytes, IDENTICAL
//   eager vs deferred -- the deferred arm still generates all of it.
//
// LargeBytecodeDefer is therefore NOT a "win" score: it stays large because
// it is dominated by parse+compile. The eager-defer delta is the small
// evaluation slice defer manages to skip, expected to be a tiny fraction of
// the total -- contrast with NsNoAccess, where the delta is almost the whole
// load.
{
  const e = measure('./large-bytecode-eager.js');
  const d = measure('./large-bytecode-defer.js');
  if (e.sideEffect !== 1) throw new Error('LargeBytecode: eager arm skipped eval');
  if (d.sideEffect !== 0) throw new Error('LargeBytecode: deferred arm evaluated');
  report('LargeBytecodeEager', e.load);
  report('LargeBytecodeDefer', d.load);
  note('LargeBytecode eager-defer delta (ms, eval skipped) = ' + (e.load - d.load));
}

// --- AlwaysUsed: defer then access unconditionally right after import ---
// Both arms evaluate during the load (deferred access happens at top
// level), so the deferred arm is slightly slower: setup + no skip.
{
  const e = measure('./alwaysused-eager.js');
  const d = measure('./alwaysused-defer.js');
  if (e.sideEffect !== 1) throw new Error('AlwaysUsed: eager arm skipped eval');
  if (d.sideEffect !== 1) throw new Error('AlwaysUsed: deferred arm did not evaluate');
  report('AlwaysUsedEager', e.load);
  report('AlwaysUsedDefer', d.load);
  note('AlwaysUsed defer-eager overhead (ms) = ' + (d.load - e.load));
}
