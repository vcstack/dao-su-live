import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
  UserOfflineError
} from 'tiktok-live-connector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const CAIDAT_PATH = path.join(__dirname, 'caidat.json');
const TUCNGU_PATH = path.join(__dirname, 'tucngu.json');

const MAC_DINH = {
  mauZuzai: 10000,
  chuKhoaTung: 'tung',
  amThanh: true,
  bangQua: [
    { tu: 0, den: 9, hieuUng: 'chuong' },
    { tu: 10, den: 99, hieuUng: 'chuongLon' },
    { tu: 100, den: 999999, hieuUng: 'doanTroTran' }
  ],
  khoaKy: ''
};

function docJson(p, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch {
    return { ...fallback };
  }
}

function ghiCaidat(obj) {
  fs.writeFileSync(CAIDAT_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

let caidat = docJson(CAIDAT_PATH, MAC_DINH);
let tucngu = docJson(TUCNGU_PATH, { tu: [] });

function boDau(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function cheTuTuc(text) {
  let out = String(text || '');
  for (const tu of tucngu.tu || []) {
    if (!tu) continue;
    const re = new RegExp(tu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '***');
  }
  return out;
}

function catTen(ten) {
  const t = cheTuTuc(String(ten || 'Khách').trim() || 'Khách');
  return t.length > 20 ? t.slice(0, 20) + '…' : t;
}

function anhUser(user) {
  const u =
    user?.profilePictureUrl ||
    user?.profilePicture?.url?.[0] ||
    user?.avatarThumb?.urlList?.[0] ||
    user?.avatarMedium?.urlList?.[0] ||
    '';
  return typeof u === 'string' ? u : '';
}

function hieuUngTheoKim(kim) {
  const bang = caidat.bangQua || MAC_DINH.bangQua;
  for (const d of bang) {
    if (kim >= d.tu && kim <= d.den) return d.hieuUng;
  }
  return 'chuong';
}

// —— WebSocket broadcast ——
const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/song', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'song.html'));
});

app.get('/api/caidat', (_req, res) => {
  const { khoaKy, ...rest } = caidat;
  res.json({ ...rest, coKhoaKy: Boolean(khoaKy) });
});

app.post('/api/caidat', (req, res) => {
  const b = req.body || {};
  caidat = {
    mauZuzai: Math.max(1000, Number(b.mauZuzai) || caidat.mauZuzai),
    chuKhoaTung: String(b.chuKhoaTung || 'tung').trim() || 'tung',
    amThanh: Boolean(b.amThanh),
    bangQua: Array.isArray(b.bangQua) ? b.bangQua : caidat.bangQua,
    khoaKy: b.khoaKy !== undefined ? String(b.khoaKy || '') : caidat.khoaKy
  };
  ghiCaidat(caidat);
  phat({ loai: 'caidat', caidat: caidatChoSong() });
  res.json({ ok: true });
});

app.post('/api/thu', (_req, res) => {
  chayThu();
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function phat(obj) {
  const raw = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(raw);
  }
}

function caidatChoSong() {
  return {
    mauZuzai: caidat.mauZuzai,
    chuKhoaTung: caidat.chuKhoaTung,
    amThanh: caidat.amThanh,
    bangQua: caidat.bangQua
  };
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ loai: 'caidat', caidat: caidatChoSong() }));
  ws.send(JSON.stringify({ loai: 'trangthai', ...trangThaiHienTai() }));
});

function daySuKien(ev) {
  const e = {
    loai: ev.loai,
    ten: catTen(ev.ten),
    anh: ev.anh || '',
    qua: ev.qua || '',
    soKimCuong: Number(ev.soKimCuong) || 0,
    soLuong: Number(ev.soLuong) || 1,
    noiDung: cheTuTuc(String(ev.noiDung || '').slice(0, 80)),
    hieuUng: ev.hieuUng || null
  };
  if (e.loai === 'qua' && !e.hieuUng) e.hieuUng = hieuUngTheoKim(e.soKimCuong);
  phat(e);
}

// —— TikTok connection ——
let ketNoi = null;
let dangNoi = false;
let tuDongNgat = false;
let lanThuLai = 0;
let henThuLai = null;
let tenKenh = '';
let trangThai = 'chua';
let loiHien = '';

function trangThaiHienTai() {
  return {
    trangThai,
    loi: loiHien,
    tenKenh,
    lanThuLai,
    dangNoi
  };
}

function capNhatTrangThai(tt, loi = '') {
  trangThai = tt;
  loiHien = loi;
  phat({ loai: 'trangthai', ...trangThaiHienTai() });
}

function dichLoi(err) {
  if (!err) return 'Lỗi không rõ';
  if (err instanceof UserOfflineError || err?.name === 'UserOfflineError') {
    return 'Kênh chưa phát live';
  }
  const m = String(err.message || err);
  if (/offline|not live|LIVE_END|user_not_live/i.test(m)) return 'Kênh chưa phát live';
  if (/rate|limit|429/i.test(m)) return 'Bị giới hạn tốc độ, thử lại sau';
  if (/sign|euler|api.?key/i.test(m)) return 'Lỗi ký kết nối (thử thêm Khoá ký nếu có)';
  if (/ENOTFOUND|ECONNREFUSED|network|fetch failed/i.test(m)) return 'Lỗi mạng, kiểm tra internet';
  return m.slice(0, 120);
}

function goHenThuLai() {
  if (henThuLai) {
    clearTimeout(henThuLai);
    henThuLai = null;
  }
}

async function noiTikTok(uniqueId, khoaKy) {
  goHenThuLai();
  tuDongNgat = true;
  if (ketNoi) {
    try {
      await ketNoi.disconnect();
    } catch {
      /* ignore */
    }
    ketNoi = null;
  }

  tenKenh = String(uniqueId || '').replace(/^@/, '').trim();
  if (!tenKenh) {
    capNhatTrangThai('loi', 'Nhập tên TikTok');
    return;
  }
  if (khoaKy !== undefined) {
    caidat.khoaKy = String(khoaKy || '');
    ghiCaidat(caidat);
  }

  dangNoi = true;
  capNhatTrangThai('dang_noi', `Đang nối @${tenKenh}…`);

  const opts = {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    fetchRoomInfoOnConnect: true
  };
  if (caidat.khoaKy) opts.signApiKey = caidat.khoaKy;

  ketNoi = new TikTokLiveConnection(tenKenh, opts);

  ketNoi.on(ControlEvent.CONNECTED, () => {
    lanThuLai = 0;
    capNhatTrangThai('da_noi', `Đã nối @${tenKenh}`);
  });

  ketNoi.on(ControlEvent.DISCONNECTED, () => {
    if (!tuDongNgat) return;
    if (lanThuLai >= 10) {
      dangNoi = false;
      capNhatTrangThai('loi', 'Mất kết nối. Đã thử lại 10 lần.');
      return;
    }
    lanThuLai += 1;
    capNhatTrangThai('mat_ket_noi', `Mất kết nối. Thử lại lần ${lanThuLai}/10 sau 5 giây…`);
    henThuLai = setTimeout(() => {
      if (tuDongNgat) noiTikTok(tenKenh);
    }, 5000);
  });

  ketNoi.on(ControlEvent.ERROR, ({ exception, info }) => {
    const loi = dichLoi(exception || info);
    if (trangThai !== 'da_noi') capNhatTrangThai('loi', loi);
  });

  ketNoi.on(WebcastEvent.CHAT, (data) => {
    daySuKien({
      loai: 'binhluan',
      ten: data.user?.nickname || data.user?.uniqueId,
      anh: anhUser(data.user),
      noiDung: data.comment || ''
    });
  });

  ketNoi.on(WebcastEvent.GIFT, (data) => {
    const giftType = data.giftDetails?.giftType;
    // shortcut: chỉ tính khi chuỗi kết thúc (theo README 2.5.0)
    if (giftType === 1 && !data.repeatEnd) return;

    const soLuong = Number(data.repeatCount) || 1;
    const mot =
      Number(data.diamondCount) ||
      Number(data.extendedGiftInfo?.diamond_count) ||
      Number(data.giftDetails?.diamondCount) ||
      1;
    const soKimCuong = mot * soLuong;
    daySuKien({
      loai: 'qua',
      ten: data.user?.nickname || data.user?.uniqueId,
      anh: anhUser(data.user),
      qua: data.giftDetails?.giftName || data.extendedGiftInfo?.name || 'Quà',
      soKimCuong,
      soLuong,
      hieuUng: hieuUngTheoKim(soKimCuong)
    });
  });

  ketNoi.on(WebcastEvent.LIKE, (data) => {
    daySuKien({
      loai: 'tim',
      ten: data.user?.nickname || data.user?.uniqueId,
      anh: anhUser(data.user),
      soLuong: Number(data.likeCount) || 1
    });
  });

  const theoDoi = (data) => {
    daySuKien({
      loai: 'theodoi',
      ten: data.user?.nickname || data.user?.uniqueId,
      anh: anhUser(data.user)
    });
  };
  ketNoi.on(WebcastEvent.FOLLOW, theoDoi);
  ketNoi.on(WebcastEvent.SOCIAL, (data) => {
    // follow action thường là 1
    if (data.displayType?.includes?.('follow') || data.action === 1) theoDoi(data);
  });

  ketNoi.on(WebcastEvent.MEMBER, (data) => {
    daySuKien({
      loai: 'vao',
      ten: data.user?.nickname || data.user?.uniqueId,
      anh: anhUser(data.user)
    });
  });

  ketNoi.on(WebcastEvent.STREAM_END, () => {
    tuDongNgat = false;
    dangNoi = false;
    goHenThuLai();
    capNhatTrangThai('ket_thuc', 'Phiên live đã kết thúc');
  });

  try {
    await ketNoi.connect();
  } catch (err) {
    const loi = dichLoi(err);
    if (tuDongNgat && lanThuLai < 10 && !(err instanceof UserOfflineError)) {
      lanThuLai += 1;
      capNhatTrangThai('loi', `${loi}. Thử lại ${lanThuLai}/10 sau 5 giây…`);
      henThuLai = setTimeout(() => {
        if (tuDongNgat) noiTikTok(tenKenh);
      }, 5000);
    } else {
      dangNoi = false;
      tuDongNgat = false;
      capNhatTrangThai('loi', loi);
    }
  }
}

async function ngatTikTok() {
  tuDongNgat = false;
  dangNoi = false;
  goHenThuLai();
  lanThuLai = 0;
  if (ketNoi) {
    try {
      await ketNoi.disconnect();
    } catch {
      /* ignore */
    }
    ketNoi = null;
  }
  capNhatTrangThai('chua', 'Đã ngắt');
}

app.post('/api/noi', async (req, res) => {
  const { ten, khoaKy } = req.body || {};
  noiTikTok(ten, khoaKy);
  res.json({ ok: true });
});

app.post('/api/ngat', async (_req, res) => {
  await ngatTikTok();
  res.json({ ok: true });
});

app.get('/api/trangthai', (_req, res) => {
  res.json(trangThaiHienTai());
});

// —— Demo events ——
function chayThu() {
  const ten = ['Lan', 'Minh', 'Hùng', 'Vy', 'Phúc', 'An', 'Ngọc', 'Tuấn'];
  const pick = () => ten[Math.floor(Math.random() * ten.length)];
  const buoc = [
    () => daySuKien({ loai: 'vao', ten: pick() }),
    () => daySuKien({ loai: 'theodoi', ten: pick() }),
    () => daySuKien({ loai: 'binhluan', ten: pick(), noiDung: 'tụng' }),
    () => daySuKien({ loai: 'binhluan', ten: pick(), noiDung: 'TUNG nào!' }),
    () => daySuKien({ loai: 'tim', ten: pick(), soLuong: 15 }),
    () => daySuKien({ loai: 'tim', ten: pick(), soLuong: 40 }),
    () => daySuKien({ loai: 'qua', ten: pick(), qua: 'Hoa hồng', soKimCuong: 5, soLuong: 1, hieuUng: 'chuong' }),
    () => daySuKien({ loai: 'qua', ten: pick(), qua: 'TikTok', soKimCuong: 50, soLuong: 1, hieuUng: 'chuongLon' }),
    () => daySuKien({ loai: 'binhluan', ten: pick(), noiDung: 'tụng' }),
    () => daySuKien({ loai: 'tim', ten: pick(), soLuong: 80 }),
    () => daySuKien({ loai: 'qua', ten: pick(), qua: 'Sư tử', soKimCuong: 300, soLuong: 1, hieuUng: 'doanTroTran' }),
    () => daySuKien({ loai: 'binhluan', ten: pick(), noiDung: 'tụng' }),
    () => daySuKien({ loai: 'qua', ten: pick(), qua: 'Lâu đài', soKimCuong: 500, soLuong: 1, hieuUng: 'doanTroTran' }),
    () => daySuKien({ loai: 'tim', ten: pick(), soLuong: 100 }),
    () => daySuKien({ loai: 'binhluan', ten: pick(), noiDung: 'tụng' }),
    () => daySuKien({ loai: 'qua', ten: 'Đòn cuối', qua: 'Universe', soKimCuong: 8000, soLuong: 1, hieuUng: 'doanTroTran' })
  ];
  buoc.forEach((fn, i) => setTimeout(fn, 800 + i * 1200));
}

server.listen(PORT, () => {
  console.log(`Dao Su LIVE: http://localhost:${PORT}`);
  console.log(`Trang song:  http://localhost:${PORT}/song`);
});
