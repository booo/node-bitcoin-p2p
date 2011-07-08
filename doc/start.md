bitcoinjs-start(1) -- run daemon in background
==============================================

## SYNOPSIS

    bitcoinjs start [<args>] [-- <daemon-args>]

## OPTIONS

  * `-m` <times>:
    Only run the daemon a maximum of <times> times.

  * `-l` <logfile>:
    Log the output of the daemon manager to <logfile>.

  * `-o` <outfile>:
    Log the output of the daemon to <outfile>.

  * `-e` <errfile>:
    Log the stderr output of the daemon to <errfile>.

  * `-p` <path>:
    Base path for the daemon manager (for pid files, etc.).

  * `-c` <command>:
    Command to execute as the interpreter (default: node).

  * `-a`:
    Append logs.

  * `--pidfile`=<pidfile>:
    Path to the pidfile.

  * `--minUptime`=<uptime>:
    Minimum uptime (milliseconds) for the daemon to not be considered
    "spinning".

  * `--spinSleepTime`=<delay>:
    Time to wait (milliseconds) between launches when daemon is
    spinning.

  * `-d`, `--debug`:
    Forces the daemon manager to log debug output.

  * `-v`, `--verbose`:
    Turns on the verbost messages from the daemon manager.

  * `-s`, `--silent`:
    Run the daemon silencing stdout and stderr.

  * `-h`, `--help`:
    Inline command help. Warning the help is from an internal tool and
    not quite accurate, please refer to this manpage instead.

## DESCRIPTION

This command starts and daemonizes a manager process which in turn
starts a process containing the BitcoinJS daemon. If the daemon stops
or crashes, the daemon manager will automatically restart it.

You can pass arguments both to the daemon manager and the daemon
itself. The daemon manager arguments must come first. If you want to
pass arguments to the daemon, add the delimiter `--` and then the
arguments for the daemon. To find out what arguments the daemon
accepts, please see `bitcoinjs help run`.

## SEE ALSO

* bitcoinjs-run(1)
* bitcoinjs-stop(1)
* bitcoinjs-restart(1)
* bitcoinjs-list(1)

