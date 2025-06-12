import { useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [keyword, setKeyword] = useState('狗');
  const [loading, setLoading] = useState(false);

  const fetchGraph = async (centerWord) => {
    setLoading(true);

    try {
      const res = await fetch(`https://api.conceptnet.io/c/zh/${encodeURIComponent(centerWord)}`);
      const data = await res.json();

      const related = data.edges
        .map((edge) => edge.end?.label || edge.end?.term)
        .filter((term) => term && term !== centerWord)
        .slice(0, 12); // 調整節點數讓圖不擠

      const newNodes = [
        { id: centerWord, main: true },
        ...related.map((r) => ({ id: r })),
      ];

      const newLinks = related.map((r) => ({
        source: centerWord,
        target: r,
      }));

      setGraphData({ nodes: newNodes, links: newLinks });
    } catch (e) {
      console.error('探索失敗', e);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchGraph(keyword);
  }, []);

  const handleClickNode = (node) => {
    fetchGraph(node.id);
    setKeyword(node.id);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div style={{ position: 'absolute', zIndex: 1, top: 20, left: 20, background: 'rgba(255,255,255,0.8)', padding: 10, borderRadius: 8 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="輸入關鍵字"
          style={{ fontSize: '1rem', padding: '0.5rem' }}
        />
        <button
          onClick={() => fetchGraph(keyword)}
          style={{ marginLeft: '1rem', padding: '0.5rem 1rem' }}
        >
          探索
        </button>
        {loading && <div style={{ marginTop: 10 }}>⏳ 載入中...</div>}
      </div>

      <ForceGraph2D
        graphData={graphData}
        nodeLabel="id"
        onNodeClick={handleClickNode}
        linkDistance={180}
        d3Force="charge"
        d3ForceConfig={{ charge: -250 }}
        cooldownTicks={80}
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = node.id;
          const fontSize = (node.main ? 16 : 12) / globalScale;
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = node.main ? 'red' : 'black';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, node.x, node.y);
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color;
          const size = node.main ? 20 : 10;
          ctx.beginPath();
          ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
      />
    </div>
  );
}
