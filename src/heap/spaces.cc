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

uint64_t Space::GetTotalAllocatedBytes() const {
  uint64_t total_bytes = total_allocated_bytes;
  HeapAllocator* allocator = heap_->allocator();

  // Here we check spaces that might have allocations in their current
  // LinearAllocationArea that hasn't been freed yet. It means that they aren't
  // counted on total_allocated_bytes yet.
  MainAllocator* space_allocator = nullptr;
  switch (identity()) {
    case NEW_SPACE: {
      space_allocator = allocator->new_space_allocator();
      break;
    }
    case OLD_SPACE: {
      space_allocator = allocator->old_space_allocator();
      break;
    }
    case TRUSTED_SPACE: {
      space_allocator = allocator->trusted_space_allocator();
      break;
    }
    case CODE_SPACE: {
      space_allocator = allocator->code_space_allocator();
      break;
    }
    case SHARED_SPACE: {
     space_allocator = allocator->shared_space_allocator();
      break;
    }
    case SHARED_TRUSTED_SPACE: {
      space_allocator = allocator->shared_trusted_space_allocator();
      break;
    }
    default:
      break;
  }

  if (space_allocator && space_allocator->top() > space_allocator->start()) {
    total_bytes += space_allocator->top() - space_allocator->start();
  }

  return total_bytes - total_allocated_bytes_in_gc;
}

}  // namespace internal
}  // namespace v8
