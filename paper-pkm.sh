#!/bin/sh
cd "$(dirname "$(readlink -f "$0")")" && exec npx electron . "$@"
