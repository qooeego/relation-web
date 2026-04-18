import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const FILM_PRESETS = [
  {
    id: 'kodak-gold',
    name: 'Kodak Gold',
    description: '暖色、柔和高光',
    videoFilter: 'saturate(1.15) contrast(1.08) brightness(1.04) sepia(0.14) hue-rotate(-6deg)',
    grainOpacity: 0.1,
    lightLeak: 'rgba(255, 166, 71, 0.15)'
  },
  {
    id: 'fuji-superia',
    name: 'Fuji Superia',
    description: '偏綠調、街拍感',
    videoFilter: 'saturate(1.08) contrast(1.13) brightness(1.02) hue-rotate(6deg)',
    grainOpacity: 0.09,
    lightLeak: 'rgba(145, 255, 184, 0.12)'
  },
  {
    id: 'cinestill-800t',
    name: 'CineStill 800T',
    description: '夜景藍冷調',
    videoFilter: 'saturate(1.05) contrast(1.16) brightness(0.94) hue-rotate(14deg)',
    grainOpacity: 0.14,
    lightLeak: 'rgba(62, 142, 255, 0.14)'
  },
  {
    id: 'bw-classic',
    name: 'B&W Classic',
    description: '黑白銀鹽風格',
    videoFilter: 'grayscale(1) contrast(1.2) brightness(1.05)',
    grainOpacity: 0.12,
    lightLeak: 'rgba(255, 255, 255, 0.05)'
  }
];

export default function App() {
  const videoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const [activeFilm, setActiveFilm] = useState(FILM_PRESETS[0]);
  const [cameraReady, setCameraReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastPhoto, setLastPhoto] = useState('');

  useEffect(() => {
    let stream;

    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (error) {
        console.error(error);
        setErrorMessage('相機啟動失敗，請確認瀏覽器已允許相機權限。');
      }
    };

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const filmFilter = useMemo(() => activeFilm.videoFilter, [activeFilm]);

  const paintFilmEffect = (ctx, width, height, preset) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const grain = (Math.random() - 0.5) * 255 * preset.grainOpacity;
      data[i] = Math.min(255, Math.max(0, data[i] + grain));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
    }

    ctx.putImageData(imageData, 0, 0);

    const leakGradient = ctx.createRadialGradient(width * 0.9, height * 0.05, 0, width * 0.9, height * 0.05, width * 0.8);
    leakGradient.addColorStop(0, preset.lightLeak);
    leakGradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = leakGradient;
    ctx.fillRect(0, 0, width, height);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !captureCanvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.filter = filmFilter;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    paintFilmEffect(ctx, canvas.width, canvas.height, activeFilm);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setLastPhoto(dataUrl);
  };

  const downloadPhoto = () => {
    if (!lastPhoto) return;

    const link = document.createElement('a');
    link.href = lastPhoto;
    link.download = `film-camera-${activeFilm.id}-${Date.now()}.jpg`;
    link.click();
  };

  return (
    <main className="film-app">
      <section className="camera-panel">
        <h1>底片模擬相機</h1>
        <p className="subtitle">已優先使用後鏡頭（Samsung S22+ 可直接測試）</p>

        <div className="camera-frame">
          <video ref={videoRef} playsInline muted className="camera-view" style={{ filter: filmFilter }} />
          <canvas ref={previewCanvasRef} className="hidden-canvas" aria-hidden="true" />
          {!cameraReady && !errorMessage && <div className="status">啟動相機中...</div>}
          {errorMessage && <div className="status error">{errorMessage}</div>}
        </div>

        <div className="film-row">
          {FILM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`film-chip ${activeFilm.id === preset.id ? 'active' : ''}`}
              onClick={() => setActiveFilm(preset)}
            >
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>

        <div className="actions">
          <button type="button" className="capture" onClick={capturePhoto} disabled={!cameraReady}>
            拍照
          </button>
          <button type="button" className="download" onClick={downloadPhoto} disabled={!lastPhoto}>
            下載照片
          </button>
        </div>
      </section>

      <section className="preview-panel">
        <h2>最近拍攝</h2>
        {lastPhoto ? <img src={lastPhoto} alt="最近拍攝成果" className="preview-image" /> : <p>還沒有照片，先拍一張吧。</p>}
      </section>

      <canvas ref={captureCanvasRef} className="hidden-canvas" aria-hidden="true" />
    </main>
  );
}
