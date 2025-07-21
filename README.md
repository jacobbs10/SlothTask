# 🦥 SlothTask: Live HLS Streaming with Real-Time Latency and Performance Monitoring

This project creates a live-looping HLS video stream (HEVC/H.265) and provides a modern React dashboard to visualize playback latency and real-time stream performance metrics. The stack features a Node.js/Express server, FFmpeg for video processing, and a sophisticated React frontend with charts and analytics.

---

## 📁 Project Structure

```
SlothTask/
│
├── server/
│   ├── server.js            # Express server for HLS, API, WebSocket, CORS, and static assets
│   ├── public/
│   │   ├── streams/         # Directory for output HLS segment playlists (.m3u8, .ts)
│   │   └── segments/        # (If used) Additional segment storage
│   ├── video/
│   │   └── Sloths.mp4       # Source video file (mount or provide)
│
├── client/
│   ├── public/
│   └── src/
│       ├── App.jsx          # Main React SPA: video player, latency, metrics, controls
│       ├── Perf.js          # Performance dashboard: charts, recommendations, score
│       └── index.js         # App entry
│
├── dev.js                   # Development launcher for client/server
├── Dockerfile               # Multi-service Docker build (server + client + ffmpeg)
├── README.md
```

---

## 🛠️ Requirements

- Node.js (v18+) & npm
- FFmpeg (locally for development, installed in Docker for prod)
- Docker (optional, for all-in-one build)
- React (already bootstrapped in `/client`)
- (Optional) [hls.js](https://github.com/video-dev/hls.js) for client-side playback

---

## 🚀 Setup & Usage

### 1. Install FFmpeg

- **macOS:** `brew install ffmpeg`
- **Ubuntu:** `sudo apt install ffmpeg`
- **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

### 2. Install Dependencies

#### Server

```bash
cd server
npm install
```

#### Client

```bash
cd ../client
npm install
```

### 3. Add Source Video

Place your video file at `server/video/Sloths.mp4` (or use the default if running via Docker).

### 4. Start the Services

#### Development (with live reload):

```bash
# From repo root
node dev.js
```
- Starts the server (`server/server.js`) on port 8000.
- Starts React client (`client/src/App.jsx`) on port 3000.

#### Production:

```bash
cd server
npm run build
node server.js
```

### 5. Access the App

- **Frontend:** http://localhost:3000
- **Backend (API, HLS):** http://localhost:8000
- **HLS Playlist Example:** http://localhost:8000/streams/broadcasting/playlist.m3u8

---

## 🖥️ Features

- **Multi-quality HLS Streaming:** (720p/1080p/4K) with network-aware codec selection.
- **HEVC Support:** Uses H.265 encoding (browser/device support required).
- **Live Latency Measurement:** Client fetches server time, compares with video playback, and displays exact latency in real time.
- **Performance Dashboard:** 
  - Real-time charts for latency, memory, CPU, throughput, and viewer distribution.
  - Performance score and recommendations.
  - Viewer/stream statistics and uptime.
- **WebSocket Metrics:** All performance/metrics data is pushed live to the frontend via WebSocket.
- **CORS:** Server is CORS-enabled for client connections.
- **Dockerfile:** All-in-one build for production (installs deps, builds client, runs server, prepares video).

---

## 🐳 Docker Usage

Build and run the full stack in one container:

```bash
docker build -t slothtask .
docker run -p 8000:8000 slothtask
# By default, React is served statically on :8000, HLS on :8000/streams/
```
- To use your own video: `-v $(pwd)/server/video:/app/server/video`

---

## ☁️ Deployment

- **Server:** Can be deployed to Render.com, AWS, or any Node.js-capable host.
- **Client:** Serves statically from the same Express server in production.

Demo URLs (if available):
- Server: https://slothtask-s.onrender.com
- Client: https://slothtask-c.onrender.com

---

## 🧾 .gitignore

Recommended to ignore large/video files and generated HLS segments:

```
*.mp4
server/public/streams/*
server/public/segments/*
```

---

## 🐞 Troubleshooting

- **Video Not Loading:** Ensure browser supports H.265/HEVC (Safari is recommended). For Chrome/Firefox, use a compatible plugin or hardware.
- **CORS Errors:** The server sets `Access-Control-Allow-Origin: *` by default, but can be restricted for production.
- **FFmpeg Not Found:** Ensure it’s in your `$PATH` or use Docker build.
- **Windows Users:** Use Git Bash or WSL for shell scripts and Docker.
- **No video at `server/video/Sloths.mp4`:** Add your own file or let Docker auto-generate a sample.

---

## ✨ Enjoy watching the world’s laziest live stream with full analytics!