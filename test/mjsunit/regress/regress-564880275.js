// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --js-defer-import-eval --bundle

// JS_BUNDLE_MODULE:mod_term.mjs
export var foo = 42;
d8.terminate();
(() => {})();

// JS_BUNDLE_MODULE_ENTRYPOINT
import defer * as ns from './mod_term.mjs';

// The first task triggers the synchronous evaluation of `mod_term.mjs`, which
// is terminated. The module becomes errored without its top-level capability
// being rejected.
setTimeout(() => {
  ns.foo;
}, 0);

// The second task runs after the termination was cleared. Accessing the
// namespace of the errored module must throw instead of exposing its exports.
// `foo` is a `var` so that the access can't throw because of TDZ.
setTimeout(() => {
  assertThrowsEquals(() => ns.foo, null);
}, 0);
