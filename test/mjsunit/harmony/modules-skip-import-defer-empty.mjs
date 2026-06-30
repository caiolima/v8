// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Intentionally empty: the regression test that imports this module overflows
// the stack at the InnerModuleEvaluation entry STACK_CHECK, before this
// module's body would ever run.
