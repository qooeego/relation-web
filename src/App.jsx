import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [keyword, setKeyword] = useState('狗');
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState(null);
  const [inputPos, setInputPos] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [customLinks, setCustomLinks] = useState([]);
  const [history, setHistory] = useState([]);
  const fgRef = useRef();
  const canvasRef = useRef();

  const userData = useRef(
    JSON.parse(localStorage.getItem('userGraphData') || '{}')
  );

  const fetchGraph = async (centerWord) => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.conceptnet.io/c/zh/${encodeURIComponent(centerWord)}`);
      const data = await res.json();

      const relatedRaw = data.edges
        .map((edge) => edge.end?.label || edge.end?.term)
        .filter((term) => term && term !== centerWord);

      const customTerms = userData.current[centerWord] || [];
      const allRelated = Array.from(new Set([...relatedRaw, ...customTerms])).slice(0, 20);

      const newNodes = [
        { id: centerWord, main: true },
        ...allRelated.map((r) => ({ id: r })),
      ];
      const newLinks = allRelated.map((r) => ({ source: centerWord, target: r }));
      setGraphData({ nodes: newNodes, links: newLinks });
      setCustomLinks(allRelated); // 顯示所有連結（不只自定）
    } catch (e) {
      console.error('探索失敗', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGraph(keyword);
  }, []);

  const handleClickNode = (node, event) => {
    if (addMode) return;
    setHistory((prev) => [...prev, keyword]);
    fetchGraph(node.id);
    setKeyword(node.id);
  };

  const handleCanvasClick = (event) => {
    if (!addMode) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setInputPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const addCustomRelation = () => {
    if (!inputValue.trim()) return;
    const current = keyword;
    const newTerm = inputValue.trim();

    userData.current[current] = userData.current[current] || [];
    userData.current[current].push(newTerm);
    localStorage.setItem('userGraphData', JSON.stringify(userData.current));

    setInputValue('');
    setAddMode(null);
    setInputPos(null);
    fetchGraph(current);
  };

  const deleteAnyRelation = (term) => {
    const current = keyword;
    userData.current[current] = (userData.current[current] || []).filter((t) => t !== term);
    localStorage.setItem('userGraphData', JSON.stringify(userData.current));
    fetchGraph(current);
  };

  const handleStartAdd = (node, event) => {
    event.stopPropagation();
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setAddMode({ nodeId: node.id, x, y });
  };

  const handleBack = () => {
    if (history.length === 0) return;
    const prev = [...history];
    const last = prev.pop();
    setHistory(prev);
    setKeyword(last);
    fetchGraph(last);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div style={{ position: 'absolute', zIndex: 1, top: 20, left: 20, display: 'flex' }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="輸入關鍵字"
          style={{
            fontSize: '1rem',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none'
          }}
        />
        <button
          onClick={() => fetchGraph(keyword)}
          style={{
            marginLeft: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          探索
        </button>
        <button
          onClick={handleBack}
          disabled={history.length === 0}
          style={{
            marginLeft: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: history.length === 0 ? '#ccc' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: history.length === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          ← 返回
        </button>
        <button
          onClick={() => setAddMode(true)}
          style={{
            marginLeft: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#f39c12',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ➕ 新增關聯
        </button>
      </div>

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="id"
        onNodeClick={handleClickNode}
        linkDistance={180}
        cooldownTicks={80}
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
        d3Force="charge"
        d3ForceConfig={{ charge: -250 }}
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
        onNodeRightClick={handleStartAdd}
      />

      <div
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          pointerEvents: addMode ? 'auto' : 'none',
        }}
      >
        {inputPos && (
          <input
            style={{
              position: 'absolute',
              left: inputPos.x,
              top: inputPos.y,
              fontSize: '16px',
              padding: '4px',
              zIndex: 10,
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCustomRelation();
            }}
            placeholder="輸入新詞按 Enter"
          />
        )}
      </div>

      <div style={{ position: 'absolute', top: 12, right: 12, background: '#fff', padding: 8, borderRadius: 4 }}>
        <strong>關鍵詞：</strong>{keyword}
        <div style={{ marginTop: 8 }}>
          {customLinks.map((term) => (
            <div key={term} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>{term}</span>
              <button onClick={() => deleteAnyRelation(term)} style={{ marginLeft: 8 }}>🗑️</button>
            </div>
          ))}
        </div>
      </div>

      <a
        href="https://www.buymeacoffee.com/qooeego"
        target="_blank"
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          textDecoration: 'none',
          fontSize: 14,
          background: '#ffdd00',
          padding: '6px 12px',
          borderRadius: '6px',
          color: '#000',
        }}
      >
        ☕ Buy Me a Coffee
      </a>
    </div>
  );
}
