import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from './lib/supabaseClient';
import gachaCherry from './assets/gacha/cherry.png';
import gachaLemon from './assets/gacha/lemon.png';
import gachaBell from './assets/gacha/bell.png';
import gachaStar from './assets/gacha/star.png';
import gachaGrape from './assets/gacha/grape.png';
import gachaSeven from './assets/gacha/seven.png';

const CONFETTI_COLORS = ['#ffd54a', '#e5484d', '#c026d3', '#ffffff'];
const fireConfetti = () => {
  confetti({ particleCount: 100, spread: 70, origin: { y: 0.4 }, colors: CONFETTI_COLORS });
  confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 }, colors: CONFETTI_COLORS });
  confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 }, colors: CONFETTI_COLORS });
};

function formatTime(min) {
  if (min < 1) return 'Baru saja';
  if (min < 60) return min + ' menit lalu';
  if (min < 1440) return Math.floor(min / 60) + ' jam lalu';
  return Math.floor(min / 1440) + ' hari lalu';
}
function fmtNum(n) {
  return n.toLocaleString('id-ID');
}

function mapBidRow(row) {
  return {
    id: row.id,
    candidate: row.candidate_name,
    office: row.office_name,
    coins: row.coins,
    bettor: row.username,
    minutesAgo: Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 60000)),
  };
}

const rankColor = (i) => (i === 0 ? 'oklch(0.85 0.15 90)' : i === 1 ? 'oklch(0.85 0.01 90)' : i === 2 ? 'oklch(0.70 0.13 55)' : 'oklch(0.5 0.05 335)');
const tickerVerbs = ['pasang', 'gaskeun', 'all-in', 'sikat'];

// dummy placeholders — replace the files in src/assets/gacha/*.svg with your own art
// (keep the same filenames, or update the imports above to point at new files/extensions)
const SLOT_SYMBOLS = {
  cherry: gachaCherry,
  lemon: gachaLemon,
  bell: gachaBell,
  star: gachaStar,
  grape: gachaGrape,
  seven: gachaSeven,
};
const SLOT_KEYS = Object.keys(SLOT_SYMBOLS);
const isFreeSpinAvailable = (lastFreeSpinAt) => {
  if (!lastFreeSpinAt) return true;
  const last = new Date(lastFreeSpinAt);
  const now = new Date();
  return last.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10);
};

const SESSION_KEY = 'tp_session';
const saveSession = (id, username, balance, lastFreeSpinAt) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id, username, balance, lastFreeSpinAt }));
};
const loadSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
};
const clearSession = () => localStorage.removeItem(SESSION_KEY);

export default function App() {
  const [candidateRows, setCandidateRows] = useState([]);
  const candidates = useMemo(() => candidateRows.map((c) => c.name), [candidateRows]);
  const [officeRows, setOfficeRows] = useState([]);
  const offices = useMemo(() => officeRows.map((o) => o.name), [officeRows]);

  const [activeTab, setActiveTab] = useState('beranda');
  const [loggedIn, setLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState('');
  const [balance, setBalance] = useState(0);
  const [lastFreeSpinAt, setLastFreeSpinAt] = useState(null);
  const [gachaOpen, setGachaOpen] = useState(false);
  const [gachaSpinning, setGachaSpinning] = useState(false);
  const [gachaReels, setGachaReels] = useState(['seven', 'seven', 'seven']);
  const [gachaResult, setGachaResult] = useState(null);
  const [gachaError, setGachaError] = useState(null);
  const [gachaImagesReady, setGachaImagesReady] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('register');
  const [authFullName, setAuthFullName] = useState('');
  const [authConsent, setAuthConsent] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState(null);
  const [officeSearch, setOfficeSearch] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedBids, setSelectedBids] = useState({});
  const [records, setRecords] = useState([]);
  const [flashMessage, setFlashMessage] = useState(null);
  const [listSearch, setListSearch] = useState('');
  const [listOfficeFilter, setListOfficeFilter] = useState('Semua Satker');
  const [officeFilterOpen, setOfficeFilterOpen] = useState(false);
  const [officeFilterQuery, setOfficeFilterQuery] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatAsAnnouncement, setChatAsAnnouncement] = useState(false);
  const [chatError, setChatError] = useState(null);
  const chatScrollRef = useRef(null);

  const flash = (msg, ms = 3500) => {
    setFlashMessage(msg);
    setTimeout(() => setFlashMessage(null), ms);
  };

  useEffect(() => {
    fireConfetti();
    const session = loadSession();
    if (session && session.id && session.username) {
      setUserId(session.id);
      setUsername(session.username);
      setBalance(session.balance || 0);
      setLastFreeSpinAt(session.lastFreeSpinAt || null);
      setLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const urls = Object.values(SLOT_SYMBOLS);
    Promise.all(
      urls.map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).finally(resolve);
          })
      )
    ).then(() => {
      if (!cancelled) setGachaImagesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tickerItems = useMemo(
    () =>
      records.slice(0, 14).map((r, i) => {
        const verb = tickerVerbs[i % tickerVerbs.length];
        return r.bettor + ' baru ' + verb + ' ' + fmtNum(r.coins) + ' Coin ke ' + r.candidate + ' di ' + r.office + '!';
      }),
    [records]
  );

  const loadOffices = async () => {
    const { data, error } = await supabase.from('offices').select('id,name,abbr').order('name');
    if (!error && data) setOfficeRows(data);
  };
  const loadCandidates = async () => {
    const { data, error } = await supabase.from('candidates').select('id,name').eq('is_active', true).order('name');
    if (!error && data) setCandidateRows(data);
  };
  const loadRecords = async () => {
    const { data, error } = await supabase
      .from('bids')
      .select('id,candidate_name,office_name,coins,username,created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!error && data) setRecords(data.map(mapBidRow));
  };

  useEffect(() => {
    loadOffices();
    loadCandidates();
    loadRecords();
  }, []);

  const appendChatMessage = (msg) => {
    setChatMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  };

  const loadChatMessages = async () => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id,user_id,username,message,is_announcement,created_at')
      .order('created_at', { ascending: true })
      .limit(200);
    if (!error && data) setChatMessages(data);
  };

  // Only fetches/subscribes once logged in — chat is members-only. Runs again
  // whenever loggedIn flips true (fresh login, or session restored on reload),
  // fetching history then opening a Realtime (WebSocket) subscription that
  // stays live for as long as the tab is open and the user is logged in.
  useEffect(() => {
    if (!loggedIn) {
      setChatMessages([]);
      return;
    }
    loadChatMessages();
    const channel = supabase
      .channel('chat_messages_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        appendChatMessage(payload.new);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loggedIn]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const sendChatMessage = async () => {
    const trimmed = chatInput.trim();
    if (!loggedIn || !trimmed || chatSending) return;
    if (chatAsAnnouncement && balance < 10) {
      setChatError('Saldo kamu kurang dari 10 Coin buat pengumuman.');
      return;
    }
    setChatSending(true);
    setChatError(null);
    try {
      const { data, error } = await supabase.rpc('post_chat_message', {
        p_user_id: userId,
        p_message: trimmed,
        p_is_announcement: chatAsAnnouncement,
      });
      if (error) throw error;
      appendChatMessage(data[0]);
      setBalance(data[0].new_balance);
      setChatInput('');
      setChatAsAnnouncement(false);
    } catch (e) {
      setChatError(e.message.includes('insufficient_balance') ? 'Saldo kamu kurang dari 10 Coin buat pengumuman.' : 'Gagal kirim pesan, coba lagi.');
    } finally {
      setChatSending(false);
    }
  };

  const openAuthModal = (mode) => {
    setAuthMode(mode);
    setAuthFullName('');
    setAuthConsent(false);
    setAuthUsername('');
    setAuthPassword('');
    setAuthError(null);
    setAuthModalOpen(true);
  };
  const closeAuthModal = () => {
    if (authLoading) return;
    setAuthModalOpen(false);
  };

  const submitAuth = async () => {
    setAuthError(null);
    if (authMode === 'register' && authFullName.trim().length < 3) {
      setAuthError('Nama lengkap minimal 3 karakter.');
      return;
    }
    if (authMode === 'register' && !authConsent) {
      setAuthError('Centang dulu persetujuan penggunaan nama kamu.');
      return;
    }
    if (authUsername.trim().length < 3) {
      setAuthError('Username minimal 3 karakter.');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('Password minimal 6 karakter.');
      return;
    }
    setAuthLoading(true);
    try {
      const { data, error } =
        authMode === 'register'
          ? await supabase.rpc('register_user', {
              p_full_name: authFullName.trim(),
              p_username: authUsername.trim(),
              p_password: authPassword,
            })
          : await supabase.rpc('login_user', {
              p_username: authUsername.trim(),
              p_password: authPassword,
            });
      if (error) {
        if (error.message.includes('username_taken')) throw new Error('Username sudah dipakai.');
        if (error.message.includes('name_not_found')) throw new Error('Kamu bukan peserta yang terdaftar. Pastikan kamu memakai nama lengkap yang sesuai!');
        if (error.message.includes('name_already_registered')) throw new Error('Nama ini sudah pernah dipakai untuk daftar. Kalau ini kamu, coba menu Masuk.');
        if (error.message.includes('invalid_name')) throw new Error('Nama lengkap minimal 3 karakter.');
        if (error.message.includes('invalid_input')) throw new Error('Username minimal 3 karakter, password minimal 6 karakter.');
        if (error.message.includes('belum dikonfigurasi')) throw error;
        throw new Error(authMode === 'register' ? 'Gagal daftar. Coba lagi.' : 'Gagal masuk. Coba lagi.');
      }
      const row = data && data[0];
      if (!row) throw new Error('Username atau password salah.');

      setUserId(row.id);
      setUsername(row.username);
      setBalance(row.balance);
      setLastFreeSpinAt(row.last_free_spin_at);
      setLoggedIn(true);
      setAuthModalOpen(false);
      saveSession(row.id, row.username, row.balance, row.last_free_spin_at);
      fireConfetti();
      flash(authMode === 'register' ? 'Selamat datang, ' + row.username + '! Kamu dapat 1000 Coin.' : 'Selamat datang kembali, ' + row.username + '!');
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    clearSession();
    setLoggedIn(false);
    setUserId(null);
    setUsername('');
    setBalance(0);
    setLastFreeSpinAt(null);
    setSelectedOffice(null);
    setSelectedBids({});
    setActiveTab('beranda');
  };

  const openGacha = () => {
    setGachaResult(null);
    setGachaError(null);
    setGachaOpen(true);
  };
  const closeGacha = () => {
    if (gachaSpinning) return;
    setGachaOpen(false);
  };

  const spinGacha = async () => {
    if (!loggedIn || gachaSpinning || !gachaImagesReady) return;
    const willBeFree = isFreeSpinAvailable(lastFreeSpinAt);
    if (!willBeFree && balance < 10) {
      setGachaError('Saldo kamu kurang dari 10 Coin.');
      return;
    }
    setGachaError(null);
    setGachaResult(null);
    setGachaSpinning(true);

    const spinTicker = setInterval(() => {
      setGachaReels([
        SLOT_KEYS[Math.floor(Math.random() * SLOT_KEYS.length)],
        SLOT_KEYS[Math.floor(Math.random() * SLOT_KEYS.length)],
        SLOT_KEYS[Math.floor(Math.random() * SLOT_KEYS.length)],
      ]);
    }, 90);

    try {
      const [{ data, error }] = await Promise.all([
        supabase.rpc('spin_slot', { p_user_id: userId }),
        new Promise((resolve) => setTimeout(resolve, 1100)),
      ]);
      clearInterval(spinTicker);
      if (error) throw error;
      const row = data[0];
      const newLastFreeSpinAt = row.was_free ? new Date().toISOString() : lastFreeSpinAt;
      setGachaReels(row.symbols);
      setBalance(row.new_balance);
      setLastFreeSpinAt(newLastFreeSpinAt);
      saveSession(userId, username, row.new_balance, newLastFreeSpinAt);
      setGachaResult({ reward: row.reward, wasFree: row.was_free });
      if (row.reward >= 1000) fireConfetti();
    } catch (e) {
      clearInterval(spinTicker);
      setGachaError(e.message.includes('insufficient_balance') ? 'Saldo kamu kurang dari 10 Coin.' : 'Gagal spin, coba lagi.');
    } finally {
      setGachaSpinning(false);
    }
  };

  const goToBid = () => setActiveTab('bid');

  const selectOffice = (office) => {
    setSelectedOffice(office);
    setCandidateSearch('');
  };
  const backToOffice = () => {
    setSelectedOffice(null);
    setSelectedBids({});
  };

  const toggleCandidate = (name) => {
    setSelectedBids((sel) => {
      const next = { ...sel };
      if (next[name] !== undefined) delete next[name];
      else next[name] = '100';
      return next;
    });
  };
  const changeCoin = (name, value) => {
    setSelectedBids((sel) => ({ ...sel, [name]: value }));
  };

  const [bidSubmitting, setBidSubmitting] = useState(false);

  const submitBid = async () => {
    const entries = Object.entries(selectedBids).filter(([, v]) => Number(v) > 0);
    if (!selectedOffice || entries.length === 0) return;
    const totalStake = entries.reduce((sum, [, v]) => sum + Number(v), 0);
    if (totalStake > balance) {
      flash('Saldo kamu tidak cukup untuk taruhan ini.', 3000);
      return;
    }
    const officeRow = officeRows.find((o) => o.name === selectedOffice);
    if (!officeRow) {
      flash('Satker tidak ditemukan, coba pilih ulang.', 3000);
      return;
    }

    setBidSubmitting(true);
    try {
      let newBalance = balance;
      for (const [name, v] of entries) {
        const candidateRow = candidateRows.find((c) => c.name === name);
        if (!candidateRow) throw new Error('Kandidat "' + name + '" tidak ditemukan.');
        const { data, error } = await supabase.rpc('place_bid', {
          p_user_id: userId,
          p_office_id: officeRow.id,
          p_candidate_id: candidateRow.id,
          p_coins: Number(v),
        });
        if (error) throw error;
        newBalance = data[0].new_balance;
      }
      setBalance(newBalance);
      saveSession(userId, username, newBalance, lastFreeSpinAt);
      setSelectedBids({});
      await loadRecords();
      flash('Taruhan dipasang! ' + entries.length + ' kandidat, total ' + fmtNum(totalStake) + ' Coin.', 4000);
    } catch (e) {
      flash('Gagal memasang taruhan: ' + e.message, 4000);
    } finally {
      setBidSubmitting(false);
    }
  };

  const notLoggedIn = !loggedIn;
  const isBeranda = activeTab === 'beranda';
  const isBid = activeTab === 'bid';
  const isList = activeTab === 'list';
  const isChat = activeTab === 'chat';

  const tabDef = [
    { key: 'beranda', label: 'Beranda' },
    { key: 'bid', label: 'Pasang Taruhan' },
    { key: 'list', label: 'Daftar Taruhan' },
    { key: 'chat', label: 'Live Chat' },
  ];

  const { candAgg, offAgg, totalCoins, bettorCount } = useMemo(() => {
    const candAgg = {};
    const offAgg = {};
    let totalCoins = 0;
    const bettors = new Set();
    for (const r of records) {
      totalCoins += r.coins;
      bettors.add(r.bettor);
      if (!candAgg[r.candidate]) candAgg[r.candidate] = { coins: 0, count: 0 };
      candAgg[r.candidate].coins += r.coins;
      candAgg[r.candidate].count += 1;
      if (!offAgg[r.office]) offAgg[r.office] = { coins: 0, count: 0 };
      offAgg[r.office].coins += r.coins;
      offAgg[r.office].count += 1;
    }
    return { candAgg, offAgg, totalCoins, bettorCount: bettors.size };
  }, [records]);

  const makeRows = (agg, maxVal) =>
    Object.entries(agg)
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, 8)
      .map(([name, v], i) => ({
        rank: i + 1,
        name,
        coinsLabel: fmtNum(v.coins),
        countLabel: v.count + 'x bid',
        rankStyle: {
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: '14px',
          background: rankColor(i),
          color: 'oklch(0.16 0.04 30)',
          flexShrink: 0,
        },
        barStyle: {
          width: Math.max(6, Math.round((v.coins / maxVal) * 100)) + '%',
          height: '100%',
          borderRadius: '4px',
          background: 'linear-gradient(90deg, oklch(0.55 0.19 25), oklch(0.82 0.19 88))',
        },
      }));

  const maxCand = Math.max(1, ...Object.values(candAgg).map((v) => v.coins));
  const maxOff = Math.max(1, ...Object.values(offAgg).map((v) => v.coins));
  const topCandidates = makeRows(candAgg, maxCand);
  const topOffices = makeRows(offAgg, maxOff);

  const statsView = [
    { label: 'Total Taruhan', value: fmtNum(records.length) },
    { label: 'Coin Beredar', value: fmtNum(totalCoins) },
    { label: 'Pemain Aktif', value: fmtNum(bettorCount) },
    { label: 'Satker', value: '90' },
  ];

  const stepsView = [
    { num: 1, title: 'Register', desc: 'Daftar gratis dan langsung dapat 1000 coin untuk modal taruhan.' },
    { num: 2, title: 'Pilih Satker', desc: 'Pilih 1 dari 90 satker sebagai tujuan tebakan.' },
    { num: 3, title: 'Pilih Nama & Bid', desc: 'Pilih nama-nama kandidat lalu pasang jumlah coin taruhanmu.' },
  ];

  const officeQuery = officeSearch.toLowerCase();
  const officesView = officeRows.filter(
    (o) => o.name.toLowerCase().includes(officeQuery) || (o.abbr && o.abbr.toLowerCase().includes(officeQuery))
  );

  const candQuery = candidateSearch.toLowerCase();
  const candidatesView = candidates.filter((c) => c.toLowerCase().includes(candQuery));

  const selectedEntries = Object.entries(selectedBids).filter(([, v]) => Number(v) > 0);
  const totalStake = selectedEntries.reduce((sum, [, v]) => sum + Number(v), 0);
  const canSubmit = loggedIn && selectedOffice && selectedEntries.length > 0 && totalStake > 0 && totalStake <= balance;

  const showOfficeStep = !selectedOffice;
  const showCandidateStep = !!selectedOffice;
  const showStickyBar = loggedIn && !!selectedOffice;

  const listQuery = listSearch.toLowerCase();
  const officeFilterOptions = ['Semua Satker', ...offices];
  const officeFilterQueryLower = officeFilterQuery.toLowerCase();
  const officeFilterOptionsView = officeFilterOptions.filter((opt) => {
    if (opt === 'Semua Satker') return true;
    const row = officeRows.find((o) => o.name === opt);
    return opt.toLowerCase().includes(officeFilterQueryLower) || (row && row.abbr && row.abbr.toLowerCase().includes(officeFilterQueryLower));
  });
  const recordsView = records
    .filter((r) => r.candidate.toLowerCase().includes(listQuery))
    .filter((r) => listOfficeFilter === 'Semua Satker' || r.office === listOfficeFilter)
    .slice(0, 200);

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '10px',
    border: '2px solid oklch(0.32 0.06 335)',
    background: 'oklch(0.16 0.045 335)',
    color: 'oklch(0.96 0.01 90)',
    fontSize: '14px',
    outline: 'none',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        fontFamily: "'Poppins',sans-serif",
        color: 'oklch(0.96 0.01 90)',
        backgroundImage:
          'repeating-linear-gradient(45deg, oklch(0.16 0.045 335) 0px, oklch(0.16 0.045 335) 2px, transparent 2px, transparent 40px), radial-gradient(ellipse at 50% -10%, oklch(0.30 0.10 335) 0%, oklch(0.14 0.04 335) 60%)',
      }}
    >
      {/* WIN TICKER */}
      {tickerItems.length > 0 && (
        <div className="tp-ticker-wrap">
          <div className="tp-ticker-track">
            {tickerItems.concat(tickerItems).map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* NAV */}
      <div
        className="tp-navbar"
        style={{
          position: 'sticky',
          top: tickerItems.length > 0 ? '34px' : 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'oklch(0.13 0.035 335)',
          borderBottom: '3px solid oklch(0.82 0.19 88)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          flexWrap: 'wrap',
        }}
      >
        <div className="tp-logo" style={{ display: 'flex', alignItems: 'center' }}>
          <div className="tp-logo-suit" style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'oklch(0.82 0.19 88)', letterSpacing: '1px' }}>♦</div>
          <div className="tp-logo-text" style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'oklch(0.82 0.19 88)', animation: 'glowPulse 3s ease-in-out infinite' }}>
            TEBAK PENEMPATAN
          </div>
          <div className="tp-logo-suit" style={{ fontFamily: "'Bebas Neue',sans-serif", color: 'oklch(0.82 0.19 88)', letterSpacing: '1px' }}>♣</div>
        </div>

        <div className="tp-nav-tabs" style={{ gap: '8px', flexWrap: 'wrap' }}>
          {tabDef.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                cursor: 'pointer',
                padding: '8px 18px',
                borderRadius: '999px',
                fontSize: '14px',
                fontWeight: 600,
                background: activeTab === tab.key ? 'oklch(0.82 0.19 88)' : 'transparent',
                color: activeTab === tab.key ? 'oklch(0.16 0.04 30)' : 'oklch(0.9 0.01 90)',
                border: activeTab === tab.key ? '2px solid oklch(0.82 0.19 88)' : '2px solid transparent',
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {loggedIn ? (
            <div
              className="tp-balance-chip"
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'oklch(0.20 0.05 335)',
                border: '2px solid oklch(0.82 0.19 88)',
                borderRadius: '999px',
              }}
            >
              <div
                className="tp-balance-avatar"
                style={{
                  borderRadius: '50%',
                  background:
                    'conic-gradient(oklch(0.55 0.19 25) 0deg 90deg, oklch(0.96 0.01 90) 90deg 180deg, oklch(0.55 0.19 25) 180deg 270deg, oklch(0.96 0.01 90) 270deg 360deg)',
                  border: '2px dashed oklch(0.82 0.19 88)',
                }}
              />
              <div className="tp-balance-text" style={{ fontWeight: 700, color: 'oklch(0.82 0.19 88)' }}>{username} • {fmtNum(balance)} Coin</div>
              <div
                className="tp-balance-logout"
                style={{ cursor: 'pointer', color: 'oklch(0.7 0.02 100)', textDecoration: 'underline' }}
                onClick={logout}
              >
                Keluar
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div
                className="tp-auth-btn"
                style={{
                  cursor: 'pointer',
                  fontFamily: "'Bebas Neue',sans-serif",
                  letterSpacing: '1px',
                  color: 'oklch(0.9 0.01 90)',
                  borderRadius: '8px',
                  border: '2px solid oklch(0.5 0.05 335)',
                }}
                onClick={() => openAuthModal('login')}
              >
                MASUK
              </div>
              <div
                className="tp-auth-btn"
                style={{
                  cursor: 'pointer',
                  fontFamily: "'Bebas Neue',sans-serif",
                  letterSpacing: '1px',
                  background: 'linear-gradient(180deg, oklch(0.82 0.15 85), oklch(0.68 0.16 80))',
                  color: 'oklch(0.16 0.04 30)',
                  borderRadius: '8px',
                  border: '2px solid oklch(0.55 0.12 85)',
                  boxShadow: '0 3px 0 oklch(0.5 0.13 80)',
                }}
                onClick={() => openAuthModal('register')}
              >
                DAFTAR • +1000 COIN
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FLASH MESSAGE */}
      {flashMessage && (
        <div
          style={{
            maxWidth: '900px',
            margin: '18px auto 0',
            background: 'oklch(0.30 0.14 145)',
            border: '2px solid oklch(0.82 0.19 88)',
            color: 'oklch(0.97 0.02 145)',
            padding: '14px 20px',
            borderRadius: '10px',
            textAlign: 'center',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          🎉 {flashMessage}
        </div>
      )}

      {/* BERANDA TAB */}
      {isBeranda && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 28px 80px' }}>
          {/* HERO */}
          <div style={{ textAlign: 'center', padding: '20px 0 36px' }}>
            <div className="tp-hero-title" style={{ fontFamily: "'Luckiest Guy',cursive", lineHeight: 1.1, letterSpacing: '1px', color: 'oklch(0.96 0.01 90)', textShadow: '3px 3px 0 oklch(0.55 0.22 25 / 0.6)' }}>
              TEBAK PENEMPATANMU,
              <br />
              <span className="tp-shimmer-text" style={{ animation: 'shimmer 2.5s linear infinite, glowPulse 2s ease-in-out infinite' }}>MENANGKAN COIN!</span>
            </div>
            <div style={{ maxWidth: '640px', margin: '18px auto 0', fontSize: '17px', color: 'oklch(0.78 0.02 100)', lineHeight: 1.6 }}>
              Tebak akan ditempatkan di satker mana teman seangkatanmu. Pasang taruhanmu dan naik ke puncak papan peringkat!
            </div>
            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', marginTop: '26px', flexWrap: 'wrap' }}>
              <div
                style={{
                  cursor: 'pointer',
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: '18px',
                  letterSpacing: '1px',
                  background: 'linear-gradient(180deg, oklch(0.60 0.19 25), oklch(0.46 0.18 25))',
                  color: 'oklch(0.97 0.01 30)',
                  padding: '14px 30px',
                  borderRadius: '10px',
                  border: '2px solid oklch(0.40 0.17 25)',
                  boxShadow: '0 4px 0 oklch(0.35 0.15 25)',
                }}
                onClick={goToBid}
              >
                PASANG TARUHAN SEKARANG
              </div>
            </div>
          </div>

          {/* GACHA BANNER */}
          <div
            onClick={openGacha}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
              background: 'linear-gradient(90deg, oklch(0.30 0.10 335), oklch(0.24 0.12 300))',
              border: '2px solid oklch(0.82 0.19 88)',
              borderRadius: '16px',
              padding: '20px 26px',
              margin: '10px 0 36px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '40px', animation: 'chipSpin 4s linear infinite' }}>🎰</div>
              <div>
                <div className="tp-shimmer-text" style={{ fontFamily: "'Luckiest Guy',cursive", fontSize: '22px', letterSpacing: '1px' }}>
                  GACHA COIN!
                </div>
                <div style={{ fontSize: '13px', color: 'oklch(0.85 0.02 100)' }}>
                  Spin gratis 1x/hari — jackpot 1000 Coin! Mau lagi? 10 Coin/spin.
                </div>
              </div>
            </div>
            <div
              style={{
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: '16px',
                letterSpacing: '1px',
                background: 'oklch(0.82 0.19 88)',
                color: 'oklch(0.16 0.04 30)',
                padding: '10px 22px',
                borderRadius: '8px',
                border: '2px solid oklch(0.55 0.12 85)',
              }}
            >
              MAIN SEKARANG
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="tp-steps-grid" style={{ gap: '18px', margin: '36px 0' }}>
            {stepsView.map((step) => (
              <div
                key={step.num}
                style={{
                  background: 'oklch(0.19 0.05 335)',
                  border: '2px solid oklch(0.32 0.06 335)',
                  borderRadius: '14px',
                  padding: '22px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    margin: '0 auto 12px',
                    background: 'oklch(0.82 0.19 88)',
                    color: 'oklch(0.16 0.04 30)',
                    fontFamily: "'Bebas Neue',sans-serif",
                    fontSize: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {step.num}
                </div>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>{step.title}</div>
                <div style={{ fontSize: '14px', color: 'oklch(0.75 0.02 100)', lineHeight: 1.5 }}>{step.desc}</div>
              </div>
            ))}
          </div>

          {/* QUICK STATS */}
          <div className="tp-stats-grid" style={{ gap: '16px', margin: '36px 0' }}>
            {statsView.map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: 'oklch(0.20 0.05 335)',
                  border: '2px solid oklch(0.82 0.19 88 / 0.4)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '32px', color: 'oklch(0.82 0.19 88)' }}>{stat.value}</div>
                <div style={{ fontSize: '13px', color: 'oklch(0.75 0.02 100)', marginTop: '4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* LEADERBOARDS */}
          <div className="tp-leaderboard-grid" style={{ gap: '24px', marginTop: '40px' }}>
            <div style={{ background: 'oklch(0.18 0.045 335)', border: '2px solid oklch(0.32 0.06 335)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '24px', letterSpacing: '1px', color: 'oklch(0.82 0.19 88)', marginBottom: '16px' }}>
                KANDIDAT PALING DIINCAR
              </div>
              {topCandidates.map((row) => (
                <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0', borderBottom: '1px solid oklch(0.28 0.05 335)' }}>
                  <div style={row.rankStyle}>{row.rank}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{row.name}</div>
                    <div style={{ height: '6px', borderRadius: '4px', background: 'oklch(0.28 0.05 335)', marginTop: '6px', overflow: 'hidden' }}>
                      <div style={row.barStyle} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '76px' }}>
                    <div style={{ fontWeight: 700, color: 'oklch(0.82 0.19 88)', fontSize: '14px' }}>{row.coinsLabel}</div>
                    <div style={{ fontSize: '11px', color: 'oklch(0.7 0.02 100)' }}>{row.countLabel}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: 'oklch(0.18 0.045 335)', border: '2px solid oklch(0.32 0.06 335)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '24px', letterSpacing: '1px', color: 'oklch(0.82 0.19 88)', marginBottom: '16px' }}>
                KANTOR TUJUAN TERPANAS
              </div>
              {topOffices.map((row) => (
                <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0', borderBottom: '1px solid oklch(0.28 0.05 335)' }}>
                  <div style={row.rankStyle}>{row.rank}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{row.name}</div>
                    <div style={{ height: '6px', borderRadius: '4px', background: 'oklch(0.28 0.05 335)', marginTop: '6px', overflow: 'hidden' }}>
                      <div style={row.barStyle} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '76px' }}>
                    <div style={{ fontWeight: 700, color: 'oklch(0.82 0.19 88)', fontSize: '14px' }}>{row.coinsLabel}</div>
                    <div style={{ fontSize: '11px', color: 'oklch(0.7 0.02 100)' }}>{row.countLabel}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PASANG TARUHAN TAB */}
      {isBid && (
        <>
          <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 28px 100px' }}>
            {notLoggedIn && (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: 'oklch(0.19 0.05 335)', border: '2px dashed oklch(0.82 0.19 88)', borderRadius: '16px' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '28px', color: 'oklch(0.82 0.19 88)', marginBottom: '10px' }}>DAFTAR DULU YUK!</div>
                <div style={{ color: 'oklch(0.78 0.02 100)', marginBottom: '22px' }}>Daftar sekarang dan dapatkan 1000 coin gratis untuk mulai pasang taruhan.</div>
                <div
                  style={{
                    display: 'inline-block',
                    cursor: 'pointer',
                    fontFamily: "'Bebas Neue',sans-serif",
                    fontSize: '18px',
                    letterSpacing: '1px',
                    background: 'linear-gradient(180deg, oklch(0.82 0.15 85), oklch(0.68 0.16 80))',
                    color: 'oklch(0.16 0.04 30)',
                    padding: '12px 28px',
                    borderRadius: '8px',
                    border: '2px solid oklch(0.55 0.12 85)',
                  }}
                  onClick={() => openAuthModal('register')}
                >
                  DAFTAR • +1000 COIN
                </div>
              </div>
            )}

            {loggedIn && (
              <div>
                {showOfficeStep && (
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '26px', color: 'oklch(0.82 0.19 88)', letterSpacing: '1px', marginBottom: '6px' }}>
                      LANGKAH 1 — PILIH SATKER
                    </div>
                    <div style={{ color: 'oklch(0.75 0.02 100)', marginBottom: '16px', fontSize: '14px' }}>
                      40 satker tersedia. Pilih satker tujuan yang mau kamu tebak.
                    </div>
                    <input
                      type="text"
                      placeholder="Cari satker..."
                      value={officeSearch}
                      onChange={(e) => setOfficeSearch(e.target.value)}
                      style={{ ...inputStyle, marginBottom: '18px' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: '12px', maxHeight: '480px', overflowY: 'auto', paddingRight: '6px' }}>
                      {officesView.map((office) => {
                        const selected = selectedOffice === office.name;
                        return (
                          <div
                            key={office.id}
                            onClick={() => selectOffice(office.name)}
                            style={{
                              cursor: 'pointer',
                              padding: '14px 12px',
                              borderRadius: '10px',
                              textAlign: 'center',
                              border: selected ? '2px solid oklch(0.82 0.19 88)' : '2px solid oklch(0.30 0.06 335)',
                              background: selected ? 'oklch(0.30 0.09 85)' : 'oklch(0.18 0.045 335)',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{office.name}</div>
                            {office.abbr && (
                              <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.7, letterSpacing: '0.5px' }}>{office.abbr}</div>
                            )}
                            <div style={{ fontSize: '11px', marginTop: '6px', opacity: 0.8 }}>{(offAgg[office.name] ? offAgg[office.name].count : 0) + ' taruhan'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showCandidateStep && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '26px', color: 'oklch(0.82 0.19 88)', letterSpacing: '1px' }}>
                          LANGKAH 2 — PILIH KANDIDAT
                        </div>
                        <div style={{ color: 'oklch(0.75 0.02 100)', fontSize: '14px' }}>
                          Satker tujuan: <b style={{ color: 'oklch(0.96 0.01 90)' }}>{selectedOffice}</b>
                        </div>
                      </div>
                      <div
                        style={{ cursor: 'pointer', fontSize: '13px', color: 'oklch(0.82 0.19 88)', border: '1px solid oklch(0.82 0.19 88)', padding: '8px 14px', borderRadius: '8px' }}
                        onClick={backToOffice}
                      >
                        ← Ganti Satker
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Cari nama kandidat..."
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      style={{ ...inputStyle, marginBottom: '14px' }}
                    />

                    <div style={{ maxHeight: '420px', overflowY: 'auto', border: '2px solid oklch(0.30 0.06 335)', borderRadius: '12px' }}>
                      {candidatesView.map((c, idx) => {
                        const checked = selectedBids[c] !== undefined;
                        return (
                          <div
                            key={c}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '14px',
                              padding: '12px 16px',
                              borderBottom: '1px solid oklch(0.24 0.05 335)',
                              background: idx % 2 === 0 ? 'oklch(0.16 0.04 335)' : 'oklch(0.185 0.045 335)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCandidate(c)}
                              style={{ width: '18px', height: '18px', accentColor: 'oklch(0.82 0.19 88)', cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1, fontSize: '14px', fontWeight: 500 }}>{c}</div>
                            <div style={{ fontSize: '11px', color: 'oklch(0.7 0.02 100)', minWidth: '70px' }}>
                              {(candAgg[c] ? fmtNum(candAgg[c].coins) : 0) + ' coin'}
                            </div>
                            <input
                              type="number"
                              min="10"
                              step="10"
                              placeholder="Coin"
                              value={selectedBids[c] || ''}
                              disabled={!checked}
                              onChange={(e) => changeCoin(c, e.target.value)}
                              style={{
                                width: '100px',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                border: '2px solid oklch(0.32 0.06 335)',
                                background: 'oklch(0.14 0.04 335)',
                                color: 'oklch(0.96 0.01 90)',
                                fontSize: '13px',
                                outline: 'none',
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STICKY BID BAR */}
          {showStickyBar && (
            <div
              className="tp-sticky-bid"
              style={{
                position: 'sticky',
                bottom: 0,
                zIndex: 40,
                background: 'oklch(0.12 0.03 335)',
                borderTop: '3px solid oklch(0.82 0.19 88)',
                padding: '16px 28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 -6px 20px rgba(0,0,0,0.4)',
              }}
            >
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'oklch(0.7 0.02 100)', textTransform: 'uppercase' }}>Kandidat Dipilih</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '20px', color: 'oklch(0.96 0.01 90)' }}>{selectedEntries.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'oklch(0.7 0.02 100)', textTransform: 'uppercase' }}>Total Taruhan</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '20px', color: 'oklch(0.82 0.19 88)' }}>{fmtNum(totalStake)} Coin</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'oklch(0.7 0.02 100)', textTransform: 'uppercase' }}>Sisa Saldo</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '20px', color: 'oklch(0.96 0.01 90)' }}>{fmtNum(balance)} Coin</div>
                </div>
              </div>
              <div
                style={{
                  cursor: canSubmit && !bidSubmitting ? 'pointer' : 'not-allowed',
                  opacity: canSubmit && !bidSubmitting ? 1 : 0.5,
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: '18px',
                  letterSpacing: '1px',
                  background: 'linear-gradient(180deg, oklch(0.60 0.19 25), oklch(0.46 0.18 25))',
                  color: 'oklch(0.97 0.01 30)',
                  padding: '14px 30px',
                  borderRadius: '10px',
                  border: '2px solid oklch(0.40 0.17 25)',
                  boxShadow: '0 4px 0 oklch(0.35 0.15 25)',
                }}
                onClick={() => canSubmit && !bidSubmitting && submitBid()}
              >
                {bidSubmitting ? 'MEMPROSES...' : 'PASANG TARUHAN 🎲'}
              </div>
            </div>
          )}
        </>
      )}

      {/* DAFTAR TARUHAN TAB */}
      {isList && (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 28px 80px' }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '28px', color: 'oklch(0.82 0.19 88)', letterSpacing: '1px', marginBottom: '6px' }}>
            DAFTAR TARUHAN SAAT INI
          </div>
          <div style={{ color: 'oklch(0.75 0.02 100)', fontSize: '14px', marginBottom: '20px' }}>
            Menampilkan {recordsView.length} dari {fmtNum(records.length)} taruhan yang sudah dipasang.
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Cari nama kandidat..."
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: '220px' }}
            />
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <div
                onClick={() => {
                  setOfficeFilterOpen((o) => !o);
                  setOfficeFilterQuery('');
                }}
                style={{
                  cursor: 'pointer',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: officeFilterOpen ? '2px solid oklch(0.82 0.19 88)' : '2px solid oklch(0.32 0.06 335)',
                  background: 'oklch(0.16 0.045 335)',
                  color: 'oklch(0.96 0.01 90)',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listOfficeFilter}</span>
                <span style={{ opacity: 0.7 }}>▾</span>
              </div>

              {officeFilterOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                    onClick={() => setOfficeFilterOpen(false)}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      right: 0,
                      zIndex: 91,
                      background: 'oklch(0.16 0.045 335)',
                      border: '2px solid oklch(0.82 0.19 88)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Cari satker..."
                      value={officeFilterQuery}
                      onChange={(e) => setOfficeFilterQuery(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: 'none',
                        borderBottom: '1px solid oklch(0.32 0.06 335)',
                        background: 'oklch(0.14 0.04 335)',
                        color: 'oklch(0.96 0.01 90)',
                        fontSize: '14px',
                        outline: 'none',
                      }}
                    />
                    <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                      {officeFilterOptionsView.map((opt) => (
                        <div
                          key={opt}
                          onClick={() => {
                            setListOfficeFilter(opt);
                            setOfficeFilterOpen(false);
                          }}
                          style={{
                            cursor: 'pointer',
                            padding: '10px 14px',
                            fontSize: '14px',
                            background: opt === listOfficeFilter ? 'oklch(0.30 0.09 85)' : 'transparent',
                            color: opt === listOfficeFilter ? 'oklch(0.96 0.01 90)' : 'oklch(0.9 0.01 90)',
                          }}
                        >
                          {opt}
                        </div>
                      ))}
                      {officeFilterOptionsView.length === 0 && (
                        <div style={{ padding: '14px', fontSize: '13px', color: 'oklch(0.7 0.02 100)', textAlign: 'center' }}>Tidak ditemukan</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ border: '2px solid oklch(0.30 0.06 335)', borderRadius: '14px', overflow: 'hidden' }}>
            <div
              className="tp-list-row"
              style={{
                gap: '10px',
                padding: '12px 18px',
                background: 'oklch(0.22 0.055 335)',
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'oklch(0.82 0.19 88)',
                fontWeight: 700,
              }}
            >
              <div>Kandidat</div>
              <div>Satker Tujuan</div>
              <div>Coin</div>
              <div>Pemasang</div>
              <div>Waktu</div>
            </div>
            <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
              {recordsView.map((rec, idx) => (
                <div
                  key={rec.id}
                  className="tp-list-row"
                  style={{
                    gap: '10px',
                    padding: '12px 18px',
                    fontSize: '13px',
                    background: idx % 2 === 0 ? 'oklch(0.15 0.035 335)' : 'oklch(0.175 0.04 335)',
                    borderBottom: '1px solid oklch(0.22 0.05 335)',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{rec.candidate}</div>
                  <div style={{ color: 'oklch(0.78 0.02 100)' }}>{rec.office}</div>
                  <div style={{ fontWeight: 700, color: 'oklch(0.82 0.19 88)' }}>{fmtNum(rec.coins)}</div>
                  <div style={{ color: 'oklch(0.78 0.02 100)' }}>{rec.bettor}</div>
                  <div style={{ color: 'oklch(0.65 0.02 100)', fontSize: '12px' }}>{formatTime(rec.minutesAgo)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LIVE CHAT TAB */}
      {isChat && (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 28px 80px' }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '28px', color: 'oklch(0.82 0.19 88)', letterSpacing: '1px', marginBottom: '6px' }}>
            LIVE CHAT
          </div>
          <div style={{ color: 'oklch(0.75 0.02 100)', fontSize: '14px', marginBottom: '20px' }}>
            Ngobrol bareng peserta lain, real-time.
          </div>

          {!loggedIn ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'oklch(0.19 0.05 335)', border: '2px dashed oklch(0.82 0.19 88)', borderRadius: '16px' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '28px', color: 'oklch(0.82 0.19 88)', marginBottom: '10px' }}>MASUK DULU YUK!</div>
              <div style={{ color: 'oklch(0.78 0.02 100)', marginBottom: '22px' }}>Live chat cuma buat peserta yang udah daftar & masuk.</div>
              <div
                style={{
                  display: 'inline-block',
                  cursor: 'pointer',
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: '18px',
                  letterSpacing: '1px',
                  background: 'linear-gradient(180deg, oklch(0.82 0.15 85), oklch(0.68 0.16 80))',
                  color: 'oklch(0.16 0.04 30)',
                  padding: '12px 28px',
                  borderRadius: '8px',
                  border: '2px solid oklch(0.55 0.12 85)',
                }}
                onClick={() => openAuthModal('register')}
              >
                DAFTAR • +1000 COIN
              </div>
            </div>
          ) : (
            <>
              <div
                ref={chatScrollRef}
                style={{
                  height: '440px',
                  overflowY: 'auto',
                  border: '2px solid oklch(0.30 0.06 335)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  background: 'oklch(0.15 0.035 335)',
                }}
              >
                {chatMessages.length === 0 && (
                  <div style={{ color: 'oklch(0.65 0.02 100)', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>
                    Belum ada pesan. Mulai ngobrol yuk!
                  </div>
                )}
                {chatMessages.map((m) =>
                  m.username === 'System' ? (
                    <div key={m.id} style={{ textAlign: 'center', fontSize: '12px', fontStyle: 'italic', color: 'oklch(0.55 0.02 100)' }}>
                      {m.message}
                    </div>
                  ) : m.is_announcement ? (
                    <div
                      key={m.id}
                      style={{
                        background: 'linear-gradient(90deg, oklch(0.30 0.10 335), oklch(0.24 0.12 300))',
                        border: '2px solid oklch(0.82 0.19 88)',
                        borderRadius: '10px',
                        padding: '10px 14px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontSize: '13px' }}>📢</span>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: 'oklch(0.82 0.19 88)' }}>{m.username}</span>
                        <span style={{ fontSize: '11px', color: 'oklch(0.75 0.02 100)' }}>
                          {new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'oklch(0.97 0.01 90)', wordBreak: 'break-word' }}>{m.message}</div>
                    </div>
                  ) : (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: 'oklch(0.82 0.19 88)' }}>{m.username}</span>
                        <span style={{ fontSize: '11px', color: 'oklch(0.6 0.02 100)' }}>
                          {new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', color: 'oklch(0.94 0.01 90)', wordBreak: 'break-word' }}>{m.message}</div>
                    </div>
                  )
                )}
              </div>

              {chatError && <div style={{ color: 'oklch(0.7 0.19 25)', fontSize: '13px', marginTop: '10px' }}>{chatError}</div>}

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={chatAsAnnouncement}
                  onChange={(e) => setChatAsAnnouncement(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'oklch(0.82 0.19 88)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13px', color: 'oklch(0.85 0.02 100)' }}>📢 Kirim sebagai Pengumuman (10 Coin) — tampil menonjol buat semua orang</span>
              </label>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <input
                  type="text"
                  placeholder="Tulis pesan..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                  maxLength={500}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div
                  onClick={() => sendChatMessage()}
                  style={{
                    cursor: chatSending || !chatInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: chatSending || !chatInput.trim() ? 0.5 : 1,
                    fontFamily: "'Bebas Neue',sans-serif",
                    fontSize: '16px',
                    letterSpacing: '1px',
                    background: 'linear-gradient(180deg, oklch(0.82 0.15 85), oklch(0.68 0.16 80))',
                    color: 'oklch(0.16 0.04 30)',
                    padding: '0 22px',
                    borderRadius: '10px',
                    border: '2px solid oklch(0.55 0.12 85)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {chatAsAnnouncement ? 'KIRIM • 10 COIN' : 'KIRIM'}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* FOOTER */}
      <div style={{ textAlign: 'center', padding: '24px', color: 'oklch(0.6 0.02 100)', fontSize: '12px', borderTop: '1px solid oklch(0.25 0.05 335)' }}>
        ♠ Permainan tebak-tebakan untuk hiburan internal. Coin tidak memiliki nilai tukar uang. ♥
      </div>
      <div className="tp-bottom-spacer" />

      {/* BOTTOM TAB BAR (mobile only) */}
      <div className="tp-bottom-tabs">
        {tabDef.map((tab) => (
          <div
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              cursor: 'pointer',
              padding: '12px 4px',
              borderRadius: '10px',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: activeTab === tab.key ? 'oklch(0.82 0.19 88)' : 'transparent',
              color: activeTab === tab.key ? 'oklch(0.16 0.04 30)' : 'oklch(0.9 0.01 90)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 600 }}>{tab.label}</div>
          </div>
        ))}
      </div>

      {/* AUTH MODAL */}
      {authModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={closeAuthModal}
        >
          <div
            style={{
              width: '380px',
              maxWidth: '100%',
              background: 'oklch(0.18 0.045 335)',
              border: '2px solid oklch(0.82 0.19 88)',
              borderRadius: '16px',
              padding: '28px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <div
                style={{
                  flex: 1,
                  textAlign: 'center',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  fontFamily: "'Bebas Neue',sans-serif",
                  letterSpacing: '1px',
                  fontSize: '16px',
                  background: authMode === 'register' ? 'oklch(0.82 0.19 88)' : 'transparent',
                  color: authMode === 'register' ? 'oklch(0.16 0.04 30)' : 'oklch(0.9 0.01 90)',
                }}
                onClick={() => { setAuthMode('register'); setAuthError(null); }}
              >
                DAFTAR
              </div>
              <div
                style={{
                  flex: 1,
                  textAlign: 'center',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  fontFamily: "'Bebas Neue',sans-serif",
                  letterSpacing: '1px',
                  fontSize: '16px',
                  background: authMode === 'login' ? 'oklch(0.82 0.19 88)' : 'transparent',
                  color: authMode === 'login' ? 'oklch(0.16 0.04 30)' : 'oklch(0.9 0.01 90)',
                }}
                onClick={() => { setAuthMode('login'); setAuthError(null); }}
              >
                MASUK
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {authMode === 'register' && (
                <div>
                  <input
                    type="text"
                    placeholder="Nama Lengkap (sesuai data resmi)"
                    value={authFullName}
                    onChange={(e) => setAuthFullName(e.target.value)}
                    style={inputStyle}
                    autoFocus
                  />
                  <div style={{ fontSize: '11px', color: 'oklch(0.7 0.02 100)', marginTop: '6px', lineHeight: 1.4 }}>
                    Cuma buat verifikasi kamu peserta internal — bukan username kamu. Username buat login ada di bawah.
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '12px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={authConsent}
                      onChange={(e) => setAuthConsent(e.target.checked)}
                      style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: 'oklch(0.82 0.19 88)', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '12px', color: 'oklch(0.85 0.02 100)', lineHeight: 1.4 }}>
                      Saya setuju nama saya digunakan untuk keperluan verifikasi identitas peserta & game internal ini. Baca selengkapnya di{' '}
                      <span
                        style={{ textDecoration: 'underline', color: 'oklch(0.82 0.19 88)', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTermsOpen(true);
                        }}
                      >
                        Ketentuan &amp; Privasi
                      </span>
                      .
                    </span>
                  </label>
                </div>
              )}
              <input
                type="text"
                placeholder="Username"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                style={inputStyle}
                autoFocus={authMode === 'login'}
              />
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitAuth()}
                style={inputStyle}
              />

              {authError && (
                <div style={{ color: 'oklch(0.7 0.19 25)', fontSize: '13px' }}>{authError}</div>
              )}

              <div
                style={{
                  cursor: authLoading || (authMode === 'register' && !authConsent) ? 'not-allowed' : 'pointer',
                  opacity: authLoading || (authMode === 'register' && !authConsent) ? 0.5 : 1,
                  textAlign: 'center',
                  fontFamily: "'Bebas Neue',sans-serif",
                  fontSize: '18px',
                  letterSpacing: '1px',
                  background: 'linear-gradient(180deg, oklch(0.82 0.15 85), oklch(0.68 0.16 80))',
                  color: 'oklch(0.16 0.04 30)',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '2px solid oklch(0.55 0.12 85)',
                  marginTop: '4px',
                }}
                onClick={() => !authLoading && (authMode === 'login' || authConsent) && submitAuth()}
              >
                {authLoading ? 'MEMPROSES...' : authMode === 'register' ? 'DAFTAR • +1000 COIN' : 'MASUK'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TERMS & PRIVACY MODAL */}
      {termsOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setTermsOpen(false)}
        >
          <div
            style={{
              width: '540px',
              maxWidth: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              background: 'oklch(0.18 0.045 335)',
              border: '2px solid oklch(0.82 0.19 88)',
              borderRadius: '16px',
              padding: '28px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '22px', letterSpacing: '1px', color: 'oklch(0.82 0.19 88)', marginBottom: '4px' }}>
              🎲 Sebelum Mulai — Baca Dulu Ya!
            </div>
            <div style={{ fontSize: '14px', color: 'oklch(0.9 0.01 90)', marginBottom: '18px' }}>
              Selamat datang di Tebak Penempatan! 🎉 Biar sama-sama enak, ini beberapa hal yang perlu kamu tau:
            </div>

            <div style={{ fontSize: '14px', fontWeight: 700, color: 'oklch(0.82 0.19 88)', marginBottom: '6px' }}>📋 Soal Data</div>
            <ul style={{ fontSize: '13px', color: 'oklch(0.85 0.02 100)', lineHeight: 1.6, paddingLeft: '20px', marginTop: 0, marginBottom: '18px' }}>
              <li>Game ini pakai data nama & satuan kerja yang sudah dipublikasikan resmi di kanal publik — bukan data baru yang kami kumpulkan sendiri.</li>
              <li>Kami tidak menambahkan data pribadi lain (kontak, alamat, dll).</li>
              <li>Data ini hanya untuk keperluan internal game, tidak dibagikan atau dijual ke pihak manapun.</li>
            </ul>

            <div style={{ fontSize: '14px', fontWeight: 700, color: 'oklch(0.82 0.19 88)', marginBottom: '6px' }}>🚫 Bukan Resmi</div>
            <ul style={{ fontSize: '13px', color: 'oklch(0.85 0.02 100)', lineHeight: 1.6, paddingLeft: '20px', marginTop: 0, marginBottom: '18px' }}>
              <li>Game ini murni inisiatif untuk seru-seruan, tidak berafiliasi dan tidak mewakili lembaga apapun.</li>
              <li>Hasil tebakan di sini sama sekali tidak memengaruhi hasil resmi.</li>
            </ul>

            <div style={{ fontSize: '14px', fontWeight: 700, color: 'oklch(0.82 0.19 88)', marginBottom: '6px' }}>💰 Soal Coin & Poin</div>
            <div style={{ fontSize: '13px', color: 'oklch(0.85 0.02 100)', lineHeight: 1.6, marginBottom: '18px' }}>
              Semua coin/poin di sini virtual, cuma buat fun — tidak bisa ditukar, dibeli, atau dicairkan jadi uang/aset apapun dalam bentuk apapun.
            </div>

            <div
              style={{
                cursor: 'pointer',
                textAlign: 'center',
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: '16px',
                letterSpacing: '1px',
                background: 'linear-gradient(180deg, oklch(0.82 0.15 85), oklch(0.68 0.16 80))',
                color: 'oklch(0.16 0.04 30)',
                padding: '12px',
                borderRadius: '10px',
                border: '2px solid oklch(0.55 0.12 85)',
              }}
              onClick={() => setTermsOpen(false)}
            >
              MENGERTI
            </div>
          </div>
        </div>
      )}

      {/* GACHA MODAL */}
      {gachaOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={closeGacha}
        >
          <div
            style={{
              width: '380px',
              maxWidth: '100%',
              background: 'linear-gradient(180deg, oklch(0.22 0.08 335), oklch(0.15 0.05 335))',
              border: '3px solid oklch(0.82 0.19 88)',
              borderRadius: '20px',
              padding: '28px',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tp-shimmer-text" style={{ fontFamily: "'Luckiest Guy',cursive", fontSize: '26px', letterSpacing: '1px', marginBottom: '18px' }}>
              GACHA COIN
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'center',
                marginBottom: '20px',
                background: 'oklch(0.10 0.03 335)',
                border: '2px solid oklch(0.4 0.1 335)',
                borderRadius: '14px',
                padding: '18px 10px',
              }}
            >
              {gachaReels.map((sym, i) => (
                <div
                  key={i}
                  style={{
                    width: '80px',
                    height: '80px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'oklch(0.96 0.01 90)',
                    borderRadius: '10px',
                    border: '2px solid oklch(0.82 0.19 88)',
                    overflow: 'hidden',
                  }}
                >
                  {gachaImagesReady ? (
                    <img src={SLOT_SYMBOLS[sym]} alt={sym} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '3px solid oklch(0.82 0.19 88 / 0.3)', borderTopColor: 'oklch(0.82 0.19 88)', animation: 'chipSpin 0.8s linear infinite' }} />
                  )}
                </div>
              ))}
            </div>

            {!loggedIn && (
              <div style={{ color: 'oklch(0.85 0.02 100)', fontSize: '14px', marginBottom: '16px' }}>
                Daftar / masuk dulu buat main gacha.
              </div>
            )}

            {loggedIn && gachaResult && (
              <div
                style={{
                  marginBottom: '16px',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: gachaResult.reward > 0 ? 'oklch(0.82 0.19 88)' : 'oklch(0.8 0.02 100)',
                }}
              >
                {gachaResult.reward >= 1000
                  ? '🎉 JACKPOT! +' + fmtNum(gachaResult.reward) + ' Coin!'
                  : gachaResult.reward > 0
                  ? '+' + fmtNum(gachaResult.reward) + ' Coin!'
                  : 'Belum beruntung, coba lagi!'}
              </div>
            )}

            {gachaError && <div style={{ color: 'oklch(0.7 0.19 25)', fontSize: '13px', marginBottom: '16px' }}>{gachaError}</div>}

            {loggedIn && (
              <div style={{ fontSize: '13px', color: 'oklch(0.8 0.02 100)', marginBottom: '14px' }}>
                Saldo: <b style={{ color: 'oklch(0.96 0.01 90)' }}>{fmtNum(balance)} Coin</b>
              </div>
            )}

            <div
              style={{
                cursor: !loggedIn || gachaSpinning || !gachaImagesReady ? 'not-allowed' : 'pointer',
                opacity: gachaSpinning || !gachaImagesReady ? 0.6 : 1,
                fontFamily: "'Bebas Neue',sans-serif",
                fontSize: '18px',
                letterSpacing: '1px',
                background: 'linear-gradient(180deg, oklch(0.82 0.15 85), oklch(0.68 0.16 80))',
                color: 'oklch(0.16 0.04 30)',
                padding: '14px',
                borderRadius: '10px',
                border: '2px solid oklch(0.55 0.12 85)',
              }}
              onClick={() => loggedIn && !gachaSpinning && gachaImagesReady && spinGacha()}
            >
              {!gachaImagesReady
                ? 'MEMUAT...'
                : gachaSpinning
                ? 'SPINNING...'
                : !loggedIn
                ? 'MASUK DULU'
                : isFreeSpinAvailable(lastFreeSpinAt)
                ? 'SPIN GRATIS 🎰'
                : 'SPIN • 10 COIN 🎰'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
