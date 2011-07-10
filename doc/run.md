bitcoinjs-run(1) -- run daemon in foreground
============================================

## SYNOPSIS

    bitcoinjs run [--testnet | --livenet] [<args>]

## OPTIONS

  * `-c` <file>, `--config`=<file>:
    Path to config file.

  * `--addnode`:
    Add a node to the pool of known peers.

  * `--forcenode`:
    Force maintaining a connection to this node always. This
    option acts independently from `--connect`, meaning even if
    the node is in proxy mode (single connection) it will maintain
    connections to `--forcenode` peers in addition.

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

