#!/bin/bash

mkdir -p ./hls
ffmpeg -re -stream_loop -1 -i ./video/Sloths.mp4 \
  -fflags +genpts \
  -c:v libx265 -tag:v hvc1 -preset veryfast \
  -x265-params "crf=28:keyint=48:min-keyint=48:scenecut=0" \
  -c:a aac -b:a 128k \
  -f hls \
  -hls_time 2 -hls_list_size 5 \
  -hls_flags delete_segments+program_date_time \
  -hls_segment_filename ./hls/seg_%03d.ts \
  ./hls/stream.m3u8