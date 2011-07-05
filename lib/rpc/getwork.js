var Util = require('../util');

exports.getwork = function getwork(args, opt, callback) {
  if (args.length == 0) {
    var topBlock = this.node.blockChain.getTopBlock();
    if (!topBlock) {
      throw new Error('Top block not available.');
    }

    var nb = topBlock.prepareNextBlock(
      Util.decodeHex("049e2f1d8802bff257fac96004726d4f453acaa6d35af96b1c3cc4d9b99af05dffa185140849ee2f2fa336007304459ac73b27fa13a422da41c08c80a6b3839cb6")
    );

    var header = nb.block.getHeader();

    var result = {
      midstate: Util.encodeHex(Util.sha256midstate(header)),
      data: Util.encodeHex(Util.reverseBytes32(header))
        + "0000008000000000000000000000000000000000000000000000000000000000"
        + "00000000000000000000000080020000",
      target: Util.encodeHex(Util.decodeDiffBits(nb.block.bits).reverse()),
      hash1: "0000000000000000000000000000000000000000000000000000000000000000"
        + "0000008000000000000000000000000000000000000000000000000000010000"
    };

    callback(null, result);
  } else if (args.length == 1) {
    var data = Util.decodeHex(args[0]);

    if (data.length !== 128) {
      callback(new Error("Invalid parameter"));
    }

    

    callback(new Error("Submitting work not implemented."));
  } else {
    callback(new Error("Wrong number of arguments"));
  }
};
