var sys = require('sys');
var Bitcoin = require('../lib/bitcoin');

var asciiArt = [
  "  ,d8b."
, " ,8BTC8-."
, "( 'Y8Y'.:)"
, " `-`-`--'"];

var message =
  "BitcoinJS Daemon v"+Bitcoin.version+" (node-bitcoin-p2p)\n" +
  "\n" +
  "Copyright (c) 2011 BitcoinJS Project\n" +
  "http://bitcoinjs.org/\n" +
  "\n" +
  "This program is free software; you can redistribute it and/or modify\n" +
  "it under the terms of the MIT license.\n";

var pos = 12;
message = message.split('\n').map(function (line, i) {
  if (i >= 0 && i <= 3) {
    var ascii = " "+asciiArt[i];
    while (ascii.length < pos) ascii += " ";
    line = ascii + line;
  }
  return line;
}).join('\n');

sys.puts("\n"+message);
