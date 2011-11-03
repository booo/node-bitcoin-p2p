var Script = require('../script').Script;
var ScriptInterpreter = require('../scriptinterpreter').ScriptInterpreter;
var Util = require('../util');
var bigint = require('bigint');
var Binary = require('../binary');
var error = require('../error');
var logger = require('../logger');
var Step = require('step');
var MongoBinary = require('mongoose').Types.Buffer.Binary;

var MissingSourceError = error.MissingSourceError;

var TransactionIn = exports.TransactionIn = function TransactionIn(data) {
  if ("object" !== typeof data) {
    data = {};
  }
  if (data.o) {
    this.o = data.o;
  } else {
    this.outpoint = data.outpoint;
  }
  if (data.s) {
    this.s = Buffer.isBuffer(data.script) ? data.script : Util.EMPTY_BUFFER;
  } else {
    this.s = Buffer.isBuffer(data.s) ? data.s : Util.EMPTY_BUFFER;
  }
  this.q = data.q ? data.q : data.sequence;
};

TransactionIn.prototype.getScript = function getScript() {
  return new Script(this.script);
};

var COINBASE_OP = exports.COINBASE_OP =
  Util.NULL_HASH.concat(Util.decodeHex("FFFFFFFF"));

TransactionIn.prototype.isCoinBase = function isCoinBase() {
  return this.o.compare(COINBASE_OP) == 0;
};

TransactionIn.prototype.serialize = function serialize() {
  var bytes = Binary.put();

  bytes.put(this.o);
  bytes.var_uint(this.s.length);
  bytes.put(this.s);
  bytes.word32le(this.q);

  return bytes.buffer();
};


var TransactionOut = exports.TransactionOut = function TransactionOut(data) {
  if ("object" !== typeof data) {
    data = {};
  }
  this.v = data.v ? data.v : data.value;
  this.s = data.s ? data.s : data.script;
};

TransactionOut.prototype.getScript = function getScript() {
  return new Script(this.script);
};

TransactionOut.prototype.serialize = function serialize() {
  var bytes = Binary.put();

  bytes.put(this.v);
  bytes.var_uint(this.s.length);
  bytes.put(this.s);

  return bytes.buffer();
};

var Transaction = exports.Transaction = function Transaction (data) {
  if ("object" !== typeof data) {
    data = {};
  }
  this.hash = data.hash || null;
  this.version = data.version;
  this.lock_time = data.lock_time;
  this.ins = Array.isArray(data.ins) ? data.ins.map(function (data) {
    var txin = new TransactionIn();
    txin.s = data.s;
    txin.q = data.q;
    txin.o = data.o;
    return txin;
  }) : [];
  this.outs = Array.isArray(data.outs) ? data.outs.map(function (data) {
    var txout = new TransactionOut();
    txout.v = data.v;
    txout.s = data.s;
    return txout;
  }) : [];
};

Transaction.prototype.isCoinBase = function () {
  return this.ins.length == 1 && this.ins[0].isCoinBase();
};

Transaction.prototype.isStandard = function isStandard() {
  var i;
  for (i = 0; i < this.ins.length; i++) {
    if (this.ins[i].getScript().getInType() == "Strange") {
      return false;
    }
  }
  for (i = 0; i < this.outs.length; i++) {
    if (this.outs[i].getScript().getOutType() == "Strange") {
      return false;
    }
  }
  return true;
};

Transaction.prototype.serialize = function serialize() {
  var bytes = Binary.put();

  bytes.word32le(this.version);
  bytes.var_uint(this.ins.length);
  this.ins.forEach(function (txin) {
    bytes.put(txin.serialize());
  });

  bytes.var_uint(this.outs.length);
  this.outs.forEach(function (txout) {
    bytes.put(txout.serialize());
  });

  bytes.word32le(this.lock_time);

  return bytes.buffer();
};

Transaction.prototype.calcHash = function calcHash() {
  return Util.twoSha256(this.serialize());
};

Transaction.prototype.checkHash = function checkHash() {
  if (!this.hash || !this.hash.length) return false;

  return this.calcHash().compare(this.hash) == 0;
};

Transaction.prototype.getHash = function getHash() {
  if (!this.hash || !this.hash.length) {
    this.hash = this.calcHash();
  }
  return this.hash;
};

/**
 * Load and cache transaction inputs.
 *
 * This function will try to load the inputs for a transaction.
 *
 * @param {BlockChain} blockChain A reference to the BlockChain object.
 * @param {TransactionMap|null} txStore Additional transactions to consider.
 * @param {Boolean} wait Whether to keep trying until the dependencies are
 * met (or a timeout occurs.)
 * @param {Function} callback Function to call on completion.
 */
Transaction.prototype.cacheInputs =
function cacheInputs(blockChain, txStore, wait, callback) {
  var self = this;

  var txCache = new TransactionInputsCache(this);
  txCache.buffer(blockChain, txStore, wait, callback);
};

Transaction.prototype.verify = function verify(txCache, blockChain, callback) {
  var self = this;

  var txIndex = txCache.txIndex;

  // List of queries that will search for other transactions spending
  // the same outs this transaction tries to spend.
  var srcOutCondList = [];

  var valueIn = bigint(0);
  var valueOut = bigint(0);

  Step(
    function verifyInputs() {
      var group = this.group();

      if (self.isCoinBase()) {
        throw new Error("Coinbase tx are invalid unless part of a block");
      }

      self.ins.forEach(function (txin, n) {
        var outHashBase64 = txin.outpoint.hash.toString('base64');
        var fromTxOuts = txIndex[outHashBase64];

        if (!fromTxOuts) {
          throw new MissingSourceError(
            "Source tx " + Util.formatHash(txin.outpoint.hash) +
              " for inputs " + n + " not found",
            // We store the hash of the missing tx in the error
            // so that the txStore can watch out for it.
            txin.outpoint.hash.toString('base64')
          );
        }

        var txout = fromTxOuts[txin.outpoint.index];

        if (!txout) {
          throw new Error("Source output index "+txin.outpoint.index+
                          " for input "+n+" out of bounds");
        }

        // TODO: Verify coinbase maturity

        valueIn = valueIn.add(Util.valueToBigInt(txout.v));

        srcOutCondList.push({
          "ins.o": new MongoBinary(txin.o, 0x00)
        });

        self.verifyInput(n, txout, group());
      });
    },

    function verifyInputsResults(err, results) {
      if (err) throw err;

      for (var i = 0, l = results.length; i < l; i++) {
        if (!results[i]) {
          throw new Error('Script for input '+i+' evaluated to false');
        }
      }

      this();
    },

    function queryConflicts(err) {
      if (err) throw err;

      // Make sure there are no other transactions spending the same outs
      blockChain.countConflictingTransactions(srcOutCondList, this);
    },
    function checkConflicts(err, count) {
      if (err) throw err;

      if (count) {
        // Spent output detected, retrieve transaction that spends it
        blockChain.getConflictingTransactions(srcOutCondList, function (err, results) {
          callback(new Error("At least one referenced output has"
                             + " already been spent in tx "
                             + Util.formatHashAlt(results[0]._id)));
        });
        return;
      }

      self.outs.forEach(function (txout) {
        valueOut = valueOut.add(Util.valueToBigInt(txout.v));
      });

      if (valueIn.cmp(valueOut) < 0) {
        var outValue = Util.formatValue(valueOut);
        var inValue = Util.formatValue(valueIn);
        throw new Error("Tx output value (BTC "+outValue+") "+
                        "exceeds input value (BTC "+inValue+")");
      }

      var fees = valueIn.sub(valueOut);

      // Success
      this(null, fees);
    },
    callback
  );
};

Transaction.prototype.verifyInput = function verifyInput(n, txout, callback) {
  var txin = this.ins[n];

  return ScriptInterpreter.verify(txin.getScript(),
                                  txout.getScript(),
                                  this, n, 1,
                                  callback);
};

/**
 * Returns an object containing all pubkey hashes affected by this transaction.
 *
 * The return object contains the base64-encoded pubKeyHash values as keys
 * and the original pubKeyHash buffers as values.
 */
Transaction.prototype.getAffectedKeys = function getAffectedKeys(txCache) {
  // TODO: Function won't consider results cached if there are no affected
  //       accounts.
  if (!this.affects.length) {
    this.affects = [];

    // Index any pubkeys affected by the outputs of this transaction
    for (var i = 0, l = this.outs.length; i < l; i++) {
      try {
        var txout = this.outs[i];
        var script = txout.getScript();

        var outPubKey = script.simpleOutPubKeyHash();
        if (outPubKey) {
          this.affects.push(outPubKey);
        }
      } catch (err) {
        // It's not our job to validate, so we just ignore any errors and issue
        // a very low level log message.
        logger.debug("Unable to determine affected pubkeys: " +
                     (err.stack ? err.stack : ""+err));
      }
    };

    // Index any pubkeys affected by the inputs of this transaction
    var txIndex = txCache.txIndex;
    for (var i = 0, l = this.ins.length; i < l; i++) {
      try {
        var txin = this.ins[i];

        if (txin.isCoinBase()) continue;

        // In the case of coinbase or IP transactions, the txin doesn't
        // actually contain the pubkey, so we look at the referenced txout
        // instead.
        var outHashBase64 = txin.outpoint.hash.toString('base64');
        var fromTxOuts = txIndex[outHashBase64];

        if (!fromTxOuts) {
          throw new Error("Input not found!");
        }

        var txout = fromTxOuts[txin.outpoint.index];
        var script = txout.getScript();

        var outPubKey = script.simpleOutPubKeyHash();
        if (outPubKey) {
          this.affects.push(outPubKey);
        }
      } catch (err) {
        // It's not our job to validate, so we just ignore any errors and issue
        // a very low level log message.
        logger.debug("Unable to determine affected pubkeys: " +
                     (err.stack ? err.stack : ""+err));
      }
    }
  }

  var affectedKeys = {};

  this.affects.forEach(function (pubKeyHash) {
    affectedKeys[pubKeyHash.toString('base64')] = pubKeyHash;
  });

  return affectedKeys;
};

var OP_CODESEPARATOR = 171;

var SIGHASH_ALL = 1;
var SIGHASH_NONE = 2;
var SIGHASH_SINGLE = 3;
var SIGHASH_ANYONECANPAY = 80;

Transaction.prototype.hashForSignature =
function hashForSignature(script, inIndex, hashType) {
  if (+inIndex !== inIndex ||
      inIndex < 0 || inIndex >= this.ins.length) {
    throw new Error("Input index '"+inIndex+"' invalid or out of bounds "+
                    "("+this.ins.length+" inputs)");
  }
  
  // Clone transaction
  var txTmp = new Transaction();
  this.ins.forEach(function (txin, i) {
    txTmp.ins.push(new TransactionIn(txin));
  });
  this.outs.forEach(function (txout) {
    txTmp.outs.push(new TransactionOut(txout));
  });
  txTmp.version = this.version;
  txTmp.lock_time = this.lock_time;

  // In case concatenating two scripts ends up with two codeseparators,
  // or an extra one at the end, this prevents all those possible
  // incompatibilities.
  script.findAndDelete(OP_CODESEPARATOR);

  // Blank out other inputs' signatures
  for (var i = 0; i < txTmp.ins.length; i++) {
    txTmp.ins[i].s = Util.EMPTY_BUFFER;
  }

  txTmp.ins[inIndex].s = script.buffer;

  // Blank out some of the outputs
  if ((hashType & 0x1f) == SIGHASH_NONE) {
    txTmp.outs = [];

    // Let the others update at will
    for (var i = 0; i < txTmp.ins.length; i++) {
      if (i != inIndex) {
        txTmp.ins[i].q = 0;
      }
    }
  } else if ((hashType & 0x1f) == SIGHASH_SINGLE) {
    // TODO: Untested
    if (inIndex >= txTmp.outs.length) {
      throw new Error("Transaction.hashForSignature(): SIGHASH_SINGLE " +
                      "no corresponding txout found - out of bounds");
    }

    // Cut off all outs after the one we want to keep
    txTmp.outs = txTmp.outs.slice(0, inIndex);

    // Zero all outs except the one we want to keep
    for (var i = 0; i < inIndex; i++) {
      txTmp.outs[i].s = Util.EMPTY_BUFFER;
      txTmp.outs[i].v = Util.INT64_MAX;
    }
  }

  // Blank out other inputs completely, not recommended for open
  // transactions
  if (hashType & SIGHASH_ANYONECANPAY) {
    txTmp.ins = [txTmp.ins[inIndex]];
  }

  var buffer = txTmp.serialize();

  // Append hashType
  buffer = buffer.concat(new Buffer([parseInt(hashType), 0, 0, 0]));

  return Util.twoSha256(buffer);
};

/**
 * Returns an object with the same field names as jgarzik's getblock patch.
 */
Transaction.prototype.getStandardizedObject = function getStandardizedObject() {
  var tx = {
    hash: Util.encodeHex(this.getHash()),
    version: this.version,
    lock_time: this.lock_time
  };

  var totalSize = 8; // version + lock_time
  totalSize += Util.getVarIntSize(this.ins.length); // tx_in count
  var ins = this.ins.map(function (txin) {
    var txinObj = {
      prev_out: {
        hash: Util.encodeHex(txin.outpoint.hash.slice(0).reverse()),
        n: txin.outpoint.index
      }
    };
    if (txin.isCoinBase()) {
      txinObj.coinbase = Util.encodeHex(txin.script);
    } else {
      txinObj.scriptSig = new Script(txin.script).getStringContent(false, 0);
    }
    totalSize += 36 + Util.getVarIntSize(txin.script.length) +
      txin.script.length + 4; // outpoint + script_len + script + sequence
    return txinObj;
  });

  totalSize += Util.getVarIntSize(this.outs.length);
  var outs = this.outs.map(function (txout) {
    totalSize += Util.getVarIntSize(txout.script.length) +
      txout.script.length + 8; // script_len + script + value
    return {
      value: Util.formatValue(txout.v),
      scriptPubKey: new Script(txout.s).getStringContent(false, 0)
    };
  });

  tx.size = totalSize;

  tx["in"] = ins;
  tx["out"] = outs;

  return tx;
};

// Add some Mongoose compatibility functions to the plain object
Transaction.prototype.toObject = function toObject() {
  return this;
};


var TransactionInputsCache = exports.TransactionInputsCache =
function TransactionInputsCache(tx)
{
  var txList = [];
  var txList64 = [];
  var reqOuts = {};

  // Get list of transactions required for verification
  tx.ins.forEach(function (txin) {
    if (txin.isCoinBase()) return;

    var hash64 = txin.outpoint.hash.toString('base64');
    if (txList64.indexOf(hash64) == -1) {
      txList.push(txin.outpoint.hash);
      txList64.push(hash64);
    }
    if (!reqOuts[hash64]) {
      reqOuts[hash64] = [];
    }
    reqOuts[hash64][txin.outpoint.index] = true;
  });

  this.tx = tx;
  this.txList = txList;
  this.txList64 = txList64;
  this.txIndex = {};
  this.requiredOuts = reqOuts;
  this.callbacks = [];
};

TransactionInputsCache.prototype.buffer = function buffer(blockChain, txStore, wait, callback)
{
  var self = this;

  var complete = false;

  if ("function" === typeof callback) {
    self.callbacks.push(callback);
  }

  var missingTx = {};
  self.txList64.forEach(function (hash64) {
    missingTx[hash64] = true;
    blockChain.addListener("txAdd:"+hash64, handleTx);
    blockChain.addListener("txSave:"+hash64, handleTx);
  });

  // A utility function to create the index object from the txs result lists
  function indexTxs(err, txs) {
    if (err) throw err;

    // Index memory transactions
    txs.forEach(function (tx) {
      var hash64 = tx.hash.toString('base64');
      var obj = {};
      Object.keys(self.requiredOuts[hash64]).forEach(function (o) {
        obj[+o] = tx.outs[+o];
      });
      self.txIndex[hash64] = obj;
      delete missingTx[hash64];

      blockChain.removeListener("txAdd:"+hash64, handleTx);
      blockChain.removeListener("txSave:"+hash64, handleTx);
    });

    this(null);
  };

  // Utility function that handles transactions as the come in
  function handleTx(e) {
    var hash64 = e.tx.hash.toString('base64');

    // Add to cache
    var obj = {};
    Object.keys(self.requiredOuts[hash64]).forEach(function (o) {
      obj[+o] = e.tx.outs[+o];
    });
    self.txIndex[hash64] = obj;

    // We only need to handle this event once, so clean up
    blockChain.removeListener("txAdd:"+hash64, handleTx);
    blockChain.removeListener("txSave:"+hash64, handleTx);

    // If we have all transactions, we issue the callback event
    delete missingTx[hash64];
    if (!Object.keys(missingTx).length) {
      complete = true;
      self.callback(null, self);
    }
  };

  Step(
    // First find and index memory transactions (if a txStore was provided)
    function findMemTx() {
      if (txStore) {
        txStore.find(self.txList64, this);
      } else {
        this(null, []);
      }
    },
    indexTxs,
    // Second find and index persistent transactions
    function findBlockChainTx(err) {
      if (err) throw err;

      // TODO: Major speedup should be possible if we load only the outs and not
      //       whole transactions.
      var callback = this;
      blockChain.getOutputsByHashes(self.txList, function (err, result) {
        callback(err, result);
      });
    },
    indexTxs,
    function saveTxCache(err) {
      if (err) throw err;

      var missingTxDbg = '';
      if (Object.keys(missingTx).length) {
        missingTxDbg = Object.keys(missingTx).map(function (hash64) {
          return Util.formatHash(new Buffer(hash64, 'base64'));
        }).join(',');
      }

      if (wait && Object.keys(missingTx).length) {
        // TODO: This might no longer be needed now that saveTransactions uses
        //       the safe=true option.
        setTimeout(function () {
          var missingHashes = Object.keys(missingTx);
          if (missingHashes.length) {
            missingHashes.forEach(function (hash64) {
              blockChain.removeListener("txAdd:"+hash64, handleTx);
              blockChain.removeListener("txSave:"+hash64, handleTx);
            });
            self.callback(new Error('Missing inputs (timeout while searching): '
                                    + missingTxDbg));
          } else if (!complete) {
            self.callback(new Error('Callback failed to trigger'));
          }
        }, 10000);
      } else {
        complete = true;
        this(null, self);
      }
    },
    self.callback.bind(self)
  );
};


TransactionInputsCache.prototype.callback = function callback(err)
{
  var args = Array.prototype.slice.apply(arguments);

  // Empty the callback array first (because downstream functions could add new
  // callbacks or otherwise interfere if were not in a consistent state.)
  var cbs = this.callbacks;
  this.callbacks = [];

  cbs.forEach(function (cb) {
    cb.apply(null, args);
  });
};
