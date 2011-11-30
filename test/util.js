var vows = require('vows'),
    assert = require('assert');

var Binary = require('binary');
var bignum = require('bignum');

var Util = require('../lib/util');
var logger = require('../lib/logger');

logger.disable();

vows.describe('Bitcoin Utils').addBatch({
  'A Bitcoin address': {
    topic: "12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX",
    'is decoded correctly': function (topic) {
      var addrHash = Util.addressToPubKeyHash(topic);

      var expected = Util.decodeHex('119b098e2e980a229e139a9ed01a469e518e6f26');
      assert.equal(expected.compare(addrHash), 0);
    },
    'is re-encoded correctly': function (topic) {
      var addrHash = Util.addressToPubKeyHash(topic);
      assert.equal(Util.pubKeyHashToAddress(addrHash), topic);
    }
  },

  'Difficulty bits': {
    topic: 0x1b0404cb,
    'can be converted to a target': function (topic) {
      var target = Util.decodeDiffBits(topic);
      assert.equal(target.toHex(),
                   "00000000000404cb0000000000000000" +
                   "00000000000000000000000000000000");
    },
    'are correctly represented in a buffer': function (topic) {
      var decoded = Util.decodeDiffBits(topic);
      var decodedInt = Util.decodeDiffBits(topic, true);
      assert.equal(bignum.fromBuffer(decoded).toString(16),
                   decodedInt.toString(16));
    },
    'can be re-encoded': function (topic) {
      var decoded = Util.decodeDiffBits(topic);
      var reencoded = Util.encodeDiffBits(decoded);
      assert.equal(reencoded,
                   topic);
    }
  },

  'A block header': {
    topic: Util.decodeHex(
        '0100000057cb9e9826b22b9cfa59d374d8cd9acd4759d6cd326583b412080000'
      + '00000000f526d72b6a7c531db19642091b27eb964d8a238da753e0a0ef167ce5'
      + 'e8467383c0b7104e122a0c1a0000000080000000000000000000000000000000'
      + '0000000000000000000000000000000000000000000000000000000000000280'),
    'hashes to the correct midstate': function (topic) {
      var midstate = Util.sha256midstate(topic);
      assert.equal(midstate.toHex(),
                   "2a7ce7ed41c789515649417421a5f260" +
                   "576461a477d440cda7355ddbab651f8c");
    }
  }
}).export(module);
