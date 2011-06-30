var logger = require('./logger');
var mongoose = require('../vendor/mongoose/lib/mongoose/index'); // database
var Step = require('step');
require('./schema/index');

var Storage = exports.Storage = function (uri) {
	this.connection = mongoose.createConnection(uri, function (err) {
		if (err) {
			logger.error('Could not connect to database: ' +
						 (err.stack ? err.stack : err.toString()));
		}
	});

	var Block = this.Block = this.connection.model('Block');
	var Transaction = this.Transaction = this.connection.model('Transaction');
	var Account = this.Account = this.connection.model('Account');

	this.genericErrorHandler = function (err) {
		if (err) {
			logger.warn("Error while marking transaction as spent", err);
		}
	};

	this.knowsBlock = function (hash, callback) {
		if (hash instanceof Buffer) {
			hash = hash.toString('binary');
		} else if (typeof hash !== "string") {
			callback('Invalid value for hash');
			return;
		}

		Block.find({'hash': hash}).count(function (err, count) {
			callback(err, !!count);
		});
	};

	this.knowsTransaction = function (hash, callback) {
		if (hash instanceof Buffer) {
			hash = hash.toString('binary');
		} else if (typeof hash !== "string") {
			callback('Invalid value for hash');
			return;
		}

		Transaction.find({'hash': hash}).count(function (err, count) {
			callback(err, !!count);
		});
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
			function dropAccounts(err) {
				if (err) throw err;

				Account.remove(this);
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
		this.connection.db.dropDatabase(callback);
	};
};
