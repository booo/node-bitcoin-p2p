var vows = require('vows'),
    assert = require('assert');

var Storage = require('../lib/storage').Storage;
var BlockChain = require('../lib/blockchain').BlockChain;

vows.describe('Block Chain').addBatch({
	'An empty block chain': {
		topic: function () {
			var self = this;
			var chain = new BlockChain(new Storage('mongodb://localhost/bitcointest'));
			chain.on('initComplete', function () {
				self.callback(null, chain);
			});
			chain.init();
		},

		'is a BlockChain': function (blockChain) {
			assert.instanceOf(blockChain, BlockChain);
		},

		'contains the genesis block': {
			topic: function (topic) {
				return topic.getTopBlock();
			},

			'which is a block': function (topic) {
				assert.instanceOf(topic, topic.base.model('Block'));
			},

			'with a valid hash': function (topic) {
				assert.isTrue(topic.checkHash());
			},

			'that matches the expected genesis block hash': function (topic) {
				var expectedHash = new Buffer('6FE28C0AB6F1B372C1A6A246AE63F74F' +
											  '931E8365E15A089C68D6190000000000', 'hex');
				assert.equal(expectedHash.compare(topic.getHash()), 0);
			},

			'has the correct height': function (topic) {
				assert.equal(+topic.height, 0);
			}
		}
	}
}).export(module);
