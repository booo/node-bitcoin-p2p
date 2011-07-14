var sys = require('sys');
var logger = require('./logger');
var Util = require('./util');

var Binary = require('mongoose').Types.Buffer.Binary;

var Accounting = exports.Accounting = function (storage, blockChain) {
  events.EventEmitter.call(this);

  this.storage = storage;

  var self = this;

  var Block = this.storage.Block;
  var Transaction = this.storage.Transaction;
  var Account = this.storage.Account;

  var addTxSynchro = Util.createSynchrotron(function (next, pubKey, tx, height, index) {
    Account.collection.update(
      // Find the account index for this public key
      { pubKeyHash: new Binary(pubKey) },
      // Atomically push this transaction
      { $addToSet : { "txs" : {
        tx: new Binary(tx.getHash()),
        height: height,
        n: index
      } } },
      // Insert if not exists
      { upsert : true },
      // Callback
      function (err) {
        if (err) {
          logger.error("Error while registering tx for " +
                       "pub key " + Util.formatBuffer(pubKey) +
                       ": " + err);
        }

        next();
      }
    );
  });

  this.handleAdd = function (e) {
    var affectedAccounts = e.tx.getAffectedAccounts();

    for (var i in affectedAccounts) {
      if (affectedAccounts.hasOwnProperty(i)) {
        addTxSynchro(i, affectedAccounts[i], e.tx, e.block.height, e.index);

        // Notify anybody listening to this pubkey
        this.emit('txAdd:'+i, e);
      }
    }
  };

  this.handleRevoke = function (e) {
    var affectedAccounts = e.tx.getAffectedAccounts();

    for (var i in affectedAccounts) {
      if (affectedAccounts.hasOwnProperty(i)) {
        // TODO: Remove tx from accounting index

        // Notify anybody listening to this pubkey
        this.emit('txRevoke:'+i, e);
      }
    }
  };

  blockChain.addListener('txAdd', this.handleAdd.bind(this));
  blockChain.addListener('txRevoke', this.handleRevoke.bind(this));
};

sys.inherits(Accounting, events.EventEmitter);
