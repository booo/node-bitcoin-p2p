bitcoinjs-test(1) -- unit tests
===============================

## SYNOPSIS

    bitcoinjs test [--json | --xunit | --dot-matrix]

## OPTIONS

  * `-v`, `--verbose`:
    Enable verbose output.

  * `-w`, `--watch`:
    Keep watching files for changes.

  * `-s`, `--silent`:
    Don't print a report.

  * `-m` <pattern>:
    Only run tests matching this string.

  * `-m` <pattern>:
    Only run tests matching this regular expression.

  * --json`:
    Display the results in JSON format.

  * --spec`:
    Display the results in specification format (default).

  * --dot-matrix`:
    Display the results as a dot matrix.

  * --xunit`:
    Display the results in XUnit format.

  * --version`:
    Print version.

  * `-h`, `--help`:
    This help file.

## DESCRIPTION

Runs the unit tests included with BitcoinJS. You can use this to make
sure everything is set up right.

Note that the tests rely on a mongodb database running on localhost.

