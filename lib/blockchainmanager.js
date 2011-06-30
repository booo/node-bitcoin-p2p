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
};

sys.inherits(BlockChainManager, events.EventEmitter);

BlockChainManager.prototype.enable = function ()
{
	this.enabled = true;

	if (!this.timer) {
		this.checkStatus();
	}

	this.startDownload();
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
				conn.sendGetBlocks(locator, toHash);
			}
		}
	}).bind(this));
};
