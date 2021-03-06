var Script = require('../script').Script;
var ScriptInterpreter = require('../scriptinterpreter').ScriptInterpreter;
var Util = require('../util');
var bignum = require('bignum');
var Binary = require('../binary');
var error = require('../error');
var logger = require('../logger');
var Step = require('step');

var VerificationError = error.VerificationError;
var MissingSourceError = error.MissingSourceError;

var TransactionIn = exports.TransactionIn = function TransactionIn(data) {
  if ("object" !== typeof data) {
    data = {};
  }
  if (data.o) {
    this.o = data.o;
  }
  this.s = Buffer.isBuffer(data.s) ? data.s :
           Buffer.isBuffer(data.script) ? data.script : Util.EMPTY_BUFFER;
  this.q = data.q ? data.q : data.sequence;
};

TransactionIn.prototype.getScript = function getScript() {
  return new Script(this.s);
};

var COINBASE_OP = exports.COINBASE_OP =
  Util.NULL_HASH.concat(Util.decodeHex("FFFFFFFF"));

TransactionIn.prototype.isCoinBase = function isCoinBase() {
  return this.o.compare(COINBASE_OP) === 0;
};

TransactionIn.prototype.serialize = function serialize() {
  var bytes = Binary.put();

  bytes.put(this.o);
  bytes.varint(this.s.length);
  bytes.put(this.s);
  bytes.word32le(this.q);

  return bytes.buffer();
};

TransactionIn.prototype.getOutpointHash = function getOutpointIndex() {
  if ("undefined" !== typeof this.o.outHashCache) {
    return this.o.outHashCache;
  }

  return this.o.outHashCache = this.o.slice(0, 32);
};

TransactionIn.prototype.getOutpointIndex = function getOutpointIndex() {
  return (this.o[32]      ) +
         (this.o[33] <<  8) +
         (this.o[34] << 16) +
         (this.o[35] << 24);
};

TransactionIn.prototype.setOutpointIndex = function setOutpointIndex(n) {
  this.o[32] = n       & 0xff;
  this.o[33] = n >>  8 & 0xff;
  this.o[34] = n >> 16 & 0xff;
  this.o[35] = n >> 24 & 0xff;
};


var TransactionOut = exports.TransactionOut = function TransactionOut(data) {
  if ("object" !== typeof data) {
    data = {};
  }
  this.v = data.v ? data.v : data.value;
  this.s = data.s ? data.s : data.script;
};

TransactionOut.prototype.getScript = function getScript() {
  return new Script(this.s);
};

TransactionOut.prototype.serialize = function serialize() {
  var bytes = Binary.put();

  bytes.put(this.v);
  bytes.varint(this.s.length);
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
  if (data.buffer) this._buffer = data.buffer;
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
  bytes.varint(this.ins.length);
  this.ins.forEach(function (txin) {
    bytes.put(txin.serialize());
  });

  bytes.varint(this.outs.length);
  this.outs.forEach(function (txout) {
    bytes.put(txout.serialize());
  });

  bytes.word32le(this.lock_time);

  return this._buffer = bytes.buffer();
};

Transaction.prototype.getBuffer = function getBuffer() {
  if (this._buffer) return this._buffer;

  return this.serialize();
};

Transaction.prototype.calcHash = function calcHash() {
  return Util.twoSha256(this.getBuffer());
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

  var outpoints = [];

  var valueIn = bignum(0);
  var valueOut = bignum(0);

  function getTxOut(txin) {
    var outHash = txin.getOutpointHash();
    var outIndex = txin.getOutpointIndex();
    var outHashBase64 = outHash.toString('base64');
    var fromTxOuts = txIndex[outHashBase64];

    if (!fromTxOuts) {
      throw new MissingSourceError(
        "Source tx " + Util.formatHash(outHash) +
          " for inputs " + n + " not found",
        // We store the hash of the missing tx in the error
        // so that the txStore can watch out for it.
        outHash.toString('base64')
      );
    }

    var txout = fromTxOuts[outIndex];

    if (!txout) {
      throw new Error("Source output index "+outIndex+
                      " for input "+n+" out of bounds");
    }

    return txout;
  };

  Step(
    function verifyInputs() {
      var group = this.group();

      if (self.isCoinBase()) {
        throw new Error("Coinbase tx are invalid unless part of a block");
      }

      self.ins.forEach(function (txin, n) {
        var txout = getTxOut(txin);

        // TODO: Verify coinbase maturity

        valueIn = valueIn.add(Util.valueToBigInt(txout.v));

        outpoints.push(txin.o);

        self.verifyInput(n, txout.getScript(), group());
      });
    },

    function verifyInputsResults(err, results) {
      if (err) throw err;

      for (var i = 0, l = results.length; i < l; i++) {
        if (!results[i]) {
          var txout = getTxOut(self.ins[i]);
          logger.scrdbg('Script evaluated to false');
          logger.scrdbg('|- scriptSig', ""+self.ins[i].getScript());
          logger.scrdbg('`- scriptPubKey', ""+txout.getScript());
          throw new VerificationError('Script for input '+i+' evaluated to false');
        }
      }

      this();
    },

    function queryConflicts(err) {
      if (err) throw err;

      // Make sure there are no other transactions spending the same outs
      blockChain.countConflictingTransactions(outpoints, this);
    },
    function checkConflicts(err, count) {
      if (err) throw err;

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

      if (count) {
        // Spent output detected, retrieve transaction that spends it
        blockChain.getConflictingTransactions(outpoints, function (err, results) {
          if (results.length) {
            if (results[0].getHash().compare(self.getHash()) == 0) {
              logger.warn("Detected tx re-add (recoverable db corruption): "
                          + Util.formatHashAlt(results[0].getHash()));
              // TODO: Needs to return an error for the memory pool case?
              callback(null, fees);
            } else {
              callback(new Error("At least one referenced output has"
                                 + " already been spent in tx "
                                 + Util.formatHashAlt(results[0].getHash())));
            }
          } else {
            callback(new Error("Outputs of this transaction are spent, but "+
                               "the transaction(s) that spend them are not "+
                               "available. This probably means you need to "+
                               "reset your database."));
          }
        });
        return;
      }

      // Success
      this(null, fees);
    },
    callback
  );
};

Transaction.prototype.verifyInput = function verifyInput(n, scriptPubKey, callback) {
  return ScriptInterpreter.verify(this.ins[n].getScript(),
                                  scriptPubKey,
                                  this, n, 0,
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
  if (!(this.affects && this.affects.length)) {
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
        var outHash = txin.getOutpointHash();
        var outIndex = txin.getOutpointIndex();
        var outHashBase64 = outHash.toString('base64');
        var fromTxOuts = txIndex[outHashBase64];

        if (!fromTxOuts) {
          throw new Error("Input not found!");
        }

        var txout = fromTxOuts[outIndex];
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

  // Get mode portion of hashtype
  var hashTypeMode = hashType & 0x1f;

  // Generate modified transaction data for hash
  var bytes = Binary.put();
  bytes.word32le(this.version);

  // Serialize inputs
  if (hashType & SIGHASH_ANYONECANPAY) {
    // Blank out all inputs except current one, not recommended for open
    // transactions.
    bytes.varint(1);
    bytes.put(this.ins[inIndex].o);
    bytes.varint(script.buffer.length);
    bytes.put(script.buffer);
    bytes.word32le(this.ins[inIndex].q);
  } else {
    bytes.varint(this.ins.length);
    for (var i = 0, l = this.ins.length; i < l; i++) {
      var txin = this.ins[i];
      bytes.put(this.ins[i].o);

      // Current input's script gets set to the script to be signed, all others
      // get blanked.
      if (inIndex === i) {
        bytes.varint(script.buffer.length);
        bytes.put(script.buffer);
      } else {
        bytes.varint(0);
      }

      if (hashTypeMode === SIGHASH_NONE && inIndex !== i) {
        bytes.word32le(0);
      } else {
        bytes.word32le(this.ins[i].q);
      }
    }
  }

  // Serialize outputs
  if (hashTypeMode === SIGHASH_NONE) {
    bytes.varint(0);
  } else {
    var outsLen;
    if (hashTypeMode === SIGHASH_SINGLE) {
      // TODO: Untested
      if (inIndex >= txTmp.outs.length) {
        throw new Error("Transaction.hashForSignature(): SIGHASH_SINGLE " +
                        "no corresponding txout found - out of bounds");
      }
      outsLen = inIndex + 1;
    } else {
      outsLen = this.outs.length;
    }

    // TODO: If hashTypeMode !== SIGHASH_SINGLE, we could memcpy this whole
    //       section from the original transaction as is.
    bytes.varint(outsLen);
    for (var i = 0; i < outsLen; i++) {
      if (hashTypeMode === SIGHASH_SINGLE && i !== inIndex) {
        // Zero all outs except the one we want to keep
        bytes.put(Util.INT64_MAX);
        bytes.varint(0);
      } else {
        bytes.put(this.outs[i].v);
        bytes.varint(this.outs[i].s.length);
        bytes.put(this.outs[i].s);
      }
    }
  }

  bytes.word32le(this.lock_time);

  var buffer = bytes.buffer();

  // Append hashType
  buffer = buffer.concat(new Buffer([parseInt(hashType), 0, 0, 0]));

  return Util.twoSha256(buffer);
};

/**
 * Returns an object with the same field names as jgarzik's getblock patch.
 */
Transaction.prototype.getStandardizedObject = function getStandardizedObject() {
  var tx = {
    hash: Util.formatHashFull(this.getHash()),
    version: this.version,
    lock_time: this.lock_time
  };

  var totalSize = 8; // version + lock_time
  totalSize += Util.getVarIntSize(this.ins.length); // tx_in count
  var ins = this.ins.map(function (txin) {
    var txinObj = {
      prev_out: {
        hash: Util.encodeHex(new Buffer(txin.getOutpointHash()).reverse()),
        n: txin.getOutpointIndex()
      }
    };
    if (txin.isCoinBase()) {
      txinObj.coinbase = Util.encodeHex(txin.s);
    } else {
      txinObj.scriptSig = new Script(txin.s).getStringContent(false, 0);
    }
    totalSize += 36 + Util.getVarIntSize(txin.s.length) +
      txin.s.length + 4; // outpoint + script_len + script + sequence
    return txinObj;
  });

  totalSize += Util.getVarIntSize(this.outs.length);
  var outs = this.outs.map(function (txout) {
    totalSize += Util.getVarIntSize(txout.s.length) +
      txout.s.length + 8; // script_len + script + value
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

    var hash = txin.o.slice(0, 32);
    var hash64 = hash.toString('base64');
    if (txList64.indexOf(hash64) == -1) {
      txList.push(hash);
      txList64.push(hash64);
    }
    if (!reqOuts[hash64]) {
      reqOuts[hash64] = [];
    }
    reqOuts[hash64][txin.getOutpointIndex()] = true;
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
  });

  // A utility function to create the index object from the txs result lists
  function indexTxs(err, txs) {
    if (err) throw err;

    // Index memory transactions
    txs.forEach(function (tx) {
      var hash64 = tx.getHash().toString('base64');
      var obj = {};
      Object.keys(self.requiredOuts[hash64]).forEach(function (o) {
        obj[+o] = tx.outs[+o];
      });
      self.txIndex[hash64] = obj;
      delete missingTx[hash64];
    });

    this(null);
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

  try {
    cbs.forEach(function (cb) {
      cb.apply(null, args);
    });
  } catch (err) {
    logger.error("Callback error after connecting tx inputs: "+
                 (err.stack ? err.stack : err.toString()));
  }
};
