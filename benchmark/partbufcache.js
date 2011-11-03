require('buffertools');

var suite = require('./common');

var subject = new Buffer(32).clear().concat(new Buffer('/////w==', 'base64'));

// add tests
suite.add('getBuffer (no cache)', function() {
  return subject.slice(0, 32);
});
var getBufferCache = null;
suite.add('getBuffer (cache)', function() {
  if (getBufferCache !== null) return getBufferCache;

  return getBufferCache = subject.slice(0, 32);
});
suite.add('getInt (no cache)', function() {
  return (subject[32]      ) +
         (subject[33] <<  8) +
         (subject[34] << 16) +
         (subject[35] << 24);
});
var getIntCache = null;
suite.add('getInt (cache)', function() {
  if (getIntCache !== null) return getIntCache;

  return getIntCache = (subject[32]      ) +
                       (subject[33] <<  8) +
                       (subject[34] << 16) +
                       (subject[35] << 24);
});

// run async
suite.run({ 'async': true });
