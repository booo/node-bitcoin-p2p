// These dependencies are provided as a convenience for custom RPC functions
// registered via 'definerpc' (they are evaluated in this context)
var bitcoin = require('../bitcoin');
var Util = require('../util');
var Step = require('step');

exports.definerpc = function getblockcount(args, opt, callback) {
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
  } else {
    callback(new Error("Handler did not evaluate to a valid function"));
  }
};
