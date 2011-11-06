var vows = require('vows'),
    assert = require('assert');

var Storage = require('../lib/storage').Storage;
var encodeHex = require('../lib/util').encodeHex;

var Block = require('../lib/schema/block').Block;
var Transaction = require('../lib/schema/transaction').Transaction;

var Step = require('step');

var testBlock1 = new Block({
  nonce: 1,
  height: 5,
  active: true
});

var testBlock2 = new Block({
  nonce: 2,
  height: 8,
  active: true
});

var testBlock3 = new Block({
  nonce: 3,
  height: 2,
  active: true
});

var testBlock4 = new Block({
  nonce: 4,
  height: 9,
  active: true
});

var testTx1 = new Transaction({
});

vows.describe('Storage').addBatch({
  'A database': {
    topic: function () {
      var callback = this.callback;
      var storage = Storage.get('mongodb://localhost/bitcointest');

      Step(
        function connectStep() {
          storage.connect(this);
        },
        function emptyStep(err) {
          if (err) throw err;
          storage.emptyDatabase(this);
        },
        function insertBlock1(err) {
          if (err) throw err;
          storage.saveBlock(testBlock1, this);
        },
        function insertBlock2(err) {
          if (err) throw err;
          storage.saveBlock(testBlock2, this);
        },
        function insertBlock3(err) {
          if (err) throw err;
          storage.saveBlock(testBlock3, this);
        },
        function insertBlock4(err) {
          if (err) throw err;
          storage.saveBlock(testBlock4, this);
        },
        function insertTx1(err) {
          if (err) throw err;
          storage.saveTransaction(testTx1, this);
        },
        function startTests(err) {
          callback(err, storage);
        }
      );
      return;
    },

    'is a Storage': function (storage) {
      assert.instanceOf(storage, Storage);
    },

    'can fetch a block by hash': {
      topic: function (storage) {
        var callback = this.callback;

        storage.getBlockByHash(testBlock1.getHash(), function (err, block) {
          if (err) {
            callback(err);
            return;
          }

          callback(null, block);
        });
      },

      'returning a Block': function (topic) {
        assert.instanceOf(topic, Block);
      },

      'with the right hash': function (topic) {
        assert.equal(
          encodeHex(topic.calcHash()),
          encodeHex(testBlock1.calcHash())
        );
      },

      'with the right height': function (topic) {
        assert.equal(topic.height,
                     testBlock1.height);
      },

      "that retained its 'active' flag": function (topic) {
        assert.equal(topic.active,
                     testBlock1.active);
      }
    },

    'can fetch a block by height': {
      topic: function (storage) {
        var callback = this.callback;

        storage.getBlockByHeight(testBlock2.height, function (err, block) {
          if (err) {
            callback(err);
            return;
          }

          callback(null, block);
        });
      },
      'returning a Block': function (topic) {
        assert.instanceOf(topic, Block);
      },
      'with the correct hash': function (topic) {
        assert.equal(
          encodeHex(topic.calcHash()),
          encodeHex(testBlock2.calcHash())
        );
      }
    },

    'can fetch blocks by hashes': {
      topic: function (storage) {
        var callback = this.callback;

        storage.getBlocksByHashes(
          [testBlock2.getHash(), testBlock3.getHash()],
          function (err, blocks) {
            if (err) {
              callback(err);
              return;
            }
            
            callback(null, blocks);
          }
        );
      },
      'returning an array of Blocks': function (topic) {
        assert.isTrue(Array.isArray(topic));
        topic.forEach(function (block) {
          assert.instanceOf(block, Block);
        });
      },
      'of the right length': function (topic) {
        assert.equal(topic.length, 2);
      },
      'with the right hashes': function (topic) {
        assert.equal(
          encodeHex(topic[0].calcHash()),
          encodeHex(testBlock2.getHash())
        );
        assert.equal(
          encodeHex(topic[1].calcHash()),
          encodeHex(testBlock3.getHash())
        );
      }
    },

    'can fetch blocks by heights': {
      topic: function (storage) {
        var callback = this.callback;

        storage.getBlocksByHeights(
          [testBlock2.height, testBlock4.height],
          function (err, blocks) {
            if (err) {
              callback(err);
              return;
            }
            
            callback(null, blocks);
          }
        );
      },
      'returning an array of Blocks': function (topic) {
        assert.isTrue(Array.isArray(topic));
        topic.forEach(function (block) {
          assert.instanceOf(block, Block);
        });
      },
      'of the right length': function (topic) {
        assert.equal(topic.length, 2);
      },
      'with the right hashes': function (topic) {
        assert.equal(
          encodeHex(topic[0].calcHash()),
          encodeHex(testBlock2.getHash())
        );
        assert.equal(
          encodeHex(topic[1].calcHash()),
          encodeHex(testBlock4.getHash())
        );
      }
    },

    'can fetch the top block': {
      topic: function (storage) {
        var callback = this.callback;

        storage.getTopBlock(function (err, block) {
          if (err) {
            callback(err);
            return;
          }

          callback(null, block);
        });
      },

      'returning a Block': function (topic) {
        assert.instanceOf(topic, Block);
      },

      'which matches the correct hash': function (topic) {
        assert.equal(
          encodeHex(topic.calcHash()),
          encodeHex(testBlock4.getHash())
        );
      }
    },

    'can fetch a block by locator': {
      topic: function (storage) {
        var callback = this.callback;

        var locator = [testBlock1.getHash(), testBlock4.getHash()];

        storage.getBlockByLocator(locator, function (err, block) {
          if (err) {
            callback(err);
            return;
          }

          callback(null, block);
        });
      },

      'returning a Block': function (topic) {
        assert.instanceOf(topic, Block);
      },

      'which matches the correct hash': function (topic) {
        assert.equal(
          encodeHex(topic.calcHash()),
          encodeHex(testBlock4.getHash())
        );
      }
    },

    'can fetch a transaction by hash': {
      topic: function (storage) {
        var callback = this.callback;

        storage.getTransactionByHash(testTx1.getHash(), function (err, tx) {
          if (err) {
            callback(err);
            return;
          }

          callback(null, tx);
        });
      },

      'returning a Transaction': function (topic) {
        assert.instanceOf(topic, Transaction);
      },

      'matches its former hash': function (topic) {
        assert.equal(
          encodeHex(topic.calcHash()),
          encodeHex(testTx1.getHash())
        );
      }
    }
  }
}).export(module);
