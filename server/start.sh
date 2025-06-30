#!/bin/bash

# Create HLS output directory
mkdir -p ./hls

# Clean old segments if any
rm -f ./hls/*.ts ./hls/*.m3u8

# Start FFmpeg in background and redirect output
chmod +x ./ffmpeg-loop.sh
./ffmpeg-loop.sh &

# Optionally wait for FFmpeg to initialize
sleep 2

# Start Node.js server
node server.js