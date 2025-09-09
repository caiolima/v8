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

