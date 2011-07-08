bitcoinjs-bch-import(1) -- import blockchain data
=================================================

## SYNOPSIS

    bitcoinjs bch-import

## DESCRIPTION

Imports block chain data from compressed bson dump files into the
database.

It will look for three files in the current working directory:

 * `blocks.bson.bz2`
   Contains the block headers.
 * `transaction.bson.bz2`
   Contains the transactions.
 * `accounts.bson.bz2`
   Contains the index of transactions by account.

The dump are created using the export utility. See `bitcoinjs help
bch-export`.

## SEE ALSO

* bitcoinjs-bch-export(1)
