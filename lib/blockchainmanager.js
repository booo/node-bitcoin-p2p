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

  this.lastSeenTop = new Buffer(0);

  // Move these to the Node's settings object
  this.checkInterval = 5000;
  this.downloadTimeout = 25000;

  this.peerManager.on('connect', this.handleConnect.bind(this));
  this.blockChain.on('blockSave', this.handleBlockSave.bind(this));
};

sys.inherits(BlockChainManager, events.EventEmitter);

BlockChainManager.prototype.enable = function ()
{
  this.enabled = true;

  if (!this.timer) {
    this.pingStatus();
  }
};

BlockChainManager.prototype.disable = function ()
{
  this.enabled = false;
};

BlockChainManager.prototype.pingStatus = function ()
{
  if (!this.enabled) {
    return;
  }

  var time = new Date().getTime();
  if (this.currentDownload &&
    this.currentDownload.lastPing < (time - this.downloadTimeout)) {
    this.currentDownload.handleTimeout();
  }

  this.timer = setTimeout(this.pingStatus.bind(this), this.interval);
};

BlockChainManager.prototype.handleConnect = function ()
{
  if (this.enabled && this.currentDownload == null) {
    this.startDownload();
  }
};

BlockChainManager.prototype.handleBlockSave = function handleBlockSave(e)
{
  var curTop = this.blockChain.getTopBlock().getHash();
  if (this.lastSeenTop.compare(curTop) != 0) {
    if (this.currentDownload) {
      this.currentDownload.resetTimeout();
    }
    this.lastSeenTop = curTop;
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
      logger.error('Error while creating block locator: ', err);
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

      // We are very, very agressive in trying to download the block chain
      // as fast as possible. Usually our back-end won't be able to keep up,
      // so we need to slow down whenever too much is queueing up.
      if (queueCount > 100) {
        logger.info('Waiting for backend to catch up... '+
                    ' (queued: '+queueCount+')');
        setTimeout(arguments.callee.bind(this, null, locator), 2000);
      } else {
        logger.info('Downloading blocks'+heightInfo+
                    ' (top: '+Util.formatHash(locator[0])+
                    ', queued: '+queueCount+')');

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
        this.currentDownload.on('timeout', function handleTimeout(e) {
          // We need to nextTick this, because there is a "close" event
          // coming up.
          process.nextTick(function () {
            this.startDownload();
          }.bind(this));
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
  this.maxDuration = 30000;

  // Bind event handlers - we do this here instead of inline so that we can
  // later reference them when we want to remove them.
  this.handleInv = this.handleInv.bind(this);
  this.handleBlock = this.handleBlock.bind(this);
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
  this.conn.on('block', this.handleBlock);
  this.conn.on('disconnect', this.handleDisconnect);

  this.lastPing = new Date().getTime();
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

BlockChainDownload.prototype.handleBlock = function handleBlock(e) {
  // TODO: We should make sure the block actually makes it into the block
  //       chain, otherwise an evil peer could "string us along" forever.
  this.resetTimeout();
};

BlockChainDownload.prototype.handleDisconnect = function handleDisconnect() {
  this.close();
};

BlockChainDownload.prototype.handleTimeout = function handleTimeout() {
  logger.info('Block download from '+this.conn.peer+' timed out');

  this.emit('timeout');
  this.close();
};

BlockChainDownload.prototype.close = function close() {
  if (this.closed) return;

  if (this.timer) clearTimeout(this.timer);

  this.conn.removeListener('inv', this.handleInv);
  this.conn.removeListener('block', this.handleBlock);
  this.conn.removeListener('disconnect', this.handleDisconnect);

  this.emit('close');

  this.closed = true;
};

BlockChainDownload.prototype.resetTimeout = function ()
{
  this.lastPing = new Date().getTime();
};
