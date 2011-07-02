var Step = require('step');
var logger = require('./logger');

/**
 * Sends and resends transactions.
 *
 * This class contains all the functionality necessary to make sure our
 * own transactions make it into a block.
 */
var TransactionSender = exports.TransactionSender = function (node) {
  this.node = node;
  this.enabled = false;
  this.timer = null;

  this.ownTx = {};
  this.lastResend = 0;
  this.newBlock = false;

  // Resend tx every 30 minutes
  this.interval = 10000;
};

TransactionSender.prototype.add = function (hash) {
  this.ownTx[hash] = true;
};

TransactionSender.prototype.remove = function (hash) {
  delete this.ownTx[hash];
};

TransactionSender.prototype.enable = function ()
{
  this.enabled = true;

  if (!this.timer) {
    this.resend();
  }
};

TransactionSender.prototype.disable = function ()
{
  this.enabled = false;
};

TransactionSender.prototype.resend = function () {
  var self = this;

  var node = this.node;
  var txStore = node.getTxStore();

  if (!this.enabled) {
    return;
  }

  if (this.newBlock) {
    var txToRebroadcast = [];
    Step(
      function getTxs() {
        var group = this.group();

        for (var i in self.ownTx) {
          if (self.ownTx.hasOwnProperty(i)) {
            txStore.get(i, group());
          }
        }
      },
      function doBroadcast(err, txs) {
        if (err) {
          logger.error("Error while rebroadcasting:\n" +
                       (e.stack ? e.stack : e.toString()));
          return;
        }
        txs = txs.filter(function (val) { return !!val; });
        if (txToRebroadcast.length) {
          logger.info('Rebroadcasting ' +
                      txToRebroadcast.length +
                      ' transactions');
          node.sendInv(txToRebroadcast);
        }
      }
    );
  }

  this.newBlock = false;

  this.timer = setTimeout(this.resend.bind(this), this.interval);
};

TransactionSender.prototype.handleBlock = function () {
  this.newBlock = true;
};
