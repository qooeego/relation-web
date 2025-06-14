import { useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [keyword, setKeyword] = useState('狗');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const fetchGraph = async (centerWord) => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.conceptnet.io/c/zh/${encodeURIComponent(centerWord)}`);
      const data = await res.json();

      const related = data.edges
        .map((edge) => edge.end?.label || edge.end?.term)
        .filter((term) => term && term !== centerWord)
        .slice(0, 12);

      const newNodes = [
        { id: centerWord, main: true },
        ...related.map((r) => ({ id: r })),
      ];

      const newLinks = related.map((r) => ({
        source: centerWord,
        target: r,
      }));

      setGraphData({ nodes: newNodes, links: newLinks });
      setKeyword(centerWord); // ❗放這裡：更新狀態
    } catch (e) {
      console.error('探索失敗', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGraph(keyword); // 初始讀取
  }, []);

  const handleClickNode = (node) => {
    setHistory((prev) => [...prev, keyword]); // ✅ 正確：記下當前詞，再前往新詞
    fetchGraph(node.id);
  };

  const handleBack = () => {
    if (history.length === 0) return;
    const prevKeyword = history[history.length - 1];
    setHistory((prevHist) => prevHist.slice(0, -1)); // pop 掉最後一筆
    fetchGraph(prevKeyword);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* 🔍 輸入欄區塊 */}
      <div style={{ position: 'absolute', zIndex: 1, top: 20, left: 20 }}>
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
        <button
          onClick={handleBack}
          disabled={history.length === 0}
          style={{ marginLeft: '1rem', padding: '0.5rem 1rem' }}
        >
          ⬅️ 返回
        </button>
        {loading && <div style={{ marginTop: 10 }}>⏳ 載入中...</div>}
      </div>

      {/* 🌐 視覺圖區塊 */}
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

      {/* ☕ 打賞按鈕 */}
      <a
        href="https://www.buymeacoffee.com/qooeego"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'absolute',
          right: 20,
          bottom: 20,
          zIndex: 1,
        }}
      >
        <img
          src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
          alt="Buy Me A Coffee"
          style={{ height: '50px', width: '180px' }}
        />
      </a>
    </div>
  );
}
