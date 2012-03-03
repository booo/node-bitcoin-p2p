require('buffertools');

// Load version from package.json
require('pkginfo')(module, 'version');

exports.logger = require('./logger');

exports.Settings = require('./settings').Settings;
exports.Connection = require('./connection').Connection;
exports.Node = require('./node').Node;
exports.Script = require('./script').Script;
exports.Util = require('./util');

var txSchema = require('./schema/transaction');
exports.schema = {
  Transaction: txSchema.Transaction,
  TransactionIn: txSchema.TransactionIn,
  TransactionOut: txSchema.TransactionOut,
  Block: require('./schema/block').Block
};

// For the time being MongoDB is our default storage module.
//
// However, you are strongly advised to use node.getStorage() to get an instance
// of the actual storage object in use. This convenience link WILL be removed in
// a future version.
exports.Storage = require('./db/mongo/storage').Storage;

// Multiple instances of bigint are incompatible (instanceof doesn't work etc.),
// so we export our instance so libraries downstream can use the same one.
exports.bignum = exports.bigint = require('bignum');


