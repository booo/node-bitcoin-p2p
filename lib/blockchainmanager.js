var sys = require('sys');
var logger = require('./logger');
var Util = require('./util');

/**
 * This class manages the block chain and block chain downloads.
 */
var BlockChainManager = exports.BlockChainManager = function (blockChain, peerManager) {
	events.EventEmitter.call(this);

	this.blockChain = blockChain;
	this.peerManager = peerManager;
	this.enabled = false;
	this.timer = null;

	// Move these to the Node's settings object
	this.interval = 5000;

	this.peerManager.on('connect', this.handleConnect.bind(this));
};

sys.inherits(BlockChainManager, events.EventEmitter);

BlockChainManager.prototype.enable = function ()
{
	this.enabled = true;
};

BlockChainManager.prototype.disable = function ()
{
	this.enabled = false;
};

BlockChainManager.prototype.checkStatus = function ()
{
	// not used, we could do some kind of sanity check here to make
	// sure we're still up to date on the block chain
};

BlockChainManager.prototype.handleConnect = function ()
{
	if (this.enabled && this.currentDownload == null) {
		this.startDownload();
	}
};

BlockChainManager.prototype.startDownload = function (toHash, fromHash)
{
	var genesisBlock = this.blockChain.getGenesisBlock();
	var topBlock = this.blockChain.getTopBlock();

	if (!toHash) {
		toHash = new Buffer(32).clear();
	}
	// TODO: Figure out a way to spread load across peers

	this.blockChain.getBlockLocator((function (err, locator) {
		if (err) {
			logger.error('Error while creating block locator: '+err);
			return;
		}

		locator.push(genesisBlock.hash);

		if (fromHash && fromHash.compare(locator[0]) !== 0) {
			locator.unshift(fromHash);
		}

		var conn = this.peerManager.getActiveConnection();
		if (conn) {
			// Create some nicely formatted info about the chain height
			var heightInfo = '';
			if (topBlock.height < conn.bestHeight) {
				var curHeight = ""+topBlock.height;
				var maxHeight = ""+conn.bestHeight;
				while (curHeight.length < maxHeight.length) {
					curHeight = " "+curHeight;
				}
				heightInfo = ' '+curHeight+'/'+maxHeight;
			}

			var queueCount = this.blockChain.getQueueCount();

			logger.info('Downloading blocks'+heightInfo+
						' (top: '+Util.formatHash(locator[0])+
						', queued: '+queueCount+')');

			// We are very, very agressive in trying to download the block chain
			// as fast as possible. Usually our back-end won't be able to keep up,
			// so we need to slow down whenever too much is queueing up.
			if (queueCount > 800) {
				setTimeout(arguments.callee.bind(this, toHash, fromHash), 2000);
			} else {
				this.currentDownload = new BlockChainDownload(conn, locator, toHash);
				this.currentDownload.on('close', function handleDownloadEnd() {
					this.currentDownload = null;
				}.bind(this));
				this.currentDownload.on('success', function handleDownloadSuccess(e) {
					var lastBlock = this.blockChain.getLastRecvBlock();
					if (lastBlock) {
						this.startDownload(e.invs[0].hash, lastBlock.getHash());
					}
				}.bind(this));
				this.currentDownload.start();
			}
		}
	}).bind(this));
};


var BlockChainDownload = exports.BlockChainDownload =
	function BlockChainDownload(connection, locator, toHash)
{
	events.EventEmitter.call(this);

	this.conn = connection;
	this.locator = locator;
	this.toHash = toHash;

	this.timer = null;

	this.closed = false;

	// Number of milliseconds after which we consider the download timed
	// out. Should be moved to network settings.
	this.maxDuration = 10000;

	// Bind event handlers - we do this here instead of inline so that we can
	// later reference them when we want to remove them.
	this.handleInv = this.handleInv.bind(this);
	this.handleDisconnect = this.handleDisconnect.bind(this);
};

sys.inherits(BlockChainDownload, events.EventEmitter);

BlockChainDownload.prototype.start = function start() {
	if (this.closed) {
		throw new Error("BlockChainDownload.start(): BlockChainDownload " +
						"instances cannot be re-used.");
	}

	this.conn.sendGetBlocks(this.locator, this.toHash);

	// Event handlers are already bound, see constructor for more info
	this.conn.on('inv', this.handleInv);
	this.conn.on('disconnect', this.handleDisconnect);

	this.timer = setTimeout(this.handleTimeout.bind(this),
							this.maxDuration);
};

BlockChainDownload.prototype.handleInv = function handleInv(e) {
	var invs = e.message.invs;

	// The remote side will send an inv with a single block to signify the
	// download is complete.
	if (invs.length == 1 && invs[0].type == 2) {
		this.emit('success', {
			invs: invs
		});
		this.close();
	}
};

BlockChainDownload.prototype.handleDisconnect = function handleDisconnect() {
	this.close();
};

BlockChainDownload.prototype.handleTimeout = function handleTimeout() {
	this.close();
};

BlockChainDownload.prototype.close = function close() {
	if (this.closed) return;

	if (this.timer) clearTimeout(this.timer);

	this.conn.removeListener('inv', this.handleInv);
	this.conn.removeListener('disconnect', this.handleDisconnect);

	this.emit('close');
};
