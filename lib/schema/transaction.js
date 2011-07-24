var mongoose = require('mongoose'); // database
var Script = require('../script').Script;
var ScriptInterpreter = require('../scriptinterpreter').ScriptInterpreter;
var Util = require('../util');
var bigint = require('bigint');
var Binary = require('../binary');
var error = require('../error');

var MissingSourceError = error.MissingSourceError;

var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var TransactionInSchema = new Schema({
  script: Buffer, // scriptSig
  sequence: Number,
  outpoint: {
    hash: Buffer,
    index: Number
  }
});

var TransactionIn = exports.TransactionIn = function TransactionIn(data) {
  if ("object" !== typeof data) {
    data = {};
  }
  this.script = data.script instanceof Buffer ? data.script : new Buffer(0);
  this.sequence = data.sequence;
  this.outpoint = data.outpoint;
};

TransactionIn.prototype.getScript = function getScript() {
  return new Script(this.script);
};

TransactionIn.prototype.isCoinBase = function isCoinBase() {
  return this.outpoint.hash.compare(Util.NULL_HASH) == 0 &&
         this.outpoint.index == 4294967295;
};

TransactionIn.prototype.serialize = function serialize() {
  var bytes = Binary.put();

  bytes.put(this.outpoint.hash);
  bytes.word32le(this.outpoint.index);
  bytes.var_uint(this.script.length);
  bytes.put(this.script);
  bytes.word32le(this.sequence);

  return bytes.buffer();
};

// Import methods to schema
Object.keys(TransactionIn.prototype).forEach(function (method) {
  TransactionInSchema.method(method, TransactionIn.prototype[method]);
});

var TransactionOutSchema = new Schema({
  value: Buffer,
  script: Buffer // scriptPubKey
});

var TransactionOut = exports.TransactionOut = function TransactionOut(data) {
  if ("object" !== typeof data) {
    data = {};
  }
  this.value = data.value;
  this.script = data.script;
};

TransactionOut.prototype.getScript = function getScript() {
  return new Script(this.script);
};

TransactionOut.prototype.serialize = function serialize() {
  var bytes = Binary.put();

  bytes.put(this.value);
  bytes.var_uint(this.script.length);
  bytes.put(this.script);

  return bytes.buffer();
};

// Import methods to schema
Object.keys(TransactionOut.prototype).forEach(function (method) {
  TransactionOutSchema.method(method, TransactionOut.prototype[method]);
});

var TransactionSchema = new Schema({
  _id: { type: Buffer, unique: true },
  block: Buffer,
  sequence: Number,
  version: String,
  lock_time: String,
  ins: [TransactionInSchema],
  outs: [TransactionOutSchema],
  active: Boolean, // Whether tx is part of the best known chain
  affects: { type: [Buffer], index: true }  // Affected accounts
});

TransactionSchema.virtual('hash')
  .get(function () {
    return this._id;
  })
  .set(function (value) {
    this.set("_id", value);
  })
;

// This index allows us to quickly find out whether an out is spent
TransactionSchema.index({ "ins.outpoint.hash": 1 });

var Transaction = exports.Transaction = function Transaction (data) {
  if ("object" !== typeof data) {
    data = {};
  }
  this.hash = data.hash || null;
  this.block = data.block;
  this.sequence = data.sequence;
  this.version = data.version;
  this.lock_time = data.lock_time;
  this.ins = Array.isArray(data.ins) ? data.ins.map(function (data) {
    return new TransactionIn(data);
  }) : [];
  this.outs = Array.isArray(data.outs) ? data.outs.map(function (data) {
    return new TransactionOut(data);
  }) : [];
  this.active = data.active || false;
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

Transaction.prototype.verify = function verify(txStore, callback) {
  var self = this;

  if (this.isCoinBase())
    callback(new Error("Coinbase tx are invalid unless part of a block"));

  // Get list of transactions required for verification
  var txList = [];
  var txList64 = [];
  this.ins.forEach(function (txin) {
    if (txin.isCoinBase()) return;
    var hash64 = txin.outpoint.hash.toString('base64');
    if (txList64.indexOf(hash64) == -1) {
      txList.push(txin.outpoint.hash);
      txList64.push(hash64);
    }
  });

  var txIndex = {};
  txStore.find(txList64, function (err, txs) {
    if (err) {
      callback(err);
      return;
    }

    // Index memory transactions
    txs.forEach(function (tx) {
      txIndex[tx.hash.toString('base64')] = tx;
    });

    self.db.model("Transaction").find({_id: {$in: txList}}, function (err, txs) {
      try {
        if (err) throw err;

        // Index database transactions
        txs.forEach(function (tx) {
          txIndex[tx.hash.toString('base64')] = tx;
        });

        // List of queries that will search for other transactions spending
        // the same outs this transaction tries to spend.
        var srcOutCondList = [];

        var valueIn = bigint(0);
        var valueOut = bigint(0);
        self.ins.forEach(function (txin, n) {
          var outHashBase64 = txin.outpoint.hash.toString('base64');
          var fromTx = txIndex[outHashBase64];

          if (!fromTx) {
            throw new MissingSourceError(
              "Source tx " + Util.formatHash(txin.outpoint.hash) +
              " for inputs " + n + " not found",
              // We store the hash of the missing tx in the error
              // so that the txStore can watch out for it.
              txin.outpoint.hash.toString('base64')
            );
          }

          var txout = fromTx.outs[txin.outpoint.index];

          if (!txout) {
            throw new Error("Outpoint for input " + n + " not found");
          }

          if (!self.verifyInput(n, fromTx)) {
            throw new Error("Script did not evaluate to true");
          }

          valueIn = valueIn.add(Util.valueToBigInt(fromTx.outs[txin.outpoint.index].value));

          srcOutCondList.push({
            "ins.outpoint.hash": txin.outpoint.hash,
            "ins.outpoint.index": txin.outpoint.index
          });
        });

        // Make sure there are no other transactions spending the same outs
        self.db.model("Transaction").find({"$or": srcOutCondList}).count(function (err, count) {
          try {
            if (err) throw err;

            if (count) {
              throw new Error("At least one referenced output has already been spent");
            }

            self.outs.forEach(function (txout) {
              valueOut = valueOut.add(Util.valueToBigInt(txout.value));
            });

            if (valueIn.cmp(valueOut) < 0)
              throw new Error("Tx outputs value exceeds inputs");

            var fees = valueIn.sub(valueOut);
          } catch (e) {
            callback(e);
            return;
          }

          // Success
          callback(null, fees);
        });
      } catch (e) {
        callback(e);
        return;
      }
    });
  });
};

Transaction.prototype.verifyInput = function verifyInput(n, fromTx) {
  var txin = this.ins[n];

  if (txin.outpoint.index >= fromTx.outs.length)
    throw new Error("Source output index "+txin.outpoint.index+
                    " for input "+n+" out of bounds");

  var txout = fromTx.outs[txin.outpoint.index];

  return ScriptInterpreter.verify(txin.getScript(),
                                  txout.getScript(),
                                  this, n, 1);
};

/**
 * Returns an object containing all pubkey hashes affected by this transaction.
 *
 * The return object contains the base64-encoded pubKeyHash values as keys
 * and the original pubKeyHash buffers as values.
 */
Transaction.prototype.getAffectedKeys = function getAffectedKeys() {
  // TODO: Function won't consider results cached if there are no affected
  //       accounts.
  if (!this.affects.length) {
    this.affects = [];

    for (var i = 0; i < this.outs.length; i++) {
      var txout = this.outs[i];
      var script = txout.getScript();

      var outPubKey = script.simpleOutPubKeyHash();

      if (outPubKey) {
        this.affects.push(outPubKey);
      }
    };

    if (!this.isCoinBase()) {
      this.ins.forEach(function (txin, j) {
        var script = txin.getScript();

        var inPubKey = script.simpleInPubKey();

        if (inPubKey) {
          inPubKey = Util.sha256ripe160(inPubKey);
          this.affects.push(inPubKey);
        }
      }.bind(this));
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
  // Clone transaction
  // TODO: This probably isn't all that fast...
  var txTmp = new Transaction(this.toObject());
  // In case concatenating two scripts ends up with two codeseparators,
  // or an extra one at the end, this prevents all those possible
  // incompatibilities.
  script.findAndDelete(OP_CODESEPARATOR);

  // Blank out other inputs' signatures
  for (var i = 0; i < txTmp.ins.length; i++) {
    txTmp.ins[i].script = new Script();
  }

  txTmp.ins[inIndex].script = script.buffer;

  // Blank out some of the outputs
  if ((hashType & 0x1f) == SIGHASH_NONE) {
    txTmp.outs = [];

    // Let the others update at will
    for (var i = 0; i < txTmp.ins.length; i++) {
      if (i != inIndex) {
        txTmp.ins[i].sequence = 0;
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
      txTmp.outs[i].script = new Buffer(0);
      txTmp.outs[i].value = Util.decodeHex("ffffffffffffffff");
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
      value: Util.formatValue(txout.value),
      scriptPubKey: new Script(txout.script).getStringContent(false, 0)
    };
  });

  tx.size = totalSize;

  tx["in"] = ins;
  tx["out"] = outs;

  return tx;
};

// Import methods to schema
Object.keys(Transaction.prototype).forEach(function (method) {
  TransactionSchema.method(method, Transaction.prototype[method]);
});

// Add some Mongoose compatibility functions to the plain object
Transaction.prototype.toObject = function toObject() {
  return this;
};

mongoose.model('Transaction', TransactionSchema);
