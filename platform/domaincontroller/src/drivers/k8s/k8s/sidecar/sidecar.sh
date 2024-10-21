#!/bin/bash

# Script used for controlling instance inputs/outputs
# as a k8s sidecar container
#
# Author: Javier Esparza-Peidro <jesparza@dsic.upv.es>

SCRIPT_PATH=`realpath $0`
SCRIPT_ROOT=`dirname $SCRIPT_PATH`
LOG_PATH=${SCRIPT_ROOT}/log
touch $LOG_PATH

TS=$(date +%s)
echo "$TS - $*"  >> $LOG_PATH