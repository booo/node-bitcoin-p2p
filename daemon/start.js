#!/usr/bin/env node

var sys = require('sys');
var path = require('path');

// Load node-bitcoin-p2p
var Bitcoin = require('../lib/bitcoin');
var logger = require('../lib/logger');

// Print welcome message
require("./welcome");

// Load user-defined settings
try {
  logger.info('Loading configuration');
  var cfg = require('./settings');
} catch (e) {
  if (e.message == "Cannot find module './settings'") {
    logger.error('Configuration file not found!');
    sys.puts(
      "\n" +
      "  We were looking under:\n" +
      "  " + path.resolve(__dirname, './settings.js') + "\n" +
      "\n" +
      "  If you just installed node-bitcoin-p2p, this is normal.\n" +
      "  You'll find an example config file here:\n" +
      "  " + path.resolve(__dirname, './settings.example.js') + "\n" +
      "\n" +
      "  Simply edit it and copy it over!\n");
    logger.info('Exiting...');
    process.exit(1);
  } else {
    throw e;
  }
}

// Start node
var node = new Bitcoin.Node(cfg);
node.start();
