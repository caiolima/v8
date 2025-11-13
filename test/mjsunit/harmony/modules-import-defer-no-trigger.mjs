// Copyright 2025 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --js-defer-import-eval

globalThis.eval_list = [];

import defer * as ns from './modules-skip-import-defer-1.mjs';

assertEquals(0, globalThis.eval_list.length);

assertEquals('Deferred Module', ns[Symbol.toStringTag]);
assertEquals(0, globalThis.eval_list.length);

const nonExistentSymbol = Symbol('nonExistent');
assertEquals(undefined, ns[nonExistentSymbol]);
assertEquals(0, globalThis.eval_list.length);

assertEquals(undefined, ns.then);
assertEquals(0, globalThis.eval_list.length);

// Testing that private fields accesses don't trigger evaluation
class Marker extends function (x) { return x } {
  #mark;

  static mark(obj) { new Marker(obj) }

  static isMarked(obj) { return #mark in obj }
}

assertFalse(Marker.isMarked(ns));
assertEquals(0, globalThis.eval_list.length);

Marker.mark(ns);
assertEquals(0, globalThis.eval_list.length);

assertTrue(Marker.isMarked(ns));
assertEquals(0, globalThis.eval_list.length);

assertThrows(() => ns.foo = 30, TypeError);
assertEquals(0, globalThis.eval_list.length);

assertThrows(() => ns.nonExistent = 30, TypeError);
assertEquals(0, globalThis.eval_list.length);

assertThrows(() => ns[Symbol.toStringTag] = 30, TypeError);
assertEquals(0, globalThis.eval_list.length);

assertThrows(() => ns[Symbol('nonExistent')] = 30, TypeError);
assertEquals(0, globalThis.eval_list.length);

let obj = Object.create(ns);

obj.foo = 40;
assertEquals(0, globalThis.eval_list.length);
assertEquals(40, obj.foo);

obj.bar = 41;
assertEquals(0, globalThis.eval_list.length);
assertEquals(41, obj.bar);
