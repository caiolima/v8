// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import defer * as ns from "./heavy-loop.js";

let startup = 0;
for (let i = 0; i < 50000; i++) startup += i;
export const ready = startup;

export function finish(){ return ns.sentinel; }
