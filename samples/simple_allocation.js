print("allocating 'a' from JS.");
let a = {};

print("allocating 'b' from JS.");
let b = {};

a = null;
print("performing full GC...");
gc();
print("GC completed...");

print("allocating 'c' from JS.");
let c = {};

print("end of test.");

