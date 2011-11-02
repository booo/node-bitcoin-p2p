var mongoose = require('mongoose'); // database
var Util = require('../util');
var Script = require('../script').Script;
var bigint = require('bigint');
var Binary = require('binary');
var Step = require('step');
var COINBASE_OP = require('./transaction').COINBASE_OP;

var VerificationError = require('../error').VerificationError;

var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var BlockRules = exports.BlockRules = {
  maxTimeOffset: 2 * 60 * 60,  // How far block timestamps can be into the future
  largestHash: bigint(2).pow(256)
};

var Block = new Schema({
  _id: { type: Buffer, unique: true },
  prev_hash: { type: Buffer, index: true },
  merkle_root: Buffer,
  timestamp: Number,
  bits: Number,
  nonce: Number,
  version: Number,
  height: { type: Number, index: true, default: -1 },
  size: Number,
  active: Boolean, // Whether block is part of the best known chain
  chainWork: Buffer, // Amount of work in the chain up to this block
  txs: { type: [Buffer], index: true }
});

Block.virtual('hash')
  .get(function () {
    return this._id;
  })
  .set(function (value) {
    this.set("_id", value);
  })
;

Block.method('getHeader', function () {
  put = Binary.put();
  put.word32le(this.version);
  put.put(this.prev_hash);
  put.put(this.merkle_root);
  put.word32le(this.timestamp);
  put.word32le(this.bits);
  put.word32le(this.nonce);
  return put.buffer();
});

Block.method('calcHash', function () {
  var header = this.getHeader();

  return Util.twoSha256(header);
});

Block.method('checkHash', function () {
  if (!this.hash || !this.hash.length) return false;
  return this.calcHash().compare(this.hash) == 0;
});

Block.method('getHash', function () {
  if (!this.hash || !this.hash.length) this.hash = this.calcHash();

  return this.hash;
});

Block.method('checkProofOfWork', function () {
  var target = Util.decodeDiffBits(this.bits);

  // TODO: Create a compare method in node-buffertools that uses the correct
  //       endian so we don't have to reverse both buffers before comparing.
  this.hash.reverse();

  if (this.hash.compare(target) > 0)
    throw 'Difficulty target not met';

  // Return the hash to its normal order
  this.hash.reverse();

  return true;
});

/**
 * Returns the amount of work that went into this block.
 *
 * Work is defined as the average number of tries required to meet this
 * block's difficulty target. For example a target that is greater than 5%
 * of all possible hashes would mean that 20 "work" is required to meet it.
 */
Block.method('getWork', function () {
  var target = Util.decodeDiffBits(this.bits, true);
  return BlockRules.largestHash.div(target.add(1));
});

Block.method('checkTimestamp', function () {
  var currentTime = new Date().getTime() / 1000;
  if (this.timestamp > currentTime + BlockRules.maxTimeOffset) {
    throw new VerificationError('Timestamp too far into the future');
  }

  return true;
});

Block.method('checkTransactions', function (txs) {
  if (!Array.isArray(txs) || txs.length <= 0) {
    throw new VerificationError('No transactions');
  }
  if (!txs[0].isCoinBase()) {
    throw new VerificationError('First tx must be coinbase');
  }
  for (var i = 1; i < txs.length; i++) {
    if (txs[i].isCoinBase()) {
      throw new VerificationError('Tx index '+i+' must not be coinbase');
    }
  }

  return true;
});

/**
 * Build merkle tree.
 *
 * Ported from Java. Original code: BitcoinJ by Mike Hearn
 * Copyright (c) 2011 Google Inc.
 */
Block.method('getMerkleTree', function (txs) {
  // The merkle hash is based on a tree of hashes calculated from the transactions:
  //
  //          merkleHash
  //             /\
  //            /  \
  //          A      B
  //         / \    / \
  //       tx1 tx2 tx3 tx4
  //
  // Basically transactions are hashed, then the hashes of the transactions are hashed
  // again and so on upwards into the tree. The point of this scheme is to allow for
  // disk space savings later on.
  //
  // This function is a direct translation of CBlock::BuildMerkleTree().

  if (txs.length == 0) {
    return [Util.NULL_HASH.slice(0)];
  }

  // Start by adding all the hashes of the transactions as leaves of the tree.
  var tree = txs.map(function (tx) {
    return tx.getHash();
  });

  var j = 0;
  // Now step through each level ...
  for (var size = txs.length; size > 1; size = Math.floor((size + 1) / 2)) {
    // and for each leaf on that level ..
    for (var i = 0; i < size; i += 2) {
      var i2 = Math.min(i + 1, size - 1);
      var a = tree[j + i];
      var b = tree[j + i2];
      tree.push(Util.twoSha256(a.concat(b)));
    }
    j += size;
  }

  return tree;
});

Block.method('calcMerkleRoot', function (txs) {
  var tree = this.getMerkleTree(txs);
  return tree[tree.length - 1];
});

Block.method('checkMerkleRoot', function (txs) {
  if (!this.merkle_root || !this.merkle_root.length) {
    throw new VerificationError('No merkle root');
  }

  if (this.calcMerkleRoot().compare(this.merkle_root) == 0) {
    throw new VerificationError('Merkle root incorrect');
  }

  return true;
});

Block.method('checkBlock', function (txs) {
  if (!this.checkHash()) {
    throw new VerificationError("Block hash invalid");
  }
  this.checkProofOfWork();
  this.checkTimestamp();

  if (txs) {
    this.checkTransactions(txs);
    if (!this.checkMerkleRoot(txs)) {
      throw new VerificationError("Merkle hash invalid");
    }
  }
  return true;
});

Block.static('getBlockValue', function (height) {
  var subsidy = bigint(50).mul(Util.COIN);
  subsidy = subsidy.div(bigint(2).pow(Math.floor(height / 210000)));
  return subsidy;
});

Block.method('getBlockValue', function () {
  return this.schema.statics.getBlockValue(this.height);
});

Block.method('toString', function () {
  return "<Block " + Util.formatHash(this.hash) + " height="+this.height+">";
});

/**
 * Initializes some properties based on information from the parent block.
 */
Block.method('attachTo', function (parent) {
  this.height = parent.height + 1;
  this.setChainWork(parent.getChainWork().add(this.getWork()));
});

Block.method('setChainWork', function (chainWork) {
  if (Buffer.isBuffer(chainWork)) {
    // Nothing to do
  } else if ("function" === typeof chainWork.toBuffer) { // duck-typing bigint
    chainWork = chainWork.toBuffer();
  } else {
    throw new Error("Block.setChainWork(): Invalid datatype");
  }

  this.chainWork = chainWork;
});

Block.method('getChainWork', function () {
  return bigint.fromBuffer(this.chainWork);
});

/**
 * Compares the chainWork of two blocks.
 */
Block.method('moreWorkThan', function (otherBlock) {
  return this.getChainWork().cmp(otherBlock.getChainWork()) > 0;
});

/**
 * Returns the difficulty target for the next block after this one.
 */
Block.method('getNextWork', function (blockChain, callback) {
  var targetTimespan = 14 * 24 * 60 * 60; // difficulty changes every two weeks
  var targetSpacing = 10 * 60;            // one block per ten minutes
  var interval = targetTimespan / targetSpacing;

  if (this.height+1 % interval != 0) {
    // Not adjustment interval, next block has same difficulty
    callback(null, this.bits);
  } else {
    // Get the first block from the old difficulty period
    blockChain.getBlockByHeight(
      this.height - interval + 1,
      function (err, lastBlock) {
        try {
          if (err) throw err;

          // Determine how long the difficulty period really took
          var actualTimespan = this.timestamp - lastBlock.timestamp;

          // There are some limits to how much we will adjust the difficulty in
          // one step
          if (actualTimespan < targetTimespan/4) {
            actualTimespan = targetTimespan/4;
          }
          if (actualTimespan > targetTimespan*4) {
            actualTimespan = targetTimespan*4;
          }

          var oldTarget = Util.decodeDiffBits(this.bits, true);
          var newTarget = oldTarget.mul(actualTimespan).div(targetTimespan);

          // TODO: Enforce proof-of-work limit

          callback(null, Util.encodeDiffBits(newTarget));
        } catch (err) {
          callback(err);
        }
      }
    );
  }
});

var medianTimeSpan = 11;

Block.method('getMedianTimePast', function (blockChain, callback) {
  var self = this;

  Step(
    function getBlocks() {
      var group = this.group();
      for (var i = medianTimeSpan; i && ((self.height - i) >= 0); i--) {
        blockChain.getBlockByHeight(self.height - i, group());
      }
    },
    function calcMedian(err, blocks) {
      if (err) throw err;

      var timestamps = blocks.map(function (block) {
        if (!block) {
          throw new Error("Prior block missing, cannot calculate median time");
        }

        return +block.timestamp;
      });

      // Sort timestamps
      timestamps = timestamps.sort();

      // Return median timestamp
      this(null, timestamps[Math.floor(timestamps.length/2)]);
    },
    callback
  );
});

Block.method('verifyChild', function (blockChain, child, callback) {
  var self = this;

  Step(
    function getExpectedDifficulty() {
      self.getNextWork(blockChain, this);
    },
    function verifyExpectedDifficulty(err, nextWork) {
      if (err) throw err;

      if (child.bits == nextWork) {
        throw new VerificationError("Incorrect proof of work");
      }

      this();
    },
    function getMinimumTimestamp(err) {
      if (err) throw err;

      self.getMedianTimePast(blockChain, this);
    },
    function verifyTimestamp(err, medianTimePast) {
      if (err) throw err;

      if (child.timestamp <= medianTimePast) {
        throw new VerificationError("Block's timestamp is too early");
      }

      this();
    },
    callback
  );
});

Block.method('createCoinbaseTx', function (beneficiary) {
  var Transaction = this.db.model('Transaction');

  var tx = new Transaction();
  tx.ins.push({
    s: Util.EMPTY_BUFFER,
    q: 0xffffffff,
    o: COINBASE_OP
  });
  tx.outs.push({
    v: Util.bigIntToValue(this.getBlockValue()),
    s: Script.createPubKeyOut(beneficiary).getBuffer()
  });
  return tx;
});

Block.method('prepareNextBlock', function (beneficiary, time) {
  var Block = this.db.model('Block');
  var Transaction = this.db.model('Transaction');

  var newBlock = new Block();

  if (!time) {
    time = Math.floor(new Date().getTime() / 1000);
  }

  // TODO: Use correct difficulty
  newBlock.version = 1;
  newBlock.bits = this.bits;
  newBlock.timestamp = time;
  newBlock.prev_hash = this.hash.slice(0);
  newBlock.height = this.height+1;

  // Create coinbase transaction
  var txs = [];

  var tx = newBlock.createCoinbaseTx(beneficiary);
  txs.push(tx);

  newBlock.merkle_root = newBlock.calcMerkleRoot(txs);

  // Return reference to (unfinished) block
  return {block: newBlock, txs: txs};
});

Block.method('mineNextBlock', function (beneficiary, time, miner, callback) {
  try {
    var data = this.prepareNextBlock(beneficiary, time);
    var newBlock = data.block;
    var txs = data.txs;

    newBlock.solve(miner, function (err, nonce) {
      newBlock.nonce = nonce;

      // Make sure hash is cached
      newBlock.getHash();

      callback(err, newBlock, txs);
    });

    // Return reference to (unfinished) block
    return newBlock;
  } catch (e) {
    callback(e);
  }
});

Block.method('solve', function (miner, callback) {
  var header = this.getHeader();
  var target = Util.decodeDiffBits(this.bits);
  miner.solve(header, target, callback);
});

/**
 * Returns an object with the same field names as jgarzik's getblock patch.
 */
Block.method('getStandardizedObject', function (txs) {
  var mrkl_tree = this.getMerkleTree(txs).map(function (buffer) {
    return Util.encodeHex(buffer.slice(0).reverse());
  });
  var block = {
    hash: Util.encodeHex(this.getHash().slice(0).reverse()),
    version: this.version,
    prev_block: Util.encodeHex(this.prev_hash.slice(0).reverse()),
    mrkl_root: mrkl_tree[mrkl_tree.length - 1],
    time: this.timestamp,
    bits: this.bits,
    nonce: this.nonce
  };


  if (txs) {
    block.n_tx = txs.length;
    var totalSize = 80; // Block header
    totalSize += Util.getVarIntSize(txs.length); // txn_count
    txs = txs.map(function (tx) {
      tx = tx.getStandardizedObject();
      totalSize += tx.size;
      return tx;
    });
    block.size = totalSize;
    block.tx = txs;
  }
  block.mrkl_tree = mrkl_tree;
  return block;
});

mongoose.model('Block', Block);
