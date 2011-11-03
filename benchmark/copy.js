require('buffertools');

var suite = require('./common');

var subject = new Buffer(10);

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

// run async
suite.run({ 'async': true });
