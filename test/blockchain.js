var vows = require('vows'),
    assert = require('assert');

var Storage = require('../lib/storage').Storage;
var Settings = require('../lib/settings').Settings;
var BlockChain = require('../lib/blockchain').BlockChain;
var Miner = require('../lib/miner/javascript.js').JavaScriptMiner;
var encodeHex = require('../lib/util').encodeHex;

var Step = require('step');

vows.describe('Block Chain').addBatch({
  'An empty block chain': {
    topic: makeTestChain(),

    'is a BlockChain': function (topic) {
      assert.instanceOf(topic.chain, BlockChain);
    },

    'contains the genesis block which': {
      topic: function (topic) {
        return topic.chain.getTopBlock();
      },

      'is a block': function (topic) {
        assert.instanceOf(topic, topic.base.model('Block'));
      },

      'has a valid hash': function (topic) {
        assert.isTrue(topic.checkHash());
      },

      'has the correct hash': function (topic) {
        var expectedHash = '14DAE1DB98CA7EFA42CC9EBE7EBB19BD' +
                           '88D80D6CBD3C4A993C20B47401D238C6';

        var actualHash = encodeHex(topic.getHash()).toUpperCase();

        assert.equal(actualHash, expectedHash);
      },

      'has a height of zero': function (topic) {
        assert.equal(+topic.height, 0);
      }
    },
  }
}).addBatch({
  'A chain with a single mined block': {
    topic: makeTestChain({
      blocks: [
        // O -> A
        ['O', 'A']
      ]
    }),

    'has a height of one': function (topic) {
      assert.equal(topic.chain.getTopBlock().height, 1);
    }
  }
}).addBatch({
  'A chain after a split': {
    topic: makeTestChain({
      blocks: [
        // O -> A -> B -> C
        //       `-> D -> E -> F
        ['O', 'A'],
        ['A', 'B'],
        ['B', 'C'],
        ['A', 'D'],
        ['D', 'E'],
        ['E', 'F']
      ]
    }),

    'has a height of four': function (topic) {
      assert.equal(topic.chain.getTopBlock().height, 4);
    },

    'has F as the top block': function (topic) {
      assert.equal(encodeHex(topic.chain.getTopBlock().getHash()),
                   encodeHex(topic.blocks.F.getHash()));
    }
  }
}).addBatch({
  'A chain after a split and reversal': {
    topic: makeTestChain({
      blocks: [
        // O -> A -> B -> C -> G -> H
        //       `-> D -> E -> F
        ['O', 'A'],
        ['A', 'B'],
        ['B', 'C'],
        ['A', 'D'],
        ['D', 'E'],
        ['E', 'F'],
        ['C', 'G'],
        ['G', 'H']
      ]
    }),

    'has a height of five': function (topic) {
      assert.equal(topic.chain.getTopBlock().height, 5);
    },

    'has H as the top block': function (topic) {
      assert.equal(encodeHex(topic.chain.getTopBlock().getHash()),
                   encodeHex(topic.blocks.H.getHash()));
    },

    'for block locator A, E, F': {
      topic: function (topic) {
        var self = this;

        var blockLocator = [];
        blockLocator.push(topic.blocks.A.getHash());
        blockLocator.push(topic.blocks.E.getHash());
        blockLocator.push(topic.blocks.F.getHash());

        topic.chain.getBlockByLocator(blockLocator, function (err, resultBlock) {
          if (err) throw err;

          self.callback(err, resultBlock, topic);
        });
      },

      'returns A': function (err, resultBlock, topic) {
        assert.equal(encodeHex(resultBlock.getHash()),
                     encodeHex(topic.blocks.A.getHash()));
      }
    }
  }
}).export(module);

function makeTestChain(descriptor) {
  var blocks = {};
  var events = [];

  descriptor = descriptor || {};

  function makeBlock(blockDesc) {
    // Translate shorthand into normal block descriptor
    if (Array.isArray(blockDesc)) {
      blockDesc = {
        parent: blockDesc[0],
        name: blockDesc[1]
      };
    }

    return function (err, chain) {
      if (err) throw err;

      blocks[blockDesc.name] = createBlock(blocks[blockDesc.parent], chain, this);
    };
  };

  return function () {
    var steps = [];

    steps.push(makeEmptyTestChain);
    steps.push(function setupTest(err, chain) {
      if (err) throw err;

      // Index genesis block
      blocks['O'] = chain.getTopBlock();

      // Monkey-patch a mechanism onto the block chain captures all events.
      chain.__emit = chain.emit;
      chain.emit = function captureEvent() {
        var args = Array.prototype.slice.call(arguments, 0);
        events.push(args);
        this.__emit.apply(this, args);
      };

      this(null, chain);
    });

    if (Array.isArray(descriptor.blocks)) {
      descriptor.blocks.forEach(function (blockDesc) {
        steps.push(makeBlock(blockDesc));
      });
    }

    steps.push(function createTesterObject(err, chain) {
      if (err) throw err;

      var topic = {};

      topic.chain = chain;
      topic.blocks = blocks;
      topic.events = events;

      return topic;
    });

    steps.push(this.callback);

    Step.apply(null, steps);
  };
};

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
