var vows = require('vows'),
    assert = require('assert');

var Storage = require('../lib/storage').Storage;
var Settings = require('../lib/settings').Settings;
var BlockChain = require('../lib/blockchain').BlockChain;
var Miner = require('../lib/miner/javascript.js').JavaScriptMiner;
var encodeHex = require('../lib/util').encodeHex;

var Block = require('../lib/schema/block').Block;

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
        assert.instanceOf(topic, Block);
      },

      'has a valid hash': function (topic) {
        assert.equal(
          encodeHex(topic.getHash()),
          '14dae1db98ca7efa42cc9ebe7ebb19bd88d80d6cbd3c4a993c20b47401d238c6'
        );
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
  'A chain downloaded in the wrong order': {
    topic: makeTestChain({
      blocks: [
        // O -> A -> B -> C -> D -> E -> F
        // (added in order O, A, D, B, C, E, B (dup), F)
        ['O', 'A'],
        ['C', 'D'],
        ['A', 'B'],
        ['B', 'C'],
        ['D', 'E'],
        ['A', 'B'],
        ['E', 'F']
      ]
    }),

    'has a height of six': function (topic) {
      assert.equal(topic.chain.getTopBlock().height, 6);
    },

    'has F as the top block': function (topic) {
      assert.equal(encodeHex(topic.chain.getTopBlock().getHash()),
                   encodeHex(topic.blocks.F.getHash()));
    }
  }
}).addBatch({
  'A chain after just a split': {
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

      'returns a Block': function (err, result) {
        assert.instanceOf(result, Block);
      },

      'returns A': function (err, resultBlock, topic) {
        assert.equal(encodeHex(resultBlock.getHash()),
                     encodeHex(topic.blocks.A.getHash()));
      }
    }
  }
}).addBatch({
  'A chain after a duplicate download': {
    topic: makeTestChain({
      blocks: [
        // O -> A -> B -> C -> D -> E -> F -> G -> H
        ['O', 'A'],
        ['A', 'B'],
        ['A', 'B'],
        ['B', 'C'],
        ['B', 'C'],
        ['C', 'D'],
        ['C', 'D'],
        ['C', 'D'],
        ['E', 'F'],
        ['D', 'E'],
        ['D', 'E'],
        ['E', 'F'],
        ['F', 'G'],
        ['F', 'G'],
        ['G', 'H'],
        ['G', 'H']
      ]
    }),

    'has a height of eight': function (topic) {
      assert.equal(topic.chain.getTopBlock().height, 8);
    },

    'has H as the top block': function (topic) {
      assert.equal(encodeHex(topic.chain.getTopBlock().getHash()),
                   encodeHex(topic.blocks.H.getHash()));
    }
  }
}).export(module);

function makeTestChain(descriptor) {
  var blocks = {};
  var blockTxs = {};
  var events = [];

  var callback = this.callback;

  descriptor = descriptor || {};

  function makeBlock(blockDesc) {
    return function (err, chain) {
      if (err) throw err;

      createBlock(blocks[blockDesc.parent], chain, this);
    };
  };


  function indexBlock(blockDesc) {
    return function (err, chain, block, txs) {
      if (err) throw err;

      blocks[blockDesc.name] = block;
      blockTxs[blockDesc.name] = txs;
      this(null, chain);
    };
  };

  return function () {
    var steps = [];

    // Create the chain where we will *generate* the blocks on
    steps.push(makeEmptyTestChain);
    steps.push(function setupGen(err, chain) {
      if (err) throw err;

      // Index genesis block
      blocks['O'] = chain.getTopBlock();

      this(null, chain);
    });
    if (Array.isArray(descriptor.blocks)) {
      // Translate shorthand into normal block descriptor
      descriptor.blocks = descriptor.blocks.map(function (blockDesc) {
        if (Array.isArray(blockDesc)) {
          blockDesc = {
            parent: blockDesc[0],
            name: blockDesc[1]
          };
        }
        return blockDesc;
      });

      var blockIndex = {O: true};
      var toProcess = descriptor.blocks.slice();
      while (toProcess.length) {
        var blockDesc = toProcess.shift();

        // Blocks can appear in the wrong order in the test description, but
        // we need to generate them in the right order.
        if (!blockIndex[blockDesc.parent]) {
          // TODO: This can cause an infinite loop if the test description is
          //       invalid.
          toProcess.push(blockDesc);
          continue;
        }

        // The test description can contain duplicates, in that case only
        // generate the block the first time.
        if (blockIndex[blockDesc.name]) {
          continue;
        }

        steps.push(makeBlock(blockDesc));
        steps.push(indexBlock(blockDesc));
        blockIndex[blockDesc.name] = true;
      }
    }

    // Create another chain where we will simulate a *download* of these blocks
    steps.push(makeEmptyTestChain);
    steps.push(function setupTest(err, chain) {
      if (err) throw err;

      // Monkey-patch a mechanism onto the block chain captures all events.
      chain.__emit = chain.emit;
      chain.emit = function captureEvent() {
        var args = Array.prototype.slice.call(arguments, 0);
        events.push(args);
        this.__emit.apply(this, args);
      };

      this(null, chain);
    });

    // Simulate block download
    if (Array.isArray(descriptor.blocks)) {
      descriptor.blocks.forEach(function (blockDesc) {
        steps.push(function simulateDownload(err, chain) {
          if (err) throw err;

          if (!blocks[blockDesc.name]) {
            throw new Error("Test block "+blockDesc.name+" was not " +
                            "generated successfully.");
          }

          var callback = this.parallel();

          chain.add(
            blocks[blockDesc.name],
            blockTxs[blockDesc.name],
            function (err) {
              callback(null, chain);
            }
          );
        });
      });
    }

    steps.push(function createTesterObject(err, chain) {
      if (err) throw err;

      var topic = {};

      topic.chain = chain;
      topic.blocks = blocks;
      topic.events = events;

      this(null, topic);
    });

    steps.push(this.callback);

    Step.apply(null, steps);
  };
};

function makeEmptyTestChain(err) {
  if (err) throw err;

  var callback = this;

  var settings = new Settings();
  var storage = Storage.get('mongodb://localhost/bitcointest');

  settings.setUnitnetDefaults();

  storage.connect(function (err) {
    if (err) {
      callback(err);
      return;
    }

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

      chain.add(newBlock, txs, function (err) {
        callback(err, chain, newBlock, txs);
      });
    }
  );
};
