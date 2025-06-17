import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [keyword, setKeyword] = useState('狗');
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [inputPos, setInputPos] = useState({ x: window.innerWidth / 2 - 100, y: 150 });
  const [inputValue, setInputValue] = useState('');
  const [allLinks, setAllLinks] = useState([]);
  const [history, setHistory] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const fgRef = useRef();
  const canvasRef = useRef();

  const userData = useRef(
    JSON.parse(localStorage.getItem('userGraphData') || '{}')
  );
  const deletedData = useRef(
    JSON.parse(localStorage.getItem('deletedGraphData') || '{}')
  );

  const fetchGraph = async (centerWord) => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.conceptnet.io/c/zh/${encodeURIComponent(centerWord)}`);
      const data = await res.json();

      const customTerms = userData.current[centerWord] || [];
      const deletedTerms = new Set(deletedData.current[centerWord] || []);

      const relatedEdges = data.edges
        .filter((edge) => {
          const endLabel = edge.end?.label || edge.end?.term;
          return (
            endLabel &&
            endLabel !== centerWord &&
            /^[\u4e00-\u9fa5]+$/.test(endLabel) && // 排除非中文
            !deletedTerms.has(endLabel)
          );
        })
        .slice(0, 20);

      const allRelated = Array.from(
        new Set([
          ...relatedEdges.map((e) => e.end?.label || e.end?.term),
          ...customTerms
        ])
      ).filter((term) => !deletedTerms.has(term));

      const newNodes = [
        { id: centerWord, main: true },
        ...allRelated.map((r) => ({ id: r }))
      ];

      const newLinks = [
        ...relatedEdges.map((edge) => ({
          source: centerWord,
          target: edge.end?.label || edge.end?.term,
          weight: Math.max(1, edge.weight * 2)
        })),
        ...customTerms
          .filter((term) => !deletedTerms.has(term))
          .map((term) => ({
            source: centerWord,
            target: term,
            weight: 4
          }))
      ];

      setGraphData({ nodes: newNodes, links: newLinks });
      setAllLinks(allRelated);

      if (fgRef.current) {
        fgRef.current.d3ReheatSimulation();
      }
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

  const addCustomRelation = () => {
    if (!inputValue.trim()) return;
    const current = keyword;
    const newTerm = inputValue.trim();

    userData.current[current] = userData.current[current] || [];
    if (!userData.current[current].includes(newTerm)) {
      userData.current[current].push(newTerm);
    }
    localStorage.setItem('userGraphData', JSON.stringify(userData.current));

    deletedData.current[current] = (deletedData.current[current] || []).filter(t => t !== newTerm);
    localStorage.setItem('deletedGraphData', JSON.stringify(deletedData.current));

    setInputValue('');
    setAddMode(false);
    setInputPos(null);
    fetchGraph(current);
  };

  const deleteAnyRelation = (term) => {
    const current = keyword;
    deletedData.current[current] = deletedData.current[current] || [];
    if (!deletedData.current[current].includes(term)) {
      deletedData.current[current].push(term);
    }
    localStorage.setItem('deletedGraphData', JSON.stringify(deletedData.current));

    fetchGraph(current);
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
      <div style={{ position: 'absolute', zIndex: 1, top: 20, left: 20, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="輸入關鍵字"
          style={{ fontSize: '1rem', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' }}
        />
        <button
          onClick={() => fetchGraph(keyword)}
          style={{ padding: '0.5rem 1rem', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >探索</button>
        <button
          onClick={handleBack}
          disabled={history.length === 0}
          style={{ padding: '0.5rem 1rem', backgroundColor: history.length === 0 ? '#ccc' : '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: history.length === 0 ? 'not-allowed' : 'pointer' }}
        >← 返回</button>
        <button
          onClick={() => setAddMode(true)}
          style={{ padding: '0.5rem 1rem', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >➕ 新增關聯</button>
        <button
          onClick={() => setShowPanel(!showPanel)}
          style={{ padding: '0.5rem 1rem', backgroundColor: '#888', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >📌 編輯區</button>
      </div>

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel="id"
        onNodeClick={handleClickNode}
        linkDistance={(link) => 300 / Math.pow(link.weight || 1, 1.5)}
        cooldownTicks={80}
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
        d3Force="charge"
        d3ForceConfig={{ charge: -250 }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          if (!node || node.x == null || node.y == null) return;
          const label = node.id;
          const fontSize = (node.main ? 16 : 12) / globalScale;
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = node.main ? 'red' : 'black';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, node.x, node.y);
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          if (!node || node.x == null || node.y == null) return;
          ctx.fillStyle = color;
          const size = node.main ? 20 : 10;
          ctx.beginPath();
          ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
      />

      {addMode && (
        <input
          style={{ position: 'absolute', left: inputPos.x, top: inputPos.y, fontSize: '16px', padding: '4px', zIndex: 10, border: '1px solid #ccc', borderRadius: '4px' }}
          autoFocus
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addCustomRelation(); }}
          placeholder="輸入新詞按 Enter"
        />
      )}

      {showPanel && (
        <div style={{ position: 'absolute', top: 60, right: 0, width: '80vw', maxWidth: 300, background: '#fff', padding: 8, borderRadius: '8px 0 0 8px', maxHeight: '70vh', overflowY: 'auto' }}>
          <strong>關鍵詞：</strong>{keyword}
          <div style={{ marginTop: 8 }}>
            {allLinks.map((term) => (
              <div key={term} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{term}</span>
                <button onClick={() => deleteAnyRelation(term)} style={{ marginLeft: 8 }}>🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <a
        href="https://www.buymeacoffee.com/qooeego"
        target="_blank"
        style={{ position: 'absolute', bottom: 16, right: 16, textDecoration: 'none', fontSize: 14, background: '#ffdd00', padding: '6px 12px', borderRadius: '6px', color: '#000' }}
      >☕ Buy Me a Coffee</a>
    </div>
  );
}
