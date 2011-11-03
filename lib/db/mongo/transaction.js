var mongoose = require('mongoose'); // database
var Util = require('../../util');

var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var Transaction = require('../../schema/transaction').Transaction;
var TransactionIn = require('../../schema/transaction').TransactionIn;
var TransactionOut = require('../../schema/transaction').TransactionOut;

var TransactionInSchema = new Schema({
  s: Buffer, // scriptSig
  q: Number, // sequence
  o: Buffer  // outpoint
});

TransactionInSchema
  .virtual('script').get(function () {
    return this.s;
  }).set(function (s) {
    this.s = s;
  });

TransactionInSchema
  .virtual('sequence').get(function () {
    return this.q;
  }).set(function (q) {
    this.q = q;
  });

TransactionInSchema
  .virtual('outpoint').get(function () {
    if (this.o) {
      return {
        hash: this.o.slice(0, 32),
        index: this.getOutpointIndex()
      };
    } else {
      return {
        hash: Util.NULL_HASH.slice(0),
        index: 0xffffffff
      };
    }
  }).set(function (o) {
    var outpoint = new Buffer(36);
    o.hash.copy(outpoint);
    outpoint[32] = o.hash.index       & 0xff;
    outpoint[33] = o.hash.index >>  8 & 0xff;
    outpoint[34] = o.hash.index >> 16 & 0xff;
    outpoint[35] = o.hash.index >> 24 & 0xff;
    this.o = outpoint;
  });

// Import methods to schema
Object.keys(TransactionIn.prototype).forEach(function (method) {
  TransactionInSchema.method(method, TransactionIn.prototype[method]);
});

var TransactionOutSchema = new Schema({
  v: Buffer, // value
  s: Buffer  // scriptPubKey
});

TransactionOutSchema
  .virtual('value').get(function () {
    return this.v;
  }).set(function (v) {
    this.v = v;
  });

TransactionOutSchema
  .virtual('script').get(function () {
    return this.s;
  }).set(function (s) {
    this.s = s;
  });

// Import methods to schema
Object.keys(TransactionOut.prototype).forEach(function (method) {
  TransactionOutSchema.method(method, TransactionOut.prototype[method]);
});

var TransactionSchema = new Schema({
  _id: { type: Buffer, unique: true },
  version: String,
  lock_time: String,
  ins: [TransactionInSchema],
  outs: [TransactionOutSchema],
  affects: { type: [Buffer], index: true }  // Affected accounts
});

TransactionSchema.virtual('hash')
  .get(function () {
    return this._id;
  })
  .set(function (value) {
    this.set("_id", value);
  })
;

// This index allows us to quickly find out whether an out is spent
TransactionSchema.index({ "ins.o": 1 });

// Import methods to schema
Object.keys(Transaction.prototype).forEach(function (method) {
  if (method === "toObject") {
    return;
  }
  TransactionSchema.method(method, Transaction.prototype[method]);
});

mongoose.model('Transaction', TransactionSchema);
