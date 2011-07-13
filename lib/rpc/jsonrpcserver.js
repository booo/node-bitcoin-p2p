var rpc = require('jsonrpc2');
var logger = require('../logger');

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
      throw new Error("JsonRpcServer(): You must set a JSON-RPC password in" +
                      "the settings.");
    }

    this.rpc = new rpc.Server();
    this.rpc.defaultScope = this;

    this.exposeMethods();
    this.startServer();
  }
};

JsonRpcServer.prototype.exposeMethods = function ()
{
  var self = this;
  var modules = ["info", "getwork", "proxy"];

  modules.forEach(function (name) {
    try {
      var module = require('./'+name);

      Object.keys(module).forEach(function (key) {
        self.rpc.expose(key, module[key]);
      });
    } catch (e) {
      logger.error('Error loading RPC module "'+name+'":\n' +
                   (e.stack ? e.stack : e.toString()));
    }
  });
};

JsonRpcServer.prototype.startServer = function ()
{
  logger.info('Listening for JSON-RPC connections on '+
              this.node.cfg.jsonrpc.host+':'+
              this.node.cfg.jsonrpc.port);

  this.rpc.listen(this.node.cfg.jsonrpc.port,
             this.node.cfg.jsonrpc.host);
};

JsonRpcServer.prototype.log = rpc.Server.trace;
