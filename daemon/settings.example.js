var cfg = new (require('../lib/settings').Settings)();

// JSON-RPC SECTION
// -----------------------------------------------------------------------------
//
// To activate the JSON-RPC API, you have to at least set this option to true
// and choose an RPC password below. Please make sure you select a secure
// password.
cfg.jsonrpc.enabled = false;

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

module.exports = cfg;
