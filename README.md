# 🦥 Sloth Live HLS Stream with Latency Measurement

This project sets up a live-looping HLS video stream of a sloth using H.265 (HEVC) encoding and visualizes the latency between the server and the client playback. Built with Node.js, FFmpeg, and a React frontend.

## 📁 Project Structure

```
sloth-streaming-project/
│
├── server/
│   ├── server.js             # Express server serving HLS stream with CORS headers
│   ├── ffmpeg-loop.sh        # Shell script looping MP4 as live HLS stream
│   ├── hls/                  # Folder for output HLS segments
│   ├── video/
│       └── Sloths.mp4         # Video file (should be mounted in Docker)
│
├── client/
│   ├── public/
│   └── src/
│       ├── App.js            # React component to play video & show latency
│       └── index.js
│
└── Dockerfile               # For running the server containerized
```

## 🛠️ Requirements

- Node.js + npm
- FFmpeg (must be installed locally)
- Docker (for bonus packaging)
- React (create via `npx create-react-app client`)

## 🚀 Instructions

### 1. Install FFmpeg

Install FFmpeg locally (required for the stream).

- macOS: `brew install ffmpeg`
- Ubuntu: `sudo apt install ffmpeg`
- Windows: Use Git Bash and [download FFmpeg](https://ffmpeg.org/download.html), and add it to your PATH.

### 2. Server Setup

```
cd server
npm install
npm install express
npm install cors
chmod +x ffmpeg-loop.sh
./ffmpeg-loop.sh & node server.js
```

> This will start generating HLS segments into `/hls` and serve them on `http://localhost:8000/hls/stream.m3u8`.

### 3. React Client

Create a React app (if not already):

```
npx create-react-app client
cd client
npm install hls.js
```

React App:

- Plays the HLS stream
- Fetches server time every second and compares with `video.currentTime` to estimate latency

Run the React app:

```
npm start
```

The video will play and the **latency in seconds** will be displayed under it.

### 4. Docker Bonus

To build and run the server in a container:

```
docker build -t sloth-stream .
docker run -v $(pwd)/server:/app -p 8000:8000 sloth-stream
```

### 5. Deployment Bonus

You can deploy:

- The **server** mounted on Render.com - https://slothtask-s.onrender.com
- The **client** mounted on render https://slothtask-c.onrender.com/

## 🔥 Notes

- The stream uses HLS v1 with H.265 codec (`libx265`). Your browser **must support H.265**, or use a compatible device (e.g., Safari on Mac).
- Due to CORS, the server sets `Access-Control-Allow-Origin: *`.

## 🧾 .gitignore Tip

To avoid committing large media files:

```
*.mp4
server/hls/*
```

## 🐞 Troubleshooting

- **Video not loading (CORS)**: Make sure Express server adds CORS headers.
- **FFmpeg error `Stream HEVC is not hvc1`**: Add `-tag:v hvc1` to ffmpeg command.
- **Windows issues**: Run using Git Bash or WSL. Use `bash ffmpeg-loop.sh & node server.js`.

---

Enjoy watching the world’s laziest live stream in real time!# SlothTask
Sloth task for webiks
