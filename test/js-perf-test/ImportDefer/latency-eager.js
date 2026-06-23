// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as ns from "./heavy-loop.js";

// Fixed startup work that runs as part of reaching the "interactive"
// milestone. Identical in both arms.
let startup = 0;
for (let i = 0; i < 50000; i++) startup += i;
export const ready = startup;

// Touching the namespace forces evaluation of the deferred dependency.
export function finish(){ return ns.sentinel; }
