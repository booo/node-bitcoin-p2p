var Util = require('../util');
var Binary = require('binary');
var logger = require('../logger');
var Step = require('step');

var newBlocksCache = {};
var blockData = null;
var lastPrevHeight = -1;
var lastTxCount = 0;
var lastTime = 0;
var enonce = 0;
var enoncePrevBlock = Util.NULL_HASH;

function updateEnonce(block, txs, enonce) {
  // Update coinbase tx script
  txs[0].ins[0].script = Binary.put()
    .word32le(block.bits)  // Difficulty bits
    .word32le(enonce)      // Extra-nonce
    .buffer();

  // Update coinbase tx hash
  txs[0].hash = txs[0].calcHash();

  // Update merkle root
  block.merkle_root = block.calcMerkleRoot(txs);
};

exports.getwork = function getwork(args, opt, callback) {
  if (args.length == 0) { // Request for work
    var self = this;
    var topBlock = this.node.blockChain.getTopBlock();
    if (!topBlock) {
      throw new Error('Top block not available.');
    }

    var time = Math.floor(new Date().getTime() / 1000);
    var txCount = this.node.txStore.getCount();

    var steps = [];

    if (lastPrevHeight != +topBlock.height ||
        (lastTxCount != txCount && time - lastTime > 60)) {
      steps.push(function () {
        if (lastPrevHeight != +topBlock.height) {
          newBlocksCache = {};
          lastPrevHeight = +topBlock.height;
        }

        topBlock.prepareNextBlock(
          self.node.blockChain,
          // TODO: Hardcoded beneficiary... yeah... see issue #22
          Util.decodeHex("049e2f1d8802bff257fac96004726d4f453acaa6d35af96b1c3cc4d9b99af05dffa185140849ee2f2fa336007304459ac73b27fa13a422da41c08c80a6b3839cb6"),
          null,
          this
        );
      });

      steps.push(function (err, data) {
        if (err) throw err;
        blockData = data;
        lastTime = time;
        this(null);
      });
    }

    steps.push(function (err) {
      if (err) throw err;
      // TODO: Implement GetAdjustedTime
      var timestamp = time;

      blockData.block.timestamp = timestamp;

      // Update extra nonce, start over at 1 when timestamp increases
      if (enoncePrevBlock.compare(blockData.block.prev_hash) != 0) {
        enonce = 0;
        enoncePrevBlock = new Buffer(blockData.block.prev_hash);
      }
      ++enonce;

      updateEnonce(blockData.block, blockData.txs, enonce);

      var header = blockData.block.getHeader();

      var result = {
        midstate: Util.encodeHex(Util.sha256midstate(header)),
        data: Util.encodeHex(Util.reverseBytes32(header))
          + "0000008000000000000000000000000000000000000000000000000000000000"
          + "00000000000000000000000080020000",
        target: Util.encodeHex(Util.decodeDiffBits(blockData.block.bits).reverse()),
        hash1: "0000000000000000000000000000000000000000000000000000000000000000"
          + "0000008000000000000000000000000000000000000000000000000000010000"
      };

      var cache = {
        block: blockData.block,
        txs: blockData.txs,
        time: timestamp,
        enonce: enonce
      };

      newBlocksCache[blockData.block.merkle_root.toString('base64')] = cache;

      this(null, result);
    });

    steps.push(callback);

    Step.apply(Step, steps);
  } else if (args.length == 1) { // Solution submission
    var data = Util.decodeHex(args[0]);

    if (data.length !== 128) {
      callback(new Error("Invalid parameter"));
      return;
    }

    data = Util.reverseBytes32(data);

    var nb = newBlocksCache[data.slice(36,68).toString('base64')];
    if (!nb) {
      this.log("getwork: Received stale solution");
      callback(null, false);
      return;
    }

    // Extract nonce from data block
    var nonce = Binary.parse(data.slice(76, 80)).word32le('nonce').vars.nonce;

    // Update stored block
    nb.block.nonce = nonce;
    nb.block.timestamp = nb.time;
    updateEnonce(nb.block, nb.txs, nb.enonce);

    // Check solution
    try {
      nb.block.hash = nb.block.calcHash();
      nb.block.checkProofOfWork();
    } catch (e) {
      this.log("getwork: Received invalid solution:\n" +
               (e.stack ? e.stack : e.toString()));
      callback(null, false);
      return;
    }

    // Store and submit block
    try {
      this.node.blockChain.add(nb.block, nb.txs, function (err) {
        if (err) {
          this.log("getwork: Error while adding new block to chain:\n" +
                   (e.stack ? e.stack : e.toString()));
          callback(null, false);
          return;
        }

        this.node.sendInv(nb.block);

        logger.notice("Submitting newly minted block "+
                      Util.formatHash(nb.block.hash));

        callback(null, true);
      }.bind(this));
    } catch (e) {
      this.log("getwork: Error while preparing to add new block to chain:\n" +
               (e.stack ? e.stack : e.toString()));
      callback(null, false);
      return;
    }
  } else {
    callback(new Error("Wrong number of arguments"));
  }
};
