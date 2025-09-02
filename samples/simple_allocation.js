var arr = [];

function allocateObject() {
   let o  = { foo: "foo"};
   return o;
}

print("allocating 'a' from JS.");
let a = {};

for (let i = 0; i < 100; i++) {
  print("allocating " + i);
//  if (i == 20) {
//    %PrepareFunctionForOptimization(allocateObject);
//    %OptimizeFunctionOnNextCall(allocateObject);
//  }
  arr.push(allocateObject());
}

print("allocating 'b' from JS.");
let b = {};

// a = null;
// print("performing full GC...");
// gc();
// print("GC completed...");
// 
print("allocating 'c' from JS.");
let c = {};

print("end of test.");

