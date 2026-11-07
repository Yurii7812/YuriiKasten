#!/bin/sh
cd "$(dirname "$(readlink -f "$0")")" && npx esbuild src/app.js --bundle --outfile=dist/app.js --format=iife --log-level=warning && exec npx electron . "$@"
