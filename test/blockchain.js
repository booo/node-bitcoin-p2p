var vows = require('vows'),
    assert = require('assert');

var Storage = require('../lib/storage').Storage;
var Settings = require('../lib/settings').Settings;
var BlockChain = require('../lib/blockchain').BlockChain;
var Miner = require('../lib/miner/javascript.js').JavaScriptMiner;

var Step = require('step');

var tester = vows.describe('Block Chain');

tester.addBatch({
	'An empty block chain': {
		topic: function () {
			Step(
				makeEmptyTestChain,
				this.callback
			);
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
	}
});

tester.addBatch({
	'A chain with a single mined block': {
		topic: function () {
			var self = this;
			Step(
				makeEmptyTestChain,
				function createSingleBlock(err, chain) {
					if (err) throw err;

					var fakeBeneficiary = new Buffer(20).clear();

					createBlock(chain.getTopBlock(), chain, this);
				},
				self.callback
			);
		},

		'has a height of one': function (chain) {
			assert.equal(chain.getTopBlock().height, 1);
		}
	}
});

(function () {
	var blocks = {};

	function makeBlock(parent, name) {
		return function (err, chain) {
			if (err) throw err;

			blocks[name] = createBlock(blocks[parent], chain, this);
		};
	};

	tester.addBatch({
		'A chain after a split': {
			topic: function () {
				var self = this;

				var forkHead;
				Step(
					makeEmptyTestChain,
					function indexGenesisBlock(err, chain) {
						if (err) throw err;

						blocks['O'] = chain.getTopBlock();
						this(null, chain);
					},

					// Block chain layout:
					//   O -> A -> B -> C
					//         \-> D -> E -> F
					makeBlock('O', 'A'),
					makeBlock('A', 'B'),
					makeBlock('B', 'C'),
					makeBlock('A', 'D'),
					makeBlock('D', 'E'),
					makeBlock('E', 'F'),
					self.callback
				);
			},

			'has a height of four': function (chain) {
				assert.equal(chain.getTopBlock().height, 4);
			}
		}
	});
})();

tester.export(module);

function makeEmptyTestChain() {
	var callback = this;

	var settings = new Settings();
	var storage = new Storage('mongodb://localhost/bitcointest');

	settings.setUnitnetDefaults();

	storage.emptyDatabase(function (err, result) {
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

function createBlock(block, chain, callback) {
	var fakeBeneficiary = new Buffer(65).clear();
	fakeBeneficiary[0] = 0x04;
	for (var i = 1, l = fakeBeneficiary.length; i < l; i++) {
		fakeBeneficiary[i] = Math.floor(Math.random()*256);
	}

	return block.mineNextBlock(
		fakeBeneficiary,
		Math.floor(new Date().getTime() / 1000),
		new Miner(),
		function (err, newBlock, txs) {
			if (err) {
				callback(err);
				return;
			}

			chain.add(newBlock, txs, function (err, result) {
				callback(err, chain);
			});
		}
	);
};
