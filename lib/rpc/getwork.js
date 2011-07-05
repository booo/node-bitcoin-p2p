var Util = require('../util');
var Binary = require('binary');

var newBlocksCache = {};
var blockData = null;
var lastPrevHeight = -1;
var lastTxCount = 0;
var lastTime = 0;
var enonce = 0;
var enonceTime = 0;

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
  if (args.length == 0) {
    var topBlock = this.node.blockChain.getTopBlock();
    if (!topBlock) {
      throw new Error('Top block not available.');
    }

    var time = Math.floor(new Date().getTime() / 1000);

    if (topBlock.height != lastPrevHeight ||
        (lastTxCount != txCount && time - lastTime > 60)) {

      if (topBlock.height != lastPrevHeight) {
        newBlocksCache = {};
      }

      blockData = topBlock.prepareNextBlock(
        Util.decodeHex("049e2f1d8802bff257fac96004726d4f453acaa6d35af96b1c3cc4d9b99af05dffa185140849ee2f2fa336007304459ac73b27fa13a422da41c08c80a6b3839cb6")
      );

      lastTime = time;
    }

    // TODO: Implement GetAdjustedTime
    var timestamp = time;

    blockData.block.timestamp = timestamp;

    // Update extra nonce, start over at 1 when timestamp increases
    if (++enonce >= 0x0f && timestamp > (enonceTime+1)) {
      enonce = 1;
      enonceTime = timestamp;
    }

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

    callback(null, result);
  } else if (args.length == 1) {
    var data = Util.decodeHex(args[0]);

    if (data.length !== 128) {
      callback(new Error("Invalid parameter"));
    }

    data = Util.reverseBytes32(header);

    var nb = newBlocksCache[data.slice(36,32).toString('base64')];
    if (!nb) {
      log("getwork: Received stale solution");
      callback(null, false);
      return;
    }

    // Extract nonce from data block
    var nonce = Binary.parser(data.slice(76, 4)).word32le('nonce').vars.nonce;

    // Update stored block
    nb.block.nonce = nonce;
    nb.block.timestamp = nb.time;
    updateEnonce(nb.block, nb.txs, nb.enonce);

    // Check solution
    try {
      nb.block.hash = nb.block.calcHash();
      nb.block.checkProofOfWork();
    } catch (e) {
      log("getwork: Received invalid solution:\n" +
          (e.stack ? e.stack : e.toString()));
      callback(null, false);
      return;
    }

    // Store and submit block
    try {
      this.blockChain.add(nb.block, nb.txs, function (err) {
        if (err) {
          log("getwork: Error while adding new block to chain:\n" +
              (e.stack ? e.stack : e.toString()));
          callback(null, false);
          return;
        }

        callback(null, true);
      });
    } catch (e) {
      log("getwork: Error while preparing to add new block to chain:\n" +
          (e.stack ? e.stack : e.toString()));
      callback(null, false);
      return;
    }

    callback(new Error("Submitting work not implemented."));
  } else {
    callback(new Error("Wrong number of arguments"));
  }
};
