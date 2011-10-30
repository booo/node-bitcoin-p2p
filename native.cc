#include <cctype>
#include <cstdlib>
#include <cstring>
#include <stdio.h>

#include <v8.h>

#include <node.h>
#include <node_buffer.h>

#include <openssl/bn.h>
#include <openssl/buffer.h>
#include <openssl/ecdsa.h>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/sha.h>
#include <openssl/ripemd.h>


using namespace std;
using namespace v8;
using namespace node;

#define REQ_FUN_ARG(I, VAR)                                                       \
  if (args.Length() <= (I) || !args[I]->IsFunction())                             \
    return ThrowException(Exception::TypeError(                                   \
                            String::New("Argument " #I " must be a function")));  \
  Local<Function> VAR = Local<Function>::Cast(args[I]);

static Handle<Value> VException(const char *msg) {
    HandleScope scope;
    return ThrowException(Exception::Error(String::New(msg)));
}


int static inline EC_KEY_regenerate_key(EC_KEY *eckey, const BIGNUM *priv_key)
{
  int ok = 0;
  BN_CTX *ctx = NULL;
  EC_POINT *pub_key = NULL;

  if (!eckey) return 0;

  const EC_GROUP *group = EC_KEY_get0_group(eckey);

  if ((ctx = BN_CTX_new()) == NULL)
    goto err;

  pub_key = EC_POINT_new(group);

  if (pub_key == NULL)
    goto err;

  if (!EC_POINT_mul(group, pub_key, priv_key, NULL, NULL, ctx))
    goto err;

  EC_KEY_set_private_key(eckey,priv_key);
  EC_KEY_set_public_key(eckey,pub_key);

  ok = 1;

 err:

  if (pub_key)
    EC_POINT_free(pub_key);
  if (ctx != NULL)
    BN_CTX_free(ctx);

  return(ok);
}

class BitcoinKey : ObjectWrap
{
private:

  const char *lastError;
  EC_KEY *ec;

  bool hasPrivate;
  bool hasPublic;

  static BitcoinKey *Generate()
  {
    BitcoinKey *key = new BitcoinKey();
    if (key->lastError) {
      return key;
    }

    if (!EC_KEY_generate_key(key->ec)) {
      key->lastError = "Error from EC_KEY_generate_key";
      return key;
    }

    key->hasPublic = true;
    key->hasPrivate = true;

    return key;
  }

  struct verify_sig_baton_t {
    // Parameters
    BitcoinKey *key;
    const unsigned char *digest;
    int digest_len;
    const unsigned char *sig;
    int sig_len;

    // Result
    // -1 = error, 0 = bad sig, 1 = good
    int result;
    Persistent<Function> cb;
  };

  int VerifySignature(const unsigned char *digest, int digest_len,
                      const unsigned char *sig, int sig_len)
  {
    return ECDSA_verify(0, digest, digest_len, sig, sig_len, ec);
  }

  static int EIO_VerifySignature(eio_req *req)
  {
    verify_sig_baton_t *b = static_cast<verify_sig_baton_t *>(req->data);

    b->result = b->key->VerifySignature(b->digest, b->digest_len,
                                        b->sig, b->sig_len);

    return 0;
  }

  ECDSA_SIG *Sign(const unsigned char *digest, int digest_len)
  {
    ECDSA_SIG *sig;

    sig = ECDSA_do_sign(digest, digest_len, ec);
    if (sig == NULL) {
      // TODO: ERROR
    }

    return sig;
  }

public:

  static Persistent<FunctionTemplate> s_ct;
  static void Init(Handle<Object> target)
  {
    HandleScope scope;
    Local<FunctionTemplate> t = FunctionTemplate::New(New);

    s_ct = Persistent<FunctionTemplate>::New(t);
    s_ct->InstanceTemplate()->SetInternalFieldCount(1);
    s_ct->SetClassName(String::NewSymbol("BitcoinKey"));

    // Accessors
    s_ct->InstanceTemplate()->SetAccessor(String::New("private"),
                                          GetPrivate, SetPrivate);
    s_ct->InstanceTemplate()->SetAccessor(String::New("public"),
                                          GetPublic, SetPublic);

    // Methods
    NODE_SET_PROTOTYPE_METHOD(s_ct, "verifySignature", VerifySignature);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "verifySignatureSync", VerifySignatureSync);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "regenerateSync", RegenerateSync);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "toDER", ToDER);
    NODE_SET_PROTOTYPE_METHOD(s_ct, "signSync", SignSync);

    // Static methods
    NODE_SET_METHOD(s_ct->GetFunction(), "generateSync", GenerateSync);
    NODE_SET_METHOD(s_ct->GetFunction(), "fromDER", FromDER);

    target->Set(String::NewSymbol("BitcoinKey"),
                s_ct->GetFunction());
  }

  BitcoinKey() :
    lastError(NULL),
    hasPrivate(false),
    hasPublic(false)
  {
    ec = EC_KEY_new_by_curve_name(NID_secp256k1);
    if (ec == NULL) {
      lastError = "Error from EC_KEY_new_by_curve_name";
    }
  }

  ~BitcoinKey()
  {
    EC_KEY_free(ec);
  }

  static Handle<Value>
  New(const Arguments& args)
  {
    HandleScope scope;

    // If an "External" is passed in as the argument, wrap it, otherwise
    // instantiate a new C++ object. Credit goes to Christian Plesner Hansen
    // for this method.
    if (args[0]->IsExternal()) {
      Handle<External> external = Handle<External>::Cast(args[0]);
      args.This()->SetInternalField(0, external);
    } else {
      BitcoinKey* key = new BitcoinKey();
      if (key->lastError != NULL) {
        return VException(key->lastError);
      }

      key->Wrap(args.This());
    }
    return args.This();
  }

  static Handle<Value>
  GenerateSync(const Arguments& args)
  {
    HandleScope scope;

    BitcoinKey* key = Generate();

    if (key->lastError != NULL) {
      return VException(key->lastError);
    }

    Handle<Function> cons = s_ct->GetFunction();
    Handle<Value> external = External::New(key);
    Handle<Value> result = cons->NewInstance(1, &external);

    return scope.Close(result);
  }

  static Handle<Value>
  GetPrivate(Local<String> property, const AccessorInfo& info)
  {
    HandleScope scope;
    BitcoinKey* key = node::ObjectWrap::Unwrap<BitcoinKey>(info.Holder());

    if (!key->hasPrivate) {
      return scope.Close(Null());
    }

    const BIGNUM *bn = EC_KEY_get0_private_key(key->ec);
    int priv_size = BN_num_bytes(bn);

    if (bn == NULL) {
      // TODO: ERROR: "Error from EC_KEY_get0_private_key(pkey)"
      return scope.Close(Null());
    }

    if (priv_size > 32) {
      // TODO: ERROR: "Secret too large (Incorrect curve parameters?)"
      return scope.Close(Null());
    }

    unsigned char *priv = (unsigned char *)malloc(32);

    int n = BN_bn2bin(bn, &priv[32 - priv_size]);

    if (n != priv_size) {
      // TODO: ERROR: "Error from BN_bn2bin(bn, &priv[32 - priv_size])"
      return scope.Close(Null());
    }

    Buffer *priv_buf = Buffer::New(32);
    memcpy(Buffer::Data(priv_buf), priv, 32);

    free(priv);

    return scope.Close(priv_buf->handle_);
  }

  static void
  SetPrivate(Local<String> property, Local<Value> value, const AccessorInfo& info)
  {
    BitcoinKey* key = node::ObjectWrap::Unwrap<BitcoinKey>(info.Holder());
    Handle<Object> buffer = value->ToObject();
    const unsigned char *data = (const unsigned char*) Buffer::Data(buffer);

    BIGNUM *bn = BN_bin2bn(data,Buffer::Length(buffer),BN_new());
    EC_KEY_set_private_key(key->ec, bn);
    BN_clear_free(bn);

    key->hasPrivate = true;
  }

  static Handle<Value>
  GetPublic(Local<String> property, const AccessorInfo& info)
  {
    HandleScope scope;
    BitcoinKey* key = node::ObjectWrap::Unwrap<BitcoinKey>(info.Holder());

    if (!key->hasPublic) {
      return scope.Close(Null());
    }

    // Export public
    unsigned int pub_size = i2o_ECPublicKey(key->ec, NULL);
    if (!pub_size) {
      // TODO: ERROR: "Error from i2o_ECPublicKey(key->ec, NULL)"
      return scope.Close(Null());
    }
    unsigned char *pub_begin, *pub_end;
    pub_begin = pub_end = (unsigned char *)malloc(pub_size);

    if (i2o_ECPublicKey(key->ec, &pub_end) != pub_size) {
      // TODO: ERROR: "Error from i2o_ECPublicKey(key->ec, &pub)"
      return scope.Close(Null());
    }
    Buffer *pub_buf = Buffer::New(pub_size);
    memcpy(Buffer::Data(pub_buf), pub_begin, pub_size);

    free(pub_begin);

    return scope.Close(pub_buf->handle_);
  }

  static void
  SetPublic(Local<String> property, Local<Value> value, const AccessorInfo& info)
  {
    BitcoinKey* key = node::ObjectWrap::Unwrap<BitcoinKey>(info.Holder());
    Handle<Object> buffer = value->ToObject();
    const unsigned char *data = (const unsigned char*) Buffer::Data(buffer);

    if (!o2i_ECPublicKey(&(key->ec), &data, Buffer::Length(buffer))) {
      // TODO: Error
      return;
    }

    key->hasPublic = true;
  }

  static Handle<Value>
  RegenerateSync(const Arguments& args)
  {
    HandleScope scope;
    BitcoinKey* key = node::ObjectWrap::Unwrap<BitcoinKey>(args.This());

    if (!key->hasPrivate) {
      return VException("Regeneration requires a private key.");
    }

    EC_KEY *old = key->ec;

    key->ec = EC_KEY_new_by_curve_name(NID_secp256k1);
    EC_KEY_regenerate_key(key->ec, EC_KEY_get0_private_key(old));

    EC_KEY_free(old);

    return scope.Close(Undefined());
  }

  static Handle<Value>
  ToDER(const Arguments& args)
  {
    HandleScope scope;
    BitcoinKey* key = node::ObjectWrap::Unwrap<BitcoinKey>(args.This());

    if (!key->hasPrivate || !key->hasPublic) {
      return scope.Close(Null());
    }

    // Export DER
    unsigned int der_size = i2d_ECPrivateKey(key->ec, NULL);
    if (!der_size) {
      // TODO: ERROR: "Error from i2d_ECPrivateKey(key->ec, NULL)"
      return scope.Close(Null());
    }
    unsigned char *der_begin, *der_end;
    der_begin = der_end = (unsigned char *)malloc(der_size);

    if (i2d_ECPrivateKey(key->ec, &der_end) != der_size) {
      // TODO: ERROR: "Error from i2d_ECPrivateKey(key->ec, &der_end)"
      return scope.Close(Null());
    }
    Buffer *der_buf = Buffer::New(der_size);
    memcpy(Buffer::Data(der_buf), der_begin, der_size);

    free(der_begin);

    return scope.Close(der_buf->handle_);
  }

  static Handle<Value>
  FromDER(const Arguments& args)
  {
    HandleScope scope;

    if (args.Length() != 1) {
      return VException("One argument expected: der");
    }
    if (!Buffer::HasInstance(args[0])) {
      return VException("Argument 'der' must be of type Buffer");
    }

    BitcoinKey* key = new BitcoinKey();
    if (key->lastError != NULL) {
      return VException(key->lastError);
    }

    Handle<Object> der_buf = args[0]->ToObject();
    const unsigned char *data = (const unsigned char*) Buffer::Data(der_buf);

    if (!d2i_ECPrivateKey(&(key->ec), &data, Buffer::Length(der_buf))) {
      return VException("Error from d2i_ECPrivateKey(&key, &data, len)");
    }
    
    key->hasPrivate = true;
    key->hasPublic = true;

    Handle<Function> cons = s_ct->GetFunction();
    Handle<Value> external = External::New(key);
    Handle<Value> result = cons->NewInstance(1, &external);

    return scope.Close(result);
  }

  static Handle<Value>
  VerifySignature(const Arguments& args)
  {
    HandleScope scope;
    BitcoinKey* key = node::ObjectWrap::Unwrap<BitcoinKey>(args.This());
  
    if (args.Length() != 3) {
      return VException("Three arguments expected: hash, sig, callback");
    }
    if (!Buffer::HasInstance(args[0])) {
      return VException("Argument 'hash' must be of type Buffer");
    }
    if (!Buffer::HasInstance(args[1])) {
      return VException("Argument 'sig' must be of type Buffer");
    }
    REQ_FUN_ARG(2, cb);
    if (!key->hasPublic) {
      return VException("BitcoinKey does not have a public key set");
    }

    Handle<Object> hash_buf = args[0]->ToObject();
    Handle<Object> sig_buf = args[1]->ToObject();

    const unsigned char *hash_data = (unsigned char *) Buffer::Data(hash_buf);
    const unsigned char *sig_data = (unsigned char *) Buffer::Data(sig_buf);

    unsigned int hash_len = Buffer::Length(hash_buf);
    unsigned int sig_len = Buffer::Length(sig_buf);

    if (hash_len != 32) {
      return VException("Argument 'hash' must be Buffer of length 32 bytes");
    }

    verify_sig_baton_t *baton = new verify_sig_baton_t();
    baton->key = key;
    baton->digest = hash_data;
    baton->digest_len = hash_len;
    baton->sig = sig_data;
    baton->sig_len = sig_len;
    baton->result = -1;
    baton->cb = Persistent<Function>::New(cb);

    key->Ref();

    eio_custom(EIO_VerifySignature, EIO_PRI_DEFAULT, VerifySignatureCallback, baton);
    ev_ref(EV_DEFAULT_UC);

    return Undefined();
  }

  static int
  VerifySignatureCallback(eio_req *req)
  {
    HandleScope scope;
    verify_sig_baton_t *baton = static_cast<verify_sig_baton_t *>(req->data);
    ev_unref(EV_DEFAULT_UC);
    baton->key->Unref();

    Local<Value> argv[2];

    argv[0] = Local<Value>::New(Null());
    argv[1] = Local<Value>::New(Null());
    if (baton->result == -1) {
      argv[0] = Exception::TypeError(String::New("Error during ECDSA_verify"));
    } else if (baton->result == 0) {
      // Signature invalid
      argv[1] = Local<Value>::New(Boolean::New(false));
    } else if (baton->result == 1) {
      // Signature valid
      argv[1] = Local<Value>::New(Boolean::New(true));
    } else {
      argv[0] = Exception::TypeError(
        String::New("ECDSA_verify gave undefined return value"));
    }

    TryCatch try_catch;

    baton->cb->Call(Context::GetCurrent()->Global(), 2, argv);

    if (try_catch.HasCaught()) {
      FatalException(try_catch);
    }

    baton->cb.Dispose();

    delete baton;
    return 0;
  }

  static Handle<Value>
  VerifySignatureSync(const Arguments& args)
  {
    HandleScope scope;
    BitcoinKey* key = node::ObjectWrap::Unwrap<BitcoinKey>(args.This());
  
    if (args.Length() != 2) {
      return VException("Two arguments expected: hash, sig");
    }
    if (!Buffer::HasInstance(args[0])) {
      return VException("Argument 'hash' must be of type Buffer");
    }
    if (!Buffer::HasInstance(args[1])) {
      return VException("Argument 'sig' must be of type Buffer");
    }
    if (!key->hasPublic) {
      return VException("BitcoinKey does not have a public key set");
    }

    Handle<Object> hash_buf = args[0]->ToObject();
    Handle<Object> sig_buf = args[1]->ToObject();

    const unsigned char *hash_data = (unsigned char *) Buffer::Data(hash_buf);
    const unsigned char *sig_data = (unsigned char *) Buffer::Data(sig_buf);

    unsigned int hash_len = Buffer::Length(hash_buf);
    unsigned int sig_len = Buffer::Length(sig_buf);

    if (hash_len != 32) {
      return VException("Argument 'hash' must be Buffer of length 32 bytes");
    }

    // Verify signature
    int result = key->VerifySignature(hash_data, hash_len, sig_data, sig_len);

    if (result == -1) {
      return VException("Error during ECDSA_verify");
    } else if (result == 0) {
      // Signature invalid
      return scope.Close(Boolean::New(false));
    } else if (result == 1) {
      // Signature valid
      return scope.Close(Boolean::New(true));
    } else {
      return VException("ECDSA_verify gave undefined return value");
    }
  }

  static Handle<Value>
  SignSync(const Arguments& args)
  {
    HandleScope scope;
    BitcoinKey* key = node::ObjectWrap::Unwrap<BitcoinKey>(args.This());
  
    if (args.Length() != 1) {
      return VException("One argument expected: hash");
    }
    if (!Buffer::HasInstance(args[0])) {
      return VException("Argument 'hash' must be of type Buffer");
    }
    if (!key->hasPrivate) {
      return VException("BitcoinKey does not have a private key set");
    }

    Handle<Object> hash_buf = args[0]->ToObject();

    const unsigned char *hash_data = (unsigned char *) Buffer::Data(hash_buf);

    unsigned int hash_len = Buffer::Length(hash_buf);

    if (hash_len != 32) {
      return VException("Argument 'hash' must be Buffer of length 32 bytes");
    }

    // Create signature
    ECDSA_SIG *sig = key->Sign(hash_data, hash_len);

    // Export DER
    unsigned int der_size = i2d_ECDSA_SIG(sig, NULL);
    if (!der_size) {
      // TODO: ERROR: "Error from i2d_ECPrivateKey(key->ec, NULL)"
      return scope.Close(Null());
    }
    unsigned char *der_begin, *der_end;
    der_begin = der_end = (unsigned char *)malloc(der_size);

    if (i2d_ECDSA_SIG(sig, &der_end) != der_size) {
      // TODO: ERROR: "Error from i2d_ECPrivateKey(key->ec, &der_end)"
      return scope.Close(Null());
    }
    Buffer *der_buf = Buffer::New(der_size);
    memcpy(Buffer::Data(der_buf), der_begin, der_size);

    free(der_begin);

    return scope.Close(der_buf->handle_);
  }
};

Persistent<FunctionTemplate> BitcoinKey::s_ct;


static Handle<Value>
pubkey_to_address256 (const Arguments& args)
{
  HandleScope scope;
  
  if (args.Length() != 1) {
    return VException("One argument expected: pubkey Buffer");
  }
  if (!Buffer::HasInstance(args[0])) {
    return VException("One argument expected: pubkey Buffer");
  }
  v8::Handle<v8::Object> pub_buf = args[0]->ToObject();
  
  unsigned char *pub_data = (unsigned char *) Buffer::Data(pub_buf);
  
  // sha256(pubkey)
  unsigned char hash1[SHA256_DIGEST_LENGTH];
  SHA256_CTX c;
  SHA256_Init(&c);
  SHA256_Update(&c, pub_data, Buffer::Length(pub_buf));
  SHA256_Final(hash1, &c);
  
  // ripemd160(sha256(pubkey))
  unsigned char hash2[RIPEMD160_DIGEST_LENGTH];
  RIPEMD160_CTX c2;
  RIPEMD160_Init(&c2);
  RIPEMD160_Update(&c2, hash1, SHA256_DIGEST_LENGTH);
  RIPEMD160_Final(hash2, &c2);
  
  // x = '\x00' + ripemd160(sha256(pubkey))
  // LATER: make the version an optional argument
  unsigned char address256[1 + RIPEMD160_DIGEST_LENGTH + 4];
  address256[0] = 0;
  memcpy(address256 + 1, hash2, RIPEMD160_DIGEST_LENGTH);
  
  // sha256(x)
  unsigned char hash3[SHA256_DIGEST_LENGTH];
  SHA256_CTX c3;
  SHA256_Init(&c3);
  SHA256_Update(&c3, address256, 1 + RIPEMD160_DIGEST_LENGTH);
  SHA256_Final(hash3, &c3);
  
  // address256 = (x + sha256(x)[:4])
  memcpy(
    address256 + (1 + RIPEMD160_DIGEST_LENGTH),
    hash3,
    4);
  
  Buffer *address256_buf = Buffer::New(1 + RIPEMD160_DIGEST_LENGTH + 4);
  memcpy(Buffer::Data(address256_buf), address256, 1 + RIPEMD160_DIGEST_LENGTH + 4);
  return scope.Close(address256_buf->handle_);
}


static const char* BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";


static Handle<Value>
base58_encode (const Arguments& args)
{
  HandleScope scope;
  
  if (args.Length() != 1) {
    return VException("One argument expected: a Buffer");
  }
  if (!Buffer::HasInstance(args[0])) {
    return VException("One argument expected: a Buffer");
  }
  v8::Handle<v8::Object> buf = args[0]->ToObject();
  
  unsigned char *buf_data = (unsigned char *) Buffer::Data(buf);
  int buf_length = Buffer::Length(buf);
  
  BN_CTX *ctx = BN_CTX_new();
  
  BIGNUM *bn = BN_bin2bn(buf_data, buf_length, NULL);
  
  BIGNUM *bn58 = BN_new();
  BN_set_word(bn58, 58);
  
  BIGNUM *bn0 = BN_new();
  BN_set_word(bn0, 0);
  
  BIGNUM *dv = BN_new();
  BIGNUM *rem = BN_new();
  
  // TODO: compute safe length
  char *str = new char[100];
  unsigned int c;
  int i, j, j2;
  
  i = 0;
  while (BN_cmp(bn, bn0) > 0) {
    if (!BN_div(dv, rem, bn, bn58, ctx)) {
      return VException("BN_div failed");
    }
    if (bn != dv) {
      BN_free(bn);
      bn = dv;
    }
    c = BN_get_word(rem);
    str[i] = BASE58_ALPHABET[c];
    i++;
  }
  
  // Leading zeros
  for (j = 0; j < buf_length; j++) {
    if (buf_data[j] != 0) {
      break;
    }
    str[i] = BASE58_ALPHABET[0];
    i++;
  }
  
  // Terminator
  str[i] = 0;
  
  // Reverse string
  int numSwaps = (i / 2);
  char tmp;
  for (j = 0; j < numSwaps; j++) {
    j2 = i - 1 - j;
    tmp = str[j];
    str[j] = str[j2];
    str[j2] = tmp;
  }
  
  BN_free(bn);
  BN_free(bn58);
  BN_free(bn0);
  BN_free(rem);
  BN_CTX_free(ctx);
  
  Local<String> ret = String::New(str);
  delete [] str;
  return scope.Close(ret);
}


static Handle<Value>
base58_decode (const Arguments& args)
{
  HandleScope scope;
  
  if (args.Length() != 1) {
    return VException("One argument expected: a String");
  }
  if (!args[0]->IsString()) {
    return VException("One argument expected: a String");
  }
  
  BN_CTX *ctx = BN_CTX_new();
  
  BIGNUM *bn58 = BN_new();
  BN_set_word(bn58, 58);
  
  BIGNUM *bn = BN_new();
  BN_set_word(bn, 0);

  BIGNUM *bnChar = BN_new();

  String::Utf8Value str(args[0]->ToString());
  char *psz = *str;
  
  while (isspace(*psz))
    psz++;
  
  // Convert big endian string to bignum
  for (const char* p = psz; *p; p++) {
    const char* p1 = strchr(BASE58_ALPHABET, *p);
    if (p1 == NULL) {
      while (isspace(*p))
        p++;
      if (*p != '\0')
        return VException("Error");
      break;
    }
    BN_set_word(bnChar, p1 - BASE58_ALPHABET);
    if (!BN_mul(bn, bn, bn58, ctx))
      return VException("BN_mul failed");
    if (!BN_add(bn, bn, bnChar))
      return VException("BN_add failed");
  }

  // Get bignum as little endian data
  unsigned int tmpLen = BN_num_bytes(bn);
  unsigned char *tmp = (unsigned char *)malloc(tmpLen);
  BN_bn2bin(bn, tmp);

  // Trim off sign byte if present
  if (tmpLen >= 2 && tmp[tmpLen-1] == 0 && tmp[tmpLen-2] >= 0x80)
    tmpLen--;
  
  // Restore leading zeros
  int nLeadingZeros = 0;
  for (const char* p = psz; *p == BASE58_ALPHABET[0]; p++)
    nLeadingZeros++;

  // Allocate buffer and zero it
  Buffer *buf = Buffer::New(nLeadingZeros + tmpLen);
  char* data = Buffer::Data(buf);
  memset(data, 0, nLeadingZeros + tmpLen);
  memcpy(data+nLeadingZeros, tmp, tmpLen);

  BN_free(bn58);
  BN_free(bn);
  BN_free(bnChar);
  BN_CTX_free(ctx);
  free(tmp);

  return scope.Close(buf->handle_);
}


int static FormatHashBlocks(void* pbuffer, unsigned int len)
{
  unsigned char* pdata = (unsigned char*)pbuffer;
  unsigned int blocks = 1 + ((len + 8) / 64);
  unsigned char* pend = pdata + 64 * blocks;
  memset(pdata + len, 0, 64 * blocks - len);
  pdata[len] = 0x80;
  unsigned int bits = len * 8;
  pend[-1] = (bits >> 0) & 0xff;
  pend[-2] = (bits >> 8) & 0xff;
  pend[-3] = (bits >> 16) & 0xff;
  pend[-4] = (bits >> 24) & 0xff;
  return blocks;
}

static Handle<Value>
sha256_midstate (const Arguments& args)
{
  HandleScope scope;

  if (args.Length() != 1) {
    return VException("One argument expected: data Buffer");
  }
  if (!Buffer::HasInstance(args[0])) {
    return VException("One argument expected: data Buffer");
  }
  v8::Handle<v8::Object> blk_buf = args[0]->ToObject();

  // Reserve 64 extra bytes of memory for padding
  unsigned int blk_len = Buffer::Length(blk_buf);
  unsigned char *blk_data = (unsigned char *) malloc(blk_len + 64);

  // Get block header
  memcpy(blk_data, Buffer::Data(blk_buf), blk_len);

  // Add SHA256 padding
  FormatHashBlocks(blk_data, blk_len);

  // Execute first half of first hash on block data
  SHA256_CTX c;
  SHA256_Init(&c);
  SHA256_Transform(&c, blk_data);

  // Note that we don't run SHA256_Final and return the middle state instead

  Buffer *midstate_buf = Buffer::New(SHA256_DIGEST_LENGTH);
  memcpy(Buffer::Data(midstate_buf), &c.h, SHA256_DIGEST_LENGTH);

  free(blk_data);

  return scope.Close(midstate_buf->handle_);
}


extern "C" void
init (Handle<Object> target)
{
  HandleScope scope;
  BitcoinKey::Init(target);
  target->Set(String::New("pubkey_to_address256"), FunctionTemplate::New(pubkey_to_address256)->GetFunction());
  target->Set(String::New("base58_encode"), FunctionTemplate::New(base58_encode)->GetFunction());
  target->Set(String::New("base58_decode"), FunctionTemplate::New(base58_decode)->GetFunction());
  target->Set(String::New("sha256_midstate"), FunctionTemplate::New(sha256_midstate)->GetFunction());
}
