var Util = require('../util');

exports.getblockcount = function getblockcount(args, opt, callback) {
  callback(null, this.node.blockChain.getTopBlock().height);
};

exports.getblocknumber = exports.getblockcount;

exports.getconnectioncount = function getconnectioncount(args, opt, callback) {
  callback(null, this.node.peerManager.getActiveConnections().length);
};

exports.getdifficulty = function getdifficulty(args, opt, callback) {
  callback(null, Util.calcDifficulty(this.node.blockChain.getTopBlock().bits));
};

exports.getgenerate = function getgenerate(args, opt, callback) {
  callback(null, false);
};

exports.gethashespersec = function gethashespersec(args, opt, callback) {
  callback(null, 0); 
};

exports.getinfo = function getinfo(args, opt, callback) {
  var info = {
      version: this.node.version,
      balance: 0.00000000,              //TODO: implement wallet
      blocks: this.node.blockChain.getTopBlock().height,
      connections: this.node.peerManager.getActiveConnections().length,
      proxy: '',                        //TODO: implement socks proxy
      generate: false,                  //TODO: implement mining
      genproclimit: -1,                 //TODO: implement mining
      difficulty: Util.calcDifficulty(this.node.blockChain.getTopBlock().bits),
      hashespersec: 0,                  //TODO: implement mining
      testnet: (this.node.cfg.network.type === 'testnet'),
      keypoololdest: 0,                 //TODO: unix time when oldest key was generated
      paytxfee: 0.00000000,             //TODO: transaction fee setting
      errors: ''                        //TODO: ?
  };
  callback(null, info);
};
