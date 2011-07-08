bitcoinjs-bch-export(1) -- export blockchain data
=================================================

## SYNOPSIS

    bitcoinjs bch-export

## DESCRIPTION

Extracts the block chain as it's currently stored in the database and
compresses the resulting bson files using bzip2.

It will create three files:

 * `blocks.bson.bz2`
   Contains the block headers.
 * `transaction.bson.bz2`
   Contains the transactions.
 * `accounts.bson.bz2`
   Contains the index of transactions by account.

The data extracted this way can also be imported back into the
database of course. See `bitcoinjs help bch-import`.

## SEE ALSO

* bitcoinjs-bch-import(1)
