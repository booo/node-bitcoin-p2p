// These dependencies are provided as a convenience for custom RPC functions
// registered via 'definerpc' (they are evaluated in this context)
var bitcoin = require('../bitcoin');
var Util = require('../util');
var Step = require('step');

exports.definerpc = function definerpc(args, opt, callback) {
  var name = args[0];
  var handlerCode = args[1];
  var handler;
  try {
    eval("handler = "+args[1]);
  } catch (err) {
    callback(err);
  }

  if ("function" === typeof handler) {
    this.rpc.expose(name, handler);
    callback(null);
  } else {
    callback(new Error("Handler did not evaluate to a valid function"));
  }
};

exports.definerpcmodule = function definerpcmodule(args, opt, callback) {
  try {
    var name = args[0];
    var moduleCode = args[1];

    var Module = require('module');

    var virtualFilename = __dirname + '/' + name + '.virtual.js';
    var rpcModule = new Module(virtualFilename, module);
    rpcModule.filename = virtualFilename;
    rpcModule.paths = module.paths;
    rpcModule._compile(moduleCode, virtualFilename);
    this.rpc.expose(name, rpcModule.exports);
    callback(null);
  } catch (err) {
    callback(err);
  }
};
