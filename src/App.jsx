import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const loadStoredMemberProfile = () => {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('memberProfile'));
  } catch {
    return null;
  }
};

const loadStoredMembers = () => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('simpleMembers')) || {};
  } catch {
    return {};
  }
};

const loadCustomProxyTemplates = () => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(localStorage.getItem('conceptNetCustomProxies'));
    if (Array.isArray(stored)) {
      return stored.filter((entry) => entry && entry.template);
    }
  } catch {}
  return [];
};

const persistMembers = (members) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('simpleMembers', JSON.stringify(members));
  } catch {}
};

const defaultInputPos = { x: window.innerWidth / 2 - 100, y: 150 };
const supportedLanguages = [
  { value: 'zh', label: '中文 (zh)' },
  { value: 'en', label: 'English (en)' }
];
const providerLabels = {
  local: '站內帳號'
};
const conceptNetUrl = (keyword, language) =>
  `https://api.conceptnet.io/query?node=/c/${language}/${encodeURIComponent(keyword)}`;

const extractJsonFromText = (text) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const possibleJson = text.slice(firstBrace, lastBrace + 1);
      return JSON.parse(possibleJson);
    }
    throw error;
  }
};

const fallbackEndpoints = [
  {
    label: 'conceptnet.io',
    build: conceptNetUrl,
    parser: (response) => response.json()
  },
  {
    label: 'cors.isomorphic-git.org',
    build: (keyword, language) => `https://cors.isomorphic-git.org/${conceptNetUrl(keyword, language)}`,
    parser: (response) => response.json()
  },
  {
    label: 'corsproxy.io',
    build: (keyword, language) => `https://corsproxy.io/?${conceptNetUrl(keyword, language)}`,
    parser: (response) => response.json()
  },
  {
    label: 'corsproxy.org',
    build: (keyword, language) =>
      `https://corsproxy.org/?${encodeURIComponent(conceptNetUrl(keyword, language))}`,
    parser: (response) => response.json()
  },
  {
    label: 'yacdn.org',
    build: (keyword, language) => `https://yacdn.org/proxy/${conceptNetUrl(keyword, language)}`,
    parser: async (response) => extractJsonFromText(await response.text())
  },
  {
    label: 'api.codetabs.com',
    build: (keyword, language) =>
      `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(conceptNetUrl(keyword, language))}`,
    parser: (response) => response.json()
  },
  {
    label: 'proxy.cors.sh',
    build: (keyword, language) => `https://proxy.cors.sh/${conceptNetUrl(keyword, language)}`,
    parser: (response) => response.json(),
    init: () => ({
      headers: {
        'x-cors-api-key': 'temp_d4e5a6b7c8d9e0f1g2h3i4j5'
      }
    })
  },
  {
    label: 'thingproxy.freeboard.io',
    build: (keyword, language) => `https://thingproxy.freeboard.io/fetch/${conceptNetUrl(keyword, language)}`,
    parser: (response) => response.json()
  },
  {
    label: 'api.allorigins.win',
    build: (keyword, language) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(conceptNetUrl(keyword, language))}`,
    parser: (response) => response.json()
  },
  {
    label: 'r.jina.ai mirror',
    build: (keyword, language) =>
      `https://r.jina.ai/http://api.conceptnet.io/query?node=/c/${language}/${encodeURIComponent(keyword)}`,
    parser: async (response) => {
      try {
        return extractJsonFromText(await response.text());
      } catch (error) {
        throw new Error(`Mirror JSON 解析失敗: ${error.message}`);
      }
    }
  },
  {
    label: 'r.jina.ai · cors.isomorphic',
    build: (keyword, language) =>
      `https://r.jina.ai/http://cors.isomorphic-git.org/${conceptNetUrl(keyword, language)}`,
    parser: async (response) => {
      try {
        return extractJsonFromText(await response.text());
      } catch (error) {
        throw new Error(`Mirror JSON 解析失敗: ${error.message}`);
      }
    }
  }
];

const buildCustomProxyUrl = (template, keyword, language) => {
  if (!template) return conceptNetUrl(keyword, language);
  const target = conceptNetUrl(keyword, language);
  const hasRawToken = template.includes('{{url}}');
  const hasEncodedToken = template.includes('{{encodedUrl}}');
  if (!hasRawToken && !hasEncodedToken) {
    return `${template}${target}`;
  }
  return template
    .replaceAll('{{encodedUrl}}', encodeURIComponent(target))
    .replaceAll('{{url}}', target);
};

const fetchWithFallback = async (keyword, language, extraEndpoints = []) => {
  const attempts = [];
  let lastError;
  const endpoints = [...extraEndpoints, ...fallbackEndpoints];

  for (const endpoint of endpoints) {
    let targetUrl = '';
    try {
      targetUrl = endpoint.build(keyword, language);
      const init =
        typeof endpoint.init === 'function'
          ? endpoint.init(keyword, language)
          : endpoint.init || undefined;
      const response = await fetch(targetUrl, init);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await endpoint.parser(response);
      return {
        data,
        endpointLabel: endpoint.label || new URL(targetUrl).host,
        endpointUrl: targetUrl
      };
    } catch (error) {
      try {
        attempts.push(`${endpoint.label || new URL(targetUrl).host}: ${error.message}`);
      } catch {
        attempts.push(`${endpoint.label || targetUrl}: ${error.message}`);
      }
      lastError = error;
    }
  }

  const detail = attempts.length ? `(${attempts.join('，')})` : '';
  const finalError = new Error(`ConceptNet 請求失敗 ${detail}`.trim());
  finalError.attempts = attempts;
  throw finalError;
};

const loadStoredClickCounts = () => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('nodeClickCounts')) || {};
  } catch (error) {
    console.warn('Failed to parse node click counts', error);
    return {};
  }
};

const persistCustomProxyTemplates = (templates) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('conceptNetCustomProxies', JSON.stringify(templates));
  } catch {}
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
  const [language, setLanguage] = useState(() => localStorage.getItem('conceptNetLanguage') || 'zh');
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [inputPos, setInputPos] = useState(defaultInputPos);
  const [inputValue, setInputValue] = useState('');
  const [allLinks, setAllLinks] = useState([]);
  const [history, setHistory] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusReport, setStatusReport] = useState({
    ok: true,
    attempts: [],
    lastChecked: null,
    message: '',
    endpointLabel: ''
  });
  const [showStatusPanel, setShowStatusPanel] = useState(false);
  const [importText, setImportText] = useState('');
  const [importNotice, setImportNotice] = useState(null);
  const [isDragOverImport, setIsDragOverImport] = useState(false);
  const [memberProfile, setMemberProfile] = useState(loadStoredMemberProfile);
  const [authNotice, setAuthNotice] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authForm, setAuthForm] = useState({ account: '', password: '', confirm: '' });
  const [customProxyTemplates, setCustomProxyTemplates] = useState(loadCustomProxyTemplates);
  const [proxyForm, setProxyForm] = useState({ label: '', template: '' });
  const [proxyNotice, setProxyNotice] = useState('');
  const clickCountsRef = useRef(loadStoredClickCounts());
  const [clickCountsSnapshot, setClickCountsSnapshot] = useState(clickCountsRef.current);
  const fgRef = useRef();
  const graphCacheRef = useRef({});
  const inFlightPrefetchRef = useRef(new Set());
  const activeRequestRef = useRef(0);
  const membersRef = useRef(loadStoredMembers());
  const proxiesHydratedRef = useRef(false);

  const userData = useRef(JSON.parse(localStorage.getItem('userGraphData') || '{}'));
  const deletedData = useRef(JSON.parse(localStorage.getItem('deletedGraphData') || '{}'));
  const customProxyEndpoints = useMemo(
    () =>
      customProxyTemplates.map((entry, index) => ({
        label: entry.label || `自訂代理 ${index + 1}`,
        build: (currentKeyword, currentLang) =>
          buildCustomProxyUrl(entry.template, currentKeyword, currentLang),
        parser: async (response) => extractJsonFromText(await response.text())
      })),
    [customProxyTemplates]
  );

  const resolveTermLabel = (concept) => {
    if (!concept) return '';
    if (concept.label) return concept.label;
    if (concept.term) {
      const parts = concept.term.split('/');
      return parts[parts.length - 1];
    }
    return '';
  };

  const getScopedKey = (currentLang, centerWord) => `${currentLang}:${centerWord}`;

  const getEndpointId = (endpoint) => {
    if (!endpoint) return '';
    return typeof endpoint === 'string' ? endpoint : endpoint.id || '';
  };

  const resolveNeighborId = (link, focusId) => {
    if (!link) return '';
    const targetId = getEndpointId(link.target);
    if (targetId && targetId !== focusId) return targetId;
    const sourceId = getEndpointId(link.source);
    if (sourceId && sourceId !== focusId) return sourceId;
    return targetId || sourceId || '';
  };

  const refreshClickCountsSnapshot = () => {
    const latest = loadStoredClickCounts();
    clickCountsRef.current = latest;
    setClickCountsSnapshot(latest);
  };

  const applyMemberProfile = (profile) => {
    if (!profile) return;
    const normalizedProfile = {
      provider: profile.provider,
      name: profile.name,
      email: profile.email,
      avatar: profile.avatar,
      id: profile.id,
      lastLoginAt: new Date().toISOString()
    };
    setMemberProfile(normalizedProfile);
    try {
      localStorage.setItem('memberProfile', JSON.stringify(normalizedProfile));
    } catch {}
  };

  const clearMemberProfile = () => {
    setMemberProfile(null);
    try {
      localStorage.removeItem('memberProfile');
    } catch {}
  };

  const resetAuthForm = () => setAuthForm({ account: '', password: '', confirm: '' });

  const handleLocalAuth = (event) => {
    event?.preventDefault?.();
    const trimmedAccount = authForm.account.trim();
    if (!trimmedAccount || !authForm.password || !authForm.confirm) {
      setAuthNotice('請完整填寫帳號、密碼與確認密碼。');
      return;
    }
    if (authForm.password !== authForm.confirm) {
      setAuthNotice('密碼與確認密碼不一致。');
      return;
    }

    const existingMembers = membersRef.current || {};
    const existing = existingMembers[trimmedAccount];

    if (existing) {
      if (existing.password !== authForm.password) {
        setAuthNotice('密碼不正確，請再試一次。');
        return;
      }
      applyMemberProfile({
        provider: 'local',
        name: trimmedAccount,
        id: trimmedAccount
      });
      setAuthNotice('登入成功，已記住此帳號。');
    } else {
      const nextMembers = {
        ...existingMembers,
        [trimmedAccount]: {
          password: authForm.password,
          createdAt: new Date().toISOString()
        }
      };
      membersRef.current = nextMembers;
      persistMembers(nextMembers);
      applyMemberProfile({
        provider: 'local',
        name: trimmedAccount,
        id: trimmedAccount
      });
      setAuthNotice('註冊並登入成功！');
    }

    resetAuthForm();
  };

  const persistClickCounts = (nextCounts) => {
    clickCountsRef.current = nextCounts;
    if (typeof window !== 'undefined') {
      localStorage.setItem('nodeClickCounts', JSON.stringify(nextCounts));
    }
  };

  const getCustomSets = (centerWord, currentLang) => {
    const scopedKey = getScopedKey(currentLang, centerWord);
    const legacyCustomTerms = userData.current[centerWord] || [];
    const legacyDeletedTerms = deletedData.current[centerWord] || [];
    const customTerms = userData.current[scopedKey] || legacyCustomTerms;
    const deletedTerms = new Set(deletedData.current[scopedKey] || legacyDeletedTerms);
    return { scopedKey, customTerms, deletedTerms };
  };

  const buildGraphPayload = (centerWord, currentLang, relatedEdges, customTerms, deletedTerms) => {
    const allRelated = Array.from(
      new Set([
        ...relatedEdges.map((item) => item.relatedTerm),
        ...customTerms
      ])
    ).filter((term) => !deletedTerms.has(term));

    return {
      nodes: [
        { id: centerWord, main: true },
        ...allRelated.map((r) => ({ id: r }))
      ],
      links: [
        ...relatedEdges.map(({ relatedTerm, edge }) => ({
          source: centerWord,
          target: relatedTerm,
          weight: Math.max(1, (edge.weight || 1) * 2)
        })),
        ...customTerms
          .filter((term) => !deletedTerms.has(term))
          .map((term) => ({
            source: centerWord,
            target: term,
            weight: 4
          }))
      ],
      allRelated
    };
  };

  const cacheGraphPayload = (scopedKey, payload) => {
    graphCacheRef.current[scopedKey] = { ...payload, timestamp: Date.now() };
  };

  const applyGraphPayload = (payload, shouldReheat = true) => {
    setGraphData({ nodes: payload.nodes, links: payload.links });
    setAllLinks(payload.allRelated);
    if (shouldReheat && fgRef.current) {
      fgRef.current.d3ReheatSimulation();
    }
  };

  const normalizeEdges = (edges, centerWord, currentLang, deletedTerms) =>
    (edges || [])
      .map((edge) => {
        const startLabel = resolveTermLabel(edge.start);
        const endLabel = resolveTermLabel(edge.end);

        let relatedTerm = endLabel;
        let relatedLanguage = edge.end?.language;

        if (startLabel === centerWord && endLabel === centerWord) {
          relatedTerm = '';
        } else if (startLabel === centerWord) {
          relatedTerm = endLabel;
          relatedLanguage = edge.end?.language;
        } else if (endLabel === centerWord) {
          relatedTerm = startLabel;
          relatedLanguage = edge.start?.language;
        }

        return {
          relatedTerm,
          relatedLanguage,
          edge
        };
      })
      .filter(({ relatedTerm, relatedLanguage }) => {
        if (!relatedTerm || relatedTerm === centerWord) return false;
        if (relatedLanguage && relatedLanguage !== currentLang) return false;
        return !deletedTerms.has(relatedTerm);
      })
      .slice(0, 20);

  const schedulePrefetch = (terms, currentLang) => {
    terms.slice(0, 6).forEach((term) => {
      const scopedKey = getScopedKey(currentLang, term);
      if (graphCacheRef.current[scopedKey] || inFlightPrefetchRef.current.has(scopedKey)) return;
      inFlightPrefetchRef.current.add(scopedKey);
      setTimeout(async () => {
        try {
          const { customTerms, deletedTerms } = getCustomSets(term, currentLang);
          const { data } = await fetchWithFallback(term, currentLang, customProxyEndpoints);
          const normalized = normalizeEdges(data.edges, term, currentLang, deletedTerms);
          const payload = buildGraphPayload(term, currentLang, normalized, customTerms, deletedTerms);
          cacheGraphPayload(scopedKey, payload);
        } catch (error) {
          console.warn('Prefetch failed', term, currentLang, error);
        } finally {
          inFlightPrefetchRef.current.delete(scopedKey);
        }
      }, 0);
    });
  };

  const fetchGraph = async (centerWord, currentLang = language) => {
    setErrorMessage('');
    const { scopedKey, customTerms, deletedTerms } = getCustomSets(centerWord, currentLang);
    const cachedPayload = graphCacheRef.current[scopedKey];
    if (cachedPayload) {
      applyGraphPayload(cachedPayload, false);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const requestId = ++activeRequestRef.current;

    try {
      const { data, endpointLabel } = await fetchWithFallback(centerWord, currentLang, customProxyEndpoints);
      if (activeRequestRef.current !== requestId) return;
      setStatusReport({
        ok: true,
        attempts: [],
        lastChecked: new Date().toISOString(),
        message: `成功連線 ConceptNet (${currentLang})`,
        endpointLabel: endpointLabel || ''
      });
      const relatedEdges = normalizeEdges(data.edges, centerWord, currentLang, deletedTerms);
      const payload = buildGraphPayload(centerWord, currentLang, relatedEdges, customTerms, deletedTerms);
      cacheGraphPayload(scopedKey, payload);
      applyGraphPayload(payload);
      refreshClickCountsSnapshot();
      schedulePrefetch(payload.allRelated, currentLang);
      setLoading(false);
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      console.error('探索失敗', error);
      setErrorMessage(`無法連到 ConceptNet (${currentLang})，僅顯示自訂關聯。錯誤：${error.message}`);
      setStatusReport({
        ok: false,
        attempts: error.attempts || [],
        lastChecked: new Date().toISOString(),
        message: `${currentLang}: ${error.message || '未知錯誤'}`,
        endpointLabel: ''
      });
      const fallbackPayload = buildGraphPayload(centerWord, currentLang, [], customTerms, deletedTerms);
      cacheGraphPayload(scopedKey, fallbackPayload);
      applyGraphPayload(fallbackPayload);
      setLoading(false);
    }
  };

  const invalidateCache = (scopedKey) => {
    if (graphCacheRef.current[scopedKey]) {
      delete graphCacheRef.current[scopedKey];
    }
  };

  useEffect(() => {
    fetchGraph(keyword, language);
  }, [language]);

  useEffect(() => {
    if (!proxiesHydratedRef.current) {
      proxiesHydratedRef.current = true;
      return;
    }
    fetchGraph(keyword, language);
  }, [customProxyTemplates]);

  useEffect(() => {
    if (!showAuthModal) {
      setAuthNotice('');
      resetAuthForm();
    }
  }, [showAuthModal]);

  const handleAddCustomProxy = (event) => {
    event?.preventDefault?.();
    setProxyNotice('');
    const trimmedTemplate = proxyForm.template.trim();
    if (!trimmedTemplate) {
      setProxyNotice('請輸入代理網址模板。');
      return;
    }
    if (!trimmedTemplate.includes('{{url}}') && !trimmedTemplate.includes('{{encodedUrl}}')) {
      setProxyNotice('模板需包含 {{url}} 或 {{encodedUrl}} 佔位符。');
      return;
    }

    const trimmedLabel = proxyForm.label.trim() || `自訂代理 ${customProxyTemplates.length + 1}`;
    const next = [
      ...customProxyTemplates,
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        label: trimmedLabel,
        template: trimmedTemplate
      }
    ];
    setCustomProxyTemplates(next);
    persistCustomProxyTemplates(next);
    setProxyForm({ label: '', template: '' });
    setProxyNotice('已新增自訂代理，之後的查詢會優先使用。');
  };

  const handleRemoveCustomProxy = (proxyId) => {
    const next = customProxyTemplates.filter((entry) => entry.id !== proxyId);
    setCustomProxyTemplates(next);
    persistCustomProxyTemplates(next);
    setProxyNotice(next.length ? '已移除代理。' : '已清空所有自訂代理。');
  };

  const recordNodeClick = (nodeId, currentLang = language) => {
    if (!nodeId) return;
    const scopedKey = getScopedKey(currentLang, nodeId);
    const next = {
      ...clickCountsRef.current,
      [scopedKey]: (clickCountsRef.current[scopedKey] || 0) + 1
    };
    persistClickCounts(next);
  };

  const getNodeClickCount = (term, currentLang = language) => {
    if (!term) return 0;
    const scopedKey = getScopedKey(currentLang, term);
    return clickCountsSnapshot[scopedKey] || 0;
  };

  const handleClickNode = (node) => {
    if (addMode) return;
    recordNodeClick(node.id, language);
    setHistory((prev) => [...prev, { keyword, language }]);
    setKeyword(node.id);
    fetchGraph(node.id, language);
  };

  const addCustomRelation = () => {
    if (!inputValue.trim()) return;
    const current = keyword;
    const scopedKey = getScopedKey(language, current);
    const newTerm = inputValue.trim();

    userData.current[scopedKey] = userData.current[scopedKey] || [];
    if (!userData.current[scopedKey].includes(newTerm)) {
      userData.current[scopedKey].push(newTerm);
    }
    localStorage.setItem('userGraphData', JSON.stringify(userData.current));

    deletedData.current[scopedKey] = (deletedData.current[scopedKey] || []).filter((t) => t !== newTerm);
    localStorage.setItem('deletedGraphData', JSON.stringify(deletedData.current));

    setInputValue('');
    setAddMode(false);
    invalidateCache(scopedKey);
    fetchGraph(current, language);
  };

  const deleteAnyRelation = (term) => {
    const current = keyword;
    const scopedKey = getScopedKey(language, current);
    deletedData.current[scopedKey] = deletedData.current[scopedKey] || [];
    if (!deletedData.current[scopedKey].includes(term)) {
      deletedData.current[scopedKey].push(term);
    }
    localStorage.setItem('deletedGraphData', JSON.stringify(deletedData.current));

    invalidateCache(scopedKey);
    fetchGraph(current, language);
  };

  const handleLogout = () => {
    clearMemberProfile();
    setAuthNotice('已登出。');
    resetAuthForm();
  };

  const handleBack = () => {
    if (history.length === 0) return;
    const prev = [...history];
    const last = prev.pop();
    setHistory(prev);
    if (!last) return;
    setKeyword(last.keyword);
    if (last.language && last.language !== language) {
      setLanguage(last.language);
      localStorage.setItem('conceptNetLanguage', last.language);
    } else {
      fetchGraph(last.keyword, last.language || language);
    }
  };

  const exportCustomData = () => {
    const payload = {
      userGraphData: userData.current,
      deletedGraphData: deletedData.current,
      exportedAt: new Date().toISOString()
    };
    downloadJson(payload, 'custom-relations.json');
  };

  const applyCustomPayload = (payload, successMessage = '匯入成功！重新整理圖譜中。') => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('JSON 內容必須是物件');
    }

    if (payload.userGraphData) {
      userData.current = payload.userGraphData;
      localStorage.setItem('userGraphData', JSON.stringify(userData.current));
    }
    if (payload.deletedGraphData) {
      deletedData.current = payload.deletedGraphData;
      localStorage.setItem('deletedGraphData', JSON.stringify(deletedData.current));
    }

    graphCacheRef.current = {};

    setImportNotice({ type: 'success', message: successMessage });
    fetchGraph(keyword, language);
  };

  const importCustomData = () => {
    setImportNotice(null);
    if (!importText.trim()) {
      setImportNotice({ type: 'error', message: '請貼上匯出內容或自行撰寫 JSON。' });
      return;
    }

    try {
      const payload = JSON.parse(importText);
      applyCustomPayload(payload);
    } catch (error) {
      console.error('匯入自訂資料失敗', error);
      setImportNotice({ type: 'error', message: `匯入失敗：${error.message}` });
    }
  };

  const handleImportDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOverImport(true);
  };

  const handleImportDragLeave = (event) => {
    event.preventDefault();
    const nextTarget = event.relatedTarget;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setIsDragOverImport(false);
  };

  const handleImportDrop = async (event) => {
    event.preventDefault();
    setIsDragOverImport(false);
    setImportNotice(null);
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      setImportNotice({ type: 'error', message: '找不到檔案，請拖曳 JSON 檔案後再試一次。' });
      return;
    }

    try {
      const text = await file.text();
      setImportText(text);
      const payload = JSON.parse(text);
      applyCustomPayload(payload, `已套用檔案「${file.name}」。`);
    } catch (error) {
      console.error('拖曳匯入失敗', error);
      setImportNotice({ type: 'error', message: `拖曳匯入失敗：${error.message}` });
    }
  };

  const renderStatusAttempts = () => {
    if (statusReport.ok) {
      return (
        <p style={{ margin: '0.5rem 0' }}>
          最近一次已成功連線 ConceptNet（{language.toUpperCase()}）
          {statusReport.endpointLabel ? ` · 代理：${statusReport.endpointLabel}` : ''}，可以直接探索官方資料。
        </p>
      );
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

  const authTriggerLabel = memberProfile
    ? `👤 ${memberProfile.name || '會員'} · 管理帳號`
    : '登入 / 註冊 · 記住會員資訊';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <button
        onClick={() => setShowAuthModal(true)}
        style={{
          position: 'absolute',
          top: 12,
          right: 16,
          zIndex: 2,
          fontSize: 12,
          color: '#2c3e50',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textDecoration: 'underline'
        }}
      >
        {authTriggerLabel}
      </button>
      <div style={{ position: 'absolute', zIndex: 1, top: 20, left: 20, display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={language === 'en' ? 'Enter a keyword' : '輸入關鍵字'}
          style={{ fontSize: '1rem', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' }}
        />
        <select
          value={language}
          onChange={(e) => {
            const nextLang = e.target.value;
            setLanguage(nextLang);
            localStorage.setItem('conceptNetLanguage', nextLang);
          }}
          style={{ padding: '0.5rem', borderRadius: 4, border: '1px solid #ccc' }}
        >
          {supportedLanguages.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          onClick={() => fetchGraph(keyword, language)}
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
        linkDistance={(link) => {
          const baseDistance = 300 / Math.pow(link.weight || 1, 1.5);
          const neighborId = resolveNeighborId(link, keyword);
          const clickBoost = 1 + getNodeClickCount(neighborId, language) * 0.4;
          return Math.max(60, baseDistance / clickBoost);
        }}
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
          placeholder={language === 'en' ? 'Enter a new term and press Enter' : '輸入新詞按 Enter'}
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
              所有自訂關聯都儲存在瀏覽器的 localStorage（鍵值格式為「語言:關鍵詞」，例如 zh:狗）。若你想建立自己的資料庫，可以匯出後備份或手動編輯 JSON 再匯入。
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 8 }}>
              <button onClick={exportCustomData} style={{ padding: '0.3rem 0.75rem', borderRadius: 4, border: '1px solid #27ae60', background: '#27ae60', color: '#fff' }}>⬇️ 匯出 JSON</button>
              <button onClick={() => { setImportText(''); setImportNotice(null); }} style={{ padding: '0.3rem 0.75rem', borderRadius: 4, border: '1px solid #ccc', background: '#ecf0f1' }}>🧹 清空匯入區</button>
            </div>
            <div
              onDragOver={handleImportDragOver}
              onDragLeave={handleImportDragLeave}
              onDrop={handleImportDrop}
              style={{
                border: `2px dashed ${isDragOverImport ? '#2980b9' : '#bbb'}`,
                borderRadius: 8,
                padding: 8,
                background: isDragOverImport ? '#f0f8ff' : '#fafafa'
              }}
            >
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="貼上包含 userGraphData / deletedGraphData 的 JSON，或直接拖曳匯出檔到此處"
                style={{ width: '100%', minHeight: 100, borderRadius: 6, border: '1px solid #ddd', padding: 8, fontFamily: 'monospace', fontSize: 12, background: '#fff' }}
              />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#555' }}>也可以拖曳匯出 JSON 檔到此區，自動填入並套用。</p>
            </div>
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
          <p style={{ margin: '0.5rem 0', fontSize: 12, color: '#333' }}>
            目前語言：<strong>{language.toUpperCase()}</strong> · 查詢網址：
            <a href={conceptNetUrl(keyword || '', language)} target="_blank" rel="noreferrer" style={{ marginLeft: 4 }}>
              /query?node=/c/{language}/{keyword || '…'}
            </a>
          </p>
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 14 }}>預設代理順序</strong>
            <ol style={{ margin: '0.4rem 0', paddingLeft: '1.25rem', fontSize: 12, color: '#444' }}>
              {fallbackEndpoints.map((endpoint, index) => (
                <li key={`${endpoint.label || 'endpoint'}-${index}`}>{endpoint.label || '未命名代理'}</li>
              ))}
            </ol>
            <p style={{ fontSize: 12, color: '#666' }}>列表由程式自動輪詢，成功的代理會立即更新上方狀態。</p>
          </div>
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 14 }}>自訂代理（會優先於預設清單）</strong>
            <p style={{ fontSize: 12, color: '#444', margin: '0.35rem 0' }}>
              模板可使用 <code>{'{{url}}'}</code>（原始 URL）或 <code>{'{{encodedUrl}}'}</code>（編碼後 URL）。例如：
              <code>https://corsproxy.io/?{'{{url}}'}</code>
            </p>
            {customProxyTemplates.length ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.25rem 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {customProxyTemplates.map((entry) => (
                  <li key={entry.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{entry.label}</div>
                      <div style={{ fontSize: 11, color: '#555', wordBreak: 'break-all' }}>{entry.template}</div>
                    </div>
                    <button type="button" onClick={() => handleRemoveCustomProxy(entry.id)} style={{ border: 'none', background: '#e74c3c', color: '#fff', borderRadius: 4, padding: '0 8px', cursor: 'pointer' }}>
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 12, color: '#777' }}>尚未加入自訂代理，將使用預設清單。</p>
            )}
            <form onSubmit={handleAddCustomProxy} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              <input
                value={proxyForm.label}
                onChange={(e) => setProxyForm((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="代理名稱（可留空）"
                style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #ddd' }}
              />
              <textarea
                value={proxyForm.template}
                onChange={(e) => setProxyForm((prev) => ({ ...prev, template: e.target.value }))}
                placeholder="輸入代理網址模板，例如：https://corsproxy.io/?{{url}}"
                rows={2}
                style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }}
              />
              <button type="submit" style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: 'none', background: '#2ecc71', color: '#fff', cursor: 'pointer' }}>
                ➕ 儲存自訂代理
              </button>
            </form>
            {proxyNotice && <p style={{ fontSize: 12, color: '#2c3e50', marginTop: 6 }}>{proxyNotice}</p>}
          </div>
          <p style={{ marginTop: 12, fontSize: 13 }}>
            ConceptNet 是免費的研究專案，偶爾會維護或被地區性網路封鎖。你可以等候官方 API 恢復，或透過上方的「自訂資料庫工具」建立 / 匯入自己的關聯資料庫，同時繼續新增節點。
          </p>
          <p style={{ marginTop: 8, fontSize: 13 }}>
            若有自己的 proxy 或內部備援，可在此面板加入模板，前端會優先嘗試你的設定並在失敗時才退回預設清單。
          </p>
        </div>
      )}

      {showAuthModal && (
        <div
          onClick={() => setShowAuthModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
            padding: 16
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(420px, 95vw)',
              background: '#fff',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16 }}>登入 / 註冊會員</strong>
              <button
                onClick={() => setShowAuthModal(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#333' }}
              >
                ✕
              </button>
            </div>
            {memberProfile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {memberProfile.avatar && (
                    <img src={memberProfile.avatar} alt="會員頭像" style={{ width: 60, height: 60, borderRadius: '50%' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 18 }}>{memberProfile.name || '已登入會員'}</div>
                    {memberProfile.email && <div style={{ fontSize: 13, color: '#555' }}>{memberProfile.email}</div>}
                    <div style={{ fontSize: 12, color: '#777' }}>
                      透過 {providerLabels[memberProfile.provider] || memberProfile.provider} 註冊 / 登入
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #ccc', background: '#f7f7f7', cursor: 'pointer' }}
                >
                  登出並更換帳戶
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 13, color: '#333', marginBottom: 0 }}>
                  不想依賴第三方？直接建立站內帳號吧！只要填寫帳號、密碼與確認密碼，我們就會在本機瀏覽器記住你的會員資訊。
                </p>
                <form onSubmit={handleLocalAuth} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                    帳號
                    <input
                      value={authForm.account}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, account: e.target.value }))}
                      placeholder="輸入帳號"
                      autoComplete="username"
                      style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #ccc' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                    密碼
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder="輸入密碼"
                      autoComplete="new-password"
                      style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #ccc' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                    確認密碼
                    <input
                      type="password"
                      value={authForm.confirm}
                      onChange={(e) => setAuthForm((prev) => ({ ...prev, confirm: e.target.value }))}
                      placeholder="再次輸入密碼"
                      autoComplete="new-password"
                      style={{ padding: '0.5rem', borderRadius: 8, border: '1px solid #ccc' }}
                    />
                  </label>
                  <button
                    type="submit"
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: 8,
                      border: 'none',
                      background: '#2c82c9',
                      color: '#fff',
                      fontSize: 15,
                      cursor: 'pointer'
                    }}
                  >
                    註冊 / 登入
                  </button>
                </form>
                <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
                  所有資料都只會儲存在你的瀏覽器中，包含帳號密碼與自訂的關聯圖。想重新開始時可清除瀏覽器資料或按登出。
                </p>
              </div>
            )}
            {authNotice && <div style={{ fontSize: 12, color: '#555' }}>{authNotice}</div>}
          </div>
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
