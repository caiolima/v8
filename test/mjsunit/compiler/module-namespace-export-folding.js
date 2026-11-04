// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --bundle --js-defer-import-eval --allow-natives-syntax --turbofan

// JS_BUNDLE_MODULE:plain.mjs
export let exported = 1;

// JS_BUNDLE_MODULE:deferred-evaluated.mjs
export let value = 2;

// JS_BUNDLE_MODULE:deferred-unevaluated.mjs
globalThis.evaluated = true;
export let value = 3;

// JS_BUNDLE_MODULE:deferred-inferred-map.mjs
globalThis.inferredMapEvaluated = true;
// A var export is initialized (to undefined) at link time, so its cell holds
// no TDZ hole before evaluation.
export var value = 6;

// JS_BUNDLE_MODULE:data.json
{"answer": 42}

// JS_BUNDLE_MODULE_ENTRYPOINT
import * as plain from './plain.mjs';
import defer * as evaluatedNs from './deferred-evaluated.mjs';
import defer * as unevaluatedNs from './deferred-unevaluated.mjs';
import defer * as inferredMapNs from './deferred-inferred-map.mjs';
import defer * as json from './data.json' with {type: 'json'};

// A found export through a regular namespace prototype is folded.
{
  const o = Object.create(plain);
  function load(o) { return o.exported; }
  %PrepareFunctionForOptimization(load);
  assertEquals(1, load(o));
  assertEquals(1, load(o));
  %OptimizeFunctionOnNextCall(load);
  assertEquals(1, load(o));
  assertOptimized(load);
}

// A found export through an evaluated deferred namespace.
{
  assertEquals(2, evaluatedNs.value);
  const o = Object.create(evaluatedNs);
  function load(o) { return o.value; }
  %PrepareFunctionForOptimization(load);
  assertEquals(2, load(o));
  assertEquals(2, load(o));
  %OptimizeFunctionOnNextCall(load);
  assertEquals(2, load(o));
  assertOptimized(load);
}

// A found export through an unevaluated deferred namespace evaluates the
// module. Gathering feedback would evaluate it, so the function is optimized
// without feedback and the load deoptimizes: this checks behavior only. The
// next case reaches the compiler's "not evaluated" bailout.
{
  assertEquals(undefined, globalThis.evaluated);
  const o = Object.create(unevaluatedNs);
  function load(o) { return o.value; }
  %PrepareFunctionForOptimization(load);
  %OptimizeFunctionOnNextCall(load);
  assertEquals(undefined, globalThis.evaluated);
  assertEquals(3, load(o));
  assertTrue(globalThis.evaluated);
  assertEquals(3, load(o));
}

// The compiler can look up an export of an unevaluated deferred namespace
// without any feedback for it: an own-property read emits a map check on {o},
// and the later {o.value} uses that inferred map instead of its feedback
// (which only saw {other}). The access must not be folded to a direct cell
// load: that would skip evaluation and return the var's link-time undefined.
{
  const o = Object.create(inferredMapNs);
  Object.defineProperty(
      o, 'own', {value: 0, writable: true, enumerable: true, configurable: true});
  const other = {own: 0, value: 'other'};
  function load(o, read) {
    const own = o.own;
    if (read) return o.value;
    return own;
  }
  %PrepareFunctionForOptimization(load);
  assertEquals(0, load(o, false));
  assertEquals(0, load(o, false));
  assertEquals('other', load(other, true));
  assertEquals('other', load(other, true));
  %OptimizeFunctionOnNextCall(load);
  assertEquals(0, load(o, false));
  assertOptimized(load);
  assertEquals(undefined, globalThis.inferredMapEvaluated);
  assertEquals(6, load(o, true));
  assertTrue(globalThis.inferredMapEvaluated);
}

// A found export of a deferred JSON (synthetic) module.
{
  const o = Object.create(json);
  function load(o) { return o.default; }
  %PrepareFunctionForOptimization(load);
  assertEquals(42, load(o).answer);
  assertEquals(42, load(o).answer);
  %OptimizeFunctionOnNextCall(load);
  assertEquals(42, load(o).answer);
  assertOptimized(load);
}

// A store to a found export through a namespace prototype throws (modules
// are strict), both before and after optimization.
{
  const o = Object.create(plain);
  function store(o) { o.exported = 5; }
  %PrepareFunctionForOptimization(store);
  assertThrows(() => store(o), TypeError);
  assertThrows(() => store(o), TypeError);
  %OptimizeFunctionOnNextCall(store);
  assertThrows(() => store(o), TypeError);
  assertEquals(1, plain.exported);
  assertFalse(Object.hasOwn(o, 'exported'));
}
