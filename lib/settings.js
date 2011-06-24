var IrcBootstrapper = require('./bootstrap/irc.js').IrcBootstrapper;
var DnsBootstrapper = require('./bootstrap/dns.js').DnsBootstrapper;
var Util = require('./util');
var hex = Util.decodeHex;
var Binary = require('binary');

var Settings = exports.Settings = function () {
	this.init();
	this.setStorageDefaults();
	this.setLivenetDefaults();
	this.setFeatureDefaults();
};

Settings.prototype.init = function () {
	this.storage = {};
	this.network = {};
	this.feature = {};
};

Settings.prototype.setStorageDefaults = function () {
	this.storage.uri = 'mongodb://localhost/bitcoin';
};

/**
 * Set the settings for the official block chain.
 *
 * Note that these also constitute the defaults for testnet and unitnet
 * unless overridden in the respective functions. So if you change something
 * in the livenet defaults, make sure you update the other functions if
 * necessary.
 */
Settings.prototype.setLivenetDefaults = function () {
	this.network.type = 'livenet';
	this.network.magicBytes = hex('f9beb4d9');
	this.network.initialPeers = [];
	this.network.bootstrap = [
		new DnsBootstrapper([
			"bitseed.xf2.org",
			"bitseed.bitcoin.org.uk"
		]),
		new IrcBootstrapper('irc.lfnet.org', '#bitcoin')
	];
	this.network.genesisBlock = {
		'height': 0,
		'nonce': 2083236893,
		'version': 1,
		'hash': hex('6FE28C0AB6F1B372C1A6A246AE63F74F931E8365E15A089C68D6190000000000'),
		'prev_hash': new Buffer(32).clear(),
		'timestamp': 1231006505,
		'merkle_root': hex('3BA3EDFD7A7B12B27AC72C3E67768F617FC81BC3888A51323A9FB8AA4B1E5E4A'),
		'bits': 486604799
	};

	this.network.genesisBlockTx = {
		'outs': [{
			'value': hex('00F2052A01000000'), // 50 BTC
			'script': Binary.put()
				.word8(65) // ???
				.put(hex('04678AFDB0FE5548271967F1A67130B7105CD6A828E03909A67962E0EA1F61DEB649F6BC3F4CEF38C4F35504E51EC112DE5C384DF7BA0B8D578A4C702B6BF11D5F'))
				.word8(0xAC)
				.buffer() // OP_CHECKSIG
		}],
		'lock_time': 0,
		'version': 1,
		'hash': hex('3BA3EDFD7A7B12B27AC72C3E67768F617FC81BC3888A51323A9FB8AA4B1E5E4A'),
		'ins': [{
			'sequence': 0xFFFFFFFF,
			'outpoint': {
				'index': 0xFFFFFFFF,
				'hash': new Buffer(32).clear()
			},
			'script': Binary.put()
				.put(hex('04FFFF001D010445'))
				.put(new Buffer('The Times 03/Jan/2009 Chancellor on brink of second bailout for banks', 'ascii'))
				.buffer()
		}]
	};

	this.network.proofOfWorkLimit = hex("00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
};

Settings.prototype.setTestnetDefaults = function () {
	this.setLivenetDefaults();

	this.network.type = 'testnet';
	this.network.magicBytes = hex('fabfb5da');
	this.network.bootstrap = [
		new IrcBootstrapper('irc.lfnet.org', '#bitcoinTEST')
	];
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

	this.network.proofOfWorkLimit = hex("00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

	this.network.genesisBlock.hash = hex("14dae1db98ca7efa42cc9ebe7ebb19bd88d80d6cbd3c4a993c20b47401d238c6");
	this.network.genesisBlock.bits = 0x207fffff;
};

Settings.prototype.setFeatureDefaults = function () {
	// Live accounting means the memory pool will create events containing
	// the individual pubKeyHash of a Bitcoin address. This allows wallets
	// to update themselves live by registering their pubKeys as event
	// listeners.
	this.feature.liveAccounting = true;
};
