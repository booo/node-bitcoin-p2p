var bitcoin = require('../../lib/bitcoin');
var logger = require('../../lib/logger');

require('colors');

try {
  var express = require('express');
  var Pubkeys = require('./pubkeys').Pubkeys;
  var Tx = require('./tx').Tx;
  var Block = require('./block').Block;
  var RealtimeAPI = require('./realtime').API;
} catch (e) {
  var path = require('path');
  logger.error(
    e.name + " while loading 'exit' mod: " + e.message + '\n\n' +
      "To install this mod's dependencies, please run: \n\n" +
      "  " + "$".grey + " bitcoinjs setup exit".bold + '\n\n' +
      "Make sure you have write permission for the module directory:\n\n" +
      "  " + path.resolve(__dirname, 'node_modules')+'\n');
  process.exit(1);
}

exports.init = function init(node) {
  var app = express.createServer();

  // Configuration
  app.configure(function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express['static'](__dirname + '/public'));
  });

  app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  });

  app.configure('production', function(){
    app.use(express.errorHandler());
  });

  app.get('/', function(req, res){
    res.send('This is a BitcoinJS exit node. Source code available at <a href="https://github.com/bitcoinjs/node-bitcoin-exit">https://github.com/bitcoinjs/node-bitcoin-exit</a>.');
  });

  var pubkeysModule = new Pubkeys({
    node: node
  });
  pubkeysModule.attach(app, '/pubkeys/');

  var txModule = new Tx({
    node: node
  });
  txModule.attach(app, '/tx/');

  var blockModule = new Block({
    node: node
  });
  blockModule.attach(app, '/block/');

  app.listen(3125);

  var io = require('socket.io').listen(app, {
    logger: logger
  });
  var realtimeApi = new RealtimeAPI(io, node, pubkeysModule, txModule, blockModule);
};
