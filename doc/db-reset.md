bitcoinjs-db-reset(1) -- delete all data
========================================

## SYNOPSIS

    bitcoinjs db-reset [--config=<path>]

## OPTIONS

  * `-c` <file>, `--config`=<file>:
    Path to config file.

  * `-h`, `--help`:
    Inline command help.

## DESCRIPTION

Delete's all collections (tables) from the mongodb database. You need
to run this command if you want to switch networks.

Note that it is recommended that you reset the database and
re-download the block chain when upgrading bitcoin-p2p.
