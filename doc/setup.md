bitcoinjs-setup(1) -- install mod dependencies
==============================================

## SYNOPSIS

    bitcoinjs setup <modname>

## OPTIONS

  * `<modname>`:
    You must specify a mod whose dependencies are to be installed.

    To get a list of available mods, look in the mods/ folder in your
    bitcoinjs installation.

## DESCRIPTION

This command takes a module name and installs any Node.js packages
this mod needs using NPM.

You need to make sure you have adequate permissions for this
operation. At a minimum, you need write permission to the
mods/<modname>/node_modules folder or - if it doesn't exist - the
mods/<modname/ folder so that it can be created.

## SEE ALSO

* bitcoinjs-run(1)

