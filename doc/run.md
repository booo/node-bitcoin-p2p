bitcoinjs-run(1) -- run daemon in foreground
============================================

## SYNOPSIS

    bitcoinjs run [--testnet | --livenet] [<args>]

## OPTIONS

  * `-c` <file>, `--config`=<file>:
    Path to config file.

  * `--connect`=<setting>:
    Changes the network connection mode for this node.

    Valid values are:

    _localhost:8333_:
    Connect to a single node (and allow no other connections). You can
    also enter multiple hosts, separated by commas.

    _p2p_:
    Use bootstrapping to connect to the open peer-to-peer network.

    _none_:
    Don't connect to anybody.

    _auto_:
    Check if localhost:8333 is available and if so, disable
    bootstrapping and use localhost as the only connection. Otherwise
    use p2p mode. (default)

  * `--addnode`:
    Add a node to the pool of known peers.

  * `--forcenode`:
    Force maintaining a connection to this node always. This
    option override any settings from --connect, meaning even if
    the node is in single connection mode it will maintain connections
    to --forcenode peers in addition.

  * `--nolisten`:
    Disable incoming connections.

  * `--livenet`:
    Connect to the main Bitcoin blockchain (default).

  * `--testnet`:
    Connect to the test network

  * `--port`=<port>:
    Port to listen for incoming peer-to-peer connections.

  * `--rpcuser`=<username>:
    Username for JSON-RPC connections.

  * `--rpcpassword`=<password>:
    Password for JSON-RPC connections.

  * `--rpcport`=<port>:
    Listen for JSON-RPC connections on <port> (default: 8432)

  * `--netdbg`:
    Enable networking debug messages.

  * `--bchdbg`:
    Enable block chain debug messages.

  * `--rpcdbg`:
    Enable JSON RPC debug messages.

  * `--scrdbg`:
    Enable script parser/interpreter debug messages.

  * `-h`, `--help`:
    Inline command help.

## DESCRIPTION

Runs the BitcoinJS daemon in the foreground. Useful for testing and
for the initial blockchain download.

