var util = require('util');
var Bitcoin = require('../lib/bitcoin');
require('colors');

var asciiArt = [" (" + "(".grey + "(B)".yellow + ")".grey + ") "];

var message =
  asciiArt+"BitcoinJS Daemon v"+Bitcoin.version+" (node-bitcoin-p2p)\n" +
  "         Copyright (c) 2011 BitcoinJS Project\n" +
  "\n" +
  " LICENSE This program is free software; you can redistribute it and/or modify\n" +
  "         it under the terms of the MIT license.\n";

util.puts("\n"+message);
