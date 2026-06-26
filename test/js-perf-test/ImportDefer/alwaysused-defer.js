// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import defer * as ns from "./heavy-loop.js";
// Top-level access forces module evaluation during graph evaluation, so the
// deferred arm gains nothing and pays the deferred-namespace setup.
export const used = ns.sentinel;
