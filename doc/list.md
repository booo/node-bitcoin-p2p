bitcoinjs-list(1) -- list daemon processes
==========================================

## SYNOPSIS

    bitcoinjs list

## DESCRIPTION

This command shows a list of currently running BitcoinJS daemon
processes.

## OUTPUT FORMAT

Here is some example output from `bitcoinjs list`:

    info: Running action: list
    info: Forever processing file: daemon/start.js
    info: Forever processes running
      [0] node daemon/start.js [5261, 5260] /var/log/V620.log 0:0:0:2.903

 * `[0]`
   ID of the process, can be used to refer to the process when
   stopping or restarting. See `bitcoinjs help stop`.
 * `node`:
   Interpreter, usually "node".
 * `daemon/start.js`:
   Here will be displayed the startup script. For bitcoinjs-server
   this is daemon/start.js.
 * `[5261, 5260]`:
   This are the process IDs. 5260 is the manager process and 5261 the
   actual daemon process.
 * `/var/log/V620.log`:
   The daemon's log file. Try tuning in to the ongoing logging using
   `tail -f <logfile>` (replace <logfile> with the log file path.
 * `0:0:0:2.903`:
   Uptime of the process.

## SEE ALSO

* bitcoinjs-run(1)
* bitcoinjs-start(1)
* bitcoinjs-stop(1)
* bitcoinjs-restart(1)

