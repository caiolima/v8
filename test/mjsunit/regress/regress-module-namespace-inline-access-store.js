// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --bundle --allow-natives-syntax

// JS_BUNDLE_MODULE:mod.mjs
export const exported = 1;

// JS_BUNDLE_MODULE_ENTRYPOINT
import * as ns from './mod.mjs';

// [[Set]] on an object inheriting from a JSModuleNamespace must always be
// rejected (throwing TypeError in strict mode), even when a map transition for
// the absent property exists on the receiver's map.
const protoChild = Object.create(ns);
Object.defineProperty(protoChild, 'foo', {
  value: 42,
  writable: true,
  enumerable: true,
  configurable: true,
});

function storeFoo(o, v) {
  o.foo = v;
}

%PrepareFunctionForOptimization(storeFoo);
for (let i = 0; i < 3; i++) {
  assertThrows(() => storeFoo(Object.create(ns), 99), TypeError);
}
%OptimizeFunctionOnNextCall(storeFoo);
const receiver = Object.create(ns);
assertThrows(() => storeFoo(receiver, 99), TypeError);
assertEquals(undefined, receiver.foo);
assertFalse(Object.hasOwn(receiver, 'foo'));
