var vows = require('vows'),
    assert = require('assert');

var fs = require('fs');

var buffertools = require('buffertools');

var logger = require("../lib/logger");
var bitcoin = require("../lib/bitcoin");

var Script = bitcoin.Script;
var Connection = bitcoin.Connection;
var ScriptInterpreter = require("../lib/scriptinterpreter").ScriptInterpreter;
var Opcode = require("../lib/opcode").Opcode;
var Util = require("../lib/util");
var Transaction = require('../lib/schema/transaction').Transaction;
var BitcoinKey = Util.BitcoinKey;

logger.logger.levels.scrdbg = 1;

var suite = vows.describe('Script');

suite.addBatch({ "Script with": {
  'OP_1NEGATE & OP_16':
  stackTest([OP_1NEGATE, OP_16], [-1, 16]),

  'OP_3DUP':
  stackTest([OP_1, OP_2, OP_3, OP_3DUP], [1, 2, 3, 1, 2, 3]),

  'OP_DEPTH':
  stackTest([OP_1, OP_2, OP_2, OP_DEPTH], [1, 2, 2, 3]),

  'OP_IF, OP_ELSE & OP_ENDIF':
  stackTest([OP_1, OP_IF, OP_2, OP_4, OP_ELSE, OP_5, OP_ENDIF], [2, 4]),

  'OP_VERIFY':
  stackTest([OP_1, OP_VERIFY, OP_0, OP_VERIFY], [0], 'OP_VERIFY negative'),

  'OP_RETURN':
  stackTest([OP_1, OP_2, OP_RETURN, OP_3], [1, 2], 'OP_RETURN'),

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
  stackTest(["abcd", "abcd", OP_EQUALVERIFY, "abcd", "1234", OP_EQUALVERIFY],
            [0],
            'OP_EQUALVERIFY negative'),

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
  stackTest([OP_15, OP_2, OP_DIV, OP_DUP, OP_1NEGATE, OP_5, OP_MUL, OP_DIV], [7, -1]),

  'OP_MOD':
  stackTest([OP_15, OP_4, OP_MOD, OP_1NEGATE, OP_5, OP_MOD], [3, -1]),

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
            [0],
            'OP_NUMEQUALVERIFY negative'),

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
            ['ff339e8b4a9b0a07d4686197de3d4e065d8cdcba']),

  'OP_SHA256':
  stackTest(['426974636f696e4a5321', OP_SHA256],
            ['9ba45bbda2f95c4c280f05b6e265b52c4f73e8715c2dde291db4602775008e6f']),

  'OP_HASH160':
  stackTest(['426974636f696e4a5321', OP_HASH160],
            ['dcb1a65091f21be9d8e5aeda5b7bc28a8413508e']),

  'OP_HASH256':
  stackTest(['426974636f696e4a5321', OP_HASH256],
            ['12a8c4ebf9fe29890dc3627fe4bf73e13eb28b394d900ce2e75c19e03a630ad4']),

  'OP_CHECKSIG':
  // Tx d86f99eeb70b45ba08632cd14eb8765b6b95d863857e30d5c16d0e0868462499
  // from testnet, block 30000
  txTest("01000000014bd1838beb7b7d1b68d3347fca42b81ca0728fc16a8c7b604989aa0a5fde983c000000008a4730440220168833f25d742e7126bdd8f6b5d7753388ef8f35f450ee21fc0bc8af8a83cd5402201fbb9c820786e96c4b00d17abc2678f732e0d06d676c35271c2317486280af25014104d853001cd8ab4bacf57319be8b138a7b712dd00500d34e005bec0d0933fdd2a23de4fe65876d2744ed7e7b30ac205e389e238325e405e4b2d995187d15b43fedffffffff0280792f77000000001976a9146a72d5d8e2b77ddd3f0641c8539bb86d5344378088ac002f6859000000001976a91406eb2190b488a5ed02e0423f63b99c23bc163da188ac00000000", [OP_DUP, OP_HASH160, "08bb96496ef8690604a8c186bd7f3190c42d9f65", OP_EQUALVERIFY, OP_CHECKSIG]),

  'OP_CHECKSIG_2':
  // Tx f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16
  // from livenet, block 170
  txTest("0100000001c997a5e56e104102fa209c6a852dd90660a20b2d9c352423edce25857fcd3704000000004847304402204e45e16932b8af514961a1d3a1a25fdf3f4f7732e9d624c6c61548ab5fb8cd410220181522ec8eca07de4860a4acdd12909d831cc56cbbac4622082221a8768d1d0901ffffffff0200ca9a3b00000000434104ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84cac00286bee0000000043410411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3ac00000000", ["0411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3", OP_CHECKSIG]),

  'OP_CHECKSIG_3':
  // Tx c99c49da4c38af669dea436d3e73780dfdb6c1ecf9958baa52960e8baee30e73
  // from livenet, block 110300
  txTest("01000000010276b76b07f4935c70acf54fbf1f438a4c397a9fb7e633873c4dd3bc062b6b40000000008c493046022100d23459d03ed7e9511a47d13292d3430a04627de6235b6e51a40f9cd386f2abe3022100e7d25b080f0bb8d8d5f878bba7d54ad2fda650ea8d158a33ee3cbd11768191fd004104b0e2c879e4daf7b9ab68350228c159766676a14f5815084ba166432aab46198d4cca98fa3e9981d0a90b2effc514b76279476550ba3663fdcaff94c38420e9d5000000000100093d00000000001976a9149a7b0f3b80c6baaeedce0a0842553800f832ba1f88ac00000000", [OP_DUP, OP_HASH160, "dc44b1164188067c3a32d4780f5996fa14a4f2d9", OP_EQUALVERIFY, OP_CHECKSIG]),

  'OP_CHECKSIG_4':
  // Tx 48ce0ba13b087f3712cdc354db918436aeeca60596ac7c54572c8c1b9a8b5ba4
  // from testnet, block 42132
  // Included to test compressed key format
  txTest("766f790b01ef11dd97c3d6c812cf598ef5f5a88731e5e7cd1ef325be0a2f906179fbd4afb2010000006c493046022100b5775bd2ef0a5d45369f286dfa24fa990af7ae887b2a3e2c24d8eacb18430e36022100d9b6760e59f2a52cecd81ef7422c9ad41589f879a24358145307169858b8dc13082102a32efde012298e69e3601eb94fceb84c900efecdca8abc6a46f20a810acf18b7ffffffff014000a812000000001976a9145682781e9afa6c0b039e32d469d5212a61d8a8fa88ac00000000", [OP_DUP, OP_HASH160, "18b8cfeb1ed02c1793e0c51a2a9b4fef278a7adb", OP_EQUALVERIFY, OP_CHECKSIG]),

  'OP_CHECKMULTISIG':
  checkmultisigTest(2, 2),
  
  'OP_CHECKMULTISIG_2':
  checkmultisigTest(1, 2),
  
  'OP_CHECKMULTISIG_3':
  checkmultisigTest(2, 3),
  
  'OP_CHECKMULTISIG_4':
  checkmultisigTest(10, 20),
  
  'OP_CHECKMULTISIG_5':
  checkmultisigTest(20, 20),
  
  'OP_CHECKMULTISIG_6':
  // Tx a17b21f52859ed326d1395d8a56d5c7389f5fc83c17b9140a71d7cb86fdf0f5f
  // from testnet, block 30301
  txTest("0100000001bb664ff716b9dfc831bcc666c1767f362ad467fcfbaf4961de92e45547daab8701000000fd190100493046022100d73f633f114e0e0b324d87d38d34f22966a03b072803afa99c9408201f6d6dc6022100900e85be52ad2278d24e7edbb7269367f5f2d6f1bd338d017ca460008776614401473044022071fef8ac0aa6318817dbd242bf51fb5b75be312aa31ecb44a0afe7b49fcf840302204c223179a383bb6fcb80312ac66e473345065f7d9136f9662d867acf96c12a42015241048c006ff0d2cfde86455086af5a25b88c2b81858aab67f6a3132c885a2cb9ec38e700576fd46c7d72d7d22555eee3a14e2876c643cd70b1b0a77fbf46e62331ac4104b68ef7d8f24d45e1771101e269c0aacf8d3ed7ebe12b65521712bba768ef53e1e84fff3afbee360acea0d1f461c013557f71d426ac17a293c5eebf06e468253e00ffffffff0280969800000000001976a9140817482d2e97e4be877efe59f4bae108564549f188ac7015a7000000000062537a7652a269537a829178a91480677c5392220db736455533477d0bc2fba65502879b69537a829178a91402d7aa2e76d9066fb2b3c41ff8839a5c81bdca19879b69537a829178a91410039ce4fdb5d4ee56148fe3935b9bfbbe4ecc89879b6953ae00000000", [OP_3, OP_ROLL, OP_DUP, OP_2, OP_GREATERTHANOREQUAL, OP_VERIFY, OP_3, OP_ROLL, OP_SIZE, OP_NOT, OP_OVER, OP_HASH160, "80677c5392220db736455533477d0bc2fba65502", OP_EQUAL, OP_BOOLOR, OP_VERIFY, OP_3, OP_ROLL, OP_SIZE, OP_NOT, OP_OVER, OP_HASH160, "02d7aa2e76d9066fb2b3c41ff8839a5c81bdca19", OP_EQUAL, OP_BOOLOR, OP_VERIFY, OP_3, OP_ROLL, OP_SIZE, OP_NOT, OP_OVER, OP_HASH160, "10039ce4fdb5d4ee56148fe3935b9bfbbe4ecc89", OP_EQUAL, OP_BOOLOR, OP_VERIFY, OP_3, OP_CHECKMULTISIG]),
  
  'OP_NOP1':
  // Tx f5eb769eff73a4781b600064ac16dff54e039994e7dedb77903a19b5edec1fc7
  // from testnet, block 39399
  txTest("0100000002ab9f97d24b612e7fbf27ba5d29f0c7201ddca2db0dde304965a4c7691d77a3bb000000008c493046022100866e834a7d2609a3a22a9c5ff13e301b4ad9f7fcb65dc3e8b27d07f3fc02084b022100eec81365b922db5707058379a1038dc0c8c6d547a31b494b2f05e607a62b9505014104c56c2ccd35260cef7b79c742b0cfc076f2e709f10191b9058a9116f18801834c5b14ace9aa99bc480092da29fc3f4dd8eccae151304cadfbcf07d4047d2e32d5ffffffffbe521dc4280bff0dfee92c3606d2e1c748ec9ed8692cfc35a8f5c631a2d63cc901000000d300483045022100c044d2877e14ffd0d1a832fd65f8670937d26c15e9049d384febdfe53616a29d022073983873504caf70c9468147497dddc027cb895ab2548095069daeca5dc0c083014c87514104cbcdfa318634d9a31a0d43e0e266914cde11ae9eb15d39ebcb9d5169483826dd74a0af31b36fea6648e1d55862a7d7799f5b3f44bb4901b0ab555c648cb509044104338517576bf89b220338e01e171b366ad261bd07e9480b4e179a0c9580b91c9debecabd840141d4bb4a8da498c1a30c59fbce0a798bde6a3cda397aa93de600752aeffffffff0270d75d00000000001976a9142869126e5a899e9d5e68acab40a91f7366bbe36088ac80f0fa02000000001976a9145ce6be8588bcdd09376e20eb7c0994ac0b6b142188b000000000", [OP_DUP, OP_HASH160, "c0c8d884f47c6e206c0bea693764b5e495c65d11", OP_EQUALVERIFY, OP_NOP1], 1, [0, '3045022100c044d2877e14ffd0d1a832fd65f8670937d26c15e9049d384febdfe53616a29d022073983873504caf70c9468147497dddc027cb895ab2548095069daeca5dc0c08301', '514104cbcdfa318634d9a31a0d43e0e266914cde11ae9eb15d39ebcb9d5169483826dd74a0af31b36fea6648e1d55862a7d7799f5b3f44bb4901b0ab555c648cb509044104338517576bf89b220338e01e171b366ad261bd07e9480b4e179a0c9580b91c9debecabd840141d4bb4a8da498c1a30c59fbce0a798bde6a3cda397aa93de600752ae'])
}});

suite.addBatch(generateSuite('script_valid.json'));
suite.addBatch(generateSuite('script_invalid.json', true));

suite.export(module);

function generateSuite(filename, shouldFail)
{
  var file = fs.readFileSync(__dirname + '/data/' + filename, 'utf8');
  var tests = JSON.parse(file);
  var suite = {};

  var n = 0;
  tests.forEach(function (test) {
    var scriptSig = parseTestData(test[0]);
    var scriptPubKey = parseTestData(test[1]);
    var title = scriptSig.getStringContent(true) + ' ' +
      scriptPubKey.getStringContent(true);
    if (test.length >= 3) {
      title += ' '+test[2];
    }
    suite[title] = scriptTest(scriptSig, scriptPubKey, shouldFail);
  });
  return { 'Static script': suite };
};

function parseTestData(str)
{
  var literals = [];
  str = str.replace(/\'(.*?)(?!\\)\'/g, function ($0, $1) {
    literals.push($1);
    return 'STR'+(literals.length - 1);
  });
  str = str.split(' ');
  str = str.map(function (token) {
    if (token.substr(0, 3) == 'STR') {
      return addDataPrefix(new Buffer(literals[+token.substr(3)], 'utf-8'));
    } else if (token.substr(0, 2) == '0x') {
      return new Buffer(token.substr(2), 'hex');
    } else if (token.match(/^-?[0-9]+$/)) {
      var number = +token;
      if (number == 0) {
        return new Buffer([0]);
      } else if (number >= -1 && number <= 16) {
        return new Buffer([number + 80]);
      } else {
        return addDataPrefix(ScriptInterpreter.bigintToBuffer(number));
      }
    } else {
      return new Buffer([Opcode.map['OP_'+token]]);
    }
  });
  var scriptBuffer = buffertools.concat.apply(buffertools, str);
  try {
    return new Script(scriptBuffer);
  } catch (e) {
    return new Script();
    console.log(scriptBuffer, e.stack);
  }
};

function addDataPrefix(data)
{
  var script = new Script();
  script.writeBytes(data);
  return script.buffer;
};

/**
 * Test whether a script results in the correct stack.
 */
function stackTest(scriptChunks, stack, expectedError)
{
  var context = {
    topic: function () {
      var cb = this.callback;
      var script = Script.fromTestData(scriptChunks);
      var si = new ScriptInterpreter();
      si.disableUnsafeOpcodes = false;
      si.eval(script, null, null, null, function (e) {
        cb(null, {
          err: e,
          stack: si.getPrimitiveStack()
        });
      });

      // Async topics must not return a value
      return;
    },

    'executes correctly': function (topic) {
      assert.deepEqual(topic.stack, stack);
    }
  };

  if (expectedError) {
    context['with error '+expectedError] = function (topic) {
      assert.equal(topic.err.message, expectedError);
    };
  } else {
    context['without error'] = function (topic) {
      assert.equal(topic.err, null);
    };
  }

  return context;
};

var defaultTx = Connection.parseTx(Util.decodeHex("766f790b01ef11dd97c3d6c812cf598ef5f5a88731e5e7cd1ef325be0a2f906179fbd4afb2010000006c493046022100b5775bd2ef0a5d45369f286dfa24fa990af7ae887b2a3e2c24d8eacb18430e36022100d9b6760e59f2a52cecd81ef7422c9ad41589f879a24358145307169858b8dc13082102a32efde012298e69e3601eb94fceb84c900efecdca8abc6a46f20a810acf18b7ffffffff014000a812000000001976a9145682781e9afa6c0b039e32d469d5212a61d8a8fa88ac00000000"));
function scriptTest(scriptSig, scriptPubKey, shouldFail)
{
  var testCase = {
    topic: function () {
      var cb = this.callback;
      var si = ScriptInterpreter.verify(scriptSig, scriptPubKey,
                                        defaultTx, 0, 1, function (e, result) {
        if (e && !shouldFail) {
          cb(e);
          return;
        } else if (e) {
          cb(null, false);
          return;
        }
        cb(null, result);
      });
    }
  };
  testCase[shouldFail ? 'is false' : 'is true'] = function (topic) {
    assert[shouldFail ? 'isFalse' : 'isTrue'](topic);
  };
  return testCase;
};

function txTest(txData, scriptPubKeyData, inIndex, expectedResult)
{
  inIndex = "number" === typeof inIndex ? inIndex : 0;
  expectedResult = expectedResult ? expectedResult : [1];
  return {
    topic: function () {
      var cb = this.callback;
      var txInfo = Connection.parseTx(Util.decodeHex(txData));
      var tx = new Transaction(txInfo);
      var scriptSig = new Script(tx.ins[inIndex].s);
      var scriptPubKey = Script.fromTestData(scriptPubKeyData);
      var si = tx.verifyInput(inIndex, scriptPubKey, function (e) {
        if (e) {
          cb(e);
          return;
        }
        cb(null, si);
      });

      // Async topics must not return a value
      return;
    },

    'executes correctly': function (topic) {
      assert.deepEqual(topic.getPrimitiveStack(), expectedResult);
    },

    'is valid': function (topic) {
      assert.isTrue(topic.getResult());
    }
  };
};

function checkmultisigTest(sigCount, keyCount) {
  return {
    'topic': function () {
      var cb = this.callback;
      var si = new ScriptInterpreter();

      if (sigCount < 0 || keyCount < 0 || sigCount > keyCount || keyCount > 20) {
        throw new Error('Invalid OP_CHECKMULTISIG test');
      }

      var keys = [];
      for (var i = 0; i < keyCount; i++) {
        var key = BitcoinKey.generateSync();
        keys.push(key);
      }

      // Convert number to script chunk - this algorithm works for numbers between
      // 0 and 32. Since our range is 1 to 20
      var sigCountOp = (sigCount > 16) ? ["1"+(sigCount-16)] : [sigCount+80];
      var keyCountOp = (keyCount > 16) ? ["1"+(keyCount-16)] : [keyCount+80];

      var scriptPubkey = Script.fromTestData([].concat(
        sigCountOp,
        keys.map(function (key) {
          return key.public;
        }),
        keyCountOp,
        [OP_CHECKMULTISIG]
      ));

      var tx = new Transaction({
        ins: [{
          o: Util.NULL_HASH
        }],
        outs: [{
          v: Util.decodeHex('05f5e100'),
          s: new Buffer(0)
        }]
      });
      var scriptSig = signMultisig(scriptPubkey, keys.slice(0, sigCount), tx);
      si.evalTwo(scriptSig, scriptPubkey, tx, 0, 0, function (e) {
        if (e) {
          cb(e);
          return;
        }
        cb(null, si.getPrimitiveStack());
      });

      // Async topics must not return a value
      return;
    },

    'executes correctly': function (topic) {
      assert.deepEqual(topic, [1]);
    }
  };
};

function signMultisig(scriptPubkey, keys, tx) {
  var hash = tx.hashForSignature(scriptPubkey, 0, 1);

  var scriptData = [];
  scriptData.push(OP_0);

  keys.forEach(function (key) {
    var sig = key.signSync(hash);
    var sigData = new Buffer(sig.length+1);
    sig.copy(sigData);
    sigData[sigData.length-1] = 1;
    scriptData.push(sigData);
  });

  return Script.fromTestData(scriptData);
};
