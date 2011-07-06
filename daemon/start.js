#!/usr/bin/env node

var sys = require('sys');
var path = require('path');
var yanop = require('yanop');

// Load node-bitcoin-p2p
var Bitcoin = require('../lib/bitcoin');
var logger = require('../lib/logger');

// Command-line arguments parsing
var opts = yanop.simple({
  config: {
    type: yanop.string,
    short: 'c',
    description: 'Configuration file',
    default: './settings'
  },
  livenet: {
    type: yanop.flag,
    description: 'Use the regular network (default)'
  },
  testnet: {
    type: yanop.flag,
    description: 'Use the test network'
  }
});

// Print welcome message
require("./welcome");

// Load user-defined settings
logger.info('Loading configuration');
try {
  var configPath = opts.config;
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

if (!(cfg instanceof Bitcoin.Settings)) {
  logger.error('Settings file is invalid!\n');
  sys.puts("Please see\n" + 
           path.resolve(__dirname, './settings.example.js') + "\n" +
           "for an example config file.\n");
  process.exit(1);
}

// Apply configuration from the command line
if (opts.livenet) {
  cfg.setLivenetDefaults();
} else if (opts.testnet) {
  cfg.setTestnetDefaults();
}

// Start node
var node = new Bitcoin.Node(cfg);
node.start();
