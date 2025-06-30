#!/bin/bash

# Create HLS output folder
mkdir -p public/hls

# Run ffmpeg to create looping stream (runs in background)
ffmpeg -stream_loop -1 -re -i ./video/Sloths.mp4 \
  -c:v libx265 -preset veryfast -x265-params log-level=error \
  -f hls -hls_time 2 -hls_list_size 5 -hls_flags delete_segments \
  -hls_segment_filename public/hls/stream_%03d.ts public/hls/stream.m3u8 &

# Start your Node server (update if needed)
node server.js