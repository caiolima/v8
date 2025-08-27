// Test JavaScript file for heap profiler
// This file demonstrates various allocation patterns

print("Starting allocation test...");

// Create objects that will generate allocations
var ephemeralObjects = [];
var longLivedObjects = [];

function createLargeObjects() {
  print("Creating large objects...");
  for (let i = 0; i < 50; i++) {
    ephemeralObjects.push({
      id: i,
      data: new Array(200000).fill('item_' + i),
      nested: {
        value: 'test_string_' + i,
        array: new Array(100).fill(i)
      }
    });

    longLivedObjects.push({
      id: i,
      data: new Array(10).fill('item_' + i),
      nested: {
        value: 'test_string_' + i,
        array: new Array(10).fill(i)
      }
    });
  }
  return ephemeralObjects.length;
}

function createStrings() {
  print("Creating strings...");
  var strings = [];
  for (let i = 0; i < 100; i++) {
    strings.push('This is test string number ' + i + ' with some additional content');
  }
  return strings.length;
}

function createMaps() {
  print("Creating maps...");
  var map = new Map();
  for (let i = 0; i < 50; i++) {
    map.set('key_' + i, 'value_' + i);
  }
  return map.size;
}

// Execute allocation-heavy functions
var objectCount = createLargeObjects();
var stringCount = createStrings();
var mapSize = createMaps();

print("Before GC - objects in memory");

// Clear references to allow GC
//ephemeralObjects = null;
// Trigger garbage collection (available due to --expose-gc flag)
gc();
