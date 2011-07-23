var sys = require('sys');
var logger = require('./logger');
var Binary = require('binary');
var Settings = require('./settings').Settings;
var Util = require('./util');
var BlockLocator = require('./blocklocator').BlockLocator;
var Step = require('step');

var BlockChain = exports.BlockChain = function BlockChain(storage, settings) {
  events.EventEmitter.call(this);
  if (!settings) settings = new Settings();

  this.storage = storage;
  this.cfg = settings;

  var self = this;

  var Block = this.storage.Block;
  var Transaction = this.storage.Transaction;
  var PubKeyHash = this.storage.PubKeyHash;

  var genesisBlock = null;
  var currentTopBlock = null;
  var lastRecvBlock = null;

  // TODO: This should be in Settings
  var recentBlockIndexLimit = 10;

  // Indexes for faster block processing
  var connectingBlockIndex = new ConnectingBlockIndex();
  var recentBlockIndex = new RecentBlockIndex(recentBlockIndexLimit);

  // Mechanism for pausing the block chain during a reorg
  var reorgInProgress = false;
  var incomingBlockQueue = [];

  function createGenesisBlock(callback) {
    logger.info("Loading genesis block");

    var genesisTransaction;
    try {
      genesisBlock = currentTopBlock = new Block(self.cfg.network.genesisBlock);
      genesisBlock.active = true;
      genesisBlock.setChainWork(genesisBlock.getWork());

      // A simple sanity check to make sure our constants are not
      // corrupted and our block hashing algorithm is working.
      if (!genesisBlock.checkHash()) {
        logger.error("Genesis block hash validation failed. There is " +
                     "something wrong with our constants or block hash " +
                     "validation code.");
        return;
      }

      genesisTransaction = new Transaction(self.cfg.network.genesisBlockTx);

      self.emit('blockAdd', {block: genesisBlock, txs: [genesisTransaction]});
    } catch (e) {
      logger.error("Error while adding genesis block: "+(e.stack ? e.stack : e));
      return;
    }

    genesisBlock.save(function (err) {
      // It's faster to just ignore the duplicate key error than to
      // check beforehand
      if (err && err.message.indexOf("E11000") == -1) {
        logger.error(err);
        callback(err);
        return;
      }

      if (!genesisTransaction.checkHash()) {
        logger.error("Genesis tx hash validation failed. There is something " +
                     "wrong with our constants or tx hash validation code.");
        return;
      }

      genesisTransaction.block = genesisBlock.getHash();
      genesisTransaction.active = true;

      self.emit('txAdd', {block: genesisBlock, index: 0, tx: genesisTransaction, chain: self});

      genesisTransaction.save(function (err) {
        // It's faster to just ignore the duplicate key error than to
        // check beforehand
        if (err && err.message.indexOf("E11000") == -1) {
          logger.error(err);
          callback(err);
          return;
        }


        self.emit('txAdd', {block: genesisBlock, index: 0, tx: genesisTransaction, chain: self});
      });

      self.emit('blockSave', {block: genesisBlock, txs: [genesisTransaction]});
      callback();
    });
  }

  function loadTopBlock(callback) {
    Block
      .find({active: true})
      .sort('height', -1)
      .limit(1)
      .exec(function (err, block) {
        if (err) {
          logger.error("Error while initializing block chain: " +
                       (err.stack ? err.stack : err.toString()));
          return;
        }
        currentTopBlock = block[0];
        callback();
      });
  }

  var getBlockByHash = this.getBlockByHash =
  function getBlockByHash(hash, callback) {
    Block.findOne({_id: hash}, callback);
  };

  var getBlockByHeight = this.getBlockByHeight =
  function getBlockByHeight(height, callback) {
    Block.findOne({height: height, active: true}, callback);
  };

  var getBlockByPref = this.getBlockByPrev =
  function getBlockByPrev(block, callback) {
    if ("object" == typeof block && block.hash) {
      block = block.hash;
    }

    Block.findOne({prev_hash: block}, function (err, block) {
      if (err) {
        callback(err);
        return;
      }

      callback(err, block);
    });
  };

  var getGenesisBlock = this.getGenesisBlock =
  function getGenesisBlock() {
    return genesisBlock;
  };

  var getTopBlock = this.getTopBlock =
  function getTopBlock() {
    return currentTopBlock;
  };

  var getBlockLocator = this.getBlockLocator =
  function getBlockLocator(callback) {
    BlockLocator.createFromBlockChain(this, callback);
  };

  /**
   * Check if a block is in the database yet.
   */
  var knowsBlock = this.knowsBlock = function knowsBlock(hash, callback) {
    if (hash instanceof Buffer) {
      // Nothing to do
    } else if (typeof hash === "string") {
      hash = new Buffer(hash, 'base64');
    } else {
      callback('Invalid value for hash');
      return;
    }

    Block.find({'_id': hash}).count(function (err, count) {
      callback(err, !!count);
    });
  };

  /**
   * Check if a transaction is in the database yet.
   *
   * Warning: This may return an incorrect result if the transaction is inserted
   * while the query is in progress.
   */
  var knowsTransaction = this.knowsTransaction =
  function knowsTransaction(hash, callback) {
    if (hash instanceof Buffer) {
      // Nothing to do
    } else if (typeof hash === "string") {
      hash = new Buffer(hash, 'base64');
    } else {
      callback('Invalid value for hash');
      return;
    }

    Transaction.find({'_id': hash}).count(function (err, count) {
      callback(err, !!count);
    });
  };

  /**
   * Get the last block we received.
   *
   * Very untrusted! This is only meant for continuously requesting
   * blocks during a block chain download. Otherwise always use
   * getTopBlock().
   */
  var getLastRecvBlock = this.getLastRecvBlock = function getLastRecvBlock () {
    return lastRecvBlock;
  };

  var getTransactionByHash = this.getTransactionByHash =
  function (hash, callback) {
    Transaction.findOne({_id: hash}, callback);
  };

  var getQueueCount = this.getQueueCount = function getQueueCount() {
    return connectingBlockIndex.getLength();
  };

  var add = this.add = function add(block, txs, callback) {
    var self = this;

    if (!block instanceof Block) {
      block = this.makeBlockObject(block);
    }

    var hash64 = block.getHash().toString('base64');

    // Check if the block is already being added
    if (connectingBlockIndex.getByHash(hash64)) {
      return;
    }

    // Check if the block was recently added
    if (recentBlockIndex.getByHash(hash64)) {
      return;
    }

    // Static checks
    try {
      block.checkBlock();
    } catch (e) {
      if (e.stack) {
        logger.error(e.stack);
      }
      callback('Check failed: ' + e, null);
      return;
    }

    // Index transactions
    txs = txs.map(function (tx) {
      if (!(tx instanceof Transaction)) {
        tx = new Transaction(tx);
      }

      // This will try and determine all Bitcoin addresses affected by
      // this transaction.
      //
      // The call is caching, we just trigger it so the information is
      // guaranteed to be added to the database.
      tx.getAffectedKeys();

      return tx;
    });

    var bw = new BlockWrapper(block, txs);
    bw.addCallback(callback);

    // During a reorg, we can't process new blocks
    if (reorgInProgress) {
      incomingBlockQueue.push(bw);
      return;
    }

    // Start the block connection process
    processBlock(bw);
  };

  /**
   * Connect a block and store it.
   *
   * This function takes over once add() has ascertained that the block passed
   * intrinsic checks and there is no reorg currently in progress.
   */
  var processBlock = this.processBlock = function processBlock(bw, hash64) {
    // Shorthand
    var block = bw.block;

    // hash64 is an optional parameter, provided for performance
    hash64 = hash64 || block.getHash().toString('base64');
    var parent64 = block.prev_hash.toString('base64');

    // Index block while it is being connected
    connectingBlockIndex.add(bw, hash64, parent64);

    lastRecvBlock = block;

    // See if any orphans were waiting for this block
    var childBws;
    if ((childBws = connectingBlockIndex.getByParent(hash64))) {
      // Remove those orphans as chain heads and add us instead
      connectingBlockIndex.removeHeads(childBws);
      connectingBlockIndex.addHead(bw, parent64);

      // This will cause our children to be added once we are processed
      bw.children = childBws;
    }

    // Find parent block
    // -------------------------------------------------------------------------
    var parent;

    // Does this block attach to the top of the longest chain?
    if (currentTopBlock && 
        block.prev_hash.compare(currentTopBlock.getHash()) == 0) {
      parent = currentTopBlock;
      block.attachTo(parent);

      connectToMainChain(bw);

    // Does this block connect to another orphan block?
    } else if ((parent = connectingBlockIndex.getByHash(parent64))) {
      // Attach to parent's chain
      parent.children.push(bw);
      block.attachTo(parent.block);

    // Maybe this block connects to a recently added block?
    } else if ((parent = recentBlockIndex.getByHash(parent64))) {
      // Unwrap
      parent = parent.block;

      block.attachTo(parent.block);

      connectToSideChain(bw, parent.block);

    // Still no match. Maybe this block connects to some other block in our
    // database?
    } else {
      getBlockByHash(block.prev_hash, function (err, parent) {
        if (err) {
          bw.triggerError(err);
          return;
        }

        // Actually, can we please double check that we don't know this block
        getBlockByHash(block.hash, function (err, selfBlock) {
          if (err) {
            bw.triggerError(err);
            return;
          }

          if (selfBlock) {
            // We already know this block after all
            return;
          }

          if (parent) {
            block.attachTo(parent);
            connectToSideChain(bw, parent);
          } else {
            // No, this block connects nowhere, add as an orphan
            connectingBlockIndex.addHead(bw);
          }
        });
      });
    }
  };

  var connectToMainChain = this.connectToMainChain =
  function connectToMainChain(bw)
  {
    // This block is no longer being connected
    connectingBlockIndex.remove(bw);
    recentBlockIndex.add(bw);

    logger.bchdbg('Adding block '+Util.formatHash(bw.block.hash));
    currentTopBlock = bw.block;
    bw.block.active = true;

    saveBlock(bw);
  };

  var connectToSideChain = this.connectToSideChain =
  function connectToSideChain(bw, parent)
  {
    // This block is no longer being connected
    connectingBlockIndex.remove(bw);
    recentBlockIndex.add(bw);

    // Switch chains if side chain has more work.
    bw.block.active = false;
    if (bw.block.moreWorkThan(currentTopBlock)) {
      // Reorganize chain up this point
      self.reorganize(currentTopBlock, bw.block, function (err) {
        // Save block as new top block
        connectToMainChain(bw);
      });
      return;
    } else {
      logger.info('Adding block '+Util.formatHash(bw.block.hash)+
                  ' on side chain');
    }
  };

  /**
   * Saves a block straight to the database.
   *
   * This assumes the block has already been processed (connected to a
   * parent, etc.). To add a new block to the chain with all the
   * necessary verification, use add().
   */
  var saveBlock = this.saveBlock = function saveBlock(bw)
  {
    self.emit('blockAdd', {block: bw.block, txs: bw.txs, chain: self});

    bw.block.save(function (err) {
      if (err) {
        bw.triggerError(err);
        return ;
      }

      // Asynchronously store all of this block's transactions to the database
      self.saveTransactions(bw.block, bw.txs);

      // This event will also trigger us saving all child blocks that
      // are currently waiting.
      self.emit('blockSave', {block: bw.block, txs: bw.txs, chain: self});

      bw.triggerSuccess();
    });
  };

  this.saveTransactions = function addTransactions(block, txs) {
    var dbTxs = [];
    txs.forEach(function (tx, i) {
      tx.block = block.getHash();
      tx.active = block.active;

      // Calculate hash
      tx.getHash();

      self.emit('txAdd', {block: block, index: i, tx: tx, chain: self});

      dbTxs.push(tx.toObject());
    });
    Transaction.collection.insertAll(dbTxs, function (err) {
      if (err) {
        logger.warn(err);
        return;
      }

      txs.forEach(function (tx, i) {
        self.emit('txSave', {block: block, index: i, tx: tx, chain: self});
      });
    });
  };

  this.findFork = function findFork(bOld, bNew, toDisconnect, toConnect, callback) {
    try {
      if ("function" == typeof toDisconnect) {
        callback = toDisconnect;
        toDisconnect = null;
      }

      toDisconnect = toDisconnect || [];
      toConnect = toConnect || [];

      if (bOld.getHash().compare(bNew.getHash()) === 0) {
        callback(null, toDisconnect, toConnect, bOld);
        return;
      }

      if (bOld.height > bNew.height) {
        toDisconnect.push(bOld);

        self.getBlockByHash(bOld.prev_hash, function (err, bOld) {
          if (err) {
            callback(err);
            return;
          }
          if (!bOld) {
            logger.error("Active branch was disconnected, cannot find root.");
            callback(new Error("Disconnected fork (old branch)"));
            return;
          }
          self.findFork(bOld, bNew, toDisconnect, toConnect, callback);
        });
      } else {
        if (bNew.height <= 0) {
          callback(new Error("No common root found"));
        }
        toConnect.push(bNew);

        Block.findOne({hash: bNew.prev_hash}, function (err, bNew) {
          if (err) {
            callback(err);
            return;
          }
          if (!bNew) {
            logger.error("New branch was disconnected, cannot find root.");
            callback(new Error("Disconnected fork (new branch)"));
            return;
          }
          self.findFork(bOld, bNew, toDisconnect, toConnect, callback);
        });
      }
    } catch (e) {
      callback(e);
    }
  };

  this.reorganize = function reorganize(oldTopBlock, newTopBlock, callback) {
    logger.info('Reorganize (old head: '+Util.formatHash(oldTopBlock.hash)+
          ', new head: '+Util.formatHash(newTopBlock.hash)+')');

    // While a reorganization is in progress, no new block can be processed.
    reorgInProgress = true;

    // Follow the chains down to the fork
    this.findFork(oldTopBlock, newTopBlock, function (err, toDisconnect, toConnect) {
      if (err) {
        reorgInProgress = false;
        logger.error('Unable to reorganize: '+err);
        return;
      }

      var reorgSteps = [];

      // Disconnect old fork
      toDisconnect.forEach(function (block) {
        reorgSteps.push(function (err) {
          if (err) throw err;

          var nextReorgStep = this;

          block.active = false;

          Transaction.find({block: block.hash}, function (err, txs) {
            if (err) {
              logger.error('Error during reorg (while getting'+
                           'txs to disconnect): '+err);
              nextReorgStep();
              return;
            }

            // First revoke the transactions
            var revokeSteps = txs.map(function (tx, i) {
              return function (err) {
                if (err) throw err;

                self.emit('txRevoke', {
                  block: block,
                  index: i,
                  tx: tx,
                  chain: self
                });
                tx.active = false;
                tx.save(this);
              }
            });

            // Revoke txs in reverse order
            revokeSteps.reverse();

            // Once done, save the block and go to the next
            // reorg step.
            revokeSteps.push(function () {
              if (err) {
                logger.error('Error during reorg'+
                             '(while disconnecting txs): '+err);
              }
              block.save(this);
            });
            revokeSteps.push(function (err) {
              if (err) {
                logger.error('Error during reorg'+
                             '(while disconnecting block): '+err);
              }
              nextReorgStep();
            });

            Step.apply(null, revokeSteps);
          });
        });
      });

      // Connect new fork
      toConnect.forEach(function (block) {
        reorgSteps.push(function () {
          if (err) throw err;

          var nextReorgStep = this;

          block.active = true;

          Transaction.find({block: block.hash}, function (err, txs) {
            if (err) {
              logger.error('Error during reorg (while getting'+
                           'txs to connect): '+err);
              nextReorgStep();
              return;
            }

            var addSteps = txs.map(function (tx, i) {
              return function (err) {
                if (err) throw err;

                var callback = this;

                self.emit('txAdd', {
                  block: block,
                  index: i,
                  tx: tx,
                  chain: self
                });
                tx.active = true;
                tx.save(function (err) {
                  if (err) {
                    logger.error('Error during reorg'+
                                 '(while connecting tx): '+err);
                    callback();
                    return;
                  }
                  self.emit('txSave', {
                    block: block,
                    index: i,
                    tx: tx,
                    chain: self
                  });

                  callback();
                });
              };
            });

            addSteps.push(function (err) {
              if (err) {
                logger.error('Error during reorg'+
                             '(while connecting block): '+err);
                this();
                return;
              }

              self.emit('blockAdd', {
                block: block,
                txs: txs,
                chain: self
              });
              block.save(this);
            });

            addSteps.push(function (err) {
              if (err) {
                logger.error('Error during reorg'+
                             '(while connecting block): '+err);
              } else {
                self.emit('blockSave', {
                  block: block,
                  txs: txs,
                  chain: self
                });
              }

              nextReorgStep();
            });

            Step.apply(null, addSteps);
          });
        });
      });

      reorgSteps.push(function (err) {
        // TODO: Transactions from the disconnected chain should be added
        //       to the memory pool.
        this();
      });

      reorgSteps.push(function () {
        // Set new top block
        currentTopBlock = newTopBlock;

        // Run callback
        if ("function" == typeof callback) callback(null);

        // Unpause block chain
        reorgInProgress = false;
      });

      Step.apply(null, reorgSteps);
    });
  };

  this.makeBlockObject = function (blockData) {
    return new Block(blockData);
  };

  this.init = function () {
    createGenesisBlock(function () {
      loadTopBlock(function () {
        self.emit('initComplete');
      });
    });
  };

  /**
   * Find the latest matching block from a locator.
   *
   * A locator is basically just a list of blocks. We send it to the database and
   * ask it to get the latest block that is in the list.
   */
  this.getBlockByLocator = function (locator, callback) {
    Block.find({_id: {"$in": locator}, active: 1}).sort('height', -1).limit(1).exec(function (err, result) {
      if (err) {
        callback(err);
        return;
      }

      if (result.length) {
        callback(null, result[0]);
      } else {
        callback(null, null);
      }
    });
  };
};

sys.inherits(BlockChain, events.EventEmitter);


var BlockWrapper = exports.BlockWrapper = function BlockWrapper(block, txs) {
  this.block = block;
  this.txs = txs;
  this.callbacks = [];
  this.since = new Date().getTime();
  this.children = [];
};

BlockWrapper.prototype.addCallback = function addCallback(callback) {
  this.callbacks.push(callback);
};

BlockWrapper.prototype.triggerSuccess = function triggerSuccess() {
  this.callbacks.forEach(function (callback) {
    callback(null, this.block);
  }.bind(this));
  this.callbacks = [];
};

BlockWrapper.prototype.triggerError = function triggerError(err) {
  this.callbacks.forEach(function (callback) {
    callback(err);
  });
  this.callbacks = [];
};

var BlockThread = exports.BlockThread = function BlockThread() {

};


var ConnectingBlockIndex = exports.ConnectingBlockIndex =
function ConnectingBlockIndex() {
  this.list = [];
  this.index = {};

  // Index of parents of the current heads of the orphan chains
  this.parentIndex = {};

  // TODO: Remove stale orphan strings after a timeout
};

ConnectingBlockIndex.prototype.add = function add(bw, hash64) {
  this.list.push(bw);
  this.index[hash64] = bw;
};

ConnectingBlockIndex.prototype.remove = function remove(bw) {
  this.list.splice(this.list.indexOf(bw));
  delete this.index[bw.block.getHash().toString('base64')];
};

ConnectingBlockIndex.prototype.getLength = function getLength() {
  return this.list.length;
};

ConnectingBlockIndex.prototype.getByHash = function getByHash(hash64) {
  return this.index[hash64];
};

ConnectingBlockIndex.prototype.getByParent = function getByParent(parent64) {
  return this.parentIndex[parent64];
};

ConnectingBlockIndex.prototype.getAll = function getAll() {
  return this.list;
};

ConnectingBlockIndex.prototype.addHead = function addHead(bw, parent64) {
  parent64 = parent64 || bw.block.prev_hash.toString('base64');

  if (!this.parentIndex[parent64]) {
    this.parentIndex[parent64] = [];
  }
  this.parentIndex[parent64].push(bw);
};

ConnectingBlockIndex.prototype.removeHead = function removeHead(bw, parent64) {
  parent64 = parent64 || bw.block.prev_hash.toString('base64');

  this.parentIndex[parent64].splice(this.parentIndex[parent64].indexOf(bw), 1);
  if (!this.parentIndex[parent64].length) {
    delete this.parentIndex[parent64];
  }
};


ConnectingBlockIndex.prototype.removeHeads = function removeHeads(bws) {
  bws.forEach(function (bw) {
    this.removeHead(bw);
  }.bind(this));
};

var RecentBlockIndex = exports.RecentBlockIndex =
function RecentBlockIndex(maxEntries) {
  this.maxEntries = maxEntries;

  this.list = [];
  this.index = {};
};

RecentBlockIndex.prototype.add = function add(bw, hash64, parent64) {
  this.list.push(bw);
  this.index[hash64] = bw;

  this.clean();
};

RecentBlockIndex.prototype.getByHash = function getByHash(hash64) {
  return this.index[hash64];
};

RecentBlockIndex.prototype.clean = function clean() {
  while (this.list.length > this.maxEntries) {
    var dropped = this.list.shift();
    delete this.index[dropped.block.getHash().toString('base64')];
  }
};
