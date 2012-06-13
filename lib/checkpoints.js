var Util = require('./util');

/**
 * These are the checkpoints for the main blockchain.
 */
var checkpoints = module.exports = {};

var l = checkpoints.livenet = [];
var t = checkpoints.testnet = [];

function cp(list, height, hash) {
  list.push({ height: height, hash: Util.decodeHex(hash) });
}

// Livenet checkpoints
cp(l,  11111, '0000000069e244f73d78e8fd29ba2fd2ed618bd6fa2ee92559f542fdb26e7c1d');
cp(l,  33333, '000000002dd5588a74784eaa7ab0507a18ad16a236e7b1ce69f00d7ddfb5d0a6');
cp(l,  68555, '00000000001e1b4903550a0b96e9a9405c8a95f387162e4944e8d9fbe501cd6a');
cp(l,  70567, '00000000006a49b14bcf27462068f1264c961f11fa2e0eddd2be0791e1d4124a');
cp(l,  74000, '0000000000573993a3c9e41ce34471c079dcf5f52a0e824a81e7f953b8661a20');
cp(l, 105000, '00000000000291ce28027faea320c8d2b054b2e0fe44a773f3eefb151d6bdc97');
cp(l, 118000, '000000000000774a7f8a7a12dc906ddb9e17e75d684f15e00f8767f9e8f36553');
cp(l, 134444, '00000000000005b12ffd4cd315cd34ffd4a594f430ac814c91184a0d42d2b0fe');
cp(l, 140700, '000000000000033b512028abb90e1626d8b346fd0ed598ac0a3c371138dce2bd');

// Testnet checkpoints
cp(t,    546, '000000002a936ca763904c3c35fce2f3556c559c0214345d31b1bcebf76acb70');
