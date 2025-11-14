import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const defaultInputPos = { x: window.innerWidth / 2 - 100, y: 150 };
const conceptNetUrl = (keyword) => `https://api.conceptnet.io/c/zh/${encodeURIComponent(keyword)}`;
const proxyUrlFactories = [
  (keyword) => `https://cors.isomorphic-git.org/${conceptNetUrl(keyword)}`,
  (keyword) => `https://thingproxy.freeboard.io/fetch/${conceptNetUrl(keyword)}`,
  (keyword) => `https://api.allorigins.win/raw?url=${encodeURIComponent(conceptNetUrl(keyword))}`
];

const fetchWithFallback = async (keyword) => {
  const urlFactories = [conceptNetUrl, ...proxyUrlFactories];
  const attempts = [];
  let lastError;

  for (const builder of urlFactories) {
    const targetUrl = builder(keyword);
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      attempts.push(`${new URL(targetUrl).host}: ${error.message}`);
      lastError = error;
    }
  }

  const detail = attempts.length ? `(${attempts.join('，')})` : '';
  const finalError = new Error(`ConceptNet 請求失敗 ${detail}`.trim());
  finalError.attempts = attempts;
  throw finalError;
};

const downloadJson = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [keyword, setKeyword] = useState('狗');
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [inputPos, setInputPos] = useState(defaultInputPos);
  const [inputValue, setInputValue] = useState('');
  const [allLinks, setAllLinks] = useState([]);
  const [history, setHistory] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusReport, setStatusReport] = useState({ ok: true, attempts: [], lastChecked: null, message: '' });
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [importText, setImportText] = useState('');
  const [importNotice, setImportNotice] = useState(null);
  const fgRef = useRef();

  const userData = useRef(JSON.parse(localStorage.getItem('userGraphData') || '{}'));
  const deletedData = useRef(JSON.parse(localStorage.getItem('deletedGraphData') || '{}'));

  const fetchGraph = async (centerWord) => {
    setLoading(true);
    setErrorMessage('');

    const customTerms = userData.current[centerWord] || [];
    const deletedTerms = new Set(deletedData.current[centerWord] || []);

    let relatedEdges = [];

    try {
      const data = await fetchWithFallback(centerWord);
      setStatusReport({ ok: true, attempts: [], lastChecked: new Date().toISOString(), message: '成功連線 ConceptNet' });
      relatedEdges = (data.edges || [])
        .filter((edge) => {
          const endLabel = edge.end?.label || edge.end?.term;
          return (
            endLabel &&
            endLabel !== centerWord &&
            /^[一-龥]+$/.test(endLabel) &&
            !deletedTerms.has(endLabel)
          );
        })
        .slice(0, 20);
    } catch (error) {
      console.error('探索失敗', error);
      setErrorMessage(`無法連到 ConceptNet，僅顯示自訂關聯。錯誤：${error.message}`);
      setStatusReport({
        ok: false,
        attempts: error.attempts || [],
        lastChecked: new Date().toISOString(),
        message: error.message || '未知錯誤'
      });
    }

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

    setLoading(false);
  };

  useEffect(() => {
    fetchGraph(keyword);
  }, []);

  const handleClickNode = (node) => {
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

  const exportCustomData = () => {
    const payload = {
      userGraphData: userData.current,
      deletedGraphData: deletedData.current,
      exportedAt: new Date().toISOString()
    };
    downloadJson(payload, 'custom-relations.json');
  };

  const importCustomData = () => {
    setImportNotice(null);
    if (!importText.trim()) {
      setImportNotice({ type: 'error', message: '請貼上匯出內容或自行撰寫 JSON。' });
      return;
    }

    try {
      const payload = JSON.parse(importText);
      if (payload.userGraphData) {
        userData.current = payload.userGraphData;
        localStorage.setItem('userGraphData', JSON.stringify(userData.current));
      }
      if (payload.deletedGraphData) {
        deletedData.current = payload.deletedGraphData;
        localStorage.setItem('deletedGraphData', JSON.stringify(deletedData.current));
      }
      setImportNotice({ type: 'success', message: '匯入成功！重新整理圖譜中。' });
      fetchGraph(keyword);
    } catch (error) {
      console.error('匯入自訂資料失敗', error);
      setImportNotice({ type: 'error', message: `匯入失敗：${error.message}` });
    }
  };

  const renderStatusAttempts = () => {
    if (statusReport.ok) {
      return <p style={{ margin: '0.5rem 0' }}>最近一次已成功連線 ConceptNet，可以直接探索官方資料。</p>;
    }

    if (!statusReport.attempts.length) {
      return <p style={{ margin: '0.5rem 0' }}>尚未偵測到連線結果，請嘗試輸入關鍵字後再查看。</p>;
    }

    return (
      <ul style={{ paddingLeft: '1.25rem', margin: '0.5rem 0' }}>
        {statusReport.attempts.map((attempt, index) => (
          <li key={`${attempt}-${index}`}>{attempt}</li>
        ))}
      </ul>
    );
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
          onClick={() => {
            setInputPos(defaultInputPos);
            setAddMode(true);
          }}
          style={{ padding: '0.5rem 1rem', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >➕ 新增關聯</button>
        <button
          onClick={() => setShowPanel(!showPanel)}
          style={{ padding: '0.5rem 1rem', backgroundColor: '#888', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >{showPanel ? '▶️ 收起編輯區' : '📌 編輯區'}</button>
        <button
          onClick={() => setShowStatusPanel(!showStatusPanel)}
          style={{ padding: '0.5rem 1rem', backgroundColor: '#9b59b6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >{showStatusPanel ? '🛰️ 關閉連線說明' : '🛰️ 連線說明'}</button>
        {loading && <span style={{ alignSelf: 'center', color: '#444' }}>載入中...</span>}
        {errorMessage && (
          <span style={{ width: '100%', color: '#c0392b', fontWeight: 600 }}>{errorMessage}</span>
        )}
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
          try {
            if (!node || node.x == null || node.y == null || isNaN(node.x) || isNaN(node.y)) return;
            const label = node.id;
            const fontSize = (node.main ? 16 : 12) / globalScale;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillStyle = node.main ? 'red' : 'black';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, node.x, node.y);
          } catch {}
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          try {
            if (!node || node.x == null || node.y == null || isNaN(node.x) || isNaN(node.y)) return;
            ctx.fillStyle = color;
            const size = node.main ? 20 : 10;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
            ctx.fill();
          } catch {}
        }}
      />

      {addMode && inputPos && (
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
        <div style={{ position: 'absolute', top: 60, right: 0, width: '33vw', maxWidth: 360, background: '#fff', padding: 12, borderRadius: '12px 0 0 12px', maxHeight: '80vh', overflowY: 'auto', overflowX: 'auto', boxShadow: '-4px 6px 16px rgba(0,0,0,0.1)' }}>
          <strong>關鍵詞：</strong>{keyword}
          <div style={{ marginTop: 8 }}>
            {allLinks.map((term) => (
              <div key={term} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{term}</span>
                <button onClick={() => deleteAnyRelation(term)} style={{ marginLeft: 8 }}>🗑️</button>
              </div>
            ))}
          </div>

          <hr style={{ margin: '12px 0' }} />
          <div>
            <strong>自訂資料庫工具</strong>
            <p style={{ fontSize: 12, color: '#555' }}>
              所有自訂關聯都儲存在瀏覽器的 localStorage。若你想建立自己的資料庫，可以匯出後備份或手動編輯 JSON 再匯入。
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 8 }}>
              <button onClick={exportCustomData} style={{ padding: '0.3rem 0.75rem', borderRadius: 4, border: '1px solid #27ae60', background: '#27ae60', color: '#fff' }}>⬇️ 匯出 JSON</button>
              <button onClick={() => { setImportText(''); setImportNotice(null); }} style={{ padding: '0.3rem 0.75rem', borderRadius: 4, border: '1px solid #ccc', background: '#ecf0f1' }}>🧹 清空匯入區</button>
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="貼上包含 userGraphData / deletedGraphData 的 JSON，或自行撰寫新的資料結構"
              style={{ width: '100%', minHeight: 100, borderRadius: 6, border: '1px solid #ddd', padding: 8, fontFamily: 'monospace', fontSize: 12 }}
            />
            <button onClick={importCustomData} style={{ marginTop: 8, padding: '0.4rem 0.8rem', borderRadius: 4, border: '1px solid #2980b9', background: '#2980b9', color: '#fff' }}>⬆️ 匯入 / 套用</button>
            {importNotice && (
              <div style={{ marginTop: 6, fontSize: 12, color: importNotice.type === 'error' ? '#c0392b' : '#27ae60' }}>
                {importNotice.message}
              </div>
            )}
          </div>
        </div>
      )}

      {showStatusPanel && (
        <div style={{ position: 'absolute', bottom: 16, left: 16, width: 'min(420px, 90vw)', background: '#fff', padding: 16, borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.15)' }}>
          <strong style={{ fontSize: 16 }}>ConceptNet 連線說明</strong>
          <p style={{ margin: '0.25rem 0', fontSize: 12, color: '#666' }}>
            {statusReport.lastChecked ? `最後檢查：${new Date(statusReport.lastChecked).toLocaleString()}` : '尚未進行檢查'}
          </p>
          <p style={{ margin: '0.5rem 0' }}>{statusReport.message || '尚未偵測到錯誤。'}</p>
          {renderStatusAttempts()}
          <p style={{ marginTop: 12, fontSize: 13 }}>
            ConceptNet 是免費的研究專案，偶爾會維護或被地區性網路封鎖。你可以等候官方 API 恢復，或透過上方的「自訂資料庫工具」建立 / 匯入自己的關聯資料庫，同時繼續新增節點。
          </p>
          <p style={{ marginTop: 8, fontSize: 13 }}>
            如果需要另一個資料來源，可以改用匯入的 JSON 檔，或在 proxy 清單中加入你自己的可用伺服器。
          </p>
        </div>
      )}

      <a
        href="https://www.buymeacoffee.com/qooeego"
        target="_blank"
        style={{ position: 'absolute', bottom: 16, right: 16, textDecoration: 'none', fontSize: 16, fontWeight: 'bold', background: '#ffdd00', padding: '6px 12px', borderRadius: '6px', color: '#000' }}
      >☕ Buy Me a Coffee</a>
    </div>
  );
}
