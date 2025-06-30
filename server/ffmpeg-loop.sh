#!/bin/bash

mkdir -p ./hls
ffmpeg -re -stream_loop -1 -i ./video/Sloths.mp4 \
  -c:v libx265 -tag:v hvc1 -preset veryfast -x265-params crf=28 \
  -f hls \
  -hls_time 2 -hls_list_size 6 \
  -hls_flags delete_segments+program_date_time \
  -hls_segment_filename ./hls/seg_%03d.ts \
  ./hls/stream.m3u8