var logger = require('../../logger');
var Step = require('step');
var Storage = require('../../storage').Storage;
var Connection = require('../../connection').Connection;
var util = require('util');
var fs = require('fs');
var url = require('url');

var leveldb = require('leveldb'); // database
var DB = leveldb.DB;
var WriteBatch = leveldb.WriteBatch;

var Block = require('../../schema/block').Block;
var Transaction = require('../../schema/transaction').Transaction;

function serializeBlock(block)
{
  var data = {
    prev_hash: block.prev_hash.toString('binary'),
    merkle_root: block.merkle_root.toString('binary'),
    timestamp: block.timestamp,
    bits: block.bits,
    nonce: block.nonce,
    version: block.version,
    height: block.height,
    size: block.size,
    active: block.active,
    chainWork: block.chainWork.toString('binary'),
    txs: block.txs.map(function (hash) {
      return hash.toString('binary');
    })
  };

  return JSON.stringify(data);
};

function deserializeBlock(data) {
  data = JSON.parse(data);
  data.prev_hash = new Buffer(data.prev_hash, 'binary');
  data.merkle_root = new Buffer(data.merkle_root, 'binary');
  data.chainWork = new Buffer(data.chainWork, 'binary');
  data.txs = data.txs.map(function (hash) {
      return new Buffer(hash, 'binary');
  });
  return new Block(data);
};

function serializeTransaction(tx) {
  return tx.serialize();
};

function deserializeTransaction(data) {
  return new Transaction(Connection.parseTx(data));
};

function formatHeightKey(height) {
  var tempHeightBuffer = new Buffer(4);
  height = Math.floor(+height);
  tempHeightBuffer[0] = height >> 24 & 0xff;
  tempHeightBuffer[1] = height >> 16 & 0xff;
  tempHeightBuffer[2] = height >>  8 & 0xff;
  tempHeightBuffer[3] = height       & 0xff;
  return tempHeightBuffer;
};

var LeveldbStorage = exports.LeveldbStorage = exports.Storage =
function LeveldbStorage(uri) {
  var self = this;

  var hBlock;
  var hTransaction;
  var hBlockPrevIndex;
  var bBlockHeightIndex;
  var bBlockTxsIndex;
  var bTxAffectsIndex;
  var hSpentIndex;

  var connInfo = url.parse(uri);
  var prefix = connInfo.path;

  var connected = false;
  var connect = this.connect = function connect(callback) {
    if (connected) {
      callback(null);
      return;
    }
    connected = true;

    Step(
      function createBlockDb() {
        self.hBlock = hBlock = new DB();
        hBlock.open(prefix+'block.db', {create_if_missing: true}, this);
      },
      function createTransactionDb(err) {
        if (err) throw err;

        self.hTransaction = hTransaction = new DB();
        hTransaction.open(prefix+'tx.db', {create_if_missing: true}, this);
      },
      function createBlockPrevIndexDb(err) {
        if (err) throw err;
        
        self.hBlockPrevIndex = hBlockPrevIndex = new DB();
        hBlockPrevIndex.open(prefix+'bpi.db', {create_if_missing: true}, this);
      },
      function createBlockHeightIndexDb(err) {
        if (err) throw err;
        
        self.bBlockHeightIndex = bBlockHeightIndex = new DB();
        bBlockHeightIndex.open(prefix+'bhi.db', {create_if_missing: true}, this);
      },
      function createBlockTxsIndexDb(err) {
        if (err) throw err;
        
        self.bBlockTxsIndex = bBlockTxsIndex = new DB();
        bBlockTxsIndex.open(prefix+'bti.db', {create_if_missing: true}, this);
      },
      function createTxAffectsIndexDb(err) {
        if (err) throw err;
        
        self.bTxAffectsIndex = bTxAffectsIndex = new DB();
        bTxAffectsIndex.open(prefix+'tai.db', {create_if_missing: true}, this);
      },
      function createSpentIndexDb(err) {
        if (err) throw err;
        
        self.hSpentIndex = hSpentIndex = new DB();
        hSpentIndex.open(prefix+'spent.db', {create_if_missing: true}, this);
      },
      callback
    );
  };

  var disconnect = this.disconnect = function disconnect(callback) {
    if (!connected) {
      callback(null);
      return;
    }
    Step(
      function createBlockDb() {
        hBlock.close(this);
      },
      function createTransactionDb(err) {
        if (err) throw err;
        hTransaction.close(this);
      },
      function createBlockPrevIndexDb(err) {
        if (err) throw err;
        hBlockPrevIndex.close(this);
      },
      function createBlockHeightIndexDb(err) {
        if (err) throw err;
        bBlockHeightIndex.close(this);
      },
      function createBlockTxsIndexDb(err) {
        if (err) throw err;
        bBlockTxsIndex.close(this);
      },
      function createTxAffectsIndexDb(err) {
        if (err) throw err;
        bTxAffectsIndex.close(this);
      },
      callback
    );
  };

  var emptyDatabase = this.emptyDatabase =
  function emptyDatabase(callback) {
    Step(
      function () {
        disconnect(this);
      },
      function (err) {
        if (err) throw err;
        DB.destroyDB(prefix+'block.db', {});
        DB.destroyDB(prefix+'tx.db', {});
        DB.destroyDB(prefix+'bpi.db', {});
        DB.destroyDB(prefix+'bhi.db', {});
        DB.destroyDB(prefix+'bti.db', {});
        DB.destroyDB(prefix+'tai.db', {});
        DB.destroyDB(prefix+'spent.db', {});
        this(null);
      },
      function (err) {
        if (err) throw err;
        connected = false;
        connect(this);
      },
      callback
    );
  };

  this.dropDatabase = function (callback) {
    DB.destroyDB(prefix+'block.db', {});
    DB.destroyDB(prefix+'tx.db', {});
    DB.destroyDB(prefix+'bpi.db', {});
    DB.destroyDB(prefix+'bhi.db', {});
    DB.destroyDB(prefix+'bti.db', {});
    DB.destroyDB(prefix+'tai.db', {});
    DB.destroyDB(prefix+'spent.db', {});
    callback(null);
  };

  this.saveBlock = function (block, callback) {
    var hash = block.getHash();
    var data = serializeBlock(block);
    Step(
      function () {
        hBlock.put(hash, data, this);
      },
      function (err) {
        if (err) throw err;

        // TODO: Encode as integer
        var height = formatHeightKey(block.height);
        bBlockHeightIndex.put(height, hash, this);
      },
      function (err) {
        if (err) throw err;

        hBlockPrevIndex.put(block.prev_hash, hash, this);
      },
      callback
    );
  };

  this.saveTransaction = function (tx, callback) {
    var hash = tx.getHash();
    var data = serializeTransaction(tx);
    hTransaction.put(hash, data, callback);
  };

  this.saveTransactions = function (txs, callback) {
    var wb = new WriteBatch();
    txs.forEach(function (tx) {
      wb.put(tx.getHash(), serializeTransaction(tx));
    });
    hTransaction.write(wb, callback);
  };

  var connectTransaction = this.connectTransaction =
  function connectTransaction(tx, callback) {
    connectTransactions([tx], callback);
  };

  var connectTransactions = this.connectTransactions =
  function connectTransactions(txs, callback) {
    var wb = new WriteBatch();
    txs.forEach(function (tx) {
      if (tx.isCoinBase()) {
        return;
      }
      tx.ins.forEach(function (txin) {
        wb.put(txin.o, '');
      });
    });
    hSpentIndex.write(wb, callback);
  };

  var disconnectTransaction = this.disconnectTransaction =
  function disconnectTransaction(tx, callback) {
    disconnectTransactions([tx], callback);
  };

  var disconnectTransactions = this.disconnectTransactions =
  function disconnectTransactions(txs, callback) {
    var wb = new WriteBatch();
    txs.forEach(function (tx) {
      tx.ins.forEach(function (txin) {
        wb.del(txin.o);
      });
    });
    hSpentIndex.write(wb, callback);
  };

  var getTransactionByHash = this.getTransactionByHash =
  function getTransactionByHash(hash, callback) {
    hTransaction.get(hash, true, function (err, data) {
      if (err) {
        callback(err);
        return;
      }
      if (data) {
        data = deserializeTransaction(data);
      }
      callback(null, data);
    });
  };

  var getTransactionsByHashes = this.getTransactionsByHashes =
  function getTransactionsByHashes(hashes, callback) {
    Step(
      function () {
        var group = this.group();
        for (var i = 0, l = hashes.length; i < l; i++) {
          hTransaction.get(hashes[i], true, group());
        }
      },
      function (err, result) {
        if (err) throw err;
        var txs = [];
        result.forEach(function (tx) {
          if (tx) {
            txs.push(deserializeTransaction(tx));
          }
        });
        this(null, txs);
      },
      callback
    );
  };

  this.getOutputsByHashes = function (hashes, callback) {
    getTransactionsByHashes(hashes, callback);
  };

  var getBlockByHash = this.getBlockByHash =
  function getBlockByHash(hash, callback) {
    hBlock.get(hash, true, function getBlockByHashCallback(err, data) {
      if (err) {
        callback(err);
        return;
      }

      if (data) {
        data = deserializeBlock(data);
      }

      callback(null, data);
    });
  };

  var getBlocksByHashes = this.getBlocksByHashes =
  function getBlocksByHashes(hashes, callback) {
    Step(
      function () {
        var group = this.group();
        for (var i = 0, l = hashes.length; i < l; i++) {
          if (hashes[i]) {
            hBlock.get(hashes[i], true, group());
          }
        }
      },
      function (err, result) {
        if (err) throw err;

        var blocks = [];
        result.forEach(function (block) {
          if (block) {
            blocks.push(deserializeBlock(block));
          }
        });

        callback(null, blocks);
      },
      callback
    );
  };

  var getBlockByHeight = this.getBlockByHeight =
  function getBlockByHeight(height, callback) {
    height = formatHeightKey(height);
    Step(
      function () {
        bBlockHeightIndex.get(height, true, this);
      },
      function (err, result) {
        if (err) throw err;

        if (!result) {
          this(null, null);
        } else {
          getBlockByHash(result, this);
        }
      },
      callback
    );
  };

  var getBlocksByHeights = this.getBlocksByHeights =
  function getBlocksByHeights(heights, callback)
  {
    Step(
      function () {
        var group = this.group();
        for (var i = 0, l = heights.length; i < l; i++) {
          bBlockHeightIndex.get(formatHeightKey(heights[i]), true, group());
        }
      },
      function (err, hashes) {
        if (err) throw err;

        getBlocksByHashes(hashes, this);
      },
      function sortStep(err, blocks) {
        if (err) throw err;

        blocks = blocks.sort(function (a, b) {
          return a.height - b.height;
        });

        try {
          callback(null, blocks);
        } catch (err) {
          logger.error('Storage: Uncaught callback err: ' +
                       (err.stack ? err.stack : err.toString()));
        }
      }
    );
  };

  var getBlockByPrev = this.getBlockByPrev =
  function getBlockByPrev(block, callback) {
    if ("object" == typeof block && block.hash) {
      block = block.hash;
    }

    hBlockPrevIndex.get(block, true, function getBlockByPrevCallback(err, data) {
      if (err) {
        callback(err);
        return;
      }

      var hash = new Buffer(data, 'binary');

      if (data) {
        getBlockByHash(hash, callback);
      } else {
        callback(null, null);
      }
    });
  };

  var getTopBlock = this.getTopBlock =
  function getTopBlock(callback) {
    var iterator = bBlockHeightIndex.newIterator({});
    Step(
      function () {
        iterator.seekToLast(this);
      },
      function (err) {
        if (err) throw err;

        var hash = iterator.value();
        getBlockByHash(hash, this);
      },
      callback
    );
  };

  /**
   * Find the latest matching block from a locator.
   *
   * A locator is basically just a list of hashes. We send it to the database
   * and ask it to get the latest block that is in the list.
   */
  var getBlockByLocator = this.getBlockByLocator =
  function (locator, callback)
  {
    getBlocksByHashes(locator, function (err, blocks) {
      if (err) {
        callback(err);
        return;
      }

      var highest = null;
      blocks.forEach(function (block) {
        if (block.active &&
            ((!highest) || block.height > highest.height)) {
          highest = block;
        }
      });

      callback(null, highest);
    });
  };

  var countConflictingTransactions = this.countConflictingTransactions =
  function countConflictingTransactions(outpoints, callback) {
    Step(
      function queryOutpointsStep() {
        var group = this.group();
        for (var i = 0, l = outpoints.length; i < l; i++) {
          hSpentIndex.get(outpoints[i], group());
        }
      },
      function reduceResultStep(err, results) {
        if (err) {
          callback(err);
          return;
        }
        var count = results.reduce(function(sum, result){  
          return "string" === typeof result ? ++sum : sum;
        }, 0);
        callback(null, count);
      }
    );
  };

  var getConflictingTransactions = this.getConflictingTransactions =
  function getConflictingTransactions(outpoints, callback) {
    throw new Error('not implemented');
  };

  var knowsBlock = this.knowsBlock =
  function knowsBlock(hash, callback) {
    getBlockByHash(hash, function (err, block) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, !!block);
    });
  };

  var knowsTransaction = this.knowsTransaction =
  function knowsTransction(hash, callback) {
    getTransactionByHash(hash, function (err, tx) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, !!tx);
    });
  };
};

util.inherits(LeveldbStorage, Storage);
