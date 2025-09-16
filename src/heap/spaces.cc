// Copyright 2011 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "src/heap/spaces.h"

#include <algorithm>
#include <cinttypes>
#include <utility>

#include "src/base/bits.h"
#include "src/base/bounded-page-allocator.h"
#include "src/base/macros.h"
#include "src/base/sanitizer/msan.h"
#include "src/common/globals.h"
#include "src/heap/base/active-system-pages.h"
#include "src/heap/concurrent-marking.h"
#include "src/heap/heap.h"
#include "src/heap/large-spaces.h"
#include "src/heap/main-allocator-inl.h"
#include "src/heap/mark-compact.h"
#include "src/heap/memory-chunk-layout.h"
#include "src/heap/mutable-page-metadata.h"
#include "src/heap/read-only-heap.h"
#include "src/heap/remembered-set.h"
#include "src/heap/slot-set.h"
#include "src/init/v8.h"
#include "src/logging/counters.h"
#include "src/objects/free-space-inl.h"
#include "src/objects/heap-object.h"
#include "src/objects/js-array-buffer-inl.h"
#include "src/objects/objects-inl.h"
#include "src/snapshot/snapshot.h"
#include "src/utils/ostreams.h"

namespace v8 {
namespace internal {

SpaceWithLinearArea::SpaceWithLinearArea(Heap* heap, AllocationSpace id,
                                         std::unique_ptr<FreeList> free_list)
    : Space(heap, id, std::move(free_list)) {}

SpaceIterator::SpaceIterator(Heap* heap)
    : heap_(heap), current_space_(FIRST_MUTABLE_SPACE) {}

SpaceIterator::~SpaceIterator() = default;

bool SpaceIterator::HasNext() {
  while (current_space_ <= LAST_MUTABLE_SPACE) {
    Space* space = heap_->space(current_space_);
    if (space) return true;
    ++current_space_;
  }

  // No more spaces left.
  return false;
}

Space* SpaceIterator::Next() {
  DCHECK_LE(current_space_, LAST_MUTABLE_SPACE);
  Space* space = heap_->space(current_space_++);
  DCHECK_NOT_NULL(space);
  return space;
}

size_t Space::GetTotalAllocatedBytes() {
  size_t total_bytes = total_allocated_bytes;
  HeapAllocator* allocator = heap_->allocator();

  // Here we check spaces that might have allocations in their current
  // LinearAllocationArea that hasn't been freed yet. It means that they aren't
  // counted on total_allocated_bytes yet.
  PrintF("Space Address: %p\n", this);
  switch (identity()) {
    case NEW_SPACE: {
      const MainAllocator* new_allocator = allocator->new_space_allocator();
      PrintF("LAA start: %p, LAA top: %p, Space Address: %p\n", reinterpret_cast<void*>(new_allocator->start()), reinterpret_cast<void*>(new_allocator->top()), this);
      if (new_allocator->top() > new_allocator->start()) {
        total_bytes += new_allocator->top() - new_allocator->start();
      }
      break;
    }
    case OLD_SPACE: {
      const MainAllocator* old_allocator = allocator->old_space_allocator();
      if (old_allocator->top() > old_allocator->start()) {
        size_t size = old_allocator->top() - old_allocator->start();
        total_bytes += size;
      }
      break;
    }
    case TRUSTED_SPACE: {
      const MainAllocator* trusted_allocator = allocator->trusted_space_allocator();
      if (trusted_allocator->top() > trusted_allocator->start()) {
        total_bytes += trusted_allocator->top() - trusted_allocator->start();
      }
      break;
    }
    case CODE_SPACE: {
      const MainAllocator* code_allocator = allocator->code_space_allocator();
      if (code_allocator->top() > code_allocator->start()) {
        total_bytes += code_allocator->top() - code_allocator->start();
      }
      break;
    }
    case SHARED_SPACE: {
      const MainAllocator* shared_allocator = allocator->shared_space_allocator();
      if (shared_allocator->top() > shared_allocator->start()) {
        total_bytes += shared_allocator->top() - shared_allocator->start();
      }
      break;
    }
    case SHARED_TRUSTED_SPACE: {
      const MainAllocator* trust_shared_allocator = allocator->shared_trusted_space_allocator();
      if (trust_shared_allocator->top() > trust_shared_allocator->start()) {
        total_bytes += trust_shared_allocator->top() - trust_shared_allocator->start();
      }
      break;
    }
    default:
      break;
  }

  PrintF("Space: %s, Total Bytes: %zu, Total Bytes in GC: %zu\n", ToString(identity()), total_bytes, total_allocated_bytes_in_gc);
  return total_bytes - total_allocated_bytes_in_gc;
}

}  // namespace internal
}  // namespace v8
