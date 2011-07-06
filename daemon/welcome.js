var sys = require('sys');
var Bitcoin = require('../lib/bitcoin');

var version = ""+Bitcoin.version;
while (version.length < 11) {
  version += " ";
}

sys.puts(
  "\n" +
  "BitcoinJS Daemon v"+version+"                           -+syys/.    \n" +
  "(powered by node-bitcoin-p2p)                          +ddo++hdh-   \n" +
  "                                                     `:ydd+//odhs/:`\n" +
  "Copyright (c) 2011 BitcoinJS Project                 +--+so/+s+/.`y:\n" +
  "http://bitcoinjs.org/                                `/+++++++++++: \n" +
  "\n" +
  "This program is free software; you can redistribute it and/or modify\n" +
  "it under the terms of the MIT license.\n");
