#!/usr/bin/env node

var sys = require('sys');
var path = require('path');
var opts = require('opts');

// Load node-bitcoin-p2p
var Bitcoin = require('../lib/bitcoin');
var logger = require('../lib/logger');

// Command-line arguments parsing
var options = [{
  short: 'c',
  long: 'config',
  description: 'Configuration file',
  value: true
}];
opts.parse(options, true);

// Print welcome message
require("./welcome");

// Load user-defined settings
logger.info('Loading configuration');
try {
  var configPath = opts.get('config') || './settings';
  var cfg = require(configPath);
} catch (e) {
  if (/^Cannot find module /.test(e.message)) {
    logger.warn('No configuration file found!');
    sys.puts(
      "\n" +
      "BitcoinJS was unable to locate your config file under:\n" +
      "" + path.resolve(__dirname, configPath) + "\n" +
      "\n" +
      "If you just installed node-bitcoin-p2p, this is normal.\n" +
      "You'll find an example config file here:\n" +
      "" + path.resolve(__dirname, './settings.example.js') + "\n");
  } else {
    throw e;
  }
}

// Start node
var node = new Bitcoin.Node(cfg);
node.start();
