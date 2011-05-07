var vows = require('vows'),
    assert = require('assert');

var Util = require('../lib/util');
var logger = require('../lib/logger');

logger.disable();

vows.describe('Bitcoin Utils').addBatch({
	'A Bitcoin address': {
		topic: "12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX",
		'is decoded correctly': function (topic) {
			var addrHash = Util.addressToPubKeyHash(topic);

			var expected = new Buffer('119b098e2e980a229e139a9ed01a469e518e6f26', 'hex');
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
						 "00000000000404cb000000000000000000000000000000000000000000000000");
		}
	}
}).export(module);
