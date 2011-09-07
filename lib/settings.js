var IrcBootstrapper = require('./bootstrap/irc.js').IrcBootstrapper;
var DnsBootstrapper = require('./bootstrap/dns.js').DnsBootstrapper;
var Util = require('./util');
var hex = Util.decodeHex;
var Binary = require('binary');
var checkpoints = require('./checkpoints');

/**
 * Holds the node's configuration options.
 *
 * Please see `bitcoinjs help run` for help on command line options and
 * `daemon/settings.example.js` for help on configuration inside JavaScript.
 */
var Settings = exports.Settings = function () {
  this.init();
  this.setStorageDefaults();
  this.setJsonRpcDefaults();
  this.setNetworkDefaults();
  this.setLivenetDefaults();
  this.setFeatureDefaults();
};

Settings.prototype.init = function () {
  this.storage = {};
  this.network = {};
  this.feature = {};
  this.jsonrpc = {};
};

Settings.prototype.setStorageDefaults = function () {
  this.storage.uri = 'mongodb://localhost/bitcoin';
};

Settings.prototype.setJsonRpcDefaults = function () {
  this.jsonrpc.enable = false;
  this.jsonrpc.username = "admin";
  this.jsonrpc.password = null;

  // Host/IP to bind to, use "0.0.0.0" to listen on all interfaces
  this.jsonrpc.host = "127.0.0.1";
  // Port to listen on
  this.jsonrpc.port = 8432;
};

Settings.prototype.setNetworkDefaults = function () {
  // Force the node to connect to a specific node or nodes
  this.network.connect = null;

  // List of peers to add to the list of known peers
  this.network.initialPeers = [];

  // List of peers to maintain a permanent connection (also overrides "connect")
  this.network.forcePeers = [];

  // Don't accept incoming peer-to-peer connections
  // TODO: Implement functionality.
  this.network.noListen = false;
};

/**
 * Set the settings for the official block chain.
 *
 * Note that these also constitute the defaults for testnet and unitnet
 * unless overridden in the respective functions. So if you change something
 * in the livenet defaults, make sure you update the other functions if
 * necessary.
 *
 * For more detailed documentation on some of these settings, please see
 * daemon/settings.example.js.
 */
Settings.prototype.setLivenetDefaults = function () {
  this.network.type = 'livenet';
  this.network.port = 8333;
  this.network.magicBytes = hex('f9beb4d9');

  // List of bootstrapping mechanisms
  this.network.bootstrap = [
    new DnsBootstrapper([
      "bitseed.xf2.org",
      "bitseed.bitcoin.org.uk",
      "dnsseed.bluematt.me"
    ]),
    new IrcBootstrapper('irc.lfnet.org', '#bitcoin')
  ];
  this.network.genesisBlock = {
    'height': 0,
    'nonce': 2083236893,
    'version': 1,
    'hash': hex('6FE28C0AB6F1B372C1A6A246AE63F74F' +
                '931E8365E15A089C68D6190000000000'),
    'prev_hash': new Buffer(32).clear(),
    'timestamp': 1231006505,
    'merkle_root': hex('3BA3EDFD7A7B12B27AC72C3E67768F61' +
                       '7FC81BC3888A51323A9FB8AA4B1E5E4A'),
    'bits': 486604799
  };

  this.network.genesisBlockTx = {
    'outs': [{
      'value': hex('00F2052A01000000'), // 50 BTC
      'script': Binary.put()
        .word8(65) // 65 bytes of data follow
        .put(hex('04678AFDB0FE5548271967F1A67130B7105CD6A828E03909' +
                 'A67962E0EA1F61DEB649F6BC3F4CEF38C4F35504E51EC112' +
                 'DE5C384DF7BA0B8D578A4C702B6BF11D5F'))
        .word8(0xAC) // OP_CHECKSIG
        .buffer()
    }],
    'lock_time': 0,
    'version': 1,
    'hash': hex('3BA3EDFD7A7B12B27AC72C3E67768F61' +
                '7FC81BC3888A51323A9FB8AA4B1E5E4A'),
    'ins': [{
      'sequence': 0xFFFFFFFF,
      'outpoint': {
        'index': 0xFFFFFFFF,
        'hash': new Buffer(32).clear()
      },
      'script': Binary.put()
        .put(hex('04FFFF001D010445'))
        .put(new Buffer('The Times 03/Jan/2009 Chancellor on brink of ' +
                        'second bailout for banks', 'ascii'))
        .buffer()
    }]
  };

  this.network.proofOfWorkLimit = hex("00000000FFFFFFFFFFFFFFFFFFFFFFFF" +
                                      "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");

  this.network.checkpoints = checkpoints.livenet;
};

Settings.prototype.setTestnetDefaults = function () {
  this.setLivenetDefaults();

  this.network.type = 'testnet';
  this.network.port = 18333;
  this.network.magicBytes = hex('fabfb5da');
  this.network.bootstrap = [
    new IrcBootstrapper('irc.lfnet.org', '#bitcoinTEST')
  ];

  this.network.genesisBlock = {
    'height': 0,
    'nonce': 384568319,
    'version': 1,
    'hash': hex("08B067B31DC139EE8E7A76A4F2CFCCA4" +
                "77C4C06E1EF89F4AE308951907000000"),
    'prev_hash': new Buffer(32).clear(),
    'timestamp': 1296688602,
    'merkle_root': hex('3BA3EDFD7A7B12B27AC72C3E67768F61' +
                       '7FC81BC3888A51323A9FB8AA4B1E5E4A'),
    'bits': 487063544
  };

  this.network.proofOfWorkLimit = hex("000000007FFFFFFFFFFFFFFFFFFFFFFF" +
                                      "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
};

/**
 * Set block chain and network settings for unittest.
 *
 * We're using a special configuration for our unit tests, called "unitnet".
 *
 * It's chosen to be incompatible with both Livenet and Testnet, in case our
 * unit tests accidentally connect to a real node.
 */
Settings.prototype.setUnitnetDefaults = function () {
  this.setLivenetDefaults();

  this.network.type = 'unitnet';
  this.network.magicBytes = hex('f3bbb2df');
  this.network.bootstrap = [];

  this.network.genesisBlock.hash = hex("14DAE1DB98CA7EFA42CC9EBE7EBB19BD" +
                                       "88D80D6CBD3C4A993C20B47401D238C6");
  this.network.genesisBlock.bits = 0x207fffff;

  this.network.proofOfWorkLimit = hex("00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF" +
                                      "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
};

Settings.prototype.setFeatureDefaults = function () {
  // Live accounting means the memory pool will create events containing
  // the individual pubKeyHash of a Bitcoin address. This allows wallets
  // to update themselves live by registering their pubKeys as event
  // listeners.
  this.feature.liveAccounting = true;
};
