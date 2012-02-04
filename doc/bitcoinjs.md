bitcoinjs(1) -- BitcoinJS commandline utility
=============================================

## SYNOPSIS

    bitcoinjs <command> [args]

## DESCRIPTION

bitcoinjs is a part of node-bitcoin-p2p and serves as the general
purpose commandline tool for the BitcoinJS ecosystem. It's made up of
modules, similar to the way git or npm are set up.

It's main job at the moment is running and controlling
node-bitcoin-p2p's daemon.

## USAGE

* run:
  Run the BitcoinJS daemon in the foreground. See `bitcoinjs help
  run`.
* start:
  Start BitcoinJS as a daemon in the background. See `bitcoinjs help
  start`.
* stop:
  Stop the BitcoinJs daemon. See `bitcoinjs help stop`.
* restart:
  Restart BitcoinJS daemon. See `bitcoinjs help restart`.
* list:
  List currently running instances of BitcoinJS. See `bitcoinjs help
  list`.
* db-reset
  Removes all tables from the database. See `bitcoinjs help db-reset`.
* db-drop
  Drops the database. This function is slightly slower than db-reset,
  because the allocated hard drive space is being freed up. See
  `bitcoinjs help db-drop`.
* bch-import
  Import the block chain from data files. See `bitcoinjs help
  bch-import`.
* bch-export
  Export the block chain data from the database into a series of dump
  files. See `bitcoinjs help bch-export`.
* test:
  Executes the BitcoinJS unit tests, powered by VowsJS. By default the
  --spec format is used. Other available formats are XUnit, JSON and
  dot matrix. See `bitcoinjs help test`.
* setup:
  Installs the dependencies for a mod. See the mods/ folder in your
  bitcoinjs installation for information on what mods are available.

## BUGS

When you find issues or to request new features, please report them:

* web:
  <https://github.com/bitcoinjs/node-bitcoin-p2p/issues>
