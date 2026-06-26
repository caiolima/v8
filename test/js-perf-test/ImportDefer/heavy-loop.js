// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Expensive top-level loop. Evaluating this module is the cost that
// `import defer` lets a program skip when the namespace is never used.

// globalThis.__sideEffect counts if a given module was evaluated and it is
// used by the harness to validate if a given module evaluation was deferred or
// not.
globalThis.__sideEffect = (globalThis.__sideEffect | 0) + 1;

let s = 0;
for (let i = 0; i < 2000000; i++) s += (i * 7) % 13;

export const sentinel = s;
