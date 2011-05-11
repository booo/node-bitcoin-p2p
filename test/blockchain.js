var vows = require('vows'),
    assert = require('assert');

var Storage = require('../lib/storage').Storage;
var Settings = require('../lib/settings').Settings;
var BlockChain = require('../lib/blockchain').BlockChain;
var Miner = require('../lib/miner/javascript.js').JavaScriptMiner;

vows.describe('Block Chain').addBatch({
	'A block chain': {
		topic: function () {
			makeEmptyTestChain(this.callback);
		},

		'is a BlockChain': function (blockChain) {
			assert.instanceOf(blockChain, BlockChain);
		},

		'contains the genesis block which': {
			topic: function (topic) {
				return topic.getTopBlock();
			},

			'is a block': function (topic) {
				assert.instanceOf(topic, topic.base.model('Block'));
			},

			'has a valid hash': function (topic) {
				assert.isTrue(topic.checkHash());
			},

			'has the correct hash': function (topic) {
				var expectedHash =
					'14DAE1DB98CA7EFA42CC9EBE7EBB19BD' +
					'88D80D6CBD3C4A993C20B47401D238C6';

				var actualHash =
					topic.getHash().toString('hex').toUpperCase();

				assert.equal(actualHash, expectedHash);
			},

			'has a height of zero': function (topic) {
				assert.equal(+topic.height, 0);
			}
		},

		'after mining a block': {
			topic: function (chain) {
				var self = this;
				var fakeBeneficiary = new Buffer(20).clear();

				chain.getTopBlock().mineNextBlock(
					fakeBeneficiary,
					Math.floor(new Date().getTime() / 1000),
					new Miner(),
					function (err, newBlock, txs) {
						if (err) {
							self.callback(err);
							return;
						}

						chain.add(newBlock, txs, function (err, result) {
							self.callback(err, result);
						});
					}
				);
			},

			'has a height of one': function (block) {
				assert.equal(block.height, 1);
			}
		}
	},

}).export(module);

function makeEmptyTestChain(callback) {
	var settings = new Settings();
	var storage = new Storage('mongodb://localhost/bitcointest');

	settings.setUnitnetDefaults();

	storage.dropDatabase(function (err, result) {
		if (err) {
			callback(err);
			return;
		}

		var chain = new BlockChain(storage, settings);
		chain.on('initComplete', function (err) {
			if (err) {
				callback(err);
				return;
			}

			callback(null, chain);
		});
		chain.init();
	});
};
