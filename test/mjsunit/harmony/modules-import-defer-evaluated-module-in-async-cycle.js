// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --js-defer-import-eval --bundle --allow-natives-syntax --turbofan

// A synchronous module in a cycle with a top-level-await module is already
// kEvaluated while its cycle root is still kEvaluatingAsync, and it stays
// kEvaluated if the root fails later on. Its deferred namespace must not be
// treated as evaluated before the whole strongly connected component has
// finished evaluating successfully: until then every evaluation trigger has
// to go through EvaluateModuleSync, which throws a TypeError while the root is
// pending (ReadyForSyncExecution is false) and rethrows the root's error once
// it has failed. This must hold for the runtime, the inline caches and
// optimized code alike.
// https://tc39.es/proposal-defer-import-eval/#sec-GetModuleExportsList

// JS_BUNDLE_MODULE:setup.mjs
export const okStarted = Promise.withResolvers();
export const unblockOk = Promise.withResolvers();
export const failStarted = Promise.withResolvers();
export const unblockFail = Promise.withResolvers();

// JS_BUNDLE_MODULE:ok-dep.mjs
import './ok-root.mjs';
export let x = 42;

// JS_BUNDLE_MODULE:ok-root.mjs
import {okStarted, unblockOk} from 'setup.mjs';
import './ok-dep.mjs';
import defer * as ns from './ok-dep.mjs';
globalThis.okNs = ns;
okStarted.resolve();
await unblockOk.promise;
// This module is the cycle root and it is still evaluating.
assertThrows(() => ns.x, TypeError);
assertThrows(() => Reflect.ownKeys(ns), TypeError);

// JS_BUNDLE_MODULE:fail-dep.mjs
import './fail-root.mjs';
export let x = 43;

// JS_BUNDLE_MODULE:fail-root.mjs
import {failStarted, unblockFail} from 'setup.mjs';
import './fail-dep.mjs';
import defer * as ns from './fail-dep.mjs';
globalThis.failNs = ns;
failStarted.resolve();
await unblockFail.promise;
throw new Error('fail-root');

// JS_BUNDLE_MODULE_ENTRYPOINT
import {okStarted, unblockOk, failStarted, unblockFail} from 'setup.mjs';

// Every evaluation trigger of a deferred namespace. They are run repeatedly
// so that the inline caches get a chance to (wrongly) cache a handler.
const triggers = [
  ns => ns.x,
  ns => ns.absent,
  ns => 'x' in ns,
  ns => 'absent' in ns,
  ns => Reflect.ownKeys(ns),
  ns => Object.keys(ns),
  ns => { for (const key in ns) {} },
  ns => Object.getOwnPropertyDescriptor(ns, 'x'),
  ns => Object.hasOwn(ns, 'x'),
  ns => Reflect.deleteProperty(ns, 'x'),
  ns => Object.create(ns).x,
  ns => 'x' in Object.create(ns),
];

// Megamorphic accesses, which are handled by the generic stubs.
function megamorphicLoad(o) {
  return o.x;
}
function megamorphicHas(o) {
  return 'x' in o;
}
for (const o of
         [{x: 1}, {x: 1, a: 1}, {x: 1, b: 1}, {x: 1, c: 1}, {x: 1, d: 1}]) {
  megamorphicLoad(o);
  megamorphicHas(o);
}
triggers.push(
    megamorphicLoad, megamorphicHas, ns => megamorphicLoad(Object.create(ns)),
    ns => megamorphicHas(Object.create(ns)));

function assertEveryTriggerThrows(ns, ...expected) {
  for (let i = 0; i < 3; i++) {
    for (const trigger of triggers) {
      assertThrows(() => trigger(ns), ...expected);
    }
    // Symbol-like keys never trigger evaluation.
    assertEquals(undefined, ns.then);
    assertEquals('Deferred Module', ns[Symbol.toStringTag]);
  }
}

const dummyObjs = [{a: 1}, {b: 2}, {c: 3}, {d: 4}, {e: 5}, {f: 6}];

// Returns a closure running {access} on the namespace {o} from code optimized
// with {optimize}. "then" is not an evaluation trigger, so its load gives the
// compiler the map of the namespace for the inlined megamorphic access, even
// if the access itself was never executed on the namespace. The functions get
// a unique source on every call: otherwise the compilation cache would make
// the cases share their feedback.
let functionId = 0;
function optimizedAccess(access, ns, optimize) {
  const id = `/* ${functionId++} */`;
  const inner = new Function(
      'o', 'doRead', `${id} if (!doRead) return 0; return ${access};`);
  const outer = new Function(
      'inner', 'o', 'doRead', `${id} let _ = o.then; return inner(o, doRead);`);
  %PrepareFunctionForOptimization(inner);
  %PrepareFunctionForOptimization(outer);
  for (const obj of dummyObjs) inner(obj, true);
  outer(inner, ns, false);
  optimize(outer);
  outer(inner, ns, false);
  return () => outer(inner, ns, true);
}

const tiers = [
  f => { %OptimizeMaglevOnNextCall(f); },
  f => { %OptimizeFunctionOnNextCall(f); },
];

function assertOptimizedAccessesThrow(ns, ...expected) {
  for (const optimize of tiers) {
    for (const access of ['o.x', 'o.absent', '"x" in o', '"absent" in o']) {
      const run = optimizedAccess(access, ns, optimize);
      assertThrows(run, ...expected);
      assertThrows(run, ...expected);
    }
  }
}

// The cycle root is still evaluating asynchronously.
{
  const okDone = import('./ok-root.mjs');
  await okStarted.promise;
  const ns = globalThis.okNs;

  assertEveryTriggerThrows(ns, TypeError);
  assertOptimizedAccessesThrow(ns, TypeError);

  unblockOk.resolve();
  await okDone;

  // The cycle root finished: the same accesses now succeed, and can be cached
  // and optimized.
  for (let i = 0; i < 3; i++) {
    assertEquals(
        [42, undefined, true, false, ['x', Symbol.toStringTag], ['x']],
        triggers.slice(0, 6).map(trigger => trigger(ns)));
    assertEquals(
        {value: 42, writable: true, enumerable: true, configurable: false},
        Object.getOwnPropertyDescriptor(ns, 'x'));
    assertTrue(Object.hasOwn(ns, 'x'));
    assertFalse(Reflect.deleteProperty(ns, 'x'));
    assertEquals(42, Object.create(ns).x);
    assertTrue('x' in Object.create(ns));
    assertEquals(42, megamorphicLoad(ns));
    assertTrue(megamorphicHas(ns));
    assertEquals(42, megamorphicLoad(Object.create(ns)));
    assertTrue(megamorphicHas(Object.create(ns)));
  }
  for (const optimize of tiers) {
    assertEquals(42, optimizedAccess('o.x', ns, optimize)());
    assertEquals(undefined, optimizedAccess('o.absent', ns, optimize)());
    assertEquals(true, optimizedAccess('"x" in o', ns, optimize)());
    assertEquals(false, optimizedAccess('"absent" in o', ns, optimize)());
  }

  function read() {
    return ns.x;
  }
  %PrepareFunctionForOptimization(read);
  assertEquals(42, read());
  assertEquals(42, read());
  %OptimizeFunctionOnNextCall(read);
  assertEquals(42, read());
  assertOptimized(read);
}

// The cycle root fails after its dependency was evaluated.
{
  const failDone = import('./fail-root.mjs');
  await failStarted.promise;
  const ns = globalThis.failNs;

  assertEveryTriggerThrows(ns, TypeError);

  unblockFail.resolve();
  let error;
  try {
    await failDone;
  } catch (e) {
    error = e;
  }
  assertEquals('fail-root', error.message);

  // The dependency is still kEvaluated, but its namespace keeps rethrowing the
  // error of its cycle root.
  assertEveryTriggerThrows(ns, Error, 'fail-root');
  assertOptimizedAccessesThrow(ns, Error, 'fail-root');
  assertEveryTriggerThrows(ns, Error, 'fail-root');
}
