#!/usr/bin/env node

var Bitcoin = require('../lib/bitcoin');

node = new Bitcoin.Node();
node.addPeer('localhost');
node.start();
