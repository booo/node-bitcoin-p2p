var logger = require('../../logger');
var mongoose = require('mongoose'); // database
var Step = require('step');

// TODO: Once the transition to database-agnostic schemas is complete, we should
//       be able to remove the reference to schema/index here.
require('./index');

var MongoStorage = exports.MongoStorage = exports.Storage =
function MongoStorage(uri) {
  this.connection = mongoose.createConnection(uri, function (err) {
    if (err) {
      logger.error('Could not connect to database: ' +
                   (err.stack ? err.stack : err.toString()));
    }
  });

  var Block = this.Block = this.connection.model('Block');
  var Transaction = this.Transaction = this.connection.model('Transaction');

  this.connect = function (callback) {
    // We could use this to wait for a connection, but since we are able to
    // queue queries anyway, we might as well connect asynchronously and let
    // the software do something in the meantime.
    callback(null);
  };

  this.emptyDatabase = function (callback) {
    logger.info('Resetting database');
    Step(
      function dropBlocks() {
        Block.remove(this);
      },
      function dropTransactions(err) {
        if (err) throw err;

        Transaction.remove(this);
      },
      function finish(err) {
        if ("function" === typeof callback) {
          callback(err);
        }
      }
    );
  };

  this.dropDatabase = function (callback) {
    logger.info('Deleting database');

    var conn = this.connection;
    conn.on('open', function () {
      conn.db.dropDatabase(callback);
    });
  };

  this.saveBlock = function (block, callback) {
    block = new Block(block);
    Block.collection.insert(block.toObject(), {safe: true}, function (err) {
      try {
        // If the block exists already, we want to overwrite it.
        //
        // We could have done an upsert to begin with, but it would
        // have been slower.
        if (err && err.message.indexOf("E11000") !== -1) {
          Block.collection.update(
            {_id: block._id}, block, {upsert: true}, function (err) {
              try {
                callback(err);
              } catch (err) {
                logger.error('Storage: Uncaught callback error: ' +
                             (err.stack ? err.stack : err.toString()));
              }
            });
        } else if (err) {
          if ("function" === typeof callback) {
            callback(err);
          }
          return;
        } else {
          // Success
          callback(null);
        }
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  this.saveTransaction = function (tx, callback) {
    // TODO: Overwrite-if-exists
    tx = new Transaction(tx);
    tx.save(function (err) {
      try {
        // It's faster to just ignore the duplicate key error than to
        // check beforehand
        if (err && err.message.indexOf("E11000") == -1) {
          logger.error(err);
          callback(err);
          return;
        }

        callback(null);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  this.saveTransactions = function (txs, callback) {
    // TODO: Overwrite-if-exists
    Transaction.collection.insertAll(
      txs,
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
                txs.forEach(function (tx) {
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

        callback(null);
      }
    );
  };

  var getTransactionByHash = this.getTransactionByHash =
  function getTransactionByHash(hash, callback) {
    Transaction.findOne({_id: hash}, function (err, result) {
      try {
        callback(err, result);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  this.getTransactionsByHashes = function (hashes, callback) {
    Transaction.find({_id: {$in: hashes}}, function (err, result) {
      try {
        callback(err, result);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  this.getOutputsByHashes = function (hashes, callback) {
    Transaction.find({_id: {$in: hashes}}, ["_id", "outs"], function (err, result) {
      try {
        callback(err, result);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  this.getBlocksByHeights = function (heights, callback) {
    Block.find({height: {$in: heights}}, function (err, result) {
      try {
        callback(err, result);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  var getBlockByHash = this.getBlockByHash =
  function getBlockByHash(hash, callback) {
    Block.findOne({_id: hash}, function (err, result) {
      try {
        callback(err, result);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  var getBlockByHeight = this.getBlockByHeight =
  function getBlockByHeight(height, callback) {
    Block.findOne({height: height, active: true}, function (err, result) {
      try {
        callback(err, result);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  var getBlockByPrev = this.getBlockByPrev =
  function getBlockByPrev(block, callback) {
    if ("object" == typeof block && block.hash) {
      block = block.hash;
    }

    Block.findOne({prev_hash: block}, function (err, block) {
      try {
        if (err) {
          callback(err);
          return;
        }

        callback(err, block);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  var getTopBlock = this.getTopBlock =
  function getTopBlock(callback) {
    Block
      .find({active: true})
      .sort('height', -1)
      .limit(1)
      .exec(callback);
  };

  /**
   * Find the latest matching block from a locator.
   *
   * A locator is basically just a list of hashes. We send it to the database
   * and ask it to get the latest block that is in the list.
   */
  var getBlockByLocator = this.getBlockByLocator =
  function (locator, callback)
  {
    Block
      .find({_id: {"$in": locator}, active: 1})
      .sort('height', -1)
      .limit(1)
      .exec(function (err, result) {
        try {
          if (err) {
            callback(err);
            return;
          }

          if (result.length) {
            callback(null, result[0]);
          } else {
            callback(null, null);
          }
        } catch (err) {
          logger.error('Storage: Uncaught callback error: ' +
                       (err.stack ? err.stack : err.toString()));
        }
      })
    ;
  };

  var countConflictingTransactions = this.countConflictingTransactions =
  function countConflictingTransactions(srcOutCondList, callback) {
    Transaction.find({"$or": srcOutCondList}).count(function (err, result) {
      try {
        callback(err, result);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  var getConflictingTransactions = this.getConflictingTransactions =
  function getConflictingTransactions(srcOutCondList, callback) {
    Transaction.find({"$or": srcOutCondList}, function (err, result) {
      try {
        callback(err, result);
      } catch (err) {
        logger.error('Storage: Uncaught callback error: ' +
                     (err.stack ? err.stack : err.toString()));
      }
    });
  };

  var knowsBlock = this.knowsBlock =
  function knowsBlock(hash, callback) {
    Block.find({'_id': hash}).count(function (err, count) {
      callback(err, !!count);
    });
  };

  var knowsTransaction = this.knowsTransaction =
  function knowsTransction(hash, callback) {
    Transaction.find({'_id': hash}).count(function (err, count) {
      callback(err, !!count);
    });
  };
};
