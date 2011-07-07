bitcoinjs-db-drop(1) -- delete database
=======================================

## SYNOPSIS

    bitcoinjs db-drop [--config=<path>]

## OPTIONS

  * `-c` <file>, `--config`=<file>:
    Path to config file.

  * `-h`, `--help`:
    Inline command help.

## DESCRIPTION

Runs MongoDB's dropDatabase on the configured database. This may take
a second as any space reserved by that database is freed.

Together with `npm rm bitcoin-p2p -g` this should result in a complete
uninstallation.
