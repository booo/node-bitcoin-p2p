var sys = require('sys');

var logger = require('./logger');
var Settings = require('./settings').Settings;
var Util = require('./util');
var BlockLocator = require('./blocklocator').BlockLocator;
var TransactionMap = require('./transactionmap').TransactionMap;
var VerificationError = require('./error').VerificationError;

var Binary = require('binary');
var Step = require('step');
var LRU = require("lru-cache");

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
  var recentTxIndex = new RecentTxIndex(2000);

  // Only process one block at a time
  var isProcessing = false;
  var incomingBlockQueue = [];

  var checkpoints = settings.network.checkpoints || [];

  function createGenesisBlock(callback) {
    logger.info("Initializing database");

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

    // TODO: Genesis tx should be saved first, then the genesis block.
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

  var getBlockByPrev = this.getBlockByPrev =
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
   * Whether the blockchain has reached the last hardcoded checkpoint.
   *
   * This is used for some optimizations. We don't accept/verify transactions
   * until we have at least the block chain up to the latest checkpoint.
   */
  var isPastCheckpoints = this.isPastCheckpoints =
  function isPastCheckpoints() {
    if ((!Array.isArray(checkpoints)) || checkpoints.length == 0) {
      return true;
    }

    var chainHeight = +this.getTopBlock().height;
    var checkpointHeight = +checkpoints[checkpoints.length-1].height;

    // Note that we consider ourselves past the checkpoints even when are only
    // just AT the last checkpoint. This is because the first block after the
    // last checkpoint needs to be treated like a non-checkpointed block.
    return chainHeight >= checkpointHeight;
  };

  /**
   * Check if a block is in the database yet.
   */
  var knowsBlock = this.knowsBlock = function knowsBlock(hash, callback) {
    try {
      if (Buffer.isBuffer(hash)) {
        // Nothing to do
      } else if (typeof hash === "string") {
        hash = new Buffer(hash, 'base64');
      } else {
        throw new Error('Invalid value for hash');
      }

      var hash64 = hash.toString('base64');

      if (connectingBlockIndex.getByHash(hash64)) {
        callback(null, true);
      } else {

        Block.find({'_id': hash}).count(function (err, count) {
          callback(err, !!count);
        });
      }
    } catch (err) {
      callback(err);
    }
  };

  /**
   * Check whether a hash belong to a currently orphaned block.
   */
  var isOrphan = this.isOrphan = function isOrphan(hash) {
    try {
      if (Buffer.isBuffer(hash)) {
        // Nothing to do
      } else if (typeof hash === "string") {
        hash = new Buffer(hash, 'base64');
      } else {
        throw new Error('Invalid value for hash');
      }

      var hash64 = hash.toString('base64');

      var orphanBw = connectingBlockIndex.getByHash(hash64);

      if (!orphanBw) {
        return false;
      }

      return orphanBw.mode === "orphan";
    } catch (err) {
      logger.error("Could not check orphan status for block " +
                   Util.formatHashAlt(hash) +
                   ": "+(err.stack ? err.stack : ""+err));
      return false;
    }
  };

  /**
   * Check if a transaction is in the database yet.
   *
   * Warning: This may return an incorrect result if the transaction is inserted
   * while the query is in progress.
   */
  var knowsTransaction = this.knowsTransaction =
  function knowsTransaction(hash, callback) {
    if (Buffer.isBuffer(hash)) {
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
  function getTransactionByHash(hash, callback) {
    Transaction.findOne({_id: hash}, callback);
  };

  /**
   * Retrieve transactions from database.
   *
   * This function includes recently added transactions in its results that
   * haven't been saved yet.
   */
  var getTransactionsByHashes = this.getTransactionsByHashes =
  function getTransactionsByHashes(hashes, callback) {
    var txs = [];

    // Get from cache the transactions that aren't saved to database yet
    hashes = hashes.filter(function (hash) {
      var tx;
      if ((tx = recentTxIndex.get(hash.toString('base64')))) {
        txs.push(tx);
        return false;
      } else {
        return true;
      }
    });

    // Get the remaining transactions from database
    Transaction.find({_id: {$in: hashes}}, function (err, result) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, txs.concat(result));
    });
  };

  /**
   * Fetch outputs from database.
   *
   * Like getTransactionsByHashes, except it only populates the "outs"
   * field when loading from database.
   */
  var getOutputsByHashes = this.getOutputsByHashes =
  function getOutputsByHashes(hashes, callback) {
    var txs = [];

    // Get from cache the transactions that aren't saved to database yet
    hashes = hashes.filter(function (hash) {
      var tx;
      if ((tx = recentTxIndex.get(hash.toString('base64')))) {
        txs.push(tx);
        return false;
      } else {
        return true;
      }
    });

    // Get the remaining transactions from database
    Transaction.find({_id: {$in: hashes}}, ["_id", "outs"], function (err, result) {
      if (err) {
        callback(err);
        return;
      }

      callback(null, txs.concat(result));
    });
  };

  var getQueueCount = this.getQueueCount = function getQueueCount() {
    return incomingBlockQueue.length;
  };

  var add = this.add = function add(block, txs, callback) {
    var self = this;

    if (!block instanceof Block) {
      block = this.makeBlockObject(block);
    }

    var hash64 = block.getHash().toString('base64');

    // Check if the block is already being added
    if (connectingBlockIndex.getByHash(hash64)) {
      if (callback) {
        callback(null);
      }
      return;
    }

    // Check if the block was recently added
    if (recentBlockIndex.get(hash64)) {
      if (callback) {
        callback(null);
      }
      return;
    }

    // Static checks
    try {
      block.checkBlock();
    } catch (e) {
      if (e && e.name != "VerificationError") {
        logger.error(e.stack);
      }
      if (callback) {
        callback('Check failed: ' + e, null);
      }
      return;
    }

    var bw = new BlockWrapper(block, txs);
    if (callback) {
      bw.addCallback(callback);
    }

    // Process blocks one at a time
    if (isProcessing) {
      incomingBlockQueue.push(bw);
    } else {
      processBlock(bw);
    }
  };

  /**
   * Connect a block and store it.
   *
   * This function takes over once add() has ascertained that the block passed
   * intrinsic checks and there is no reorg currently in progress.
   */
  var processBlock = this.processBlock = function processBlock(bw) {
    // Shorthand
    var block = bw.block;

    Step(
      function prepare() {
        isProcessing = true;

        // Index block while it is being connected
        connectingBlockIndex.add(bw);

        lastRecvBlock = block;

        // See if any orphans were waiting for this block
        var childBws = connectingBlockIndex.getByParent(bw.hash64);
        if (childBws) {
          // Remove those orphans as chain heads and add us instead
          connectingBlockIndex.removeHeads(childBws);
          connectingBlockIndex.addHead(bw, bw.parent64);

          // This will cause our children to be added once we are processed
          bw.children = childBws;
        }

        this(null);
      },
      function connect(err) {
        if (err) throw err;


        connectBlock(bw, this);
      },
      function verifyConnection(err) {
        if (err) throw err;

        bw.parent.verifyChild(self, bw.block, this);
      },
      function applyParent(err) {
        if (err) throw err;

        switch (bw.mode) {
        case 'main':
          connectToMainChain(bw, this);
          break;
        case 'side':
          connectToSideChain(bw, bw.parent, this);
          break;
        }
      },
      function prepareTxs(err) {
        if (err) throw err;

        var txList = [];
        bw.txs = bw.txs.map(function (tx) {
          if (!(tx instanceof Transaction)) {
            tx = new Transaction(tx);
          }
          // Calculate the hash
          tx.getHash();

          txList.push(tx.hash);

          return tx;
        });
        bw.block.txs = txList;
        this(null);
      },
      function verify(err) {
        if (err) throw err;

        verifyBlock(bw, this);
      },
      function reorganize(err) {
        if (err) throw err;

        if (bw.mode == "side" && bw.block.moreWorkThan(currentTopBlock)) {
          self.reorganize(currentTopBlock, bw.block, this);
        } else {
          this(null);
        }
      },
      function saveTransactions(err) {
        if (err) throw err;

        self.saveTransactions(bw.block, bw.txs, this);
      },
      function saveBlock(err) {
        if (err) throw err;

        self.saveBlock(bw, this);
      },
      function queueDependents(err) {
        if (err) throw err;

        // Children of this block can now be processed as well
        // TODO: In case this block failed to be added, we should discard
        // its children as well.
        if (bw.children) {
          bw.children.forEach(function (childBw) {
            childBw.block.attachTo(bw.block);
          });
          if (bw.mode == "main") {
            // Main chain blocks are processed with priority
            incomingBlockQueue = bw.children.concat(incomingBlockQueue);
          } else {
            // Side chain blocks are processed last
            incomingBlockQueue = incomingBlockQueue.concat(bw.children);
          }
        }

        this();
      },
      function finalize(err) {
        // The code "orphan" is a fake error which is only used to skip to
        // this point.
        if (err === "orphan") {
          err = null;
        }

        bw.callback(err);
        bw = null;

        if (incomingBlockQueue.length) {
          var next = incomingBlockQueue.shift();
          process.nextTick(self.processBlock.bind(self, next));
          //self.processBlock(next);
        } else {
          isProcessing = false;
          self.emit('queueDone', {chain: self});
        }
      }
    );
  };

  var connectBlock = this.connectBlock =
  function connectBlock(bw, callback) {
    // Shorthand
    var block = bw.block;

    // Find parent block
    // -------------------------------------------------------------------------
    var parent;

    // Does this block attach to the top of the longest chain?
    if (currentTopBlock &&
        block.prev_hash.compare(currentTopBlock.getHash()) == 0) {
      parent = currentTopBlock;
      block.attachTo(parent);

      // Block connects to main chain
      bw.mode = "main";
      bw.parent = parent;

      callback(null);

    // Does this block connect to another orphan block?
    } else if ((parent = connectingBlockIndex.getByHash(bw.parent64))) {
      // Attach to parent's chain
      parent.children.push(bw);
      block.attachTo(parent.block);

      // Block connects to an orphan chain
      logger.bchdbg('Connecting block '+
                    Util.formatHash(bw.block.hash)+' '+
                    '(parent '+Util.formatHashAlt(bw.block.prev_hash)+
                    ' known)');

      bw.mode = "orphan";

      callback("orphan");

    // Maybe this block connects to a recently added block?
    } else if ((parent = recentBlockIndex.get(bw.parent64))) {
      block.attachTo(parent);

      // Block connects to a side chain
      bw.mode = "side";
      bw.parent = parent;

      callback(null);

    // Still no match. Maybe this block connects to some other block in our
    // database?
    } else {
      getBlockByHash(block.prev_hash, function (err, parent) {
        if (err) {
          callback(err);
          return;
        }

        // Actually, can we please double check that we don't know this block
        getBlockByHash(block.hash, function (err, selfBlock) {
          if (err) {
            callback(err);
            return;
          }

          if (selfBlock) {
            // We already know this block after all
            callback(null);
            return;
          }

          if (parent) {
            block.attachTo(parent);

            // Block connects to a side chain
            bw.mode = "side";
            bw.parent = parent;

            callback(null);
          } else {
            // No, this block connects nowhere, add as an orphan
            logger.bchdbg('Connecting block '+
                          Util.formatHash(bw.block.hash)+' '+
                          '(parent '+Util.formatHashAlt(bw.block.prev_hash)+
                          ' unknown)');
            connectingBlockIndex.addHead(bw);

            // Block is the head of a new orphan chain
            bw.mode = "orphan";
            callback("orphan");
          }
        });
      });
    }
  };

  var connectToMainChain = this.connectToMainChain =
  function connectToMainChain(bw, callback)
  {
    // This block is no longer being connected
    connectingBlockIndex.remove(bw);
    recentBlockIndex.set(bw.hash64, bw.block);

    logger.bchdbg('Adding block '+Util.formatHash(bw.block.hash));
    currentTopBlock = bw.block;
    bw.block.active = true;

    callback(null);
  };

  var connectToSideChain = this.connectToSideChain =
  function connectToSideChain(bw, parent, callback)
  {
    // This block is no longer being connected
    connectingBlockIndex.remove(bw);
    recentBlockIndex.set(bw.hash64, bw.block);

    logger.info('Adding block '+Util.formatHash(bw.block.hash)+
                ' on side chain');

    // Switch chains if side chain has more work.
    bw.block.active = false;

    callback(null);
  };

  /**
   * Verifies transactions and saves the block.
   */
  var verifyBlock = this.verifyBlock = function verifyBlock(bw, callback)
  {
    var localTx = new TransactionMap();
    bw.txs.forEach(function (tx) {
      localTx.add(tx);
    });
    // Connect transactions
    Step(
      function cacheTxInputs() {
        var parallel = this.parallel;
        bw.txs.forEach(function (tx) {
          var callback = parallel();
          tx.cacheInputs(self, localTx, true, function (err, txCache) {
            if (err) {
              logger.warn('Unable to verify transaction '+
                          Util.formatHash(tx.hash)+': '+
                          (err.stack ? err.stack : ""+err));
              callback(new Error("Transaction verification failed"));
              return;
            }

            tx.getAffectedKeys(txCache);

            callback(err, txCache);
          });
        });
      },
      callback
    );
  };

  /**
   * Saves a block straight to the database.
   *
   * This assumes the block has already been processed (connected to a
   * parent, etc.). To add a new block to the chain with all the
   * necessary verification, use add().
   */
  var saveBlock = this.saveBlock = function saveBlock(bw, callback)
  {
    self.emit('blockAdd', {block: bw.block, txs: bw.txs, chain: self});

    var dbObj = bw.block.toObject();
    Block.collection.insert(dbObj, {safe: true}, function (err) {
      // Ignore duplicate key errors
      if (err && err.message.indexOf("E11000") == -1) {
        if ("function" === typeof callback) {
          callback(err);
        }
        return ;
      }

      // This event will also trigger us saving all child blocks that
      // are currently waiting.
      self.emit('blockSave', {block: bw.block, txs: bw.txs, chain: self});

      logger.bchdbg('Block added successfully ' + bw.block);

      if ("function" === typeof callback) {
        callback(null, bw);
      }
    });
  };

  var saveTransactions = this.saveTransactions =
  function addTransactions(block, txs, callback) {
    var dbTxs = [];
    txs.forEach(function (tx, i) {
      var e = {block: block, index: i, tx: tx, chain: self};
      self.emit('txAdd', e);
      self.emit('txAdd:'+tx.hash.toString('base64'), e);

      dbTxs.push(tx.toObject());
      recentTxIndex.set(tx.hash.toString('base64'), tx);

      // Create separate events for each address affected by this tx
      if (self.cfg.feature.liveAccounting) {
        tx.affects.forEach(function (hash) {
          var hash64 = hash.toString('base64');
          self.emit('txAdd:'+hash64, e);
        });
      }
    });
    Transaction.collection.insertAll(
      dbTxs,
      {keepGoing: true, safe: true},
      function (err) {
        if (err) {
          if (err.message.indexOf("E11000") != -1) {
            // A transaction we tried to insert already exists. There are
            // several of these in the block chain, e.g.:
            // http://blockexplorer.com/b/91842
            // http://blockexplorer.com/b/91880
            //
            // In MongoDB 1.9.1 there is a flag telling bulk inserts to keep
            // going, but we want to support older MongoDB versions as well, so
            // we need a workaround.
            //
            // The workaround is to just fall back to inserting each transaction
            // individually. Here we go.
            Step(
              function insertIndividual() {
                var parallel = this.parallel;
                dbTxs.forEach(function (tx) {
                  var callback = parallel();
                  Transaction.collection.insert(tx, {safe: true}, function (err) {
                    // Only pass on errors other than duplicate key
                    if (err && err.message.indexOf("E11000") == -1) {
                      callback(err);
                    } else callback();
                  });
                });
              },
              // After all the parallel insertions have finished, we go back to
              // the normal callback that would have been run normally. This won't
              // cause an endless loop, because we ignored the duplicate key
              // error.
              arguments.callee
            );
            return;
          } else {
            callback(err);
            return;
          }
        }

        txs.forEach(function (tx, i) {
          var e = {block: block, index: i, tx: tx, chain: self};
          self.emit('txSave', e);
          self.emit('txSave:'+tx.hash.toString('base64'), e);
        });

        callback(null);
      }
    );
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

        self.getBlockByHash(bOld.prev_hash, function (err, bOldParent) {
          if (err) {
            callback(err);
            return;
          }
          if (!bOldParent) {
            logger.error("Active branch was disconnected, cannot find "+
                         Util.formatHash(bOld.prev_hash));
            callback(new Error("Disconnected fork (old branch)"));
            return;
          }
          self.findFork(bOldParent, bNew, toDisconnect, toConnect, callback);
        });
      } else {
        if (bNew.height <= 0) {
          callback(new Error("No common root found"));
        }
        toConnect.push(bNew);

        Block.findOne({_id: bNew.prev_hash}, function (err, bNewParent) {
          if (err) {
            callback(err);
            return;
          }
          if (!bNewParent) {
            logger.error("New branch was disconnected, cannot find "+
                         Util.formatHash(bNew.prev_hash));
            callback(new Error("Disconnected fork (new branch)"));
            return;
          }
          self.findFork(bOld, bNewParent, toDisconnect, toConnect, callback);
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
    isProcessing = true;

    // Follow the chains down to the fork
    this.findFork(oldTopBlock, newTopBlock, function (err, toDisconnect, toConnect) {
      if (err) {
        isProcessing = false;
        logger.error('Unable to reorganize: '+err);
        return;
      }

      logger.bchdbg('Found common root at '+Util.formatHash(toConnect[0].prev_hash));

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

                var e = {
                  block: block,
                  index: i,
                  tx: tx,
                  chain: self
                };

                self.emit('txRevoke', e);

                // Create separate events for each address affected by this tx
                if (self.cfg.feature.liveAccounting) {
                  tx.affects.forEach(function (hash) {
                    var hash64 = hash.toString('base64');
                    self.emit('txRevoke:'+hash64, e);
                  });
                }
              };
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

              // Upsert (insert/update) block
              var dbObj = block.toObject();
              Block.collection.update(
                {_id: dbObj._id},
                dbObj,
                {upsert: true},
                this
              );
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

                var e = {
                  block: block,
                  index: i,
                  tx: tx,
                  chain: self
                };

                self.emit('txAdd', e);
                self.emit('txSave', e);

                // Create separate events for each address affected by this tx
                if (self.cfg.feature.liveAccounting) {
                  tx.affects.forEach(function (hash) {
                    var hash64 = hash.toString('base64');
                    self.emit('txAdd:'+hash64, e);
                  });
                }

                callback();
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

              // Upsert (insert/update) block
              var dbObj = block.toObject();
              Block.collection.update(
                {_id: dbObj._id},
                dbObj,
                {upsert: true},
                this
              );
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
        isProcessing = false;
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

  this.hash64 = block.hash.toString('base64');
  this.parent64 = block.prev_hash.toString('base64');
};

BlockWrapper.prototype.addCallback = function addCallback(callback) {
  if ("function" !== typeof callback) {
    throw new Error("BlockWrapper.addCallback(): Callback is not a function");
  }
  this.callbacks.push(callback);
};

BlockWrapper.prototype.callback = function callback(err)
{
  var args = Array.prototype.slice.apply(arguments);

  // Empty the callback array first (because downstream functions could add new
  // callbacks or otherwise interfere if were not in a consistent state.)
  var cbs = this.callbacks;
  this.callbacks = [];

  cbs.forEach(function runCallbacks(cb) {
    cb.apply(null, args);
  });
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

ConnectingBlockIndex.prototype.add = function add(bw) {
  this.list.push(bw);
  this.index[bw.hash64] = bw;

  // TODO: If there are more than n connecting blocks, drop the oldest
  //       orphan chain.
};

ConnectingBlockIndex.prototype.remove = function remove(bw) {
  this.list.splice(this.list.indexOf(bw));
  delete this.index[bw.hash64];
};

ConnectingBlockIndex.prototype.getLength = function getLength() {
  return this.list.length;
};

ConnectingBlockIndex.prototype.getByHash = function getByHash(hash64) {
  return this.index[hash64];
};

ConnectingBlockIndex.prototype.getByParent = function getByParent(parent64) {
  var list = this.parentIndex[parent64];
  if (Array.isArray(list)) {
    // If its an array we need to return a copy
    return list.slice();
  } else {
    return list;
  }
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

RecentBlockIndex.prototype.set = function set(key, value) {
  this.list.push(key);
  this.index[key] = value;

  this.clean();
};

RecentBlockIndex.prototype.get = function get(hash64) {
  return this.index[hash64];
};

RecentBlockIndex.prototype.clean = function clean() {
  while (this.list.length > this.maxEntries) {
    var dropped = this.list.shift();
    delete this.index[dropped];
  }
};

var RecentTxIndex = exports.RecentTxIndex =
function RecentTxIndex(maxEntries) {
  this.maxEntries = maxEntries;

  this.list = [];
  this.index = {};
};

RecentTxIndex.prototype.set = function set(key, value) {
  this.list.push(key);
  this.index[key] = value;

  this.clean();
};

RecentTxIndex.prototype.get = function get(key) {
  return this.index[key];
};

RecentTxIndex.prototype.clean = function clean() {
  while (this.list.length > this.maxEntries) {
    var dropped = this.list.shift();
    delete this.index[dropped];
  }
};
