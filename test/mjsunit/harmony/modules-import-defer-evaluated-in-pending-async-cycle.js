// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --js-defer-import-eval --bundle --no-lazy-feedback-allocation

// A synchronous module in a cycle with a top-level-await module is already
// kEvaluated while its cycle root is still kEvaluatingAsync. Its deferred
// namespace must not be treated as evaluated yet: until the root finishes,
// every evaluation trigger has to go through EvaluateModuleSync, which throws
// a TypeError because ReadyForSyncExecution is false. Once the root finishes,
// the same accesses succeed.
// https://tc39.es/proposal-defer-import-eval/#sec-GetModuleExportsList

// JS_BUNDLE_MODULE:setup.mjs
export const started = Promise.withResolvers();
export const unblock = Promise.withResolvers();

// JS_BUNDLE_MODULE:dep.mjs
import './root.mjs';
export let x = 42;

// JS_BUNDLE_MODULE:root.mjs
import {started, unblock} from 'setup.mjs';
import './dep.mjs';
import defer * as ns from './dep.mjs';
globalThis.ns = ns;
started.resolve();
await unblock.promise;
// This module is the cycle root, and it is still evaluating.
assertThrows(() => ns.x, TypeError);
assertThrows(() => Reflect.ownKeys(ns), TypeError);

// JS_BUNDLE_MODULE_ENTRYPOINT
import {started, unblock} from 'setup.mjs';

// Megamorphic accesses, which are handled by the generic stubs.
function megamorphicLoad(o) {
  return o.x;
}
function megamorphicHas(o) {
  return 'x' in o;
}
megamorphicLoad({x: 1});
megamorphicLoad({x: 1, a: 1});
megamorphicLoad({x: 1, b: 1});
megamorphicLoad({x: 1, c: 1});
megamorphicLoad({x: 1, d: 1});
megamorphicHas({x: 1});
megamorphicHas({x: 1, a: 1});
megamorphicHas({x: 1, b: 1});
megamorphicHas({x: 1, c: 1});
megamorphicHas({x: 1, d: 1});

const done = import('./root.mjs');
await started.promise;
const ns = globalThis.ns;

// The cycle root is still evaluating asynchronously. The accesses are repeated
// so that their inline caches get a chance to (wrongly) cache a handler.
for (let i = 0; i < 3; i++) {
  assertThrows(() => ns.x, TypeError);
  assertThrows(() => ns.absent, TypeError);
  assertThrows(() => 'x' in ns, TypeError);
  assertThrows(() => 'absent' in ns, TypeError);
  assertThrows(() => Reflect.ownKeys(ns), TypeError);
  assertThrows(() => Object.keys(ns), TypeError);
  assertThrows(() => { for (const key in ns) {} }, TypeError);
  assertThrows(() => Object.getOwnPropertyDescriptor(ns, 'x'), TypeError);
  assertThrows(() => Object.hasOwn(ns, 'x'), TypeError);
  assertThrows(() => Reflect.deleteProperty(ns, 'x'), TypeError);
  assertThrows(() => Object.create(ns).x, TypeError);
  assertThrows(() => 'x' in Object.create(ns), TypeError);
  assertThrows(() => megamorphicLoad(ns), TypeError);
  assertThrows(() => megamorphicHas(ns), TypeError);
  assertThrows(() => megamorphicLoad(Object.create(ns)), TypeError);
  assertThrows(() => megamorphicHas(Object.create(ns)), TypeError);

  // Symbol-like keys never trigger evaluation.
  assertEquals(undefined, ns.then);
  assertEquals('Deferred Module', ns[Symbol.toStringTag]);
}

unblock.resolve();
await done;

// The cycle root finished, so the same accesses succeed now.
for (let i = 0; i < 3; i++) {
  assertEquals(42, ns.x);
  assertEquals(undefined, ns.absent);
  assertTrue('x' in ns);
  assertFalse('absent' in ns);
  assertEquals(['x', Symbol.toStringTag], Reflect.ownKeys(ns));
  assertEquals(['x'], Object.keys(ns));
  const keys = [];
  for (const key in ns) keys.push(key);
  assertEquals(['x'], keys);
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
