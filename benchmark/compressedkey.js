require('buffertools');

var suite = require('./common');

var Util = require('../lib/util');

var Key = require('../native.node').BitcoinKey;

var key = new Key();

var compressedKey = Util.decodeHex('02a32efde012298e69e3601eb94fceb84c900efecdca8abc6a46f20a810acf18b7');
var uncompressedKey = Util.decodeHex('04a32efde012298e69e3601eb94fceb84c900efecdca8abc6a46f20a810acf18b74d6fe0cfc04d7eba0b3340d1c4e50370a65caa2efcc0067d4337c1cca73407a4');

var digest = Util.decodeHex('48ce0ba13b087f3712cdc354db918436aeeca60596ac7c54572c8c1b9a8b5ba4');
var sig = Util.decodeHex('3046022100b5775bd2ef0a5d45369f286dfa24fa990af7ae887b2a3e2c24d8eacb18430e36022100d9b6760e59f2a52cecd81ef7422c9ad41589f879a24358145307169858b8dc1308');

key.public = compressedKey;


// add tests
suite.add('compressed key', function() {
  key.public = compressedKey;
  key.verifySignatureSync(digest, sig);
});

suite.add('uncompressed key', function() {
  key.public = uncompressedKey;
  key.verifySignatureSync(digest, sig);
});


// run async
suite.run({ 'async': true });
