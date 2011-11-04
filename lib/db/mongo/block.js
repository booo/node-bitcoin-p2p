var mongoose = require('mongoose'); // database

var Block = require('../../schema/block').Block;

var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var BlockSchema = new Schema({
  _id: { type: Buffer, unique: true },
  prev_hash: { type: Buffer, index: true },
  merkle_root: Buffer,
  timestamp: Number,
  bits: Number,
  nonce: Number,
  version: Number,
  height: { type: Number, index: true, default: -1 },
  size: Number,
  active: Boolean, // Whether block is part of the best known chain
  chainWork: Buffer, // Amount of work in the chain up to this block
  txs: { type: [Buffer], index: true }
});

BlockSchema.virtual('hash')
  .get(function () {
    return this._id;
  })
  .set(function (value) {
    this.set("_id", value);
  })
;

// Import methods to schema
Object.keys(Block.prototype).forEach(function (method) {
  BlockSchema.method(method, Block.prototype[method]);
});

mongoose.model('Block', BlockSchema);
