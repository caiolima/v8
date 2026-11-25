// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --js-defer-import-eval --bundle --allow-natives-syntax
// Flags: --turbofan --maglev

// A synchronous module in a cycle with a top-level-await module is already
// kEvaluated while its cycle root is still kEvaluatingAsync, and it stays
// kEvaluated if the root fails later on. Optimized code must not fold accesses
// to its deferred namespace before the whole strongly connected component has
// finished evaluating successfully: until then they have to throw a TypeError
// while the root is pending, and the root's error once it has failed.
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
throw new Error('fail-root failed');

// JS_BUNDLE_MODULE_ENTRYPOINT
import {okStarted, unblockOk, failStarted, unblockFail} from 'setup.mjs';

function maglev(f) {
  %OptimizeMaglevOnNextCall(f);
}
function turbofan(f) {
  %OptimizeFunctionOnNextCall(f);
}

// Returns a closure that runs {access} on the namespace {ns}, named {o} in
// {access}, from code optimized by {optimize}.
//
// The access has never run on the namespace before, as that would already
// throw. Instead it is megamorphic and gets inlined after a load of "then",
// which is not an evaluation trigger: that load gives the compiler the map of
// the namespace, which it then uses for the access.
//
// The functions get a unique source on every call. Otherwise the compilation
// cache would make all the cases share their feedback and optimized code.
let functionId = 0;
function optimizedAccess(access, ns, optimize) {
  const id = `/* ${functionId++} */`;
  const inner = new Function(
      'o', 'doRead', `${id} if (!doRead) return 0; return ${access};`);
  const outer = new Function(
      'inner', 'o', 'doRead', `${id} let _ = o.then; return inner(o, doRead);`);
  %PrepareFunctionForOptimization(inner);
  %PrepareFunctionForOptimization(outer);
  inner({a: 1}, true);
  inner({b: 2}, true);
  inner({c: 3}, true);
  inner({d: 4}, true);
  inner({e: 5}, true);
  inner({f: 6}, true);
  outer(inner, ns, false);
  optimize(outer);
  outer(inner, ns, false);
  assertOptimized(outer);
  return () => outer(inner, ns, true);
}

// The cycle root is still evaluating asynchronously.
const okDone = import('./ok-root.mjs');
await okStarted.promise;
const okNs = globalThis.okNs;

assertThrows(optimizedAccess('o.x', okNs, maglev), TypeError);
assertThrows(optimizedAccess('o.absent', okNs, maglev), TypeError);
assertThrows(optimizedAccess('"x" in o', okNs, maglev), TypeError);
assertThrows(optimizedAccess('"absent" in o', okNs, maglev), TypeError);
assertThrows(optimizedAccess('o.x', okNs, turbofan), TypeError);
assertThrows(optimizedAccess('o.absent', okNs, turbofan), TypeError);
assertThrows(optimizedAccess('"x" in o', okNs, turbofan), TypeError);
assertThrows(optimizedAccess('"absent" in o', okNs, turbofan), TypeError);

unblockOk.resolve();
await okDone;

// The cycle root finished, so the same accesses succeed now.
assertEquals(42, optimizedAccess('o.x', okNs, maglev)());
assertEquals(undefined, optimizedAccess('o.absent', okNs, maglev)());
assertEquals(true, optimizedAccess('"x" in o', okNs, maglev)());
assertEquals(false, optimizedAccess('"absent" in o', okNs, maglev)());
assertEquals(42, optimizedAccess('o.x', okNs, turbofan)());
assertEquals(undefined, optimizedAccess('o.absent', okNs, turbofan)());
assertEquals(true, optimizedAccess('"x" in o', okNs, turbofan)());
assertEquals(false, optimizedAccess('"absent" in o', okNs, turbofan)());

// They can also be optimized with their own feedback.
function read() {
  return okNs.x;
}
%PrepareFunctionForOptimization(read);
assertEquals(42, read());
assertEquals(42, read());
%OptimizeFunctionOnNextCall(read);
assertEquals(42, read());
assertOptimized(read);

// The cycle root fails after its dependency was evaluated.
const failDone = import('./fail-root.mjs');
await failStarted.promise;
const failNs = globalThis.failNs;

unblockFail.resolve();
let error;
try {
  await failDone;
} catch (e) {
  error = e;
}
assertEquals('fail-root failed', error.message);

assertThrows(optimizedAccess('o.x', failNs, maglev), Error, 'fail-root failed');
assertThrows(
    optimizedAccess('o.absent', failNs, maglev), Error, 'fail-root failed');
assertThrows(
    optimizedAccess('"x" in o', failNs, maglev), Error, 'fail-root failed');
assertThrows(
    optimizedAccess('"absent" in o', failNs, maglev), Error,
    'fail-root failed');
assertThrows(
    optimizedAccess('o.x', failNs, turbofan), Error, 'fail-root failed');
assertThrows(
    optimizedAccess('o.absent', failNs, turbofan), Error, 'fail-root failed');
assertThrows(
    optimizedAccess('"x" in o', failNs, turbofan), Error, 'fail-root failed');
assertThrows(
    optimizedAccess('"absent" in o', failNs, turbofan), Error,
    'fail-root failed');
