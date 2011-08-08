var assert = require('assert');
var sys = require('sys');
var logger = require('./logger');
var Util = require('./util');
var error = require('./error');

var TransactionMap = exports.TransactionMap = function () {
  events.EventEmitter.call(this);

  this.txIndex = {};
};

sys.inherits(TransactionMap, events.EventEmitter);

/**
 * Add transaction to this map.
 *
 * @return Boolean Whether the transaction was new.
 */
TransactionMap.prototype.add = function (tx) {
  var hash = tx.hash.toString('binary');
  var isNew = !this.txIndex[hash];
  this.txIndex[hash] = tx;
  return isNew;
};

TransactionMap.prototype.get = function (hash, callback) {
  if ("string" === typeof hash) {
    hash = new Buffer(hash, 'base64').toString('binary');
  } else if (Buffer.isBuffer(hash)) {
    hash = hash.toString('binary');
  }

  assert.equal(typeof hash, 'string');

  var returnValue;

  if (this.txIndex[hash]) {
    returnValue = this.txIndex[hash];
  } else {
    returnValue = null;
  }

  if ("function" == typeof callback) {
    callback(null, returnValue);
  }

  return returnValue;
};

TransactionMap.prototype.getAll = function getAll() {
  var self = this;
  return Object.keys(this.txIndex).map(function (key) {
    return self.txIndex[key];
  });
};

TransactionMap.prototype.remove = function (hash) {
  if ("string" === typeof hash) {
    hash = new Buffer(hash, 'base64').toString('binary');
  } else if (Buffer.isBuffer(hash)) {
    hash = hash.toString('binary');
  }

  assert.equal(typeof hash, 'string');

  delete this.txIndex[hash];
};

TransactionMap.prototype.isKnown = function (hash) {
  if ("string" === typeof hash) {
    hash = new Buffer(hash, 'base64').toString('binary');
  } else if (Buffer.isBuffer(hash)) {
    hash = hash.toString('binary');
  }

  assert.equal(typeof hash, 'string');

  return !!this.txIndex[hash];
};

TransactionMap.prototype.find = function (hashes, callback) {
  var self = this;
  var callbacks = hashes.length;
  var disable = false;

  if (!hashes.length) {
    callback(null, []);
  }

  var result = [];
  hashes.forEach(function (hash) {
    self.get(hash, function (err, tx) {
      if (disable) {
        return;
      }

      if (err) {
        callback(err);
        disable = true;
      }

      callbacks--;

      if (tx) {
        result.push(tx);
      }

      if (callbacks === 0) {
        callback(null, result);
      }
    });
  });
};

TransactionMap.prototype.getCount = function () {
  return Object.keys(this.txIndex).length;
};
