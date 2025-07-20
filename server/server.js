const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { performance } = require('perf_hooks');

const app = express();
const port = process.env.PORT || 8000;

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket server on the same HTTP server
const wss = new WebSocket.Server({ 
  server,
  path: '/ws',
  // Add WebSocket CORS settings
  verifyClient: (info, cb) => {
    // Accept connections from any origin in development
    // In production, you can restrict this if needed
    cb(true);
  }
});

// Middleware
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('public'));

// Stream configurations
const streamConfigs = {
  social: {
    resolution: '720x404',
    bitrate: '1000k',
    fps: 24,
    preset: 'ultrafast',
    profile: 'baseline',
    level: '3.1',
    segmentTime: 2
  },
  broadcasting: {
    resolution: '1920x1080',
    bitrate: '3000k',
    fps: 30,
    preset: 'medium',
    profile: 'main',
    level: '4.0',
    segmentTime: 2
  },
  cinema: {
    resolution: '3840x2160',
    bitrate: '8000k',
    fps: 60,
    preset: 'slow',
    profile: 'high',
    level: '5.1',
    segmentTime: 2
  }
};

// Global variables
let activeStreams = new Map();
let streamMetrics = {
  startTime: null,
  segmentCount: 0,
  viewerCount: 0,
  latencyBoundary: 3000, // 3 seconds default
  currentLatency: 0
};

let perStreamStats = {
  social: {
    segmentCount: 0,
    latency: 0,
    latencyBoundary: 3000,
    startTime: null,
    viewers: 0,
    lastSegmentTime: null,
    streamStartTime: null
  },
  broadcasting: {
    segmentCount: 0,
    latency: 0,
    latencyBoundary: 3000,
    startTime: null,
    viewers: 0,
    lastSegmentTime: null,
    streamStartTime: null
  },
  cinema: {
    segmentCount: 0,
    latency: 0,
    latencyBoundary: 3000,
    startTime: null,
    viewers: 0,
    lastSegmentTime: null,
    streamStartTime: null
  }
};

// Ensure directories exist
const ensureDirectories = () => {
  const dirs = ['./public/streams', './public/segments'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Network-aware codec selection
const selectCodec = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const connection = req.headers['connection-type'] || 'unknown';
  
  // Simple heuristic for codec selection
  if (userAgent.includes('Mobile') || connection === 'cellular') {
    return 'libx264'; // H.264 for mobile/cellular
  } else if (userAgent.includes('Chrome') && !userAgent.includes('Mobile')) {
    return 'libx265'; // H.265 for modern desktop browsers
  }
  return 'libx264'; // Default to H.264
};

// Calculate accurate HLS latency
const calculateHLSLatency = (quality) => {
  try {
    const playlistPath = path.join(__dirname, 'public', 'streams', quality, 'playlist.m3u8');
    if (!fs.existsSync(playlistPath)) return null;
    
    const content = fs.readFileSync(playlistPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    let segments = [];
    let currentSegment = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        const duration = parseFloat(line.replace('#EXTINF:', '').split(',')[0]);
        currentSegment = { duration };
      } else if (line.endsWith('.ts') && currentSegment) {
        currentSegment.filename = line;
        segments.push(currentSegment);
        currentSegment = null;
      }
    }
    
    if (segments.length === 0) return null;
    
    // Get the last segment file stats to determine when it was created
    const lastSegment = segments[segments.length - 1];
    const segmentPath = path.join(__dirname, 'public', 'streams', quality, lastSegment.filename);
    
    if (!fs.existsSync(segmentPath)) return null;
    
    const segmentStats = fs.statSync(segmentPath);
    const segmentCreationTime = segmentStats.mtime.getTime();
    const now = Date.now();
    
    // Calculate total playlist duration
    const totalPlaylistDuration = segments.reduce((sum, seg) => sum + seg.duration, 0) * 1000;
    
    // HLS latency calculation:
    // Latency = time since last segment was created + duration of segments in playlist
    // This represents how far behind live the viewer is
    const timeSinceLastSegment = now - segmentCreationTime;
    const estimatedLatency = timeSinceLastSegment + totalPlaylistDuration;
    
    return estimatedLatency;
  } catch (err) {
    console.error(`Error calculating latency for ${quality}:`, err);
    return null;
  }
};

// Monitor segment creation for latency tracking
const monitorSegments = (quality, outputPath) => {
  const segmentDir = outputPath;
  
  // Watch for new segment files
  if (fs.existsSync(segmentDir)) {
    fs.watch(segmentDir, (eventType, filename) => {
      if (eventType === 'rename' && filename && filename.endsWith('.ts')) {
        const now = Date.now();
        perStreamStats[quality].lastSegmentTime = now;
        perStreamStats[quality].segmentCount++;
        
        // Calculate and update latency
        const calculatedLatency = calculateHLSLatency(quality);
        if (calculatedLatency !== null) {
          perStreamStats[quality].latency = calculatedLatency;
          
          // Broadcast latency update
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'latency',
                latency: calculatedLatency,
                boundary: perStreamStats[quality].latencyBoundary,
                quality: quality,
                timestamp: now
              }));
            }
          });
        }
      }
    });
  }
};

// Create HLS stream
const createHLSStream = (config, quality, codec = 'libx264') => {
  const outputPath = `./public/streams/${quality}`;
  const playlistPath = `${outputPath}/playlist.m3u8`;
  
  // Create output directory
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  const command = ffmpeg('./video/Sloths.mp4')
    .inputOptions([
      '-re', // Read input at native frame rate
      '-stream_loop', '-1', // Loop indefinitely
      '-fflags', '+genpts' // Generate presentation timestamps
    ])
    .videoCodec(codec)
    .audioCodec('aac')
    .videoBitrate(config.bitrate)
    .fps(config.fps)
    .size(config.resolution)
    .outputOptions([
      '-preset', config.preset,
      '-profile:v', config.profile,
      '-level', config.level,
      '-g', '30', // GOP size
      '-sc_threshold', '0', // Disable scene change detection
      '-force_key_frames', 'expr:gte(t,n_forced*2)', // Keyframe every 2 seconds
      '-hls_time', config.segmentTime.toString(), // Segment duration
      '-hls_list_size', '6', // Keep 6 segments for lower latency
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', `${outputPath}/segment_%03d.ts`,
      '-hls_start_number_source', 'datetime', // Use datetime for segment numbering
      '-f', 'hls'
    ])
    .output(playlistPath)
    .on('start', (commandLine) => {
      console.log(`Started ${quality} stream: ${commandLine}`);
      const now = Date.now();
      streamMetrics.startTime = now;
      perStreamStats[quality].startTime = now;
      perStreamStats[quality].streamStartTime = now;
      perStreamStats[quality].segmentCount = 0;
      
      // Start monitoring segments for this quality
      monitorSegments(quality, outputPath);
    })
    .on('progress', (progress) => {
      // Update basic metrics
      const now = Date.now();
      
      // Calculate more accurate latency based on actual HLS playlist
      const calculatedLatency = calculateHLSLatency(quality);
      if (calculatedLatency !== null) {
        perStreamStats[quality].latency = calculatedLatency;
        streamMetrics.currentLatency = calculatedLatency; // Update global metric too
      }
      
      // Log progress every 10 seconds
      if (progress.percent && Math.floor(progress.percent) % 10 === 0) {
        console.log(`${quality} stream progress: ${progress.percent}% - Latency: ${perStreamStats[quality].latency}ms`);
      }
    })
    .on('error', (err) => {
      console.error(`Error in ${quality} stream:`, err);
      // Restart stream on error
      setTimeout(() => {
        console.log(`Restarting ${quality} stream...`);
        createHLSStream(config, quality, codec);
      }, 5000);
    });

  return command;
};

// Initialize streams
const initializeStreams = () => {
  ensureDirectories();
  
  Object.entries(streamConfigs).forEach(([quality, config]) => {
    const codec = selectCodec({ headers: { 'user-agent': 'server' } });
    const stream = createHLSStream(config, quality, codec);
    activeStreams.set(quality, stream);
    stream.run();
  });
};

// Routes
app.get('/api/stream/:quality', (req, res) => {
  const { quality } = req.params;
  const codec = selectCodec(req);
  
  if (!streamConfigs[quality]) {
    return res.status(400).json({ error: 'Invalid quality setting' });
  }

  // If stream doesn't exist, create it
  if (!activeStreams.has(quality)) {
    const stream = createHLSStream(streamConfigs[quality], quality, codec);
    activeStreams.set(quality, stream);
    stream.run();
  }

  res.json({
    success: true,
    playlistUrl: `/streams/${quality}/playlist.m3u8`,
    quality,
    codec
  });
});

app.get('/api/metrics', (req, res) => {
  // Update latency for all active streams
  Object.keys(streamConfigs).forEach(quality => {
    const latency = calculateHLSLatency(quality);
    if (latency !== null) {
      perStreamStats[quality].latency = latency;
    }
  });

  res.json({
    ...streamMetrics,
    activeStreams: Array.from(activeStreams.keys()),
    uptime: streamMetrics.startTime ? Date.now() - streamMetrics.startTime : 0,
    perStream: perStreamStats
  });
});

app.get('/api/latency/:quality', (req, res) => {
  const { quality } = req.params;
  
  if (!streamConfigs[quality]) {
    return res.status(400).json({ error: 'Invalid quality setting' });
  }
  
  const latency = calculateHLSLatency(quality);
  
  res.json({
    quality,
    latency: latency !== null ? latency : perStreamStats[quality].latency,
    boundary: perStreamStats[quality].latencyBoundary,
    timestamp: Date.now()
  });
});

app.post('/api/latency-boundary', (req, res) => {
  const { boundary, quality } = req.body;
  
  if (boundary && boundary > 0) {
    if (quality && streamConfigs[quality]) {
      perStreamStats[quality].latencyBoundary = boundary;
    } else {
      // Set for all streams if no specific quality provided
      streamMetrics.latencyBoundary = boundary;
      Object.keys(perStreamStats).forEach(q => {
        perStreamStats[q].latencyBoundary = boundary;
      });
    }
    res.json({ success: true, boundary, quality: quality || 'all' });
  } else {
    res.status(400).json({ error: 'Invalid boundary value' });
  }
});

app.get('/api/performance', (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  res.json({
    memory: {
      rss: (memUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
      heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
      heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
      external: (memUsage.external / 1024 / 1024).toFixed(2) + ' MB'
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    uptime: process.uptime(),
    viewers: streamMetrics.viewerCount,
    streams: activeStreams.size
  });
});

// Add a health check endpoint for testing connectivity
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    wsClients: wss.clients.size
  });
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  console.log(`New WebSocket connection from ${req.socket.remoteAddress}`);
  streamMetrics.viewerCount++;
  
  // Send initial data immediately upon connection
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const initialData = {
    type: 'performance',
    perStream: { /* Your stream data here */ },
    timestamp: Date.now()
  };
  
  try {
    ws.send(JSON.stringify(initialData));
    console.log('Sent initial performance data to new client');
  } catch (err) {
    console.error('Error sending initial data:', err);
  }
  
  // Send initial latency data for all streams
  Object.keys(streamConfigs).forEach(quality => {
    const latency = calculateHLSLatency(quality);
    if (latency !== null) {
      ws.send(JSON.stringify({
        type: 'latency',
        latency: latency,
        boundary: perStreamStats[quality].latencyBoundary,
        quality: quality,
        timestamp: Date.now()
      }));
    }
  });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received WebSocket message:', data);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ 
          type: 'pong', 
          timestamp: Date.now(),
          client: data.client || 'unknown'
        }));
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket client error:', error);
  });
  
  ws.on('close', () => {
    streamMetrics.viewerCount--;
    console.log(`Viewer disconnected. Total: ${streamMetrics.viewerCount}`);
  });
});

// Periodically calculate and broadcast latency updates
setInterval(() => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const qualities = Object.keys(streamConfigs);
  const perStreamMetrics = {};

  qualities.forEach(quality => {
    // Calculate latency
    const calculatedLatency = calculateHLSLatency(quality);
    if (calculatedLatency !== null) {
      perStreamStats[quality].latency = calculatedLatency;
    }

    // --- Throughput calculation ---
    // Store previous values on the stats object
    if (!perStreamStats[quality].lastSegmentCount) perStreamStats[quality].lastSegmentCount = 0;
    if (!perStreamStats[quality].lastThroughputCheck) perStreamStats[quality].lastThroughputCheck = Date.now();

    const now = Date.now();
    const timeElapsed = (now - perStreamStats[quality].lastThroughputCheck) / 1000; // seconds
    const segmentsProduced = perStreamStats[quality].segmentCount - perStreamStats[quality].lastSegmentCount;
    const segmentsPerSec = timeElapsed > 0 ? segmentsProduced / timeElapsed : 0;

    perStreamStats[quality].lastSegmentCount = perStreamStats[quality].segmentCount;
    perStreamStats[quality].lastThroughputCheck = now;
    // -----------------------------

    perStreamMetrics[quality] = {
      memory: {
        rss: (memUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        external: (memUsage.external / 1024 / 1024).toFixed(2) + ' MB'
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: perStreamStats[quality].startTime ? (Date.now() - perStreamStats[quality].startTime) / 1000 : 0,
      viewers: perStreamStats[quality].viewers || 0,
      streams: activeStreams.size,
      latency: perStreamStats[quality].latency,
      segmentCount: perStreamStats[quality].segmentCount,
      latencyBoundary: perStreamStats[quality].latencyBoundary,
      lastSegmentTime: perStreamStats[quality].lastSegmentTime,
      segmentsPerSec // <-- Add this line
    };
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'performance',
        perStream: perStreamMetrics,
        timestamp: Date.now()
      }));
    }
  });
}, 2000); // every 2 seconds

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  
  // Stop all streams
  activeStreams.forEach((stream, quality) => {
    console.log(`Stopping ${quality} stream...`);
    stream.kill('SIGTERM');
  });
  
  // Close WebSocket server
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  process.exit(0);
});

// Start server
server.listen(port, () => {
  console.log(`HLS streaming server running on port ${port}`);
  initializeStreams();
});

module.exports = app;