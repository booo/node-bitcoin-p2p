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
  addnode: {
    type: yanop.list,
    description: 'Add a node to connect to'
  },
  connect: {
    type: yanop.string,
    description: 'Connect only to the specified node'
  },
  nolisten: {
    type: yanop.flag,
    description: 'Disable incoming connections'
  },
  livenet: {
    type: yanop.flag,
    description: 'Use the regular network (default)'
  },
  testnet: {
    type: yanop.flag,
    description: 'Use the test network'
  },
  port: {
    type: yanop.scalar,
    description: 'Port to listen for incoming connections'
  },
  rpcuser: {
    type: yanop.string,
    description: 'Username for JSON-RPC connections'
  },
  rpcpassword: {
    type: yanop.string,
    description: 'Password for JSON-RPC connections'
  },
  rpcport: {
    type: yanop.scalar,
    description: 'Listen for JSON-RPC connections on <port> (default: 8432)'
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
if (opts.addnode.length) {
  cfg.network.initialPeers = cfg.network.initialPeers.concat(opts.addnode);
}
if (opts.connect) {
  cfg.network.connect = opts.connect;
}
if (opts.nolisten) {
  cfg.network.noListen = opts.nolisten;
}
if (opts.livenet) {
  cfg.setLivenetDefaults();
} else if (opts.testnet) {
  cfg.setTestnetDefaults();
}
if (opts.port) {
  opts.port = +opts.port;
  if (opts.port > 65535 || opts.port < 0) {
    logger.error('Invalid port setting: "'+opts.port+'"');
  } else {
    cfg.network.port = opts.port;
  }
}
if (opts.rpcuser) {
  cfg.jsonrpc.enable = true;
  cfg.jsonrpc.username = opts.rpcuser;
}
if (opts.rpcpassword) {
  cfg.jsonrpc.enable = true;
  cfg.jsonrpc.password = opts.rpcpassword;
}
if (opts.rpcport) {
  opts.rpcport = +opts.rpcport;
  if (opts.port > 65535 || opts.port < 0) {
    logger.error('Invalid port setting: "'+opts.rpcport+'"');
  } else {
    cfg.jsonrpc.port = opts.rpcport;
  }
}

// Start node
var node = new Bitcoin.Node(cfg);
node.start();
