var util = require('util');
require('buffertools');
var Module = require('./webservice').Module;
var bitcoin = require('../../lib/bitcoin');
var Util = bitcoin.Util;

var Block = exports.Block = Module.define({
  title: "Welcome to your webservice!",
  name: "transaction service",
  version: "0.1.0",
  construct: function (params) {
    this.node = params.node;
  },
  schema: {
    'node': { type: bitcoin.Node, required: true }
  }
});

Block.method('status', {
  schema: {},
  handler: function (params, callback) {
    var topBlock = this.node.blockChain.getTopBlock();

    var data = {
      hash: topBlock.getHash().toString('base64'),
      height: topBlock.height
    };
    callback(null, data);
  }
});
