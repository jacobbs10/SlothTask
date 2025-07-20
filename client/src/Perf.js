import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { Activity, Users, Clock, Wifi, Server, AlertCircle, TrendingUp, Database, Video } from 'lucide-react';
import { Link } from 'react-router-dom';

// Add API_BASE_URL definition
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const streamLabels = {
  social: 'Social Media (720p)',
  broadcasting: 'Broadcasting (1080p)',
  cinema: 'Cinema (4K)'
};

const PerformanceMonitor = () => {
  // Add state for selected stream
  const [selectedStream, setSelectedStream] = useState('broadcasting');
  
  // Keep track of metrics for each stream
  const [perStreamHistory, setPerStreamHistory] = useState({
    social: {
      latency: [],
      throughput: [],
      memory: [],
      cpu: [],
      viewers: [],
      errors: []
    },
    broadcasting: {
      latency: [],
      throughput: [],
      memory: [],
      cpu: [],
      viewers: [],
      errors: []
    },
    cinema: {
      latency: [],
      throughput: [],
      memory: [],
      cpu: [],
      viewers: [],
      errors: []
    }
  });
  
  const [currentStats, setCurrentStats] = useState({});
  const [alerts, setAlerts] = useState([]);

  // Colors for charts
  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#0088fe'];

  // WebSocket for real-time data collection
  useEffect(() => {
    try {
      // Ensure API_BASE_URL is properly formatted (no trailing slash)
      const baseUrl = API_BASE_URL ? API_BASE_URL.replace(/\/$/, '') : '';
      console.log('Perf: Using API base URL:', baseUrl);
      
      let wsUrl;
      if (baseUrl) {
        // For production with separate deployments
        const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
        try {
          const urlObj = new URL(baseUrl);
          wsUrl = `${wsProtocol}://${urlObj.host}/ws`; // Add /ws path
        } catch (e) {
          console.error('Perf: Failed to parse API_BASE_URL:', e);
          const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
          wsUrl = `${wsProtocol}://${window.location.host}/ws`;
        }
      } else {
        // Fallback for development
        const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrl = `${wsProtocol}://${window.location.host}/ws`; // Add /ws path
      }
      
      console.log('Perf: Connecting to WebSocket at:', wsUrl);
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('Perf: WebSocket connected successfully');
        
        // Send an initial ping message to confirm bidirectional communication
        ws.send(JSON.stringify({ type: 'ping', client: 'dashboard' }));
      };

      ws.onmessage = (event) => {
        console.log('Perf: WebSocket message received:', event.data.slice(0, 100) + '...');
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'performance' && data.perStream) {
            const timestamp = new Date().toLocaleTimeString();
            
            // Update history for each stream
            setPerStreamHistory(prev => {
              const updated = { ...prev };
              
              Object.entries(data.perStream).forEach(([quality, metrics]) => {
                // Update each metric type for the stream
                updated[quality] = updated[quality] || {};
                
                // Latency
                updated[quality].latency = [
                  ...((updated[quality].latency || []).slice(-29)), 
                  { 
                    time: timestamp, 
                    value: metrics.latency,
                    boundary: metrics.latencyBoundary 
                  }
                ];
                
                // Throughput
                updated[quality].throughput = [
                  ...((updated[quality].throughput || []).slice(-29)), 
                  { 
                    time: timestamp, 
                    segments: metrics.segmentsPerSec || 0,
                    mbps: (metrics.segmentsPerSec || 0) * 2 // Estimate mbps based on segments/s
                  }
                ];
                
                // Memory
                updated[quality].memory = [
                  ...((updated[quality].memory || []).slice(-29)), 
                  { 
                    time: timestamp, 
                    heap: parseFloat(metrics.memory?.heapUsed?.replace(' MB', '') || 0),
                    rss: parseFloat(metrics.memory?.rss?.replace(' MB', '') || 0)
                  }
                ];
                
                // CPU
                updated[quality].cpu = [
                  ...((updated[quality].cpu || []).slice(-29)), 
                  { 
                    time: timestamp, 
                    usage: Math.random() * 80 + 10, // Using random for CPU
                    cores: navigator.hardwareConcurrency || 4
                  }
                ];
                
                // Viewers - distribute across qualities
                updated[quality].viewers = [
                  ...((updated[quality].viewers || []).slice(-29)), 
                  { 
                    time: timestamp, 
                    count: metrics.viewers || 0,
                    quality: {
                      social: quality === 'social' ? (metrics.viewers || 0) : 0,
                      broadcasting: quality === 'broadcasting' ? (metrics.viewers || 0) : 0,
                      cinema: quality === 'cinema' ? (metrics.viewers || 0) : 0
                    }
                  }
                ];
                
                // Errors
                updated[quality].errors = [
                  ...((updated[quality].errors || []).slice(-29)), 
                  { 
                    time: timestamp, 
                    count: Math.floor(Math.random() * 3),
                    severity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
                  }
                ];
              });
              
              return updated;
            });

            // Update current stats for the selected stream
            setCurrentStats(data.perStream[selectedStream] || {});
            
            // Generate alerts based on metrics
            const newAlerts = [];
            Object.entries(data.perStream).forEach(([quality, metrics]) => {
              if (metrics.memory?.heapUsed && parseFloat(metrics.memory.heapUsed.replace(' MB', '')) > 500) {
                newAlerts.push({
                  type: 'warning',
                  message: `High memory usage detected on ${streamLabels[quality]}`,
                  timestamp: new Date().toISOString()
                });
              }
              if (metrics.viewers > 100) {
                newAlerts.push({
                  type: 'info',
                  message: `High viewer count on ${streamLabels[quality]} - scaling recommended`,
                  timestamp: new Date().toISOString()
                });
              }
              if (metrics.latency > 3000) {
                newAlerts.push({
                  type: 'warning',
                  message: `High latency detected on ${streamLabels[quality]}`,
                  timestamp: new Date().toISOString()
                });
              }
            });
            
            setAlerts(prev => [...prev.slice(-9), ...newAlerts]);
          }
        } catch (err) {
          console.error('Perf: Error parsing WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('Perf: WebSocket connection closed:', event);
      };

      ws.onerror = (error) => {
        console.error('Perf: WebSocket error:', error);
      };

      return () => {
        ws.close();
        console.log('Perf: WebSocket connection closed');
      };
    } catch (error) {
      console.error('Perf: WebSocket setup error:', error);
    }
  }, []);

  // Update current stats when selected stream changes
  useEffect(() => {
    // Fetch the current stats for the selected stream
    const fetchStreamStats = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/metrics`); // Add API_BASE_URL here
        const data = await response.json();
        if (data.perStream && data.perStream[selectedStream]) {
          setCurrentStats(data.perStream[selectedStream]);
        }
      } catch (error) {
        console.error('Failed to fetch stream stats:', error);
      }
    };
    
    fetchStreamStats();
  }, [selectedStream]);

  // Calculate performance score based on selected stream
  const calculatePerformanceScore = () => {
    const streamData = perStreamHistory[selectedStream];
    if (!streamData || !streamData.latency || streamData.latency.length === 0) return 80;
    
    const latestMetrics = {
      latency: streamData.latency[streamData.latency.length - 1]?.value || 0,
      memory: streamData.memory?.[streamData.memory.length - 1]?.heap || 0,
      cpu: streamData.cpu?.[streamData.cpu.length - 1]?.usage || 0,
      errors: streamData.errors?.[streamData.errors.length - 1]?.count || 0
    };

    let score = 100;
    if (latestMetrics.latency > 2000) score -= 20;
    if (latestMetrics.memory > 400) score -= 15;
    if (latestMetrics.cpu > 70) score -= 15;
    if (latestMetrics.errors > 0) score -= 10;

    return Math.max(0, score);
  };

  const performanceScore = calculatePerformanceScore();

  // Quality distribution data
  const qualityData = (() => {
    const streamData = perStreamHistory[selectedStream];
    if (!streamData || !streamData.viewers || streamData.viewers.length === 0) {
      return [
        { name: 'Social', value: 1, color: '#8884d8' },
        { name: 'Broadcasting', value: 1, color: '#82ca9d' },
        { name: 'Cinema', value: 1, color: '#ffc658' }
      ];
    }
    
    const lastViewer = streamData.viewers[streamData.viewers.length - 1];
    const quality = lastViewer.quality || {};
    
    return [
      { name: 'Social', value: quality.social || 1, color: '#8884d8' },
      { name: 'Broadcasting', value: quality.broadcasting || 1, color: '#82ca9d' },
      { name: 'Cinema', value: quality.cinema || 1, color: '#ffc658' }
    ];
  })();

  // Current stream data for charts
  const currentStreamData = perStreamHistory[selectedStream] || {
    latency: [],
    throughput: [],
    memory: [],
    cpu: [],
    viewers: [],
    errors: []
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
        
        .text-blue-400 {
          color: #60a5fa !important;
        }
        
        .text-green-400 {
          color: #4ade80 !important;
        }
        
        .text-purple-400 {
          color: #c084fc !important;
        }
        
        .text-orange-400 {
          color: #fb923c !important;
        }
        
        .text-yellow-400 {
          color: #facc15 !important;
        }
        
        .text-red-400 {
          color: #f87171 !important;
        }
        
        .alert-warning-custom {
          background-color: rgba(245, 158, 11, 0.2) !important;
          border-left: 4px solid #facc15 !important;
        }
        
        .alert-danger-custom {
          background-color: rgba(239, 68, 68, 0.2) !important;
          border-left: 4px solid #f87171 !important;
        }
        
        .alert-info-custom {
          background-color: rgba(59, 130, 246, 0.2) !important;
          border-left: 4px solid #60a5fa !important;
        }
        
        .alert-success-custom {
          background-color: rgba(34, 197, 94, 0.2) !important;
          border-left: 4px solid #4ade80 !important;
        }
        
        .recommendation-warning {
          background-color: rgba(245, 158, 11, 0.2) !important;
          border: 1px solid #facc15 !important;
        }
        
        .recommendation-danger {
          background-color: rgba(239, 68, 68, 0.2) !important;
          border: 1px solid #f87171 !important;
        }
        
        .recommendation-success {
          background-color: rgba(34, 197, 94, 0.2) !important;
          border: 1px solid #4ade80 !important;
        }
        
        .recommendation-info {
          background-color: rgba(249, 115, 22, 0.2) !important;
          border: 1px solid #fb923c !important;
        }
        
        .chart-container {
          height: 250px;
        }
        
        .metric-card {
          transition: transform 0.2s ease;
        }
        
        .metric-card:hover {
          transform: translateY(-2px);
        }
        
        .alerts-container {
          max-height: 10rem;
          overflow-y: auto;
        }
        
        .performance-score-large {
          font-size: 2.5rem;
          font-weight: 700;
        }
        
        .stream-selector {
          max-width: 300px;
          margin: 0 auto 2rem auto;
        }
        
        .nav-button {
          position: absolute;
          top: 1rem;
          right: 1rem;
          z-index: 100;
        }
      `}</style>

      <div className="min-vh-100 bg-darker py-4 px-3">
        <div className="container-fluid" style={{ maxWidth: '80rem' }}>
          <h1 className="display-5 fw-bold mb-3 text-center">Performance Monitoring Dashboard</h1>
          
          {/* Navigation button centered below headline */}
          <div className="text-center mb-4">
            <Link to="/" className="btn btn-primary d-inline-flex align-items-center gap-2">
              <Video size={20} />
              Back to Video Player
            </Link>
          </div>
          
          {/* Stream selector dropdown */}
          <div className="stream-selector mb-4">
            <select 
              className="form-select bg-dark-custom text-white border-secondary" 
              value={selectedStream}
              onChange={(e) => setSelectedStream(e.target.value)}
            >
              {Object.entries(streamLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          
          {/* Performance Score */}
          <div className="bg-dark-custom rounded p-4 mb-4">
            <div className="d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-3">
                <TrendingUp size={24} className="text-blue-400" />
                <div>
                  <h2 className="h4 fw-semibold mb-1">Performance Score</h2>
                  <p className="text-muted-light mb-0">Stream: {streamLabels[selectedStream]}</p>
                </div>
              </div>
              <div className="text-end">
                <div className={`performance-score-large ${
                  performanceScore >= 80 ? 'text-success' : 
                  performanceScore >= 60 ? 'text-warning' : 'text-danger'
                }`}>
                  {performanceScore}%
                </div>
                <div className="small text-muted-light">Last updated: {new Date().toLocaleTimeString()}</div>
              </div>
            </div>
          </div>

          {/* Key Metrics Cards */}
          <div className="row g-3 mb-5">
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="bg-dark-custom rounded p-3 metric-card">
                <div className="d-flex align-items-center gap-3">
                  <Clock size={20} className="text-blue-400" />
                  <div>
                    <p className="small text-muted-light mb-1">Latency</p>
                    <p className="h5 fw-bold mb-0">
                      {currentStreamData.latency.length > 0 ? 
                        `${Math.round(currentStreamData.latency[currentStreamData.latency.length - 1].value)}ms` : 
                        'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <div className="bg-dark-custom rounded p-3 metric-card">
                <div className="d-flex align-items-center gap-3">
                  <Users size={20} className="text-green-400" />
                  <div>
                    <p className="small text-muted-light mb-1">Active Viewers</p>
                    <p className="h5 fw-bold mb-0">{currentStats.viewers || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <div className="bg-dark-custom rounded p-3 metric-card">
                <div className="d-flex align-items-center gap-3">
                  <Database size={20} className="text-purple-400" />
                  <div>
                    <p className="small text-muted-light mb-1">Memory Usage</p>
                    <p className="h5 fw-bold mb-0">{currentStats.memory?.heapUsed || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-12 col-sm-6 col-lg-3">
              <div className="bg-dark-custom rounded p-3 metric-card">
                <div className="d-flex align-items-center gap-3">
                  <Server size={20} className="text-orange-400" />
                  <div>
                    <p className="small text-muted-light mb-1">Uptime</p>
                    <p className="h5 fw-bold mb-0">
                      {currentStats.uptime ? `${Math.round(currentStats.uptime / 60)}m` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="row g-4 mb-5">
            {/* Latency Chart */}
            <div className="col-12 col-lg-6">
              <div className="bg-dark-custom rounded p-4">
                <h3 className="h5 fw-semibold mb-4">Latency Over Time</h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={currentStreamData.latency}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        labelStyle={{ color: '#F3F4F6' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="value" stroke="#8884d8" name="Latency (ms)" />
                      <Line type="monotone" dataKey="boundary" stroke="#ff7300" strokeDasharray="5 5" name="Boundary" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Throughput Chart */}
            <div className="col-12 col-lg-6">
              <div className="bg-dark-custom rounded p-4">
                <h3 className="h5 fw-semibold mb-4">Throughput Metrics</h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={currentStreamData.throughput}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        labelStyle={{ color: '#F3F4F6' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="mbps" stroke="#82ca9d" name="Mbps" />
                      <Line type="monotone" dataKey="segments" stroke="#ffc658" name="Segments/s" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Memory Usage Chart */}
            <div className="col-12 col-lg-6">
              <div className="bg-dark-custom rounded p-4">
                <h3 className="h5 fw-semibold mb-4">Memory Usage</h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={currentStreamData.memory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                        labelStyle={{ color: '#F3F4F6' }}
                      />
                      <Legend />
                      <Bar dataKey="heap" fill="#8884d8" name="Heap (MB)" />
                      <Bar dataKey="rss" fill="#82ca9d" name="RSS (MB)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Quality Distribution */}
            <div className="col-12 col-lg-6">
              <div className="bg-dark-custom rounded p-4">
                <h3 className="h5 fw-semibold mb-4">Viewer Quality Distribution</h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={qualityData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {qualityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Alerts Section */}
          <div className="bg-dark-custom rounded p-4 mb-4">
            <h3 className="h5 fw-semibold mb-4 d-flex align-items-center gap-2">
              <AlertCircle size={20} className="text-yellow-400" />
              System Alerts
            </h3>
            <div className="alerts-container">
              {alerts.length > 0 ? alerts.map((alert, index) => (
                <div key={index} className={`p-3 rounded mb-2 ${
                  alert.type === 'warning' ? 'alert-warning-custom' :
                  alert.type === 'error' ? 'alert-danger-custom' :
                  'alert-info-custom'
                }`}>
                  <div className="d-flex justify-content-between align-items-start">
                    <span className="small">{alert.message}</span>
                    <span className="small text-muted-light">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              )) : (
                <div className="text-muted-light text-center py-4">No alerts at this time</div>
              )}
            </div>
          </div>

          {/* Performance Recommendations */}
          <div className="bg-dark-custom rounded p-4">
            <h3 className="h5 fw-semibold mb-4">Performance Recommendations</h3>
            <div className="d-flex flex-column gap-3">
              {performanceScore < 80 && (
                <div className="p-3 recommendation-warning rounded">
                  <p className="small mb-0">
                    <strong>Performance Alert:</strong> {streamLabels[selectedStream]} stream performance is below optimal. 
                    Consider scaling resources or optimizing stream settings.
                  </p>
                </div>
              )}
              
              {currentStreamData.memory.length > 0 && currentStreamData.memory[currentStreamData.memory.length - 1]?.heap > 400 && (
                <div className="p-3 recommendation-danger rounded">
                  <p className="small mb-0">
                    <strong>Memory Warning:</strong> High memory usage detected for {streamLabels[selectedStream]}. 
                    Consider implementing memory cleanup or increasing available RAM.
                  </p>
                </div>
              )}
              
              {currentStats.viewers > 50 && (
                <div className="p-3 recommendation-success rounded">
                  <p className="small mb-0">
                    <strong>Scale Up:</strong> High viewer count detected for {streamLabels[selectedStream]}. 
                    Consider implementing CDN or load balancing for better performance.
                  </p>
                </div>
              )}
              
              {currentStreamData.latency.length > 0 && currentStreamData.latency[currentStreamData.latency.length - 1]?.value > 2000 && (
                <div className="p-3 recommendation-info rounded">
                  <p className="small mb-0">
                    <strong>Latency Issue:</strong> High latency detected for {streamLabels[selectedStream]}. 
                    Check network conditions and consider optimizing stream settings.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bootstrap JS */}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
    </>
  );
};

export default PerformanceMonitor;