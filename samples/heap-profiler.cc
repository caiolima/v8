// Copyright 2024 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fstream>
#include <sstream>
#include <iostream>

#include "include/libplatform/libplatform.h"
#include "include/v8-context.h"
#include "include/v8-function.h"
#include "include/v8-initialization.h"
#include "include/v8-isolate.h"
#include "include/v8-local-handle.h"
#include "include/v8-primitive.h"
#include "include/v8-script.h"
#include "include/v8-profiler.h"

void PrintAllocationProfile(v8::AllocationProfile* profile) {
  if (!profile) {
    printf("No allocation profile available\n");
    return;
  }

  printf("=== Allocation Profile ===\n");

  // Get samples
  const auto& samples = profile->GetSamples();
  printf("Total samples: %zu\n", samples.size());

  // Get root node and traverse
  v8::AllocationProfile::Node* root = profile->GetRootNode();
  if (!root) {
    printf("No root node found\n");
    return;
  }

  // Simple traversal of allocation tree
  std::function<void(v8::AllocationProfile::Node*, int)> traverse;
  traverse = [&](v8::AllocationProfile::Node* node, int depth) {
    if (!node) return;

    // Print indentation
    for (int i = 0; i < depth; i++) printf("  ");

    // Get function name
    v8::String::Utf8Value name(v8::Isolate::GetCurrent(), node->name);
    v8::String::Utf8Value script(v8::Isolate::GetCurrent(), node->script_name);

    const char* func_name = name.length() > 0 ? *name : "<anonymous>";
    const char* script_name = script.length() > 0 ? *script : "<unknown>";

    // Calculate total allocations
    size_t total_size = 0;
    unsigned int total_count = 0;
    for (const auto& alloc : node->allocations) {
      total_size += alloc.size * alloc.count;
      total_count += alloc.count;
    }

    if (total_count > 0) {
      printf("Function: %s (Script: %s, Line: %d)\n", func_name, script_name, node->line_number);
      for (int i = 0; i < depth; i++) printf("  ");
      printf("  -> Total: %zu bytes, Count: %u\n", total_size, total_count);
    }

    // Traverse children
    for (auto* child : node->children) {
      traverse(child, depth + 1);
    }
  };

  traverse(root, 0);
}

// Helper function to read file contents
std::string ReadFile(const char* filename) {
  std::ifstream file(filename);
  if (!file.is_open()) {
    std::cerr << "Error: Could not open file " << filename << std::endl;
    return "";
  }

  std::ostringstream content;
  content << file.rdbuf();
  file.close();

  return content.str();
}

int main(int argc, char* argv[]) {
  // Check if JavaScript file was provided
  if (argc < 2) {
    std::cerr << "Usage: " << argv[0] << " <javascript_file>" << std::endl;
    std::cerr << "Example: " << argv[0] << " test.js" << std::endl;
    return 1;
  }
  // Initialize V8.
  v8::V8::InitializeICUDefaultLocation(argv[0]);
  v8::V8::InitializeExternalStartupData(argv[0]);
  std::unique_ptr<v8::Platform> platform = v8::platform::NewDefaultPlatform();
  v8::V8::InitializePlatform(platform.get());

  // Enable GC exposure to JavaScript
  v8::V8::SetFlagsFromString("--expose-gc");

  v8::V8::Initialize();

  // Create a new Isolate and make it the current one.
  v8::Isolate::CreateParams create_params;
  create_params.array_buffer_allocator =
      v8::ArrayBuffer::Allocator::NewDefaultAllocator();
  v8::Isolate* isolate = v8::Isolate::New(create_params);

  {
    v8::Isolate::Scope isolate_scope(isolate);
    v8::HandleScope handle_scope(isolate);

    // Create a new context.
    v8::Local<v8::Context> context = v8::Context::New(isolate);
    v8::Context::Scope context_scope(context);

    // Add print function to global context
    context->Global()->Set(
        context,
        v8::String::NewFromUtf8Literal(isolate, "print"),
        v8::Function::New(context, [](const v8::FunctionCallbackInfo<v8::Value>& args) {
          for (int i = 0; i < args.Length(); i++) {
            if (i > 0) printf(" ");
            v8::String::Utf8Value str(args.GetIsolate(), args[i]);
            printf("%s", *str);
          }
          printf("\n");
          fflush(stdout);  // Ensure immediate output
        }).ToLocalChecked()
    ).ToChecked();

    printf("=== V8 Heap Profiler Example ===\n");

    // Get heap profiler
    v8::HeapProfiler* profiler = isolate->GetHeapProfiler();

    printf("Starting allocation sampling...\n");
    // Start allocation sampling (sample every 1KB with stack depth of 16)
    profiler->StartSamplingHeapProfiler(1024, 16);

    // Read JavaScript code from file
    std::string js_code = ReadFile(argv[1]);
    if (js_code.empty()) {
      std::cerr << "Failed to read JavaScript file: " << argv[1] << std::endl;
      return 1;
    }

    printf("Executing JavaScript code from file: %s\n", argv[1]);

    // Create a string containing the JavaScript source code.
    v8::Local<v8::String> source =
        v8::String::NewFromUtf8(isolate, js_code.c_str()).ToLocalChecked();

    // Compile the source code.
    v8::Local<v8::Script> script =
        v8::Script::Compile(context, source).ToLocalChecked();

    // Run the script to get the result.
    v8::Local<v8::Value> result = script->Run(context).ToLocalChecked();

    // Convert the result to a UTF8 string and print it.
    v8::String::Utf8Value utf8(isolate, result);
    printf("Result: %s\n", *utf8);

    printf("Stopping allocation sampling...\n");

    // Get allocation profile
    v8::AllocationProfile* profile = profiler->GetAllocationProfile();

    // Stop sampling
    profiler->StopSamplingHeapProfiler();

    // Print profile results
    // PrintAllocationProfile(profile);

    // Get basic heap statistics
    v8::HeapStatistics heap_stats;
    isolate->GetHeapStatistics(&heap_stats);

    printf("\n=== Basic Heap Statistics ===\n");
    printf("Total heap size: %zu bytes\n", heap_stats.total_heap_size());
    printf("Used heap size: %zu bytes\n", heap_stats.used_heap_size());
    printf("Total allocated bytes: %zu bytes\n", heap_stats.total_allocated_bytes());

    // for (size_t i = 0; i < isolate->NumberOfHeapSpaces(); i++) {
    //   // Get basic heap space statistics
    //   v8::HeapSpaceStatistics heap_space_stats;
    //   isolate->GetHeapSpaceStatistics(&heap_space_stats, i);

    //   printf("\n=== Heap Space Statistics ===\n");
    //   printf("Space name: %s\n", heap_space_stats.space_name());
    //   printf("Total space size: %zu bytes\n", heap_space_stats.space_size());
    //   printf("Used space size: %zu bytes\n", heap_space_stats.space_used_size());
    // }

    // Clean up the profile
    delete profile;
  }

  // Dispose the isolate and tear down V8.
  isolate->Dispose();
  delete create_params.array_buffer_allocator;
  v8::V8::Dispose();
  v8::V8::DisposePlatform();

  printf("Heap profiler example completed successfully!\n");
  return 0;
}
