import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import Plot from 'react-plotly.js';

const API = 'http://localhost:8000';

// Inject animation keyframes once at module load
(() => {
  if (document.getElementById('hchat-anims')) return;
  const s = document.createElement('style');
  s.id = 'hchat-anims';
  s.textContent = `
    @keyframes hcShimmer {
      0%   { background-position: -600px 0 }
      100% { background-position:  600px 0 }
    }
    @keyframes hcDotBounce {
      0%, 80%, 100% { transform: translateY(0);   opacity: 0.4; }
      40%           { transform: translateY(-6px); opacity: 1;   }
    }
    @keyframes hcReveal {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
  `;
  document.head.appendChild(s);
})();

const styles = {
  connectPage: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#212121' },
  formCard: { background: '#171717', borderRadius: '16px', padding: '40px', width: '420px', border: '1px solid #2d2d2d' },
  formTitle: { color: '#CC0000', fontSize: '28px', fontWeight: 'bold', textAlign: 'center', marginBottom: '4px' },
  formSubtitle: { color: '#888', fontSize: '14px', textAlign: 'center', marginBottom: '32px' },
  formLabel: { color: '#aaa', fontSize: '13px', marginBottom: '4px', display: 'block' },
  formInput: { width: '100%', background: '#2d2d2d', border: '1px solid #444', borderRadius: '8px', padding: '10px 12px', color: '#e0e0e0', fontSize: '14px', outline: 'none', marginBottom: '16px', boxSizing: 'border-box' },
  formBtn: { width: '100%', background: '#CC0000', border: 'none', borderRadius: '8px', padding: '12px', color: 'white', cursor: 'pointer', fontWeight: '700', fontSize: '15px', marginTop: '8px' },
  formError: { color: '#ff5252', fontSize: '13px', textAlign: 'center', marginTop: '12px' },
  container: { display: 'flex', height: '100vh', flexDirection: 'column', background: '#212121' },
  sidebar: { position: 'fixed', left: 0, top: 0, bottom: 0, width: '260px', background: '#171717', borderRight: '1px solid #2d2d2d', padding: '16px', display: 'flex', flexDirection: 'column' },
  main: { marginLeft: '260px', flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' },
  header: { padding: '12px 24px', borderBottom: '1px solid #2d2d2d', display: 'flex', alignItems: 'center', gap: '12px' },
  logo: { color: '#CC0000', fontWeight: 'bold', fontSize: '20px' },
  chatArea: { flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  inputArea: { padding: '16px 24px', borderTop: '1px solid #2d2d2d' },
  inputBox: { display: 'flex', background: '#2d2d2d', borderRadius: '12px', padding: '12px 16px', alignItems: 'center', maxWidth: '768px', margin: '0 auto', width: '100%' },
  input: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#e0e0e0', fontSize: '15px', resize: 'none', fontFamily: 'inherit' },
  sendBtn: { background: '#CC0000', border: 'none', borderRadius: '8px', padding: '8px 16px', color: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '14px' },
  msgUser: { background: '#2d2d2d', padding: '14px 18px', borderRadius: '12px', maxWidth: '768px', margin: '0 auto', width: '100%' },
  msgBot: { background: '#1a1a1a', padding: '14px 18px', borderRadius: '12px', maxWidth: '768px', margin: '0 auto', width: '100%', border: '1px solid #333' },
  chartCard: { background: '#ffffff', borderRadius: '14px', padding: '20px 22px 18px', marginTop: '12px', border: '1px solid #e4e9f2', boxShadow: '0 2px 8px rgba(15,23,42,0.05), 0 12px 32px rgba(15,23,42,0.07)' },
  chartHeader: { display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '14px', paddingBottom: '13px', borderBottom: '1px solid #f0f3f9' },
  chartIcon: { width: '36px', height: '36px', borderRadius: '9px', background: '#eef3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chartTitle: { fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '2px', letterSpacing: '-0.01em', lineHeight: 1.35 },
  chartType: { fontSize: '11px', color: '#94a3b8', fontWeight: '500', letterSpacing: '0.04em' },
  plotWrap: { background: '#ffffff', borderRadius: '8px', overflowX: 'auto', overflowY: 'hidden' },
  insightBox: { background: '#f8faff', border: '1px solid #dce7ff', color: '#1e3a8a', borderRadius: '9px', padding: '11px 15px', marginTop: '13px', fontSize: '12.5px', fontWeight: '500', lineHeight: 1.65, display: 'flex', alignItems: 'flex-start', gap: '8px' },
  insightDot: { width: '7px', height: '7px', borderRadius: '50%', background: '#3b82f6', marginTop: '4px', flexShrink: 0 },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
  chatItem: { padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' },
  chatItemActive: { background: '#2d2d2d' },
  chatItemHover: { background: '#252525' },
  newChatBtn: { width: '100%', background: 'transparent', border: '1px solid #444', borderRadius: '8px', padding: '10px', color: '#e0e0e0', cursor: 'pointer', fontSize: '13px', marginBottom: '16px', textAlign: 'left' },
  profileBtn: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderTop: '1px solid #2d2d2d', cursor: 'pointer', marginTop: 'auto' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
};

// Business colour system — blue family with grey-blue tones
const CHART_COLORS = {
  // Bar shades: light grey-blue (low value) → rich blue (high value)
  barShades: ['#c8d6ee', '#a8bee4', '#7fa2d8', '#5580cc', '#3a65be', '#2450ae', '#163d9a'],
  // Line / scatter: amber accent reads clearly over white
  line: '#f59e0b',
  // Pie: blue + slate shades interleaved for variety
  pie: ['#2450ae', '#4f75e8', '#7fa2d8', '#94a3b8', '#3a65be', '#60a5fa', '#a8bee4', '#cbd5e1'],
  grid: '#f0f4fb',
  axis: '#cbd5e1',
  tickLabel: '#94a3b8',
  axisTitle: '#64748b',
  hover: { bg: '#1e293b', text: '#f8fafc' },
};

// Assign each bar a shade based on its rank (lowest value = lightest, highest = darkest)
function barColors(values) {
  const n = values.length;
  if (n === 1) return [CHART_COLORS.barShades[Math.floor(CHART_COLORS.barShades.length / 2)]];
  const ranked = [...values].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const shades = CHART_COLORS.barShades;
  const colors = new Array(n);
  ranked.forEach(({ i }, rank) => {
    const idx = Math.round((rank / (n - 1)) * (shades.length - 1));
    colors[i] = shades[idx];
  });
  return colors;
}

const FONT = 'Inter, Segoe UI, Arial, sans-serif';

const ICON = {
  bar: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3a65be" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>
    </svg>
  ),
  line: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 9 14 13 21 5"/>
    </svg>
  ),
  scatter: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#4f75e8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="18" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="8" cy="14" r="2"/>
    </svg>
  ),
  pie: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/>
    </svg>
  ),
};

function ChartMessage({ chart }) {
  if (!chart || !Array.isArray(chart.x) || !Array.isArray(chart.y)) return null;

  const type = chart.type || 'bar';
  const isPie = type === 'pie';
  const isLine = type === 'line' || type === 'scatter';
  const chartWidth = isPie ? 660 : Math.max(660, chart.x.length * 108);

  const trace = isPie
    ? {
        type: 'pie',
        labels: chart.x,
        values: chart.y,
        hole: 0.46,
        textinfo: 'label+percent',
        textposition: 'outside',
        textfont: { size: 11.5, family: FONT, color: '#374151' },
        marker: { colors: CHART_COLORS.pie, line: { color: '#ffffff', width: 2.5 } },
        hovertemplate: '<b>%{label}</b><br>%{value:,.0f}  ·  %{percent}<extra></extra>',
        pull: chart.x.map(() => 0.015),
        sort: false,
      }
    : {
        type: type === 'scatter' ? 'scatter' : type,
        mode: isLine ? 'lines+markers' : undefined,
        x: chart.x,
        y: chart.y,
        name: chart.seriesName || 'Value',
        line: isLine ? { color: CHART_COLORS.line, width: 2.5, shape: 'spline', smoothing: 0.8 } : undefined,
        marker: {
          color: isLine ? CHART_COLORS.line : barColors(chart.y),
          size: isLine ? 8 : undefined,
          symbol: isLine ? 'circle' : undefined,
          line: { color: '#ffffff', width: isLine ? 2 : 0 },
          cornerradius: type === 'bar' ? 4 : undefined,
        },
        width: type === 'bar' ? 0.46 : undefined,
        opacity: 1,
        hovertemplate: `<b>%{x}</b><br>${chart.yLabel || 'Value'}: <b>%{y:,.0f}</b><extra></extra>`,
      };

  const sharedAxisStyle = {
    tickfont: { color: CHART_COLORS.tickLabel, size: 11, family: FONT },
    linecolor: CHART_COLORS.axis,
    linewidth: 1,
    mirror: false,
    zeroline: false,
  };

  const layout = {
    autosize: true,
    height: 380,
    margin: { l: 72, r: 20, t: 20, b: 72 },
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: { family: FONT, color: CHART_COLORS.tickLabel, size: 12 },
    showlegend: isPie,
    legend: {
      orientation: 'h', x: 0.5, xanchor: 'center', y: -0.16,
      font: { size: 12, color: '#334155', family: FONT },
      itemsizing: 'constant', bgcolor: 'rgba(0,0,0,0)',
    },
    hoverlabel: {
      bgcolor: CHART_COLORS.hover.bg, bordercolor: CHART_COLORS.hover.bg,
      font: { color: CHART_COLORS.hover.text, family: FONT, size: 12.5 },
    },
    bargap: 0.5,
    xaxis: isPie ? undefined : {
      ...sharedAxisStyle,
      title: { text: chart.xLabel || '', standoff: 14, font: { size: 12, color: CHART_COLORS.axisTitle, family: FONT, weight: 600 } },
      showgrid: false,
      tickangle: chart.x.length > 6 ? -40 : 0,
      ticks: 'outside',
      ticklen: 4,
      tickcolor: CHART_COLORS.axis,
    },
    yaxis: isPie ? undefined : {
      ...sharedAxisStyle,
      title: { text: chart.yLabel || '', standoff: 14, font: { size: 12, color: CHART_COLORS.axisTitle, family: FONT, weight: 600 } },
      gridcolor: CHART_COLORS.grid,
      gridwidth: 1,
      showgrid: true,
      rangemode: 'tozero',
      showline: false,
    },
  };

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1) + ' Chart';

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <div style={styles.chartIcon}>{ICON[type] || ICON.bar}</div>
        <div>
          <div style={styles.chartTitle}>{chart.title || 'Data Visualization'}</div>
          <div style={styles.chartType}>{typeLabel}</div>
        </div>
      </div>
      <div style={styles.plotWrap}>
        <Plot
          data={[trace]}
          layout={layout}
          config={{
            responsive: true,
            displaylogo: false,
            scrollZoom: true,
            displayModeBar: true,
            modeBarButtonsToRemove: [
              'zoom2d', 'pan2d', 'select2d', 'lasso2d',
              'zoomIn2d', 'zoomOut2d', 'autoScale2d',
              'hoverClosestCartesian', 'hoverCompareCartesian', 'toggleSpikelines',
            ],
            toImageButtonOptions: {
              format: 'png',
              filename: (chart.title || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              height: 800, width: 1200, scale: 2,
            },
          }}
          style={{ width: chartWidth, minWidth: 0 }}
          useResizeHandler
        />
      </div>
      {chart.insight && (
        <div style={styles.insightBox}>
          <div style={styles.insightDot} />
          <span>{chart.insight}</span>
        </div>
      )}
    </div>
  );
}

// ── Chart loading skeleton ────────────────────────────────────────────────────
const SHIMMER = {
  background: 'linear-gradient(90deg, #eef2fb 25%, #dde5f5 50%, #eef2fb 75%)',
  backgroundSize: '600px 100%',
  animation: 'hcShimmer 1.4s infinite linear',
  borderRadius: '6px',
};

const PHASE_LABELS = ['Analyzing your query', 'Building visualization', 'Rendering chart'];
const FAKE_BARS   = [54, 80, 66, 94, 50, 74];

function ChartLoadingPlaceholder() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase(p => (p + 1) % PHASE_LABELS.length), 1700);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ ...styles.chartCard, marginTop: 0 }}>
      {/* Skeleton header */}
      <div style={styles.chartHeader}>
        <div style={{ ...styles.chartIcon, ...SHIMMER, background: undefined }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <div style={{ ...SHIMMER, height: '13px', width: '58%' }} />
          <div style={{ ...SHIMMER, height: '10px', width: '30%' }} />
        </div>
      </div>

      {/* Skeleton bar chart */}
      <div style={{ padding: '8px 4px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '168px', gap: '9px', padding: '0 18px' }}>
          {FAKE_BARS.map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1, height: `${h}%`,
                ...SHIMMER,
                borderRadius: '4px 4px 0 0',
                animationDelay: `${i * 0.09}s`,
              }}
            />
          ))}
        </div>
        <div style={{ height: '1px', background: '#e2e8f0', margin: '0 18px 7px' }} />
        <div style={{ display: 'flex', gap: '9px', padding: '0 18px' }}>
          {FAKE_BARS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: '8px', ...SHIMMER, animationDelay: `${i * 0.09}s` }} />
          ))}
        </div>
      </div>

      {/* Animated phase indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f4f7ff', borderRadius: '9px', padding: '11px 14px', marginTop: '14px' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: '#4f75e8',
                animation: `hcDotBounce 1.1s ${i * 0.18}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
        <span style={{ color: '#3a5fc0', fontSize: '13px', fontWeight: '500', letterSpacing: '0.01em' }}>
          {PHASE_LABELS[phase]}&hellip;
        </span>
      </div>
    </div>
  );
}

// ── Fade-in wrapper for real charts ──────────────────────────────────────────
// Returns true when the user's question is likely requesting a chart/visual
function isChartQuery(q = '') {
  return /^(show\s+me|visualize|visualise)\b/i.test(q.trim());
}

// ── Simple inline loader for text-only queries ────────────────────────────────
const EXEC_LABELS = ['Executing query', 'Fetching results', 'Processing'];

function SimpleLoadingIndicator() {
  const [label, setLabel] = useState(EXEC_LABELS[0]);
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const dotTimer = setInterval(() => setDotCount(d => d >= 3 ? 1 : d + 1), 420);
    const labelTimer = setInterval(() => setLabel(l => {
      const i = EXEC_LABELS.indexOf(l);
      return EXEC_LABELS[(i + 1) % EXEC_LABELS.length];
    }), 2000);
    return () => { clearInterval(dotTimer); clearInterval(labelTimer); };
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 2px' }}>
      {/* Waveform bars */}
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center', height: '18px' }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              width: '3px',
              borderRadius: '2px',
              background: '#4f75e8',
              animation: `hcDotBounce 0.9s ${i * 0.13}s ease-in-out infinite`,
              height: '100%',
            }}
          />
        ))}
      </div>
      <span style={{ color: '#64748b', fontSize: '13.5px', fontWeight: '500' }}>
        {label}{'.'.repeat(dotCount)}
      </span>
    </div>
  );
}

function AnimatedChart({ chart }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div style={{
      opacity: ready ? 1 : 0,
      transform: ready ? 'translateY(0)' : 'translateY(14px)',
      transition: 'opacity 0.48s ease, transform 0.48s ease',
    }}>
      <ChartMessage chart={chart} />
    </div>
  );
}

function ConnectForm({ onConnected, onClose }) {
  const [form, setForm] = useState({ host: '', port: '', username: '', password: '', database: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const connStr = `postgresql://${form.username}:${form.password}@${form.host}:${form.port}/${form.database}`;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/connect`, { connection_string: connStr });
      onConnected(res.data.tables);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
    setLoading(false);
  };

  return (
    <form style={styles.formCard} onSubmit={handleSubmit}>
      <div style={styles.formTitle}>HONDA</div>
      <div style={styles.formSubtitle}>Connect to your PostgreSQL database</div>
      <label style={styles.formLabel}>Host</label>
      <input style={styles.formInput} placeholder="localhost" value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} required />
      <label style={styles.formLabel}>Port</label>
      <input style={styles.formInput} placeholder="5432" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} required />
      <label style={styles.formLabel}>Username</label>
      <input style={styles.formInput} placeholder="postgres" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required />
      <label style={styles.formLabel}>Password</label>
      <input style={styles.formInput} type="password" placeholder="your password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
      <label style={styles.formLabel}>Database</label>
      <input style={styles.formInput} placeholder="your_database_name" value={form.database} onChange={e => setForm({ ...form, database: e.target.value })} required />
      <button style={{ ...styles.formBtn, opacity: loading ? 0.6 : 1 }} type="submit" disabled={loading}>
        {loading ? 'Connecting...' : 'Connect'}
      </button>
      {onClose && <button type="button" onClick={onClose} style={{ ...styles.formBtn, background: '#333', marginTop: '8px' }}>Cancel</button>}
      {error && <div style={styles.formError}>{error}</div>}
    </form>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [tables, setTables] = useState([]);
  const [chats, setChats] = useState([]);  // [{id, title, messages}]
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const chatRef = useRef(null);

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat ? activeChat.messages : [];

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  const handleConnected = (tbls) => {
    setConnected(true);
    setTables(tbls);
    setShowProfile(false);
    if (chats.length === 0) newChat();
  };

  const newChat = () => {
    const id = Date.now();
    const chat = { id, title: 'New Chat', messages: [] };
    setChats(prev => [chat, ...prev]);
    setActiveChatId(id);
  };

  const updateMessages = (newMsgs) => {
    setChats(prev => prev.map(c => {
      if (c.id !== activeChatId) return c;
      const title = c.title === 'New Chat' && newMsgs.length > 0 && newMsgs[0].role === 'user'
        ? newMsgs[0].content.slice(0, 30)
        : c.title;
      return { ...c, messages: newMsgs, title };
    }));
  };

  const getRecentHistory = (chatMessages) => {
    const selected = [];
    let userTurns = 0;

    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      const msg = chatMessages[i];
      if (!msg.content) continue;
      selected.push({ role: msg.role, content: msg.content });
      if (msg.role === 'user') userTurns += 1;
      if (userTurns >= 3) break;
    }

    return selected.reverse();
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    const updated = [...messages, { role: 'user', content: question }];
    updateMessages(updated);
    setLoadingQuery(question);
    setLoading(true);
    try {
      const res = await axios.post(`${API}/query`, { question, history: getRecentHistory(messages) });
      updateMessages([...updated, { role: 'bot', content: res.data.answer, chart: res.data.chart }]);
    } catch (e) {
      updateMessages([...updated, { role: 'bot', content: 'Error: ' + (e.response?.data?.detail || e.message) }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div style={styles.container}>
      {/* Profile modal */}
      {showProfile && (
        <div style={styles.overlay} onClick={() => setShowProfile(false)}>
          <div onClick={e => e.stopPropagation()}>
            <ConnectForm onConnected={handleConnected} onClose={() => setShowProfile(false)} />
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ color: '#CC0000', fontSize: '24px', fontWeight: 'bold' }}>H</span>
          <span style={{ color: '#e0e0e0', fontWeight: '600' }}>Honda Data Assistant</span>
        </div>

        <button style={styles.newChatBtn} onClick={newChat}>+ New Chat</button>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {chats.map(c => (
            <div
              key={c.id}
              style={{ ...styles.chatItem, ...(c.id === activeChatId ? styles.chatItemActive : {}) }}
              onClick={() => setActiveChatId(c.id)}
            >
              {c.title}
            </div>
          ))}
        </div>

        {/* Profile button */}
        <div style={styles.profileBtn} onClick={() => setShowProfile(true)}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#CC0000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '14px' }}>U</div>
          <div>
            <div style={{ color: '#e0e0e0', fontSize: '13px' }}>Profile</div>
            <div style={{ color: '#666', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ ...styles.statusDot, background: connected ? '#4caf50' : '#ff5252' }}></span> {connected ? 'Connected' : 'Not Connected'}
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={styles.main}>
        <div style={styles.header}>
          <span style={styles.logo}>HONDA</span>
          <span style={{ color: '#888', fontSize: '14px' }}>Data Assistant</span>
        </div>

        <div style={styles.chatArea} ref={chatRef}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: '20vh', color: '#666' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', color: '#CC0000' }}>H</div>
              <div style={{ fontSize: '18px', marginBottom: '8px' }}>Honda Data Assistant</div>
              <div style={{ fontSize: '14px' }}>Ask questions about your data in plain English.</div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={msg.role === 'user' ? styles.msgUser : styles.msgBot}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                {msg.role === 'user' ? 'You' : 'Honda Assistant'}
              </div>
              {!msg.chart && <ReactMarkdown>{msg.content}</ReactMarkdown>}
              {msg.chart && <AnimatedChart chart={msg.chart} />}
            </div>
          ))}
          {loading && (
            <div style={styles.msgBot}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '10px' }}>Honda Assistant</div>
              {isChartQuery(loadingQuery)
                ? <ChartLoadingPlaceholder />
                : <SimpleLoadingIndicator />
              }
            </div>
          )}
        </div>

        <div style={styles.inputArea}>
          <div style={styles.inputBox}>
            <textarea
              style={styles.input}
              rows={1}
              placeholder={connected ? "Ask about your data..." : "Connect to a database first (click Profile)..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!connected}
            />
            <button style={{ ...styles.sendBtn, opacity: (!connected || !input.trim()) ? 0.5 : 1 }} onClick={handleSend} disabled={!connected || !input.trim()}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
