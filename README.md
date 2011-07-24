# node-bitcoin-p2p

This is a client library for the Bitcoin P2P network, written for
Node.js, using MongoDB as its back end.

# Differences to official client

The official client contains the node, wallet, GUI and miner. This
library only contains the node, i.e. the P2P part of Bitcoin. Its
intended use is as a server component to give lighter clients
access to the data in the block chain (in real-time.)

# Installation

Please refer to the wiki for detailed [installation
instructions](https://github.com/bitcoinjs/node-bitcoin-p2p/wiki/Installation).

## Prerequisites

* [Node.js](https://github.com/joyent/node) 0.4.8+
* [NPM](https://github.com/isaacs/npm) 1.0+
* [MongoDB](http://www.mongodb.org/) 1.6.x+
  **Note:** Due to the database size, you need to be using the 64-bit
  build of MongoDB.
* [libgmp](http://gmplib.org/) (lib and headers)


## Installation

This one-liner will install the latest version straight from NPM:

``` sh
# Install node-bitcoin-p2p globally
sudo npm install bitcoin-p2p -g
```

If you run into problems, please take a look at the "Troubleshooting"
section below or go to the Issues tab to open a new ticket.

# Usage

For your first experience with the BitcoinJS daemon, try running it
right from the terminal.

``` sh
bitcoinjs run --testnet
```

You can find out more about the various functions of the command line
utility via the help feature:

``` sh
bitcoinjs help
```


## Logging

`node-bitcoin-p2p` logs using the winston library. Currently, it
defaults to logging anything on the `debug` log level and higher. Here
are the available log levels:

- `netdbg` - Networking events (sending/receiving messages)
- `bchdbg` - Block chain events (adding blocks)
- `rpcdbg` - JSON-RPC API events (requests/responses)
- `scrdbg` - Script interpreter events (custom scripts, errors)
- `debug` - Other verbose logging
- `info` - General information and status messages
- `warn` - Something rare happened (e.g. strange pubKeyScript)
- `error` - Something bad happened

The XXXdbg levels can be enabled individually by editing
lib/logger.js.


## Advanced usage

`node-bitcoin-p2p` is not only a daemon, but also a Node.js
module/library. In most cases it's best to use the daemon via RPC. But
sometimes you need the extra control that comes with directly linking
to the code.

For details on developing with `node-bitcoin-p2p` as a library, take a
look at the Developer Guide on the
[wiki](https://github.com/bitcoinjs/node-bitcoin-p2p/wiki).


# Upgrading

When upgrading node-bitcoin-p2p it is a good idea to reset its
database:

``` sh
mongo bitcoin --eval "db.dropDatabase()"
```

This won't be necessary once node-bitcoin-p2p is more stable, but for
now new versions often break database compatibility and since it only
takes about ten minutes to regenerate it makes sense to just reset it.


# Tests

To run the test suite, please install [Vows](http://vowsjs.org) and
run the following command:

``` sh
vows test/* --spec
```

# Status

The library is currently alpha quality. Here are some things it
currently lacks:

- Verify difficulty transitions
- Accept incoming Bitcoin connections (optionally)
- Store hashes etc. as MongoDB BinData instead of base64

On top of that, it could use a lot more documentation, test
cases and general bug fixing across the board.

You can find more information on the Issues tab on Github.

# Troubleshooting

## Native module missing

If you see this error:

    Error: Cannot find module '../build-cc/default/native'

This happens when the native components of node-bitcoin-p2p are not
compiled yet.

Make sure you have `libgmp3-dev` installed, then go to the
node-bitcoin-p2p folder and run:

``` sh
node-waf configure build
```

# Credits

node-bitcoin-p2p - Node.js Bitcoin client<br>
Copyright (c) 2011 Stefan Thomas <justmoon@members.fsf.org>.

Native extensions are<br>
Copyright (c) 2011 Andrew Schaaf <andrew@andrewschaaf.com>

Parts of this software are based on [BitcoinJ](http://code.google.com/p/bitcoinj/)<br>
Copyright (c) 2011 Google Inc.
