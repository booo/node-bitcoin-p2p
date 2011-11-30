require('buffertools');

// Load version from package.json
require('pkginfo')(module, 'version');

exports.Settings = require('./settings').Settings;
exports.Connection = require('./connection').Connection;
exports.Node = require('./node').Node;
exports.Script = require('./script').Script;
exports.Util = require('./util');

// For the time being MongoDB is our default storage module.
//
// However, you are strongly advised to use node.getStorage() to get an instance
// of the actual storage object in use. This convenience link WILL be removed in
// a future version.
exports.Storage = require('./db/mongo/storage').Storage;

// Multiple instances of bigint are incompatible (instanceof doesn't work etc.),
// so we export our instance so libraries downstream can use the same one.
exports.bignum = exports.bigint = require('bignum');


