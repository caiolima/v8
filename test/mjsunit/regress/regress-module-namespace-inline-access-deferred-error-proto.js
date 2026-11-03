// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --bundle --js-defer-import-eval --allow-natives-syntax --turbofan

// JS_BUNDLE_MODULE:throws.mjs
globalThis.throws_evaluated = true;
export const z = 1;
throw new Error('throws');

// JS_BUNDLE_MODULE_ENTRYPOINT
import defer * as throws from './throws.mjs';

// Same as the receiver case, but with the deferred namespace on the prototype
// chain: an optimized load of an absent name must evaluate the module and
// rethrow its evaluation error.
function loadNope(o, doRead) {
  if (!doRead) return 0;
  return o.nope;
}
function thenAndNope(o, doRead) {
  let _ = o.then;
  return loadNope(o, doRead);
}

const dummyObjs = [{a: 1}, {b: 2}, {c: 3}, {d: 4}, {e: 5}, {f: 6}];
const throwsChild = Object.create(throws);
%PrepareFunctionForOptimization(loadNope);
%PrepareFunctionForOptimization(thenAndNope);
for (const obj of dummyObjs) loadNope(obj, true);
thenAndNope(throwsChild, false);
%OptimizeFunctionOnNextCall(thenAndNope);
thenAndNope(throwsChild, false);
assertOptimized(thenAndNope);
assertEquals(undefined, globalThis.throws_evaluated);
assertThrows(() => thenAndNope(throwsChild, true), Error, 'throws');
assertTrue(globalThis.throws_evaluated);
assertThrows(() => throwsChild.z, Error, 'throws');
