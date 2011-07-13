/**
 * This RPC module provides utility function allowing proxy access to Bitcoin.
 *
 * Some apps would like to send/receive (raw) messages on the Bitcoin network
 * without implementing a full node themselves. This module contains some
 * miscellaneous functions that fall under this category.
 */

var Util = require('../util');
var Connection = require('../connection').Connection;

/**
 * Broadcast a signed transaction on the Bitcoin network.
 *
 * This allows an RPC client that has generated a transaction to publish it
 * without having to connect to the P2P network itself.
 *
 * Example Request:
 *
 * { tx: "..." }
 *
 * The actual transaction is a hex-encoded version of the binary format
 * specified by the Bitcoin protocol documentation:
 * https://en.bitcoin.it/wiki/Protocol_specification#tx
 *
 * Example Response:
 *
 * true
 */
exports.broadcasttx = function broadcasttx(args, opt, callback) {
  var txBuf = Util.decodeHex(args.tx.toString());
	var message = bitcoin.Connection.parseMessage("tx", txBuf);
	delete message.command;
	var Transaction = this.node.getStorage().Transaction;
	var tx = new Transaction(message);
	this.node.sendTx(tx, function (err) {
		if (err) {
			callback(err);
			return;
		}
		callback(null, true);
	});
};


/**
 * Retrieve a transaction as hex.
 *
 * Example Request:
 *
 * "..hash.."
 *
 * Submit the hash as a hex encoded string.
 *
 * Example Response:
 *
 * "..."
 *
 * The return value is the serialized transaction in the tx format as specified
 * on the wiki https://en.bitcoin.it/wiki/Protocol_specification#tx or false if
 * the transaction was not found.
 */
exports.gettransactionraw = function gettransactionraw(args, opt, callback) {
  var hash = Util.decodeHex(args[0]).reverse();
  this.node.txStore.get(hash, function (err, tx) {
    if (err) {
      callback(err);
      return;
    }

    if (tx) {
      callback(null, Util.encodeHex(tx.serialize()));
    } else {
      this.node.blockChain.getTransactionByHash(hash, function (err, tx) {
        if (err) {
          callback(err);
          return;
        }

        if (tx) {
          callback(null, Util.encodeHex(tx.serialize()));
        } else {
          callback(null, false);
        }
      }.bind(this));
    }
  }.bind(this));
};
