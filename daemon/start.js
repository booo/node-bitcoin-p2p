// Load node-bitcoin-p2p
var Bitcoin = require('../lib/bitcoin');
var logger = require('../lib/logger');

// Load user-defined settings
try {
  var cfg = require('./settings');
} catch (e) {
  
}

// Start node
var node = new Bitcoin.Node(cfg);
node.start();
