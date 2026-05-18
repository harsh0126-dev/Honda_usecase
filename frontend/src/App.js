import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import Plot from 'react-plotly.js';

const API = 'http://localhost:8000';

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
  chartCard: { background: '#ffffff', color: '#172033', borderRadius: '10px', padding: '16px', marginTop: '10px', border: '1px solid #edf1f7', boxShadow: '0 14px 38px rgba(15, 23, 42, 0.07)' },
  chartHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  chartIcon: { width: '24px', height: '24px', borderRadius: '7px', background: '#eef7f1', color: '#22a06b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '13px' },
  chartTitle: { fontSize: '14px', fontWeight: '800', color: '#202938', marginBottom: '3px', letterSpacing: 0 },
  chartType: { fontSize: '11px', color: '#8a94a6', fontWeight: '600' },
  plotWrap: { background: '#ffffff', border: '1px solid #eef2f7', borderRadius: '9px', padding: '14px 12px 8px', overflowX: 'auto', overflowY: 'hidden' },
  insightBox: { background: '#eef5ff', border: '1px solid #dfeaff', color: '#24509a', borderRadius: '8px', padding: '12px 14px', marginTop: '12px', fontSize: '12px', fontWeight: '700', lineHeight: 1.55 },
  insightLabel: { color: '#f59e0b', fontSize: '13px', fontWeight: '900', marginRight: '8px' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
  chatItem: { padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' },
  chatItemActive: { background: '#2d2d2d' },
  chatItemHover: { background: '#252525' },
  newChatBtn: { width: '100%', background: 'transparent', border: '1px solid #444', borderRadius: '8px', padding: '10px', color: '#e0e0e0', cursor: 'pointer', fontSize: '13px', marginBottom: '16px', textAlign: 'left' },
  profileBtn: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderTop: '1px solid #2d2d2d', cursor: 'pointer', marginTop: 'auto' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
};

function ChartMessage({ chart }) {
  if (!chart || !Array.isArray(chart.x) || !Array.isArray(chart.y)) return null;

  const type = chart.type || 'bar';
  const isPie = type === 'pie';
  const chartWidth = isPie ? 680 : Math.max(680, chart.x.length * 105);
  const palette = ['#4f75e8', '#5d8ff0', '#6aa6f8', '#7db7fb', '#9ac8ff', '#bddcff'];
  const accentColor = '#f59e0b';
  const trace = isPie
    ? {
        type: 'pie',
        labels: chart.x,
        values: chart.y,
        hole: 0.45,
        textinfo: 'label+percent',
        marker: { colors: palette, line: { color: '#ffffff', width: 3 } },
        hovertemplate: '%{label}<br>%{value}<br>%{percent}<extra></extra>',
      }
    : {
        type: type === 'scatter' ? 'scatter' : type,
        mode: type === 'line' || type === 'scatter' ? 'lines+markers' : undefined,
        x: chart.x,
        y: chart.y,
        name: chart.seriesName || 'Value',
        line: { color: accentColor, width: 2, shape: 'spline' },
        marker: {
          color: type === 'bar' ? chart.y.map((_, index) => palette[index % palette.length]) : accentColor,
          size: 8,
          line: { color: '#ffffff', width: 1.5 },
        },
        width: type === 'bar' ? 0.42 : undefined,
        opacity: 0.95,
        hovertemplate: `%{x}<br>${chart.yLabel || 'Value'}: %{y}<extra></extra>`,
      };

  const layout = {
    autosize: true,
    height: 350,
    margin: { l: 72, r: 24, t: 34, b: 76 },
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: { family: 'Inter, Segoe UI, Arial, sans-serif', color: '#3f4a5f', size: 12 },
    showlegend: true,
    legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: 1.16, font: { size: 12, color: '#273142' }, itemsizing: 'constant' },
    hoverlabel: { bgcolor: '#111827', bordercolor: '#111827', font: { color: '#ffffff', family: 'Inter, Segoe UI, Arial, sans-serif' } },
    bargap: 0.48,
    xaxis: isPie ? undefined : {
      title: { text: chart.xLabel || 'Category', standoff: 20, font: { size: 12, color: '#374151', family: 'Inter, Segoe UI, Arial, sans-serif', weight: 700 } },
      gridcolor: '#f2f5f9',
      tickangle: -35,
      zeroline: false,
      tickfont: { color: '#7b8496', size: 11 },
      linecolor: '#e3e9f2',
      mirror: false,
    },
    yaxis: isPie ? undefined : {
      title: { text: chart.yLabel || 'Value', standoff: 20, font: { size: 12, color: '#374151', family: 'Inter, Segoe UI, Arial, sans-serif', weight: 700 } },
      gridcolor: '#f2f5f9',
      zerolinecolor: '#e3e9f2',
      tickfont: { color: '#7b8496', size: 11 },
      linecolor: '#e3e9f2',
      rangemode: 'tozero',
    },
  };

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <div style={styles.chartIcon}>▥</div>
        <div>
          <div style={styles.chartTitle}>{chart.title || 'Data Visualization'}</div>
          <div style={styles.chartType}>{`${type.charAt(0).toUpperCase() + type.slice(1)} Chart`}</div>
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
            toImageButtonOptions: {
              format: 'png',
              filename: (chart.title || 'data-visualization').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              height: 720,
              width: 1100,
              scale: 2,
            },
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          }}
          style={{ width: chartWidth }}
          useResizeHandler
        />
      </div>
      {chart.insight && (
        <div style={styles.insightBox}>
          <span style={styles.insightLabel}>•</span>
          <span>{chart.insight}</span>
        </div>
      )}
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

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    const updated = [...messages, { role: 'user', content: question }];
    updateMessages(updated);
    setLoading(true);
    try {
      const res = await axios.post(`${API}/query`, { question });
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
              {msg.chart && <ChartMessage chart={msg.chart} />}
            </div>
          ))}
          {loading && (
            <div style={styles.msgBot}>
              <div style={{ color: '#CC0000' }}>Thinking...</div>
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
