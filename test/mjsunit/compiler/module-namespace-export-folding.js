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

// JS_BUNDLE_MODULE:self-evaluating.mjs
import * as self from './self-evaluating.mjs';
// Accesses through the module's own namespace while it is still evaluating are
// not folded, but still read the (initialized) export.
export var value = 7;
{
  const o = Object.create(self);
  function load(o) { return o.value; }
  %PrepareFunctionForOptimization(load);
  assertEquals(7, load(o));
  assertEquals(7, load(o));
  %OptimizeFunctionOnNextCall(load);
  assertEquals(7, load(o));
  assertOptimized(load);
  value = 8;
  assertEquals(8, load(o));
}

// JS_BUNDLE_MODULE:deferred-inferred-map-missing.mjs
globalThis.inferredMapMissingEvaluated = true;
export var value = 7;

// JS_BUNDLE_MODULE:data.json
{"answer": 42}

// JS_BUNDLE_MODULE_ENTRYPOINT
import * as plain from './plain.mjs';
import defer * as evaluatedNs from './deferred-evaluated.mjs';
import defer * as unevaluatedNs from './deferred-unevaluated.mjs';
import defer * as inferredMapNs from './deferred-inferred-map.mjs';
import defer * as inferredMapMissingNs from './deferred-inferred-map-missing.mjs';
import defer * as json from './data.json' with {type: 'json'};
import * as selfEvaluating from './self-evaluating.mjs';

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

// Feedback recorded on a namespace map that has since been migrated. The
// earlier cases made {plain}'s map fast; normalizing {plain} moves its
// PrototypeInfo to a new dictionary map and resets the old map's field to
// Smi::zero(). Unlike a fast-to-fast prototype migration, this does not
// abandon the old map, so the compiler still sees it in {load}'s feedback and
// must not treat its prototype_info as a PrototypeInfo.
{
  function load(ns) { return ns.exported; }
  %PrepareFunctionForOptimization(load);
  assertEquals(1, load(plain));
  assertEquals(1, load(plain));
  assertTrue(%HasFastProperties(plain));
  %OptimizeObjectForAddingMultipleProperties(plain, 1);
  assertFalse(%HasFastProperties(plain));
  %OptimizeFunctionOnNextCall(load);
  assertEquals(1, load(plain));
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

// The compiler can look up a property of an unevaluated deferred namespace
// without any feedback for it: an own-property read emits a map check on {o},
// and the later {o.value} or {o.missing} uses that inferred map instead of its
// feedback (which only saw {other}). Neither access may be folded: a direct
// cell load for {value} would skip evaluation and return the var's link-time
// undefined, and a not-found {missing} would skip evaluation as well (a
// deferred namespace evaluates its module on any string key). Each read uses
// its own module, since whichever runs first evaluates it.
{
  const other = {own: 0, value: 'other', missing: 'other'};
  function load(o, key) {
    const own = o.own;
    if (key === 'value') return o.value;
    if (key === 'missing') return o.missing;
    return own;
  }
  function makeObject(ns) {
    const o = Object.create(ns);
    Object.defineProperty(
        o, 'own',
        {value: 0, writable: true, enumerable: true, configurable: true});
    return o;
  }
  const o = makeObject(inferredMapNs);
  const oMissing = makeObject(inferredMapMissingNs);
  %PrepareFunctionForOptimization(load);
  assertEquals(0, load(o));
  assertEquals(0, load(oMissing));
  assertEquals('other', load(other, 'value'));
  assertEquals('other', load(other, 'missing'));
  %OptimizeFunctionOnNextCall(load);
  assertEquals(0, load(o));
  assertOptimized(load);

  assertEquals(undefined, globalThis.inferredMapEvaluated);
  assertEquals(6, load(o, 'value'));
  assertTrue(globalThis.inferredMapEvaluated);

  assertEquals(undefined, globalThis.inferredMapMissingEvaluated);
  assertEquals(undefined, load(oMissing, 'missing'));
  assertTrue(globalThis.inferredMapMissingEvaluated);
}

// Once the module is evaluated, the same access through its namespace is
// folded.
{
  const o = Object.create(selfEvaluating);
  function load(o) { return o.value; }
  %PrepareFunctionForOptimization(load);
  assertEquals(8, load(o));
  assertEquals(8, load(o));
  %OptimizeFunctionOnNextCall(load);
  assertEquals(8, load(o));
  assertOptimized(load);
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
