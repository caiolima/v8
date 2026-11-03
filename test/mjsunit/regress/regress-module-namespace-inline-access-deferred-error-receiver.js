// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --bundle --js-defer-import-eval --allow-natives-syntax --turbofan

// JS_BUNDLE_MODULE:throws.mjs
globalThis.throws_evaluated = true;
export const y = 1;
throw new Error('throws');

// JS_BUNDLE_MODULE_ENTRYPOINT
import defer * as throws from './throws.mjs';

// When the deferred module throws during evaluation, an optimized load of an
// absent name on the deferred namespace must evaluate the module and rethrow
// the error, not fold to undefined. "then" is not an evaluation trigger, so it
// is used to collect feedback for the namespace's map without evaluating the
// module.
function loadNope(o, doRead) {
  if (!doRead) return 0;
  return o.nope;
}
function thenAndNope(o, doRead) {
  let _ = o.then;
  return loadNope(o, doRead);
}

const dummyObjs = [{a: 1}, {b: 2}, {c: 3}, {d: 4}, {e: 5}, {f: 6}];
%PrepareFunctionForOptimization(loadNope);
%PrepareFunctionForOptimization(thenAndNope);
for (const obj of dummyObjs) loadNope(obj, true);
thenAndNope(throws, false);
%OptimizeFunctionOnNextCall(thenAndNope);
thenAndNope(throws, false);
assertOptimized(thenAndNope);
assertEquals(undefined, globalThis.throws_evaluated);
assertThrows(() => thenAndNope(throws, true), Error, 'throws');
assertTrue(globalThis.throws_evaluated);
// Later accesses keep rethrowing the evaluation error.
assertThrows(() => thenAndNope(throws, true), Error, 'throws');
assertThrows(() => throws.y, Error, 'throws');
