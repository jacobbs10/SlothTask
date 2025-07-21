const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure video directory exists
const videoDir = path.join(__dirname, 'server', 'video');
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir, { recursive: true });
  console.log('Created video directory');
}

// Check if sample video exists
const videoPath = path.join(videoDir, 'Sloths.mp4');
if (!fs.existsSync(videoPath)) {
  console.log('No sample video found. You should add a video file at server/video/Sloths.mp4');
}

// Start both client and server
console.log('Starting development environment...');
console.log('Starting server on port 8000...');
execSync('cd server && npm run dev', { stdio: 'inherit' });