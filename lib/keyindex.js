var sys = require('sys');
var logger = require('./logger');
var Util = require('./util');

var Binary = require('mongoose').Types.Buffer.Binary;

var KeyIndex = exports.KeyIndex = function (storage, blockChain) {
  events.EventEmitter.call(this);

  this.storage = storage;

  var self = this;

  var Block = this.storage.Block;
  var Transaction = this.storage.Transaction;
  var PubKeyHash = this.storage.PubKeyHash;

  var addTxSynchro = Util.createSynchrotron(function (next, pubKey, tx, height, index) {
    PubKeyHash.collection.update(
      // Find the index for this public key
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
    var affectedKeys = e.tx.getAffectedKeys();

    for (var i in affectedKeys) {
      if (affectedKeys.hasOwnProperty(i)) {
        addTxSynchro(i, affectedKeys[i], e.tx, e.block.height, e.index);

        // Notify anybody listening to this pubkey
        this.emit('txAdd:'+i, e);
      }
    }
  };

  this.handleRevoke = function (e) {
    var affectedKeys = e.tx.getAffectedKeys();

    for (var i in affectedKeys) {
      if (affectedKeys.hasOwnProperty(i)) {
        // TODO: Remove tx from pubkey hash index

        // Notify anybody listening to this pubkey
        this.emit('txRevoke:'+i, e);
      }
    }
  };

  blockChain.addListener('txAdd', this.handleAdd.bind(this));
  blockChain.addListener('txRevoke', this.handleRevoke.bind(this));
};

sys.inherits(KeyIndex, events.EventEmitter);
