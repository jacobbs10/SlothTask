import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Settings, Activity, Users, Clock, Wifi, BarChart2 } from 'lucide-react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import PerformanceMonitor from './Perf';

// In a single service deployment, API_BASE_URL should be empty
// For local development, the proxy in package.json handles routing
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '' // Empty for single-service deployment
  : 'http://localhost:8000'; // Explicit URL for local development

const HLSVideoPlayer = () => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const wsRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQuality, setCurrentQuality] = useState('broadcasting');
  const [latency, setLatency] = useState(0);
  const [latencyBoundary, setLatencyBoundary] = useState(3000);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [metrics, setMetrics] = useState({});
  const [performance, setPerformance] = useState({});
  const [networkInfo, setNetworkInfo] = useState({});
  const [perStreamMetrics, setPerStreamMetrics] = useState({});

  // Quality options
  const qualityOptions = [
    { value: 'social', label: 'Social Media (720p)', description: 'Low latency, mobile-friendly' },
    { value: 'broadcasting', label: 'Broadcasting (1080p)', description: 'Standard TV quality' },
    { value: 'cinema', label: 'Cinema (4K)', description: 'Ultra high quality' }
  ];

  // Initialize HLS player
  const initializeHLS = async (quality) => {
    try {
      const response = await fetch(`/api/stream/${quality}`);
      const data = await response.json();
      
      if (data.success) {
        // Dynamic import of hls.js
        const Hls = (await import('hls.js')).default;
        
        if (Hls.isSupported()) {
          // Clean up existing HLS instance
          if (hlsRef.current) {
            hlsRef.current.destroy();
          }
          
          const hls = new Hls({
            lowLatencyMode: true,
            backBufferLength: 90,
            maxBufferLength: 30,
            maxMaxBufferLength: 30,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 5,
            liveDurationInfinity: true,
            enableWorker: true
          });
          
          hlsRef.current = hls;
          hls.loadSource(data.playlistUrl);
          hls.attachMedia(videoRef.current);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('HLS manifest parsed');
            setConnectionStatus('connected');
          });
          
          hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS error:', data);
            setConnectionStatus('error');
          });
          
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS support (Safari)
          videoRef.current.src = data.playlistUrl;
          setConnectionStatus('connected');
        }
      }
    } catch (error) {
      console.error('Failed to initialize HLS:', error);
      setConnectionStatus('error');
    }
  };

  // WebSocket connection for real-time performance
  const connectWebSocket = () => {
    try {
      // Create WebSocket URL based on environment
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = process.env.NODE_ENV === 'production'
        ? `${wsProtocol}://${window.location.host}/ws`
        : `ws://localhost:8000/ws`;
      
      console.log('Connecting to WebSocket at:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        setConnectionStatus('connected');
        
        // Send an initial ping message to confirm bidirectional communication
        ws.send(JSON.stringify({ type: 'ping', client: 'player' }));
      };

      ws.onmessage = (event) => {
        console.log('WebSocket message received:', event.data.slice(0, 100) + '...');
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'performance' && data.perStream) {
            console.log('Performance data received for streams:', Object.keys(data.perStream));
            setPerStreamMetrics(data.perStream);
            // Update current stream metrics
            if (data.perStream[currentQuality]) {
              setLatency(data.perStream[currentQuality].latency);
              setLatencyBoundary(data.perStream[currentQuality].latencyBoundary);
              setMetrics(data.perStream[currentQuality]);
              setPerformance(data.perStream[currentQuality]);
            }
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
        setConnectionStatus('disconnected');
        setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };
    } catch (error) {
      console.error('Failed to setup WebSocket:', error);
    }
  };

  // Fetch metrics and performance data
  const fetchMetrics = async () => {
    try {
      console.log('Fetching metrics from:', `${API_BASE_URL}/api/metrics`);
      const [metricsRes, performanceRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/metrics`),
        fetch(`${API_BASE_URL}/api/performance`)
      ]);
      
      if (!metricsRes.ok) {
        console.error('Metrics fetch failed:', await metricsRes.text());
        return;
      }
      
      if (!performanceRes.ok) {
        console.error('Performance fetch failed:', await performanceRes.text());
        return;
      }
      
      const metricsData = await metricsRes.json();
      const performanceData = await performanceRes.json();
      
      console.log('Metrics data:', metricsData);
      console.log('Performance data:', performanceData);
      
      setMetrics(metricsData);
      setPerformance(performanceData);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  // Get network information
  const getNetworkInfo = () => {
    if ('connection' in navigator) {
      const connection = navigator.connection;
      setNetworkInfo({
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt
      });
    }
  };

  // Update latency boundary
  const updateLatencyBoundary = async (newBoundary) => {
    try {
      await fetch('/api/latency-boundary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundary: newBoundary })
      });
      setLatencyBoundary(newBoundary);
    } catch (error) {
      console.error('Failed to update latency boundary:', error);
    }
  };

  // Play/Pause functionality
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Quality change handler
  const handleQualityChange = (quality) => {
    setCurrentQuality(quality);
    initializeHLS(quality);
  };

  // Initialize on component mount
  useEffect(() => {
    initializeHLS(currentQuality);
    connectWebSocket();
    getNetworkInfo();
    
    const metricsInterval = setInterval(fetchMetrics, 5000);
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      clearInterval(metricsInterval);
    };
  }, []);

  // When currentQuality changes, update displayed metrics
  useEffect(() => {
    if (perStreamMetrics[currentQuality]) {
      setLatency(perStreamMetrics[currentQuality].latency);
      setLatencyBoundary(perStreamMetrics[currentQuality].latencyBoundary);
      setMetrics(perStreamMetrics[currentQuality]);
      setPerformance(perStreamMetrics[currentQuality]);
    }
  }, [currentQuality, perStreamMetrics]);

  // Format latency display
  const formatLatency = (latencyMs) => {
    if (latencyMs < 1000) return `${Math.round(latencyMs)}ms`;
    return `${(latencyMs / 1000).toFixed(1)}s`;
  };

  // Get latency status color
  const getLatencyColor = () => {
    if (latency < latencyBoundary * 0.5) return 'text-success';
    if (latency < latencyBoundary) return 'text-warning';
    return 'text-danger';
  };

  return (
    <>
      {/* Bootstrap CSS */}
      <link 
        href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" 
        rel="stylesheet" 
      />
      
      {/* Custom CSS for dark theme and additional styling */}
      <style>{`
        body {
          background-color: #1a1a1a !important;
          color: white !important;
          min-height: 100vh;
        }
        
        .bg-dark-custom {
          background-color: #2d2d2d !important;
        }
        
        .bg-darker {
          background-color: #1a1a1a !important;
        }
        
        .text-muted-light {
          color: #9ca3af !important;
        }
        
        .quality-button {
          transition: all 0.2s ease;
        }
        
        .quality-button:hover {
          border-color: #6c757d !important;
        }
        
        .quality-button.active {
          border-color: #0d6efd !important;
          background-color: rgba(13, 110, 253, 0.1) !important;
        }
        
        .video-container {
          max-height: 24rem;
          overflow: hidden;
        }
        
        video {
          width: 100%;
          height: auto;
          display: block;
        }
        
        .font-mono {
          font-family: 'Courier New', monospace;
        }
        
        .range-custom {
          flex: 1;
          margin: 0 1rem;
        }
        
        .nav-button {
          position: absolute;
          top: 1rem;
          right: 1rem;
          z-index: 100;
        }
      `}</style>

      <div className="container-fluid py-4" style={{ maxWidth: '72rem' }}>
        <h1 className="display-5 fw-bold mb-3 text-center">Live HLS Streaming Service</h1>
        
        {/* Navigation button centered below headline */}
        <div className="text-center mb-4">
          <Link to="/Perf" className="btn btn-primary d-inline-flex align-items-center gap-2">
            <BarChart2 size={20} />
            View Performance Dashboard
          </Link>
        </div>
        
        {/* Video Player */}
        <div className="bg-black rounded mb-4 video-container">
          <video
            ref={videoRef}
            controls={false}
            autoPlay
            muted
            playsInline
            className="w-100"
          />
          
          {/* Custom Controls */}
          <div className="bg-dark-custom p-3 d-flex justify-content-between align-items-center">
            <button
              onClick={togglePlayPause}
              className="btn btn-primary d-flex align-items-center gap-2"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            
            <div className="d-flex align-items-center gap-3">
              <div className={`d-flex align-items-center gap-1 ${getLatencyColor()}`}>
                <Clock size={16} />
                <span className="font-mono">{formatLatency(latency)}</span>
              </div>
              
              <div className="d-flex align-items-center gap-1">
                <Wifi size={16} />
                <span className={`small ${connectionStatus === 'connected' ? 'text-success' : 'text-danger'}`}>
                  {connectionStatus}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quality Selection */}
        <div className="bg-dark-custom rounded p-4 mb-4">
          <h3 className="h5 fw-semibold mb-3 d-flex align-items-center gap-2">
            <Settings size={20} />
            Stream Quality
          </h3>
          <div className="row g-3">
            {qualityOptions.map((option) => (
              <div key={option.value} className="col-12 col-md-4">
                <button
                  onClick={() => handleQualityChange(option.value)}
                  className={`btn w-100 p-3 border-2 quality-button ${
                    currentQuality === option.value
                      ? 'active border-primary'
                      : 'border-secondary'
                  }`}
                  style={{ backgroundColor: 'transparent' }}
                >
                  <div className="fw-semibold text-start">{option.label}</div>
                  <div className="small text-muted-light text-start">{option.description}</div>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Latency Configuration */}
        <div className="bg-dark-custom rounded p-4 mb-4">
          <h3 className="h5 fw-semibold mb-3">Latency Configuration</h3>
          <div className="d-flex align-items-center gap-3">
            <label className="small">Latency Boundary:</label>
            <input
              type="range"
              min="500"
              max="10000"
              step="100"
              value={latencyBoundary}
              onChange={(e) => updateLatencyBoundary(parseInt(e.target.value))}
              className="form-range range-custom"
            />
            <span className="small font-mono">{formatLatency(latencyBoundary)}</span>
          </div>
          <div className="mt-2 small text-muted-light">
            Current latency: <span className={getLatencyColor()}>{formatLatency(latency)}</span>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="row g-4">
          <div className="col-12 col-md-6">
            <div className="bg-dark-custom rounded p-4">
              <h3 className="h5 fw-semibold mb-3 d-flex align-items-center gap-2">
                <Activity size={20} />
                Server Performance
              </h3>
              <div className="small">
                <div className="d-flex justify-content-between mb-2">
                  <span>Memory Usage:</span>
                  <span className="font-mono">{performance.memory?.heapUsed || 'N/A'}</span>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span>Uptime:</span>
                  <span className="font-mono">{performance.uptime ? `${Math.round(performance.uptime)}s` : 'N/A'}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Active Streams:</span>
                  <span className="font-mono">{performance.streams || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-6">
            <div className="bg-dark-custom rounded p-4">
              <h3 className="h5 fw-semibold mb-3 d-flex align-items-center gap-2">
                <Users size={20} />
                Stream Metrics
              </h3>
              <div className="small">
                <div className="d-flex justify-content-between mb-2">
                  <span>Viewers:</span>
                  <span className="font-mono">{metrics.viewerCount || 0}</span>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span>Segments:</span>
                  <span className="font-mono">{metrics.segmentCount || 0}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Network:</span>
                  <span className="font-mono">{networkInfo.effectiveType || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bootstrap JS */}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
    </>
  );
};

const MainApp = () => (
  <Router>
    <Routes>
      <Route path="/" element={<HLSVideoPlayer />} />
      <Route path="/Perf" element={<PerformanceMonitor />} />
    </Routes>
  </Router>
);

export default MainApp;