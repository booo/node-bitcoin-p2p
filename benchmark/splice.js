require('buffertools');

var suite = require('./common');

var subject = new Buffer('aaaaaaaaaabbbbbbbbbbcccccccccc', 'ascii');

// add tests
suite.add('Buffer#copy', function() {
  var target = new Buffer(20);
  subject.copy(target, 0, 0, 10);
  subject.copy(target, 10, 20, 30);
  return target;
});
suite.add('Buffer#concat', function() {
  return subject.slice(0, 10).concat(subject.slice(20, 30));
});

suite.add('skip-alternate', function () {
  var skip = [10,10,10];
  var pos = 0, marker = 0, copy = true;
  var target = new Buffer(subject.length);
  for (var i = 0, l = subject.length; i < l; i++) {
    if (skip[marker] == 0) {
      marker++;
      copy = !copy;
    }
    skip[marker]--;
    if (copy) {
      target[pos++] = subject[i];
    }
  }
  target.length = pos;
  return target;
});

suite.add('skip-absolute-obj', function () {
  var skip = {10:10};
  var pos = 0;
  var target = new Buffer(subject.length);
  for (var i = 0, l = subject.length; i < l; i++) {
    if (skip[i]) i += skip[i];
    target[pos++] = subject[i];
  }
  target.length = pos;
  return target;
});

suite.add('skip-absolute-arr', function () {
  var skip = [];
  skip[10] = 10;
  var pos = 0;
  var target = new Buffer(subject.length);
  for (var i = 0, l = subject.length; i < l; i++) {
    if (skip[i]) i += skip[i];
    target[pos++] = subject[i];
  }
  target.length = pos;
  return target;
});

// run async
suite.run({ 'async': true });
