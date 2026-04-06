import { useEffect, useState } from 'react';
import { Lock, User, Mail, Eye, EyeOff, LogOut, Key, CheckCircle, FileText, Download, Image, Type, Shield, Database, Clock, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { HistoryStore, HistoryPanel } from './HistoryCrypto';

// ─── Utility helpers ─────────────────────────────────────────────────────────

const toB64 = (buf) => { const bytes = new Uint8Array(buf); let binary = ""; const CHUNK = 8192; for (let i = 0; i < bytes.length; i += CHUNK) { binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK)); } return btoa(binary); };
const fromB64 = (str) => { const clean = str.replace(/[^A-Za-z0-9+/]/g, ""); const padded = clean + "=".repeat((4 - clean.length % 4) % 4); return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)); };


const readJson = (key, fallback) => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
};
const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.error(`Could not save ${key}`, e); }
};

// ─── OOP Core Classes ─────────────────────────────────────────────────────────

class CryptoEngine {
  static AES_ITERATIONS = 250000;

  static async deriveKey({ password, salt, iterations = CryptoEngine.AES_ITERATIONS }) {
    const base = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  static async encrypt({ plainBytes, password }) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await CryptoEngine.deriveKey({ password, salt });
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
    return {
      ciphertext: toB64(cipher),
      salt: toB64(salt),
      iv: toB64(iv),
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: CryptoEngine.AES_ITERATIONS,
      version: 1,
    };
  }

  static async decrypt({ payload, password }) {
    const { ciphertext, salt, iv, iterations } = payload;
    if (!ciphertext || !salt || !iv) throw new Error('Invalid payload: missing ciphertext, salt, or iv.');
    const key = await CryptoEngine.deriveKey({ password, salt: fromB64(salt), iterations: iterations || CryptoEngine.AES_ITERATIONS });
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ciphertext));
    return new Uint8Array(plain);
  }
}

// HistoryStore is now imported from './HistoryCrypto.js'

// Initialize the database asynchronously early on
HistoryStore.init().catch(console.error);

class AccountManager {
  static ACCOUNTS_KEY = 'encryptionSystemAccounts';
  static USER_KEY = 'encryptionSystemLoggedInUser';

  constructor() {
    this.accounts = readJson(AccountManager.ACCOUNTS_KEY, []);
  }

  save() { writeJson(AccountManager.ACCOUNTS_KEY, this.accounts); }

  find({ email }) { return this.accounts.find(a => a.email === email) || null; }

  register({ name, email, password }) {
    if (!name || !email || !password) throw new Error('Please fill in all fields.');
    if (this.accounts.some(a => a.email === email)) throw new Error('An account with this email already exists.');
    const account = { name, email, password };
    this.accounts.push(account);
    this.save();
    return account;
  }

  login({ email, password }) {
    const account = this.accounts.find(a => a.email === email && a.password === password);
    if (!account) throw new Error('Invalid email or password.');
    return { email: account.email, name: account.name };
  }

  changePassword({ email, oldPassword, newPassword }) {
    const idx = this.accounts.findIndex(a => a.email === email);
    if (idx < 0) throw new Error('User account not found.');
    if (this.accounts[idx].password !== oldPassword) throw new Error('Incorrect old password.');
    this.accounts[idx].password = newPassword;
    this.save();
  }

  persistSession({ user }) { writeJson(AccountManager.USER_KEY, user); }
  clearSession() { localStorage.removeItem(AccountManager.USER_KEY); }
  getSession() { return readJson(AccountManager.USER_KEY, null); }
}

class FileProcessor {
  static isText(file) { return file && (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')); }
  static isImage(file) { return file && file.type.startsWith('image/'); }
  static isCsv(file) { return file && (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')); }
  static isXlsx(file) { return file && (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.toLowerCase().endsWith('.xlsx')); }
  static isDataset(file) { return FileProcessor.isCsv(file) || FileProcessor.isXlsx(file); }

  static decryptedDatasetName(name, originalName = '') {
    // If the original name was recorded in the payload (e.g. data.xlsx)
    if (originalName) {
      const extIdx = originalName.lastIndexOf('.');
      if (extIdx !== -1) {
        const base = originalName.substring(0, extIdx);
        const ext = originalName.substring(extIdx);
        return `${base}.decrypted${ext}`;
      }
      return `${originalName}.decrypted`;
    }

    // Fallback if no original name was in the payload
    if (name.endsWith('.encrypted.csv')) {
      const original = name.replace('.encrypted.csv', '');
      const ext = original.substring(original.lastIndexOf('.'));
      const base = original.substring(0, original.lastIndexOf('.'));
      return `${base}.decrypted${ext}`;
    }
    return `${name}.decrypted`;
  }

  static async download({ text, name, mimeType = 'text/plain;charset=utf-8' }) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: name });
        const writable = await handle.createWritable();
        await writable.write(new Blob([text], { type: mimeType }));
        await writable.close();
        return;
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    }
    const blob = new Blob([text], { type: mimeType });
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(blob, name);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  static async downloadBytes({ bytes, name, mimeType = 'application/octet-stream' }) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: name });
        const writable = await handle.createWritable();
        await writable.write(new Blob([bytes], { type: mimeType }));
        await writable.close();
        return;
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    }
    const blob = new Blob([bytes], { type: mimeType });
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(blob, name);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  static decryptedName(name) {
    return name.endsWith('.aes256.txt')
      ? `${name.replace('.aes256.txt', '')}.decrypted.txt`
      : `${name}.decrypted.txt`;
  }

  static decryptedImageName(name) {
    return name.replace('.aes256.png', '') || `${name}.decrypted`;
  }

  // ── Raw PNG builder/parser ──────────────────────────────────────────────────
  // Bypasses the browser canvas / color-correction pipeline entirely.
  // Data is stored verbatim in RGBA pixels of a hand-crafted PNG binary.

  static _crc32Table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  static _crc32(buf, offset = 0, length = buf.length - offset) {
    let crc = 0xFFFFFFFF;
    const t = FileProcessor._crc32Table;
    for (let i = offset; i < offset + length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  static _adler32(buf) {
    let a = 1, b = 0;
    for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
    return ((b << 16) | a) >>> 0;
  }

  static _u32be(n) {
    return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
  }

  static _chunk(type, data) {
    const typeBytes = type.split('').map(c => c.charCodeAt(0));
    const len = FileProcessor._u32be(data.length);
    const crcInput = new Uint8Array([...typeBytes, ...data]);
    const crc = FileProcessor._u32be(FileProcessor._crc32(crcInput));
    return new Uint8Array([...len, ...typeBytes, ...data, ...crc]);
  }

  // Deflate-store: zlib header + uncompressed deflate blocks + adler32
  static _zlibStore(raw) {
    const BSIZE = 65535;
    const blocks = [];
    for (let i = 0; i < raw.length || i === 0; i += BSIZE) {
      const slice = raw.slice(i, i + BSIZE);
      const last = (i + BSIZE >= raw.length) ? 1 : 0;
      // deflate non-compressed block header
      blocks.push(new Uint8Array([last, slice.length & 0xFF, (slice.length >> 8) & 0xFF,
        (~slice.length) & 0xFF, ((~slice.length) >> 8) & 0xFF]));
      blocks.push(slice);
    }
    const adler = FileProcessor._adler32(raw);
    const adlerBytes = new Uint8Array(FileProcessor._u32be(adler));
    // zlib header: CM=8 deflate, CINFO=0 (window 256), FCHECK chosen so header % 31 === 0
    const zlibHeader = new Uint8Array([0x78, 0x01]);
    const parts = [zlibHeader, ...blocks, adlerBytes];
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  // Build a valid PNG from RGBA pixel data (width x height, row-major)
  static _buildPNG(width, height, rgbaPixels) {
    // PNG signature
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR
    const ihdr = new Uint8Array([
      ...FileProcessor._u32be(width),
      ...FileProcessor._u32be(height),
      8,  // bit depth
      2,  // color type: RGB (no alpha — avoids premult issues)
      0, 0, 0  // compression, filter, interlace
    ]);

    // Raw image data: for each row, filter byte (0=None) + RGB pixels
    const rowBytes = width * 3;
    const rawRows = new Uint8Array(height * (1 + rowBytes));
    for (let y = 0; y < height; y++) {
      rawRows[y * (1 + rowBytes)] = 0; // filter type None
      for (let x = 0; x < width; x++) {
        const src = (y * width + x) * 4;
        const dst = y * (1 + rowBytes) + 1 + x * 3;
        rawRows[dst] = rgbaPixels[src];
        rawRows[dst + 1] = rgbaPixels[src + 1];
        rawRows[dst + 2] = rgbaPixels[src + 2];
      }
    }

    const idat = FileProcessor._zlibStore(rawRows);
    const iend = new Uint8Array(0);

    const ihdrChunk = FileProcessor._chunk('IHDR', Array.from(ihdr));
    const idatChunk = FileProcessor._chunk('IDAT', Array.from(idat));
    const iendChunk = FileProcessor._chunk('IEND', Array.from(iend));

    const total = sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
    const png = new Uint8Array(total);
    let off = 0;
    for (const part of [sig, ihdrChunk, idatChunk, iendChunk]) { png.set(part, off); off += part.length; }
    return png;
  }

  // Parse a raw PNG binary and return RGBA pixel data + dimensions
  static _parsePNG(buf) {
    const view = new DataView(buf.buffer || buf);
    const bytes = new Uint8Array(buf.buffer ? buf.buffer : buf);

    // Verify PNG signature
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('Not a valid PNG file.');

    let off = 8;
    let width = 0, height = 0, colorType = 0;
    const idatChunks = [];

    while (off < bytes.length) {
      const len = view.getUint32(off); off += 4;
      const type = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]); off += 4;
      const data = bytes.slice(off, off + len); off += len;
      off += 4; // skip CRC

      if (type === 'IHDR') {
        const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
        width = dv.getUint32(0, false);
        height = dv.getUint32(4, false);
        colorType = data[9];
      } else if (type === 'IDAT') {
        idatChunks.push(data);
      } else if (type === 'IEND') break;
    }

    // Concatenate IDAT chunks
    const totalIdat = idatChunks.reduce((s, c) => s + c.length, 0);
    const idat = new Uint8Array(totalIdat);
    let idatOff = 0;
    for (const c of idatChunks) { idat.set(c, idatOff); idatOff += c.length; }

    // Decompress zlib-stored (uncompressed deflate blocks)
    // Skip 2-byte zlib header
    let pos = 2;
    const channels = colorType === 2 ? 3 : 4; // RGB or RGBA
    const rowBytes = width * channels;
    const rawRows = new Uint8Array(height * (1 + rowBytes));
    let rawOff = 0;

    while (pos < idat.length - 4) {
      const last = idat[pos]; pos++;
      const blen = idat[pos] | (idat[pos + 1] << 8); pos += 2;
      pos += 2; // skip ~len
      rawRows.set(idat.slice(pos, pos + blen), rawOff);
      rawOff += blen;
      pos += blen;
      if (last) break;
    }

    // Reconstruct RGBA from raw rows (filter byte must be 0=None)
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const rowStart = y * (1 + rowBytes) + 1;
      for (let x = 0; x < width; x++) {
        const src = rowStart + x * channels;
        const dst = (y * width + x) * 4;
        rgba[dst] = rawRows[src];
        rgba[dst + 1] = rawRows[src + 1];
        rgba[dst + 2] = rawRows[src + 2];
        rgba[dst + 3] = 255;
      }
    }

    return { width, height, rgba };
  }

  // Encode arbitrary bytes into a distorted-looking PNG (raw binary, no canvas)
  static async encodeToDistortedPng(dataBytes) {
    // Layout: [4-byte LE length][data bytes], packed 3 bytes per pixel (R,G,B)
    const len = dataBytes.length;
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, len, true);
    const combined = new Uint8Array(4 + len);
    combined.set(header); combined.set(dataBytes, 4);

    const pixelCount = Math.ceil(combined.length / 3);
    const MAX_SIDE = 16383;
    const width = Math.min(Math.ceil(Math.sqrt(pixelCount)), MAX_SIDE);
    const height = Math.ceil(pixelCount / width);
    if (height > MAX_SIDE) throw new Error('File is too large to encrypt.');

    // Build RGBA pixel array — pack 3 data bytes into R,G,B; padding pixels get random noise
    const rgba = new Uint8Array(width * height * 4);
    const noiseSize = width * height * 3;
    const noise = new Uint8Array(noiseSize);
    for (let i = 0; i < noiseSize; i += 65536) {
      crypto.getRandomValues(noise.subarray(i, Math.min(i + 65536, noiseSize)));
    }
    for (let i = 0; i < width * height; i++) {
      const b0 = i * 3, b1 = i * 3 + 1, b2 = i * 3 + 2;
      rgba[i * 4] = b0 < combined.length ? combined[b0] : noise[b0];
      rgba[i * 4 + 1] = b1 < combined.length ? combined[b1] : noise[b1];
      rgba[i * 4 + 2] = b2 < combined.length ? combined[b2] : noise[b2];
      rgba[i * 4 + 3] = 255;
    }

    const pngBytes = FileProcessor._buildPNG(width, height, rgba);
    return new Blob([pngBytes], { type: 'image/png' });
  }

  // Decode bytes back from a distorted PNG (raw binary parser, no canvas)
  static async decodeFromDistortedPng(file) {
    const buf = await FileProcessor.readArrayBuffer(file);
    const bytes = new Uint8Array(buf);
    const { width, height, rgba } = FileProcessor._parsePNG(bytes);

    // Extract 3 bytes per pixel (R, G, B)
    const totalPixels = width * height;
    const raw = new Uint8Array(totalPixels * 3);
    for (let i = 0; i < totalPixels; i++) {
      raw[i * 3] = rgba[i * 4];
      raw[i * 3 + 1] = rgba[i * 4 + 1];
      raw[i * 3 + 2] = rgba[i * 4 + 2];
    }

    const len = new DataView(raw.buffer, 0, 4).getUint32(0, true);
    if (len > raw.length - 4) throw new Error('Corrupted encrypted image: invalid length header.');
    return raw.slice(4, 4 + len);
  }

  static async readText(file) { return file.text(); }

  static async readArrayBuffer(file) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.onerror = () => rej(new Error('Could not read file.'));
      reader.readAsArrayBuffer(file);
    });
  }
}

// ─── Singleton managers ───────────────────────────────────────────────────────
const accountManager = new AccountManager();

// ─── UI Components ────────────────────────────────────────────────────────────

const TabBtn = ({ active, onClick, children, icon: Icon }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${active ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/50' : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/80'
      }`}
  >
    {Icon && <Icon size={15} />}
    {children}
  </button>
);

const ModeToggle = ({ value, onChange }) => (
  <div className="flex gap-2 p-1 bg-slate-900/60 rounded-xl">
    {['encrypt', 'decrypt'].map(m => (
      <button
        key={m}
        type="button"
        onClick={() => onChange(m)}
        className={`flex-1 py-2 rounded-lg font-semibold text-sm capitalize transition-all ${value === m ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
      >
        {m}
      </button>
    ))}
  </div>
);

const Notice = ({ type, children }) => (
  <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${type === 'error' ? 'bg-red-950 border border-red-700 text-red-200' : 'bg-emerald-950 border border-emerald-700 text-emerald-200'
    }`}>
    {type === 'success' && <CheckCircle size={16} className="mt-0.5 shrink-0" />}
    <span>{children}</span>
  </div>
);

const KeyInput = ({ value, onChange, placeholder = 'Enter encryption/decryption password' }) => (
  <div className="relative">
    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
    <input
      type="password"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600/80 text-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-sm"
      required
    />
  </div>
);

const SubmitBtn = ({ processing, mode, label }) => (
  <button
    type="submit"
    disabled={processing}
    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-lg hover:from-cyan-500 hover:to-blue-500 font-semibold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
  >
    <Download size={15} />
    {processing ? 'Processing…' : label || (mode === 'encrypt' ? 'Encrypt & Download' : 'Decrypt & Download')}
  </button>
);

// ─── Feature Panels ───────────────────────────────────────────────────────────

const TextFileCryptoPanel = ({ user }) => {
  const [mode, setMode] = useState('encrypt');
  const [file, setFile] = useState(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processing, setProcessing] = useState(false);

  const reset = () => { setError(''); setSuccess(''); };

  const handleFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(null); reset();
    if (!f) return;
    if (!FileProcessor.isText(f)) return setError('Only .txt files are allowed.');
    setFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    reset();
    if (!file) return setError('Please select a .txt file.');
    if (!key) return setError('Please enter a key password.');
    setProcessing(true);
    try {
      const text = await FileProcessor.readText(file);

      if (mode === 'encrypt') {
        const plainBytes = new TextEncoder().encode(text);
        const payload = await CryptoEngine.encrypt({ plainBytes, password: key });
        const compact = `${payload.salt}:${payload.iv}:${payload.ciphertext}`;
        const outName = `${file.name}.aes256.txt`;
        FileProcessor.download({ text: compact, name: outName });
        await HistoryStore.addRecord(user.email, { file: outName, action: 'Encrypt Text File', data: compact, mimeType: 'text/plain' });
        setSuccess(`Encrypted "${file.name}" and downloaded.`);
      } else {
        const parts = text.trim().split(':');
        if (parts.length < 3) throw new Error('Could not parse encrypted file. Make sure it was encrypted by this app.');
        const [salt, iv, ...rest] = parts;
        const payload = { salt, iv, ciphertext: rest.join(':'), algorithm: 'AES-256-GCM', iterations: 250000 };
        const plainBytes = await CryptoEngine.decrypt({ payload, password: key });
        const plainText = new TextDecoder().decode(plainBytes);
        const outName = FileProcessor.decryptedName(file.name);
        FileProcessor.download({ text: plainText, name: outName });
        await HistoryStore.addRecord(user.email, { file: outName, action: 'Decrypt Text File', data: plainText, mimeType: 'text/plain' });
        setSuccess(`Decrypted "${file.name}" and downloaded.`);
      }
    } catch (err) {
      setError(err.message || 'Operation failed. Check your key and try again.');
    } finally {
      setProcessing(false);
      setKey('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Notice type="error">{error}</Notice>}
      {success && <Notice type="success">{success}</Notice>}
      <ModeToggle value={mode} onChange={m => { setMode(m); setKey(''); reset(); }} />
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Text File (.txt)</label>
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={handleFile}
          className="w-full bg-slate-900 border border-slate-600/80 text-slate-300 rounded-lg p-3 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-cyan-700 file:text-white file:text-xs"
          required
        />
        {file && <p className="text-slate-500 text-xs mt-1.5">Selected: {file.name}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Key Password</label>
        <KeyInput value={key} onChange={setKey} />
      </div>
      <SubmitBtn processing={processing} mode={mode} />
    </form>
  );
};

const TextAreaCryptoPanel = ({ user }) => {
  const [mode, setMode] = useState('encrypt');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const reset = () => { setError(''); setOutputText(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    reset();
    if (!inputText.trim()) return setError('Please enter some text.');
    if (!key) return setError('Please enter a key password.');
    setProcessing(true);
    try {
      if (mode === 'encrypt') {
        const plainBytes = new TextEncoder().encode(inputText);
        const payload = await CryptoEngine.encrypt({ plainBytes, password: key });
        const compact = `${payload.salt}:${payload.iv}:${payload.ciphertext}`;
        setOutputText(compact);
        FileProcessor.download({ text: compact, name: 'encrypted_snippet.txt' });
        await HistoryStore.addRecord(user.email, { file: 'encrypted_snippet.txt', action: 'Encrypt Plain Text', data: compact, mimeType: 'text/plain' });
      } else {
        const parts = inputText.trim().split(':');
        if (parts.length < 3) throw new Error('Invalid encrypted text. Make sure it was encrypted by this app.');
        const [salt, iv, ...rest] = parts;
        const payload = { salt, iv, ciphertext: rest.join(':'), algorithm: 'AES-256-GCM', iterations: 250000 };
        const plainBytes = await CryptoEngine.decrypt({ payload, password: key });
        const plainText = new TextDecoder().decode(plainBytes);
        setOutputText(plainText);
        FileProcessor.download({ text: plainText, name: 'decrypted_snippet.txt' });
        await HistoryStore.addRecord(user.email, { file: 'decrypted_snippet.txt', action: 'Decrypt Plain Text', data: plainText, mimeType: 'text/plain' });
      }
    } catch (err) {
      setError(err.message || 'Operation failed. Check your key and try again.');
    } finally {
      setProcessing(false);
      setKey('');
    }
  };

  const copyOutput = () => { if (outputText) navigator.clipboard.writeText(outputText); };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Notice type="error">{error}</Notice>}
      <ModeToggle value={mode} onChange={m => { setMode(m); setInputText(''); reset(); setKey(''); }} />
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {mode === 'encrypt' ? 'Plaintext Input' : 'Encrypted Text Input'}
        </label>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={mode === 'encrypt' ? 'Type or paste text here…' : 'Paste the encrypted text here…'}
          rows={5}
          className="w-full bg-slate-900 border border-slate-600/80 text-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y font-mono"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Key Password</label>
        <KeyInput value={key} onChange={setKey} />
      </div>
      <button
        type="submit"
        disabled={processing}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-lg hover:from-cyan-500 hover:to-blue-500 font-semibold shadow-lg transition-all disabled:opacity-50 text-sm"
      >
        {processing ? 'Processing…' : mode === 'encrypt' ? 'Encrypt Text' : 'Decrypt Text'}
      </button>
      {outputText && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-300">
              {mode === 'encrypt' ? 'Encrypted Output' : 'Decrypted Plaintext'}
            </label>
            <button type="button" onClick={copyOutput} className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">Copy</button>
          </div>
          <textarea
            readOnly
            value={outputText}
            rows={6}
            className="w-full bg-slate-950 border border-slate-600/60 text-emerald-300 rounded-lg p-3 text-sm font-mono resize-y"
          />
        </div>
      )}
    </form>
  );
};

const ImageCryptoPanel = () => {
  const [mode, setMode] = useState('encrypt');
  const [file, setFile] = useState(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState(null);

  const reset = () => { setError(''); setSuccess(''); };

  const handleFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(null); setPreview(null); reset();
    if (!f) return;
    if (mode === 'encrypt' && !FileProcessor.isImage(f)) return setError('Please select an image file (PNG, JPEG, GIF, WebP, etc.).');
    if (mode === 'decrypt' && !(/\.aes256(\s*\(\d+\))?\.png$/i.test(f.name))) return setError('Please select an .aes256.png encrypted image file.');
    setFile(f);
    if (mode === 'encrypt') setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    reset();
    if (!file) return setError('Please select a file.');
    if (!key) return setError('Please enter a key password.');
    setProcessing(true);
    try {
      if (mode === 'encrypt') {
        const buf = await FileProcessor.readArrayBuffer(file);
        const plainBytes = new Uint8Array(buf);
        const payload = await CryptoEngine.encrypt({ plainBytes, password: key });
        // Store original mime type so we can restore it on decrypt
        payload.mimeType = file.type;
        payload.originalName = file.name;
        // Encode payload as JSON bytes, then embed into a distorted PNG
        const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
        const pngBlob = await FileProcessor.encodeToDistortedPng(jsonBytes);
        const outName = `${file.name}.aes256.png`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(pngBlob);
        a.download = outName;
        a.click();
        URL.revokeObjectURL(a.href);
        setSuccess(`Encrypted image "${file.name}" and downloaded as distorted PNG.`);
      } else {
        // Decode JSON bytes from the distorted PNG, then decrypt
        const jsonBytes = await FileProcessor.decodeFromDistortedPng(file);
        const jsonStr = new TextDecoder().decode(jsonBytes);
        let payload;
        try { payload = JSON.parse(jsonStr); }
        catch { throw new Error('Could not parse encrypted file. Make sure it was encrypted by this app.'); }
        if (payload.algorithm !== 'AES-256-GCM') throw new Error('Unsupported algorithm.');
        const plainBytes = await CryptoEngine.decrypt({ payload, password: key });
        const mimeType = payload.mimeType || 'image/png';
        const originalName = payload.originalName || FileProcessor.decryptedImageName(file.name);
        FileProcessor.downloadBytes({ bytes: plainBytes, name: originalName, mimeType });
        setSuccess(`Decrypted image and downloaded as "${originalName}".`);
      }
    } catch (err) {
      setError(err.message || 'Operation failed. Check your key and try again.');
    } finally {
      setProcessing(false);
      setKey('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Notice type="error">{error}</Notice>}
      {success && <Notice type="success">{success}</Notice>}
      <ModeToggle value={mode} onChange={m => { setMode(m); setFile(null); setPreview(null); setKey(''); reset(); }} />
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {mode === 'encrypt' ? 'Image File (PNG, JPEG, GIF, WebP…)' : 'Encrypted Image File (.aes256.png)'}
        </label>
        <input
          type="file"
          accept={mode === 'encrypt' ? 'image/*' : '.png,.aes256.png'}
          onChange={handleFile}
          className="w-full bg-slate-900 border border-slate-600/80 text-slate-300 rounded-lg p-3 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-cyan-700 file:text-white file:text-xs"
          required
        />
        {file && <p className="text-slate-500 text-xs mt-1.5">Selected: {file.name}</p>}
        {preview && (
          <div className="mt-3 rounded-lg overflow-hidden border border-slate-700 max-h-48 flex items-center justify-center bg-slate-950">
            <img src={preview} alt="Preview" className="max-h-48 object-contain" />
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Key Password</label>
        <KeyInput value={key} onChange={setKey} />
      </div>
      <SubmitBtn processing={processing} mode={mode} label={mode === 'encrypt' ? 'Encrypt Image & Download' : 'Decrypt Image & Download'} />
    </form>
  );
};

const DatasetCryptoPanel = ({ user }) => {
  const [mode, setMode] = useState('encrypt');
  const [file, setFile] = useState(null);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState(null);

  const reset = () => { setError(''); setSuccess(''); };

  const parsePreview = async (f) => {
    try {
      if (FileProcessor.isXlsx(f)) {
        const buf = await FileProcessor.readArrayBuffer(f);
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length === 0) return null;
        const headers = rows[0].map(h => String(h ?? ''));
        const dataRows = rows.slice(1, 6).map(r => headers.map((_, ci) => String(r[ci] ?? '')));
        return { headers, rows: dataRows, totalRows: rows.length - 1 };
      } else {
        const text = await f.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length === 0) return null;
        const parseRow = (row) => {
          const cells = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < row.length; i++) {
            const ch = row[i];
            if (ch === '"') {
              if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
              else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
              cells.push(current.trim());
              current = '';
            } else {
              current += ch;
            }
          }
          cells.push(current.trim());
          return cells;
        };
        const headers = parseRow(lines[0]);
        const rows = lines.slice(1, 6).map(parseRow);
        return { headers, rows, totalRows: lines.length - 1 };
      }
    } catch { return null; }
  };

  const handleFile = async (e) => {
    const f = e.target.files?.[0] || null;
    setFile(null); setPreview(null); reset();
    if (!f) return;
    if (mode === 'encrypt') {
      if (!FileProcessor.isDataset(f)) return setError('Only .csv and .xlsx files are allowed.');
      setFile(f);
      setPreview(await parsePreview(f));
    } else {
      if (!f.name.toLowerCase().endsWith('.encrypted.csv')) return setError('Please select an .encrypted.csv file.');
      setFile(f);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    reset();
    if (!file) return setError('Please select a dataset file.');
    if (!key) return setError('Please enter a key password.');
    setProcessing(true);
    try {
      if (mode === 'encrypt') {
        const buf = await FileProcessor.readArrayBuffer(file);
        const plainBytes = new Uint8Array(buf);
        const payload = await CryptoEngine.encrypt({ plainBytes, password: key });
        payload.originalName = file.name;
        payload.mimeType = file.type || (FileProcessor.isXlsx(file) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv');
        // Serialize payload to base64 so no metadata is visible in the CSV, just encrypted chunks
        const serialized = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        const CHUNK = 30000;
        const csvRows = [];
        for (let i = 0; i < serialized.length; i += CHUNK) {
          csvRows.push(serialized.slice(i, i + CHUNK));
        }
        const csvContent = csvRows.join('\n');
        const outName = `${file.name}.encrypted.csv`;
        await FileProcessor.download({ text: csvContent, name: outName, mimeType: 'text/csv;charset=utf-8' });
        await HistoryStore.addRecord(user.email, { file: outName, action: 'Encrypt Dataset', data: csvContent, mimeType: 'text/csv;charset=utf-8' });
        setSuccess(`Encrypted "${file.name}" and downloaded as .csv.`);
      } else {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const serialized = lines.join('');
        let payloadMap;
        try {
          payloadMap = JSON.parse(decodeURIComponent(escape(atob(serialized))));
        } catch {
          throw new Error('Could not parse encrypted file. Make sure it was encrypted by this app.');
        }

        if (!payloadMap.ciphertext || !payloadMap.salt || !payloadMap.iv) throw new Error('Could not parse encrypted file. Make sure it was encrypted by this app.');
        if (payloadMap.algorithm !== 'AES-256-GCM') throw new Error('Unsupported algorithm.');
        const payload = { ...payloadMap, iterations: Number(payloadMap.iterations) || 250000 };
        const plainBytes = await CryptoEngine.decrypt({ payload, password: key });
        const mimeType = payloadMap.mimeType || 'text/csv';
        const originalName = FileProcessor.decryptedDatasetName(file.name, payloadMap.originalName);
        await FileProcessor.downloadBytes({ bytes: plainBytes, name: originalName, mimeType });
        await HistoryStore.addRecord(user.email, { file: originalName, action: 'Decrypt Dataset', data: toB64(plainBytes.buffer), isBase64: true, mimeType });
        setSuccess(`Decrypted and downloaded as "${originalName}".`);
      }
    } catch (err) {
      setError(err.message || 'Operation failed. Check your key and try again.');
    } finally {
      setProcessing(false);
      setKey('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Notice type="error">{error}</Notice>}
      {success && <Notice type="success">{success}</Notice>}
      <ModeToggle value={mode} onChange={m => { setMode(m); setFile(null); setPreview(null); setKey(''); reset(); }} />
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {mode === 'encrypt' ? 'Dataset File (.csv, .xlsx)' : 'Encrypted Dataset File (.encrypted.csv)'}
        </label>
        <input
          type="file"
          accept={mode === 'encrypt' ? '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : '.csv,.encrypted.csv'}
          onChange={handleFile}
          className="w-full bg-slate-900 border border-slate-600/80 text-slate-300 rounded-lg p-3 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-cyan-700 file:text-white file:text-xs"
          required
        />
        {file && <p className="text-slate-500 text-xs mt-1.5">Selected: {file.name}</p>}
      </div>
      {preview && (
        <div className="rounded-lg border border-slate-600/60 overflow-hidden">
          <div className="bg-slate-900/80 px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Dataset Preview</span>
            <span className="text-xs text-slate-500">{preview.totalRows} row{preview.totalRows !== 1 ? 's' : ''} total{preview.rows.length < preview.totalRows ? `, showing first ${preview.rows.length}` : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800">
                  {preview.headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-cyan-400 font-semibold border-b border-slate-700 whitespace-nowrap">{h || `Col ${i + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/70'}>
                    {preview.headers.map((_, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-slate-300 border-b border-slate-800/60 whitespace-nowrap max-w-[200px] truncate">{row[ci] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Key Password</label>
        <KeyInput value={key} onChange={setKey} />
      </div>
      <SubmitBtn processing={processing} mode={mode} label={mode === 'encrypt' ? 'Encrypt Dataset & Download' : 'Decrypt Dataset & Download'} />
    </form>
  );
};

// ─── Auth Screen ──────────────────────────────────────────────────────────────

const AuthScreen = ({ onLogin }) => {
  const [authMode, setAuthMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    try {
      let user;
      if (authMode === 'login') {
        user = accountManager.login({ email: form.email, password: form.password });
      } else {
        accountManager.register({ name: form.name, email: form.email, password: form.password });
        user = { email: form.email, name: form.name };
      }
      accountManager.persistSession({ user });
      onLogin(user);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl shadow-2xl border border-slate-700/80 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl mb-4 shadow-lg shadow-cyan-900/50">
              <Shield className="text-white" size={30} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-1">CipherVault</h1>
            <p className="text-slate-400 text-sm">AES-256 Encryption System</p>
          </div>
          <div className="flex gap-2 mb-6">
            {['login', 'signup'].map(m => (
              <button key={m} type="button" onClick={() => { setAuthMode(m); setError(''); }}
                className={`flex-1 py-2.5 rounded-lg font-semibold capitalize text-sm transition-all ${authMode === m ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                {m === 'login' ? 'Login' : 'Sign Up'}
              </button>
            ))}
          </div>
          {error && <Notice type="error">{error}</Notice>}
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {authMode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter your name"
                    className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 text-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-sm" required />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="Enter email"
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 text-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-sm" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input type={showPwd ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-12 py-3 bg-slate-900 border border-slate-600 text-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-sm" required />
                <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit"
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-lg hover:from-cyan-500 hover:to-blue-500 font-semibold shadow-lg transition-all text-sm mt-2">
              {authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-500">MTI University — Secure Multi-Dimensional Encryption</p>
        </div>
      </div>
    </div>
  );
};

// ─── Change Password Modal ────────────────────────────────────────────────────

const ChangePasswordModal = ({ user, onClose }) => {
  const [form, setForm] = useState({ oldPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.oldPassword || !form.newPassword) return setError('Please fill in both fields.');
    try {
      accountManager.changePassword({ email: user.email, oldPassword: form.oldPassword, newPassword: form.newPassword });
      setSuccess('Password updated successfully!');
      setTimeout(() => onClose(), 1800);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Key size={20} className="text-cyan-400" />Change Password</h2>
        {error && <Notice type="error">{error}</Notice>}
        {success && <Notice type="success">{success}</Notice>}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {['oldPassword', 'newPassword'].map(field => (
            <div key={field}>
              <label className="block text-sm font-medium text-slate-300 mb-2">{field === 'oldPassword' ? 'Old Password' : 'New Password'}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                <input type="password" value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })}
                  placeholder={field === 'oldPassword' ? 'Enter old password' : 'Enter new password'}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 text-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-sm" required />
              </div>
            </div>
          ))}
          <div className="flex gap-3 pt-1">
            <button type="submit" className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 text-white py-3 rounded-lg hover:from-cyan-500 font-semibold transition-all text-sm">Update Password</button>
            <button type="button" onClick={onClose} className="px-5 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 font-semibold transition-all text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'file', label: 'Text Files', icon: FileText },
  { id: 'textarea', label: 'Plain Text', icon: Type },
  // { id: 'image', label: 'Images', icon: Image },
  { id: 'dataset', label: 'Datasets', icon: Database },
];

// HistoryPanel is now imported from './HistoryCrypto.js'

const EncryptionSystem = () => {
  const [user, setUser] = useState(null);
  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] = useState('file');
  const [showChangePwd, setShowChangePwd] = useState(false);

  useEffect(() => {
    const session = accountManager.getSession();
    if (session) { setUser(session); setIsAuth(true); }
  }, []);

  const handleLogin = (u) => { setUser(u); setIsAuth(true); };
  const handleLogout = () => { accountManager.clearSession(); setUser(null); setIsAuth(false); };

  if (!isAuth) return <AuthScreen onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 p-4">
      {showChangePwd && <ChangePasswordModal user={user} onClose={() => setShowChangePwd(false)} />}
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl border border-slate-700/80 p-4 mb-4 shadow-2xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow shadow-cyan-900/50">
                <Shield size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight">CipherVault</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block mr-1">
                <div className="text-sm text-slate-300 font-medium">{user.name}</div>
                <div className="text-xs text-slate-500">{user.email}</div>
              </div>
              <button onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-2 ${activeTab === 'history' ? 'bg-cyan-600 shadow-md shadow-cyan-900/50 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'} rounded-lg text-xs font-medium transition-all`}>
                <Clock size={13} /><span className="hidden sm:inline">History</span>
              </button>
              <button onClick={() => setShowChangePwd(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium transition-colors">
                <Key size={13} /><span className="hidden sm:inline">Change Password</span>
              </button>
              <button onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors">
                <LogOut size={13} />Logout
              </button>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-2 mb-4">
          {TABS.map(tab => (
            <TabBtn key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} icon={tab.icon}>
              {tab.label}
            </TabBtn>
          ))}
        </div>

        {/* Panel */}
        <div className="bg-slate-800 rounded-xl border border-slate-700/80 p-6 shadow-xl">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {TABS.find(t => t.id === activeTab)?.icon && (() => { const Icon = TABS.find(t => t.id === activeTab).icon; return <Icon size={18} className="text-cyan-400" />; })()}
              {activeTab === 'file' && 'Text File Encryption'}
              {activeTab === 'textarea' && 'Plain Text Encryption'}
              {activeTab === 'image' && 'Image Encryption'}
              {activeTab === 'dataset' && 'Dataset Encryption'}
              {activeTab === 'history' && 'Activity History'}
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              {activeTab === 'file' && 'Encrypt or decrypt .txt files. Supports all characters including colons, semicolons, and special symbols.'}
              {activeTab === 'textarea' && 'Encrypt or decrypt any text directly in the browser. Copy the JSON output to decrypt later.'}
              {activeTab === 'image' && 'Encrypt or decrypt image files (PNG, JPEG, GIF, WebP). The encrypted output is a distorted .png image.'}
              {activeTab === 'dataset' && 'Encrypt or decrypt dataset files (.csv, .xlsx). Preview your data before encrypting.'}
              {activeTab === 'history' && 'View a timeline of all your encryption and decryption activities.'}
            </p>
          </div>
          {activeTab === 'file' && <TextFileCryptoPanel user={user} />}
          {activeTab === 'textarea' && <TextAreaCryptoPanel user={user} />}
          {/* {activeTab === 'image' && <ImageCryptoPanel user={user} />} */}
          {activeTab === 'dataset' && <DatasetCryptoPanel user={user} accountManager={accountManager} />}
          {activeTab === 'history' && <HistoryPanel user={user} HistoryStore={HistoryStore} FileProcessor={FileProcessor} fromB64={fromB64} />}
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">MTI University · Dimensional Data Encryption System</p>
      </div>
    </div>
  );
};

export default EncryptionSystem;