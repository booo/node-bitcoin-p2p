var bitcoin = require('../../lib/bitcoin');
var logger = require('../../lib/logger');

var util = require('util');
require('buffertools');
var uuid = require('node-uuid');
var Step = require('step');
var Module = require('./webservice').Module;
var Util = bitcoin.Util;

var PubkeysCache = function () {
  events.EventEmitter.call(this);
};

util.inherits(PubkeysCache, events.EventEmitter);

var PubkeysData = function () {
  events.EventEmitter.call(this);
};

util.inherits(PubkeysData, events.EventEmitter);

var cache = new PubkeysCache();

var Pubkeys = exports.Pubkeys = Module.define({
  title: "Welcome to your webservice!",
  name: "public keys service",
  version: "0.1.0",
  construct: function (params) {
    this.node = params.node;
  },
  schema: {
    'node': { type: bitcoin.Node, required: true }
  }
});

Pubkeys.method('echo', {
  schema: {
    msg: { type: String, required: true }
  },
  handler: function (options, callback) {
    callback(null, options.msg);
  }
});

function addTxToChain(data, e) {
  try {
    var chainHash;
    if (data.chain.length) {
      var lastEntry = data.chain[data.chain.length-1];
      var prevHash = new Buffer(lastEntry.chainHash, 'base64');
      chainHash = Util.sha256(prevHash.concat(e.tx.hash));
    } else {
      chainHash = e.tx.hash;
    }
    var chainTx = {
      hash: e.tx.hash,
      chainHash: chainHash,
      height: e.block.height,
      index: e.tx.index
    };
    data.chain.push(chainTx);

    data.emit('txAdd', {data: data, tx: e.tx, chainTx: chainTx, block: e.block});
  } catch (err) {
    logger.error("addTxToChain Error: "+err);
  }
};

function revokeTxFromChain(data, e) {
  // TODO: Implement
};

Pubkeys.method('register', {
  schema: {
    keys: { type: String }
  },
  handler: function (params, callback) {
    var handle = Util.sha256(params.keys).toString('base64');

    var storage = this.node.getStorage();
    var blockChain = this.node.getBlockChain();

    // Validate keys
    var keys = params.keys.split(',');
    var pubKeyHashes = [];
    for (var i = 0; i < keys.length; i++) {
      // Trim whitespace
      var key = keys[i].replace(/^\s+|\s+$/g, '');

      // Ignore empty keys
      if (!key.length) continue;

      // Convert Bitcoin address to pubkey hash
      var pubKeyHash = Util.addressToPubKeyHash(keys[i]);
      if (!pubKeyHash) {
        callback({
          type: "InvalidKeys",
          message: "This is not a valid Bitcoin address: '"+keys[i]+"'"
        });
        return;
      }
      pubKeyHashes.push(pubKeyHash);
    }

    // Make sure we have at least one key
    if (!pubKeyHashes.length) {
      callback({
        type: "NoKeys",
        message: "Client did not provide any keys to register."
      });
      return;
    }

    function getDataForKeys(storage, pubKeyHashes, callback) {
      for (var i = 0; i < pubKeyHashes.length; i++) {
        var pubKeyHash = pubKeyHashes[i];
      }

      var txs;
      var data = new PubkeysData();
      Step(
        function getTxHashesStep() {
          storage.getAffectedTransactions(pubKeyHashes, this);
        },
        function getTxsStep(err, txHashes) {
          if (err) throw err;

          storage.getTransactionsByHashes(txHashes, this);
        },
        function (err, txData) {
          if (err) throw err;

          txs = txData;

          pubKeyHashes.forEach(function (pubKeyHash) {
            // Set up events for new transactions
            var hash64 = pubKeyHash.toString('base64');
            blockChain.addListener('txAdd:'+hash64, addTxToChain.bind(global, data));
            blockChain.addListener('txRevoke:'+hash64, revokeTxFromChain.bind(global, data));
          });

          data.accounts = pubKeyHashes.map(function (pubKeyHash) {
            return {pubKeyHash: pubKeyHash};
          });
          data.chain = [];

          var txsArray = [];
          var accIndex = {};

          // If there are no transactions, skip this step. This is
          // needed because Step hangs if no this.parallel() is called.
          if (!txs.length) {
            this(null);
            return;
          }

          var parallel = this.parallel;
          txs.forEach(function (tx) {
            var cb = parallel();
            storage.getContainingBlock(tx.getHash(), function (err, blockHash) {
              if (err) {
                cb(err);
                return;
              }

              storage.getBlockByHash(blockHash, cb);
            });
          });
        },
        function processBlockMetaInfo() {
          var blocks = Array.prototype.slice.apply(arguments);
          var err = blocks.shift();

          if (err) throw err;

          txs = txs.map(function (tx, i) {
            for (var j = 0, l = blocks[i].txs.length; j < l; j++) {
              if (blocks[i].txs[j].compare(tx.hash) == 0) {
                break;
              }
            }
            return {
              tx: tx,
              height: blocks[i].height,
              index: j
            };
          });
          this(null);
        },
        function generateChain(err) {
          if (err) throw err;

          // Sort transactions by height, then index
          txs.sort(function (a,b) {
            if (a.height == b.height) {
              return a.index - b.index;
            } else {
              return a.height - b.height;
            }
          });

          // Create a chain with only unique values
          var curHash, lastHash, chainHash;
          for (var i = 0; i < txs.length; i++) {
            curHash = txs[i].tx.hash;
            // Add first tx
            if (i == 0) {
              chainHash = curHash;

              // Add only unique txs
              // (we only need to check against the last one as they are sorted)
            } else if (lastHash.compare(curHash) != 0) {
              chainHash = Util.sha256(chainHash.concat(curHash));
            } else {
              continue;
            }
            data.chain.push({
              hash: curHash,
              chainHash: chainHash,
              height: txs[i].height,
              index: txs[i].index
            });
            lastHash = curHash;
          }

          this(null, data);
        },
        callback
      );
    };

    if ("undefined" == typeof PubkeysCache[handle]) {
      // Set the handle to a function that waits for the result, then triggers
      cache[handle] = function (callback) {
        cache.once(handle, callback);
      };
      getDataForKeys(storage, pubKeyHashes, function (err, data) {
        // Now that the result is ready, the handle should be a function
        // that calls the provided callback immediately
        cache[handle] = function (callback) {
          callback(err, data);
        };

        // Call any callbacks that are waiting for this data
        cache.emit(handle, err, data);
      });
    }

    // We don't wait for anything, we just return with the handle, the caching is
    // taking place in the background while we wait for the client's next request
    callback(null, {
      handle: handle
    });
  }
});

var MAX_PER_REQUEST = 100;

Pubkeys.method('gettxs', {
  schema: {
    handle: { type: String, required: true }
  },
  handler: function (params, callback) {
    var self = this;

    var handle = params.handle;
    var txLocator = params.txLocator ? params.txLocator : [];

    var storage = this.node.getStorage();
    var blockChain = this.node.getBlockChain();

    function sendResult(err, data) {
      if (err) {
        err.type = 'ServerError';
        callback(err);
        return;
      }

      var top = data.chain.length ?
        data.chain[data.chain.length-1].chainHash :
        Util.NULL_HASH;

      var start = 0;
      loop:
      if (txLocator.length) {
        for (var i = data.chain.length-1; i >= 0; i--) {
          for (var j = 0; j < txLocator.length; j++) {
            if (data.chain[i].hash.compare(txLocator[j]) == 0) {
              start = i;
              break loop;
            }
          }
        }
      }

      var txs = data.chain.slice(i, MAX_PER_REQUEST);

      var txsHashes = txs.map(function (val) {
        return val.hash;
      });
      Step(
        function loadTransactions() {
          storage.getTransactionsByHashes(txsHashes, this);
        },
        function loadBlocks(err, txData) {
          if (err) throw err;

          var txIndex = {};
          txData.forEach(function (tx) {
            txIndex[tx.getHash().toString('base64')] = tx;
          });

          if (!txs.length) {
            this(null);
          }

          for (var i = 0, l = txs.length; i < l; i++) {
            var cb = this.parallel();

            storage.getContainingBlock(
              txs[i].hash,
              function (i, err, blockHash) {
                storage.getBlockByHash(blockHash, function (err, block) {
                  if (err) {
                    // Query error
                    txs[i] = null;
                    cb(err);
                    return;
                  } else if (!(block && block.active)) {
                    // Block invalid or inactive, ignore transaction
                    txs[i] = null;
                    cb(null);
                    return;
                  } else {
                    // Success

                    // Create final tx metadata object
                    var dbObj = txIndex[txs[i].hash.toString('base64')];
                    txs[i] = self.createOutTx(dbObj, txs[i], block);
                    cb(null);
                  }
                });
              }.bind(this, i)
            );
          }
        },
        function finalize(err) {
          if (err) {
            err.type = 'ServerError';
            callback(err);
            return;
          }

          callback(null, {
            top: top.toString('base64'),
            txs: txs,
            height: +blockChain.getTopBlock().height
          });
        }
      );
    };

    if ("undefined" == typeof cache[handle]) {
      callback({
        type: 'UnknownHandle',
        message: 'Please use pubkeys/register to announce this handle first.'
      });
      return;
    } else {
      cache[handle](sendResult);
    }
  }
});

Pubkeys.method('getunconfirmedtxs', {
  schema: {
    handle: { type: String, required: true }
  },
  handler: function (params, callback) {
    var self = this;

    var handle = params.handle;
    var txLocator = params.txLocator ? params.txLocator : [];

    var txStore = this.node.getTxStore();

    function sendResult(err, data) {
      if (err) {
        err.type = 'ServerError';
        callback(err);
        return;
      }

      var accHashes = data.accounts.map(function (account) {
        return account.pubKeyHash.toString('base64');
      });

      txStore.findByKey(accHashes, function (err, txs) {
        txs = txs.map(function (tx) {
          return self.createOutTx(tx);
        });

        callback(null, {txs: txs});
      });
    };

    if ("undefined" == typeof cache[handle]) {
      callback({
        type: 'UnknownHandle',
        message: 'Please use pubkeys/register to announce this handle first.'
      });
      return;
    } else {
      cache[handle](sendResult);
    }
  }
});

Pubkeys.method('getinfo', {
  schema: {
    handle: { type: String, required: true }
  },
  handler: function (params, callback) {
    var handle = params.handle;

    function sendResult(err, data) {
      if (err) {
        err.type = 'ServerError';
        callback(err);
        return;
      }
      callback(null, data);
    };

    if ("undefined" == typeof cache[handle]) {
      callback({
        type: 'UnknownHandle',
        message: 'Please use pubkeys/register to announce this handle first.'
      });
      return;
    } else {
      cache[handle](sendResult);
    }
  }
});

Pubkeys.prototype.createOutTx = function (dbObj, chainTx, block) {
  var outObj = {
    version: +dbObj.version,
    lock_time: +dbObj.lock_time,
    hash: dbObj.hash.toString('base64'),
    ins: [],
    outs: []
  };

  dbObj.ins.forEach(function (dbTxin) {
    var outTxin = {};
    outTxin.outpoint = {
      hash: dbTxin.getOutpointHash().toString('base64'),
      index: +dbTxin.getOutpointIndex()
    };
    outTxin.script = dbTxin.s.toString('base64');
    outTxin.sequence = +dbTxin.q;
    outObj.ins.push(outTxin);
  });
  dbObj.outs.forEach(function (dbTxout) {
    var outTxout = {};
    outTxout.value = Util.valueToBigInt(new Buffer(dbTxout.v, 'base64')).toString();
    outTxout.script = dbTxout.s.toString('base64');
    outObj.outs.push(outTxout);
  });

  // chainTx and blockHash can be null if the transaction is unconfirmed
  if (chainTx) {
    outObj.chainHash = chainTx.chainHash.toString('base64');
    outObj.index = +chainTx.index;
  }

  if (block) {
    outObj.block = {
      hash: block.getHash().toString('base64'),
      height: +block.height
    };
    outObj.timestamp = block.timestamp;
  } else if (dbObj.first_seen) {
    outObj.timestamp = Math.floor(dbObj.first_seen.getTime()/1000);
  }

  return outObj;
};

/*
exports.node = null;

exports.echo = function(options, callback){
  callback(null, options.msg);
};
exports.echo.description = "this is the echo method, it echos back your msg";
exports.echo.schema = {
  msg: { 
    type: 'string',
    optional: false 
  }
};

exports.ping = function(options, callback){
  setTimeout(function(){
    callback(null, 'pong');
  }, 2000);
}
exports.ping.description = "this is the ping method, it pongs back after a 2 second delay";

exports.register = function (options, callback) {
  callback(null, '');
};
*/
