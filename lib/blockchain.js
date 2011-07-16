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
  var orphanBlockFutures = {};
  var queueCount = 0;

  function createGenesisBlock(callback) {
    logger.info("Loading genesis block");

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

      var genesisTransaction = new Transaction(self.cfg.network.genesisBlockTx);

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

  this.getBlockByHash = function getBlockByHash(hash, callback) {
    Block.findOne({_id: hash}, callback);
  };

  this.getBlockByHeight = function getBlockByHeight(height, callback) {
    Block.findOne({height: height, active: true}, callback);
  };

  this.getBlockByPrev = function getBlockByPrev(block, callback) {
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

  this.getGenesisBlock = function getGenesisBlock() {
    return genesisBlock;
  };

  this.getTopBlock = function getTopBlock() {
    return currentTopBlock;
  };

  this.getBlockLocator = function getBlockLocator(callback) {
    BlockLocator.createFromBlockChain(this, callback);
  };

  /**
   * Get the last block we received.
   *
   * Very untrusted! This is only meant for continuously requesting
   * blocks during a block chain download. Otherwise always use
   * getTopBlock().
   */
  this.getLastRecvBlock = function getLastRecvBlock () {
    return lastRecvBlock;
  };

  this.getTransactionByHash = function (hash, callback) {
    Transaction.findOne({_id: hash}, callback);
  };

  this.getQueueCount = function () {
    return queueCount;
  };

  this.add = function add(block, txs, callback) {
    var self = this;

    if (!block instanceof Block) {
      block = this.makeBlockObject(block);
    }

    function connectBlockToParentAndSave(parent) {
      // Our parent block is there, let's attach ourselves
      block.height = parent.height + 1;
      block.setChainWork(parent.getChainWork().add(block.getWork()));

      // Update top block field if this block is a child of it
      if (currentTopBlock.hash.compare(parent.hash) === 0) {
        logger.bchdbg('Adding block '+Util.formatHash(block.hash));
        currentTopBlock = block;
        block.active = true;
      } else {
        // Block belongs to a side chain, switch chains if side
        // chain has more work.
        block.active = false;
        if (block.moreWorkThan(currentTopBlock)) {
          // Start the reorg
          self.reorganize(currentTopBlock, block, function (err) {
            currentTopBlock = block;

            callback(err, block);
          });
          queueCount--;
          return;
        } else {
          logger.info('Adding block '+Util.formatHash(block.hash)+
                ' on side chain');
        }
      }

      self.emit('blockAdd', {block: block, txs: txs, chain: self});

      block.save(function (err) {
        queueCount--;

        if (err) {
          // TODO: Handle if block is a duplicate
          return callback(err);
        }

        // Asynchronously store all of this block's transactions to the database
        self.addTransactions(block, txs);

        // This event will also trigger us saving all child blocks that
        // are currently waiting.
        self.emit('blockSave', {block: block, txs: txs, chain: self});

        callback(err, block);
      });
    }

    // Static checks
    try {
      block.checkBlock();
    } catch (e) {
      if (e.stack) {
        logger.error(e.stack);
      }
      callback('Check failed: ' + e, null);
    }

    lastRecvBlock = block;

    queueCount++;

    this.getBlockByHash(block.prev_hash, function (err, prevBlock) {
      // Let's see if we are able to connect into the chain
      if (!err && prevBlock && prevBlock.height >= 0) {
        // Our parent is in the chain, connect up and save
        connectBlockToParentAndSave(prevBlock);
      } else {
        // Our parent is not in the chain, create a future to be
        // executed when it is.
        var future = connectBlockToParentAndSave;
        if (!orphanBlockFutures[block.prev_hash]) {
          orphanBlockFutures[block.prev_hash] = {};
        }
        if (!orphanBlockFutures[block.prev_hash][block.hash]) {
          orphanBlockFutures[block.prev_hash][block.hash] = future;
        } else {
          // This block is already queued
          queueCount--;
        }
      }
    });
  };

  this.addTransactions = function addTransactions(block, txs) {
    var dbTxs = [];
    txs.forEach(function (tx, i) {
      if (!(tx instanceof Transaction)) {
        tx = new Transaction(tx);
      }

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

    // Follow the chains down to the fork
    this.findFork(oldTopBlock, newTopBlock, function (err, toDisconnect, toConnect) {
      if (err) {
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

        // TODO: Unpause queue
      });

      Step.apply(null, reorgSteps);
    });
  };

  this.makeBlockObject = function (blockData) {
    return new Block(blockData);
  };

  this.executeOrphanBlockFutures = function (block) {
    var futures = orphanBlockFutures[block.hash];
    if (futures) {
      for (var i in futures) {
        if(futures.hasOwnProperty(i)) {
          futures[i](block);
        }
      }
      delete orphanBlockFutures[block.hash];
    }
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

  // We can execute block futures as early as the blockAdd, but we have to
  // make sure we catch futures that are added later as well, by listening to
  // blockSave.
  function handleBlockEvent(e) {
    self.executeOrphanBlockFutures(e.block);
  }
  this.on('blockAdd', handleBlockEvent);
  this.on('blockSave', handleBlockEvent);
};

sys.inherits(BlockChain, events.EventEmitter);
