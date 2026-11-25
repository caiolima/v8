// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --js-defer-import-eval --bundle --no-lazy-feedback-allocation

// A synchronous module in a cycle with a top-level-await module is kEvaluated
// before its cycle root finishes, and it stays kEvaluated if the root fails
// afterwards. Its deferred namespace must not be treated as evaluated then:
// every evaluation trigger has to go through EvaluateModuleSync, which
// rethrows the error of the cycle root.
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
throw new Error('root failed');

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

unblock.resolve();
let error;
try {
  await done;
} catch (e) {
  error = e;
}
assertEquals('root failed', error.message);

// The dependency is still kEvaluated, but its namespace keeps rethrowing the
// error of its cycle root. The accesses are repeated so that their inline
// caches get a chance to (wrongly) cache a handler.
for (let i = 0; i < 3; i++) {
  assertThrows(() => ns.x, Error, 'root failed');
  assertThrows(() => ns.absent, Error, 'root failed');
  assertThrows(() => 'x' in ns, Error, 'root failed');
  assertThrows(() => 'absent' in ns, Error, 'root failed');
  assertThrows(() => Reflect.ownKeys(ns), Error, 'root failed');
  assertThrows(() => Object.keys(ns), Error, 'root failed');
  assertThrows(() => { for (const key in ns) {} }, Error, 'root failed');
  assertThrows(
      () => Object.getOwnPropertyDescriptor(ns, 'x'), Error, 'root failed');
  assertThrows(() => Object.hasOwn(ns, 'x'), Error, 'root failed');
  assertThrows(() => Reflect.deleteProperty(ns, 'x'), Error, 'root failed');
  assertThrows(() => Object.create(ns).x, Error, 'root failed');
  assertThrows(() => 'x' in Object.create(ns), Error, 'root failed');
  assertThrows(() => megamorphicLoad(ns), Error, 'root failed');
  assertThrows(() => megamorphicHas(ns), Error, 'root failed');
  assertThrows(() => megamorphicLoad(Object.create(ns)), Error, 'root failed');
  assertThrows(() => megamorphicHas(Object.create(ns)), Error, 'root failed');

  // Symbol-like keys never trigger evaluation.
  assertEquals(undefined, ns.then);
  assertEquals('Deferred Module', ns[Symbol.toStringTag]);
}
