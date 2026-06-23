// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Cheap control leaf used to smoke-test the harness.
globalThis.__sideEffect = (globalThis.__sideEffect | 0) + 1;

export const sentinel = 42;
