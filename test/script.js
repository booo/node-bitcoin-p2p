var vows = require('vows'),
    assert = require('assert');

var Script = require("../lib/script").Script;
var ScriptInterpreter = require("../lib/scriptinterpreter").ScriptInterpreter;
var Util = require("../lib/util");

vows.describe('Script').addBatch({ "Stack correct after": {
  'OP_1NEGATE & OP_16':
  stackTest([OP_1NEGATE, OP_16], [-1, 16]),

  'OP_3DUP':
  stackTest([OP_1, OP_2, OP_3, OP_3DUP], [1, 2, 3, 1, 2, 3]),

  'OP_DEPTH':
  stackTest([OP_1, OP_2, OP_2, OP_DEPTH], [1, 2, 2, 3]),

  'OP_IF, OP_ELSE & OP_ENDIF':
  stackTest([OP_1, OP_IF, OP_2, OP_4, OP_ELSE, OP_5, OP_ENDIF], [2, 4]),

  'OP_VERIFY':
  stackTest([OP_1, OP_VERIFY, OP_0, OP_VERIFY], [0]),

  'OP_RETURN':
  stackTest([OP_1, OP_2, OP_RETURN, OP_3], [1, 2]),

  'OP_TOALTSTACK & OP_FROMALTSTACK':
  stackTest([OP_1, OP_TOALTSTACK, OP_2, OP_3, OP_TOALTSTACK, OP_4,
             OP_FROMALTSTACK, OP_FROMALTSTACK], [2, 4, 3, 1]),

  'OP_2OVER':
  stackTest([OP_1, OP_2, OP_3, OP_4, OP_2OVER], [1, 2, 3, 4, 1, 2]),

  'OP_2ROT':
  stackTest([OP_1, OP_2, OP_3, OP_4, OP_5, OP_6, OP_2ROT], [3,4,5,6,1,2]),

  'OP_2SWAP':
  stackTest([OP_1, OP_2, OP_3, OP_4, OP_2SWAP], [3, 4, 1, 2]),

  'OP_IFDUP':
  stackTest([OP_0, OP_IFDUP, OP_1, OP_IFDUP], [0, 1, 1]),

  'OP_DROP':
  stackTest([OP_1, OP_2, OP_DROP], [1]),

  'OP_DUP':
  stackTest([OP_1, OP_2, OP_DUP], [1, 2, 2]),

  'OP_NIP':
  stackTest([OP_1, OP_2, OP_NIP], [2]),

  'OP_OVER':
  stackTest([OP_1, OP_2, OP_OVER], [1, 2, 1]),

  'OP_PICK':
  stackTest([OP_5, OP_4, OP_1, OP_PICK], [5, 4, 5]),

  'OP_ROLL':
  stackTest([OP_5, OP_4, OP_1, OP_ROLL], [4, 5]),

  'OP_ROT':
  stackTest([OP_5, OP_4, OP_1, OP_ROT], [4, 1, 5]),

  'OP_SWAP':
  stackTest([OP_1, OP_2, OP_3, OP_SWAP], [1, 3, 2]),

  'OP_TUCK':
  stackTest([OP_1, OP_2, OP_3, OP_TUCK], [1, 3, 2, 3]),

  'OP_CAT':
  stackTest(["aabbccdd", "eeff0011", OP_CAT], ["aabbccddeeff0011"]),

  'OP_SUBSTR':
  stackTest(["aabbccdd", OP_1, OP_2, OP_SUBSTR], ["bbcc"]),

  'OP_LEFT & OP_RIGHT':
  stackTest(["aabbccddeeff", OP_5, OP_LEFT, OP_4, OP_RIGHT], ["bbccddee"]),

  'OP_SIZE':
  stackTest(["aabbccddeeff", OP_SIZE], ["aabbccddeeff", 6]),

  'OP_INVERT':
  stackTest(["aabbccddeeff", OP_INVERT], ["554433221100"]),

  'OP_AND':
  stackTest(["efac", "8348", OP_AND], ["8308"]),

  'OP_OR':
  stackTest(["efac", "8348", OP_OR], ["efec"]),

  'OP_XOR':
  stackTest(["efac", "8348", OP_XOR], ["6ce4"]),

  'OP_EQUAL':
  stackTest(["abcd", "abcd", OP_EQUAL, "abcd", "1234", OP_EQUAL], [1, 0]),

  'OP_EQUALVERIFY':
  stackTest(["abcd", "abcd", OP_EQUALVERIFY,
             "abcd", "1234", OP_EQUALVERIFY], [0]),

  'OP_1ADD':
  stackTest([OP_1, OP_1ADD, OP_1ADD, OP_1ADD], [4]),

  'OP_1SUB':
  stackTest([OP_9, OP_1SUB, OP_1SUB, OP_1SUB], [6]),

  'OP_2MUL':
  stackTest([OP_1, OP_2MUL, OP_2MUL, OP_2MUL], [8]),

  'OP_2DIV':
  stackTest([OP_16, OP_2DIV, OP_2DIV, OP_2DIV], [2]),

  'OP_NEGATE':
  stackTest([OP_1, OP_NEGATE], [-1]),

  'OP_ABS':
  stackTest([OP_1NEGATE, OP_ABS], [1]),

  'OP_NOT':
  stackTest([OP_0, OP_NOT, OP_1, OP_NOT, OP_1NEGATE, OP_NOT], [1, 0, 0]),

  'OP_0NOTEQUAL':
  stackTest([OP_0, OP_0NOTEQUAL, OP_1, OP_0NOTEQUAL,
             OP_1NEGATE, OP_0NOTEQUAL], [0, 1, 1]),

  'OP_ADD':
  stackTest([OP_2, OP_11, OP_ADD, OP_12, OP_ADD], [25]),

  'OP_SUB':
  stackTest([OP_11, OP_3, OP_SUB, OP_DUP, OP_12, OP_SUB], [8, -4]),

  'OP_MUL':
  stackTest([OP_11, OP_3, OP_MUL, OP_DUP, OP_1NEGATE, OP_MUL], [33, -33]),

  'OP_DIV':
  stackTest([OP_15, OP_2, OP_DIV, OP_DUP, OP_1NEGATE, OP_5, OP_MUL, OP_DIV], [7, -2]),

  'OP_MOD':
  stackTest([OP_15, OP_4, OP_MOD, OP_1NEGATE, OP_5, OP_MOD], [3, 4]),

  'OP_LSHIFT':
  stackTest([OP_15, OP_3, OP_LSHIFT, OP_DUP, OP_16, OP_LSHIFT], [120, "000078"]),

  'OP_RSHIFT':
  stackTest(["000078", OP_16, OP_RSHIFT, OP_DUP, OP_3, OP_RSHIFT], [120, 15]),

  'OP_BOOLAND':
  stackTest([OP_4, OP_16, OP_BOOLAND, OP_DUP, OP_0, OP_BOOLAND], [1, 0]),

  'OP_BOOLOR':
  stackTest([OP_0, OP_12, OP_BOOLOR, OP_0, OP_0, OP_BOOLOR], [1, 0]),

  'OP_NUMEQUAL':
  stackTest([OP_0, OP_12, OP_NUMEQUAL, OP_DUP, OP_0, OP_NUMEQUAL], [0, 1]),

  'OP_NUMEQUALVERIFY':
  stackTest([OP_11, OP_11, OP_NUMEQUALVERIFY, OP_5, OP_0, OP_NUMEQUALVERIFY],
            [0]),

  'OP_NUMNOTEQUAL':
  stackTest([OP_0, OP_12, OP_NUMNOTEQUAL, OP_8, OP_8, OP_NUMNOTEQUAL],
            [1, 0]),

  'OP_LESSTHAN':
  stackTest([OP_0, OP_12, OP_LESSTHAN,
             OP_6, OP_5, OP_LESSTHAN,
             OP_8, OP_8, OP_LESSTHAN],
            [1, 0, 0]),

  'OP_GREATERTHAN':
  stackTest([OP_14, OP_12, OP_GREATERTHAN,
             OP_2, OP_5, OP_GREATERTHAN,
             OP_8, OP_8, OP_GREATERTHAN],
            [1, 0, 0]),

  'OP_LESSTHANOREQUAL':
  stackTest([OP_0, OP_12, OP_LESSTHANOREQUAL,
             OP_6, OP_5, OP_LESSTHANOREQUAL,
             OP_8, OP_8, OP_LESSTHANOREQUAL],
            [1, 0, 1]),

  'OP_GREATERTHANOREQUAL':
  stackTest([OP_14, OP_12, OP_GREATERTHANOREQUAL,
             OP_2, OP_5, OP_GREATERTHANOREQUAL,
             OP_8, OP_8, OP_GREATERTHANOREQUAL],
            [1, 0, 1]),

  'OP_MIN':
  stackTest([OP_14, OP_12, OP_MIN, OP_DUP, OP_1NEGATE, OP_MIN], [12, -1]),

  'OP_MAX':
  stackTest([OP_12, OP_14, OP_MAX, OP_DUP, OP_1NEGATE, OP_MAX], [14, 14]),

  'OP_WITHIN':
  stackTest([OP_6, OP_0, OP_14, OP_WITHIN,
             OP_0, OP_1NEGATE, OP_2, OP_WITHIN,
             OP_3, OP_1NEGATE, OP_3, OP_WITHIN],
            [1, 1, 0]),

  'OP_RIPEMD160':
  stackTest(['426974636f696e4a5321', OP_RIPEMD160],
            ['983a9b144ab6f4582e09d699074fd93c269a3faf']),

  'OP_SHA1':
  stackTest(['426974636f696e4a5321', OP_SHA1],
            ['bc1d0c5c6957cfd38a8ba6dfb1f65c0801ffd889']),

  'OP_SHA256':
  stackTest(['426974636f696e4a5321', OP_SHA256],
            ['9ba45bbda2f95c4c280f05b6e265b52c4f73e8715c2dde291db4602775008e6f']),

  'OP_HASH160':
  stackTest(['426974636f696e4a5321', OP_HASH160],
            ['dcb1a65091f21be9d8e5aeda5b7bc28a8413508e']),

  'OP_HASH256':
  stackTest(['426974636f696e4a5321', OP_HASH256],
            ['12a8c4ebf9fe29890dc3627fe4bf73e13eb28b394d900ce2e75c19e03a630ad4'])


}}).export(module);

/**
 * Test whether a script results in the correct stack.
 */
function stackTest(script, stack) {
  return function () {
    var si = run(script);
    assert.deepEqual(si.getPrimitiveStack(),
                     stack);
  };
};

function run(scriptChunks) {
  scriptChunks = scriptChunks.map(function (chunk) {
    if ("string" === typeof chunk) {
      return Util.decodeHex(chunk);
    } else {
      return chunk;
    }
  });
  var script = new Script();
  script.chunks = scriptChunks;
  var interpreter = new ScriptInterpreter();
  interpreter.disableUnsafeOpcodes = false;
  interpreter.eval(script);
  return interpreter;
};
