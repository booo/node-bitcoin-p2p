require('buffertools');

var suite = require('./common');

var subject = new Buffer(10);
var subject_s = subject.toString('binary');

// add tests
suite.add('Buffer#copy', function() {
  var target = new Buffer(subject.length);
  subject.copy(target);
});

suite.add('Buffer[]', function() {
  var target = new Buffer(subject.length);
  for (var i = 0, l = subject.length; i < l; i++) {
    target[i] = subject[i];
  }
});

suite.add('Buffer#toString', function () {
  var target = subject.toString('binary');
});

suite.add('Buffer via string', function () {
  var target = new Buffer(subject.toString('binary'), 'binary');
});

suite.add('String copy', function () {
  var target = subject_s.slice(0);
});

// run async
suite.run({ 'async': true });
