var Util = require('../util');

exports.getblockcount = function getblockcount(args, opt, callback) {
  callback(null, this.node.blockChain.getTopBlock().height);
};

exports.getblocknumber = exports.getblockcount;

exports.getdifficulty = function getdifficulty(args, opt, callback) {
  callback(null, Util.calcDifficulty(this.node.blockChain.getTopBlock().bits))
};
