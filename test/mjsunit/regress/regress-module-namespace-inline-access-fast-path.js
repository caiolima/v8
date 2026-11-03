// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --bundle --js-defer-import-eval --allow-natives-syntax --turbofan

// JS_BUNDLE_MODULE:mod1.mjs
export const exported = 1;

// JS_BUNDLE_MODULE:mod2.mjs
export const x = 1;

// JS_BUNDLE_MODULE_ENTRYPOINT
import * as ns from './mod1.mjs';
import defer * as dns from './mod2.mjs';

// Loads and has checks of absent names through a namespace on the prototype
// chain may still be optimized: they yield undefined / false. This holds for a
// regular namespace and for an already evaluated deferred namespace.
assertEquals(1, dns.x);  // Evaluate the deferred module.

function loadAbsent(o) { return o.absent; }
function hasAbsent(o) { return 'absent' in o; }
%PrepareFunctionForOptimization(loadAbsent);
%PrepareFunctionForOptimization(hasAbsent);
const nsChild = Object.create(ns);
const dnsChild = Object.create(dns);
for (const o of [nsChild, dnsChild]) {
  assertEquals(undefined, loadAbsent(o));
  assertFalse(hasAbsent(o));
}
%OptimizeFunctionOnNextCall(loadAbsent);
%OptimizeFunctionOnNextCall(hasAbsent);
for (const o of [nsChild, dnsChild]) {
  assertEquals(undefined, loadAbsent(o));
  assertFalse(hasAbsent(o));
}
assertOptimized(loadAbsent);
assertOptimized(hasAbsent);

// The same holds when the evaluated deferred namespace is accessed directly,
// i.e. when it is the receiver instead of being on the prototype chain.
function loadAbsentDirect(o) { return o.absent; }
function hasAbsentDirect(o) { return 'absent' in o; }
%PrepareFunctionForOptimization(loadAbsentDirect);
%PrepareFunctionForOptimization(hasAbsentDirect);
assertEquals(undefined, loadAbsentDirect(dns));
assertFalse(hasAbsentDirect(dns));
%OptimizeFunctionOnNextCall(loadAbsentDirect);
%OptimizeFunctionOnNextCall(hasAbsentDirect);
assertEquals(undefined, loadAbsentDirect(dns));
assertFalse(hasAbsentDirect(dns));
assertOptimized(loadAbsentDirect);
assertOptimized(hasAbsentDirect);
