// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --bundle --js-defer-import-eval --allow-natives-syntax

// JS_BUNDLE_MODULE:mod.mjs
export const x = 1;

// JS_BUNDLE_MODULE_ENTRYPOINT
import defer * as dns from './mod.mjs';

// Stores through an evaluated deferred namespace on the prototype chain must
// still throw.
assertEquals(1, dns.x);  // Evaluate the deferred module.

function storeAbsent(o) { o.absent = 1; }
const dnsChild = Object.create(dns);
%PrepareFunctionForOptimization(storeAbsent);
assertThrows(() => storeAbsent(dnsChild), TypeError);
%OptimizeFunctionOnNextCall(storeAbsent);
assertThrows(() => storeAbsent(dnsChild), TypeError);
assertEquals(undefined, dnsChild.absent);
assertFalse(Object.hasOwn(dnsChild, 'absent'));
