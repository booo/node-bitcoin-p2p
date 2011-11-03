var logger = require('../../logger');
var mongoose = require('mongoose'); // database
var Step = require('step');

// TODO: Once the transition to database-agnostic schemas is complete, we should
//       be able to remove the reference to schema/index here.
require('../../schema/index');
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

  this.genericErrorHandler = function (err) {
    if (err) {
      logger.warn("Error while marking transaction as spent", err);
    }
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
};
