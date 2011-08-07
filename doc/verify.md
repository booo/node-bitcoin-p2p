bitcoinjs-verify(1) -- validate block chain
===========================================

## SYNOPSIS

    bitcoinjs verify [--config=<path>]

## OPTIONS

  * `-c` <file>, `--config`=<file>:
    Path to config file.

  * `-h`, `--help`:
    Inline command help.

## DESCRIPTION

This tool allows you to verify the block chain in its current state in
the database. It will check whether your top block has the correct
hash according to a set of web-based services (such as Block
Explorer).

Once the top hash has been confirmed, the validation tool will verify
all hashes (blocks and transactions) in your database, effectively
proving that your block chain is 100% accurate up to your current top
block.

Note that the verify tool does not require your block chain to be
up-to-date. You can verify the chain at any time and the validation
tool only checks that your chain is valid up to that point. Once you
connect to the peer-to-peer network, BitcoinJS will automatically
request a download of the remaining blocks.
