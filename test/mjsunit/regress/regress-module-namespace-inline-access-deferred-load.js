// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --bundle --js-defer-import-eval --allow-natives-syntax --turbofan

// JS_BUNDLE_MODULE:mod.mjs
globalThis.deferred_evaluated = true;
export const x = 1;

// JS_BUNDLE_MODULE_ENTRYPOINT
import defer * as dns from './mod.mjs';

// Accessing an absent non-symbol, non-"then" property on an unevaluated
// JSDeferredModuleNamespace in optimized code must still trigger synchronous
// evaluation of the deferred module. "then" is not an evaluation trigger, so
// it is used to collect feedback for the namespace's map without evaluating
// the module.
function getNonExistent(o, doRead) {
  if (!doRead) return 0;
  return o.nonExistent;
}

function caller(o, doRead) {
  let _ = o.then;
  return getNonExistent(o, doRead);
}

const dummyObjs = [{a: 1}, {b: 2}, {c: 3}, {d: 4}, {e: 5}, {f: 6}];
%PrepareFunctionForOptimization(getNonExistent);
%PrepareFunctionForOptimization(caller);
for (const obj of dummyObjs) getNonExistent(obj, true);
caller(dns, false);
%OptimizeFunctionOnNextCall(caller);
caller(dns, false);
assertOptimized(caller);
assertEquals(undefined, globalThis.deferred_evaluated);
assertEquals(undefined, caller(dns, true));
assertTrue(globalThis.deferred_evaluated);
