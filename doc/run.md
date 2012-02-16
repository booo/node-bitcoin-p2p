bitcoinjs-run(1) -- run daemon in foreground
============================================

## SYNOPSIS

    bitcoinjs run [--testnet | --livenet] [<args>]

## OPTIONS

  * `-c` <file>, `--config`=<file>:
    Path to config file.

  * `--homedir`=<path>:
    Home directory. Default: ~/.bitcoinjs/

    This is the base path for any user-specific files.

  * `--datadir`=<path>:
    Data directory. Default: .

    Local database backends will store their data files here. Relative
    paths are interpreted relative to the `--homedir`.

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

  * `-m` <mods>, `--mods`=<mods>:
    Mods to load. You can specify multiple mods separated with commas.

    Available mods are:

    _exit_:
    Starts a BitcoinJS exit node that lightweight clients can connect
    to.

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

  * `--noverify`:
    Disable all tx/block verification.

    This is intended to be used together with `--connect` to connect
    to a trusted node or for testing purposes.

    Without verification BitcoinJS will use less resources, but you
    have to trust any node the daemon connects with.

  * `-h`, `--help`:
    Inline command help.

## DESCRIPTION

Runs the BitcoinJS daemon in the foreground. Useful for testing and
for the initial blockchain download.

