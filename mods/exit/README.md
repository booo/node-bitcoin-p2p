# node-bitcoin-exit

Public API that enables thin clients to communicate with the Bitcoin
network.

# Installation

First you need to [install
bitcoinjs-server](https://github.com/bitcoinjs/bitcoinjs-server).

Make sure you download the block chain after configuring
`bitcoinjs-server`.

Then, setup the exit node module using `bitcoinjs setup exit`.

# Usage

Start a BitcoinJS server using any of the usual commands. Add the
`-m exit` parameter to load the exit node mod.

``` sh
bitcoinjs run -m exit
```
# Status

First permanent deployment is online at https://exit.trucoin.com:3125/

Prototype software, use at your own peril.
