var rpc = require('jsonrpc2');
var logger = require('../logger');
var Util = require('../util');

// Disable rpc library logging
rpc.Server.trace = function () {
  var args = [].slice.apply(arguments);
  if (args[0] == "***") {
    args = args.slice(1);
  }
  logger.rpcdbg(args.join(" "));
};

var JsonRpcServer = exports.JsonRpcServer = function JsonRpcServer(node)
{
  this.node = node;
};

JsonRpcServer.prototype.enable = function ()
{
  if (this.node.cfg.jsonrpc.enable) {
    if (this.node.cfg.jsonrpc.password == null) {
      throw new Error("JsonRpcServer(): You must set a JSON-RPC password in the " +
                      "settings.");
    }

    this.rpc = new rpc.Server();

    this.exposeMethods();
    this.startServer();
  }
};

JsonRpcServer.prototype.exposeMethods = function ()
{
  this.rpc.expose('getblockcount', function (args, opt, callback) {
    callback(null, this.node.blockChain.getTopBlock().height);
  }.bind(this));
  this.rpc.expose('getwork', function (args, opt, callback) {
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
      if (args[0].length !== 128) {
        callback(new Error("Invalid parameter"));
      }

      callback(new Error("Submitting work not implemented."));
    } else {
      callback(new Error("Wrong number of arguments"));
    }
  }.bind(this));
};

JsonRpcServer.prototype.startServer = function ()
{
  logger.info('Listening for JSON-RPC connections on '+
              this.node.cfg.jsonrpc.host+':'+
              this.node.cfg.jsonrpc.port);

  this.rpc.listen(this.node.cfg.jsonrpc.port,
             this.node.cfg.jsonrpc.host);
};
