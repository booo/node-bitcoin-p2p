var cfg = new (require('../lib/settings').Settings)();

// JSON-RPC SECTION
// -----------------------------------------------------------------------------
//
// To activate the JSON-RPC API, you have to at least set this option to true
// and choose an RPC password below. Please make sure you select a secure
// password.
cfg.jsonrpc.enable = false;

// JSON-RPC login
//
// These are the credentials you later use to login to the RPC API.
cfg.jsonrpc.username = "admin";
cfg.jsonrpc.password = null; // Note: You MUST set a password to enable RPC

// JSON-RPC TCP/IP settings
//
// Here you can specify what interface and port to listen on. We strongly re-
// commend to leave .host set at "127.0.0.1".
cfg.jsonrpc.host = "127.0.0.1";
cfg.jsonrpc.port = 8432;

// NETWORK SECTION
// -----------------------------------------------------------------------------
// Network type
//
// BitcoinJS supports different pre-installed configuration and defaults to
// the original 2009 Satoshi block chain.
//
// Other supported configurations are (uncomment to activate):
//
//cfg.setTestnetDefaults();

// Connect
//
// We default to connect=auto mode. This means that we'll try to connect to
// a bitcoind running at localhost:8333 first as a proxy and if that doesn't
// work, we'll try connecting to the P2P network directly.
//
// Valid values:
//   "localhost:8333"     - Connect to a single node
//   ["server:8333", ...] - Connect to multiple nodes
//   "auto"               - Connect to localhost:8333 if available and
//                          disable bootstrapping and other known nodes.
//   "p2p"
//   - or -
//   null                 - Use bootstrapping
cfg.network.connect = "auto";

// Default port
//
// This is the port where BitcoinJS will listen for incoming Bitcoin
// connections. It is also used as the default port for hosts where no port
// is specified.
//
// The default depends on the network type (8333 for livenet, 18333 for testnet)
//cfg.network.port = 8333;

// No incoming connections
//
// Set this value to true if you want to prevent BitcoinJS from accepting any
// inbound Bitcoin connections.
cfg.network.noListen = false;

// DATABASE SECTION
// -----------------------------------------------------------------------------
// URI
//
// This is the MongoDB URI that BitcoinJS will use as its database. For more
// information, see: http://www.mongodb.org/display/DOCS/Connections
cfg.storage.uri = "mongodb://localhost/bitcoin";

// OTHER SETTINGS
// -----------------------------------------------------------------------------
// For other (undocumented) settings, please see the lib/settings.js file in the
// source code.

module.exports = cfg;
