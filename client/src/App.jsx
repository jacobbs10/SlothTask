import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

function App() {
  const videoRef = useRef(null);
  const [latency, setLatency] = useState(null);

  useEffect(() => {
    const video = videoRef.current;
    const source = 'http://localhost:8000/hls/stream.m3u8';

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(source);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play();
      });

      hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
        const fragTime = new Date(data.frag.programDateTime);
        const now = new Date();
        if (fragTime) {
          const diff = (now - fragTime) / 1000;
          setLatency(diff.toFixed(2));
        }
      });

    } else {
      video.src = source;
    }
  }, []);

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h1>Sloth Live Stream</h1>
      <video ref={videoRef} controls autoPlay muted width="640" />
      <p>🦥 Latency: {latency ? `${latency} seconds` : 'Calculating...'}</p>
    </div>
  );
}

export default App;