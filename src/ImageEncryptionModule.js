import React, { useState } from 'react';
import { ModeToggle, Notice, KeyInput, SubmitBtn } from './components/UIComponents';

/* =============================================================================
   1. Hana's Part: PNG Binary Utilities
   Responsibility: CRC32, Adler32, and Big-Endian conversions.
   ============================================================================= */

const _crc32Table = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

const _crc32 = (buf, offset = 0, length = buf.length - offset) => {
  let crc = 0xFFFFFFFF;
  const t = _crc32Table;
  for (let i = offset; i < offset + length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

const _adler32 = (buf) => {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
};

const _u32be = (n) => {
  return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
};


/* =============================================================================
   2. Eyad's Part: PNG Structure Builder
   Responsibility: Building PNG chunks and Zlib-stored streams.
   ============================================================================= */

const _chunk = (type, data) => {
  const typeBytes = type.split('').map(c => c.charCodeAt(0));
  const len = _u32be(data.length);
  const crcInput = new Uint8Array([...typeBytes, ...data]);
  const crc = _u32be(_crc32(crcInput));
  return new Uint8Array([...len, ...typeBytes, ...data, ...crc]);
};

const _zlibStore = (raw) => {
  const BSIZE = 65535;
  const blocks = [];
  for (let i = 0; i < raw.length || i === 0; i += BSIZE) {
    const slice = raw.slice(i, i + BSIZE);
    const last = (i + BSIZE >= raw.length) ? 1 : 0;
    blocks.push(new Uint8Array([last, slice.length & 0xFF, (slice.length >> 8) & 0xFF,
      (~slice.length) & 0xFF, ((~slice.length) >> 8) & 0xFF]));
    blocks.push(slice);
  }
  const adler = _adler32(raw);
  const adlerBytes = new Uint8Array(_u32be(adler));
  const zlibHeader = new Uint8Array([0x78, 0x01]);
  const parts = [zlibHeader, ...blocks, adlerBytes];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};

const _buildPNG = (width, height, rgbaPixels) => {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array([
    ..._u32be(width),
    ..._u32be(height),
    8, 2, 0, 0, 0
  ]);

  const rowBytes = width * 3;
  const rawRows = new Uint8Array(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    rawRows[y * (1 + rowBytes)] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + rowBytes) + 1 + x * 3;
      rawRows[dst] = rgbaPixels[src];
      rawRows[dst + 1] = rgbaPixels[src + 1];
      rawRows[dst + 2] = rgbaPixels[src + 2];
    }
  }

  const idat = _zlibStore(rawRows);
  const ihdrChunk = _chunk('IHDR', Array.from(ihdr));
  const idatChunk = _chunk('IDAT', Array.from(idat));
  const iendChunk = _chunk('IEND', []);

  const total = sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(total);
  let off = 0;
  for (const part of [sig, ihdrChunk, idatChunk, iendChunk]) { png.set(part, off); off += part.length; }
  return png;
};


/* =============================================================================
   3. Gamal's Part: PNG Binary Parser
   Responsibility: Parsing raw PNG binaries to extract pixel data.
   ============================================================================= */

const _parsePNG = (buf) => {
  const view = new DataView(buf.buffer || buf);
  const bytes = new Uint8Array(buf.buffer ? buf.buffer : buf);

  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('Not a valid PNG file.');

  let off = 8;
  let width = 0, height = 0, colorType = 0;
  const idatChunks = [];

  while (off < bytes.length) {
    const len = view.getUint32(off); off += 4;
    const type = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]); off += 4;
    const data = bytes.slice(off, off + len); off += len;
    off += 4;

    if (type === 'IHDR') {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = dv.getUint32(0, false);
      height = dv.getUint32(4, false);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') break;
  }

  const totalIdat = idatChunks.reduce((s, c) => s + c.length, 0);
  const idat = new Uint8Array(totalIdat);
  let idatOff = 0;
  for (const c of idatChunks) { idat.set(c, idatOff); idatOff += c.length; }

  let pos = 2;
  const channels = colorType === 2 ? 3 : 4;
  const rowBytes = width * channels;
  const rawRows = new Uint8Array(height * (1 + rowBytes));
  let rawOff = 0;

  while (pos < idat.length - 4) {
    const last = idat[pos]; pos++;
    const blen = idat[pos] | (idat[pos + 1] << 8); pos += 2;
    pos += 2;
    rawRows.set(idat.slice(pos, pos + blen), rawOff);
    rawOff += blen;
    pos += blen;
    if (last) break;
  }

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
};


/* =============================================================================
   4. Mossab's Part: Distortion Logic
   Responsibility: Translating data bytes into colors and vice versa.
   ============================================================================= */

const encodeToDistortedPng = async (dataBytes) => {
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

  const pngBytes = _buildPNG(width, height, rgba);
  return new Blob([pngBytes], { type: 'image/png' });
};

const decodeFromDistortedPng = async (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  const { width, height, rgba } = _parsePNG(bytes);

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
};


/* =============================================================================
   5. Eslam's Part: Image Crypto Service
   Responsibility: Orchestrating the workflow between CryptoEngine and Image logic.
   ============================================================================= */

export class ImageCryptoService {
  static async encryptImage({ plainBytes, password, fileName, fileType, CryptoEngine }) {
    const payload = await CryptoEngine.encrypt({ plainBytes, password });
    payload.mimeType = fileType;
    payload.originalName = fileName;
    const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
    return await encodeToDistortedPng(jsonBytes);
  }

  static async decryptImage({ arrayBuffer, password, CryptoEngine }) {
    const jsonBytes = await decodeFromDistortedPng(arrayBuffer);
    const jsonStr = new TextDecoder().decode(jsonBytes);
    let payload;
    try { payload = JSON.parse(jsonStr); }
    catch { throw new Error('Could not parse encrypted file. Make sure it was encrypted by this app.'); }
    if (payload.algorithm !== 'AES-256-GCM') throw new Error('Unsupported encryption algorithm.');
    const plainBytes = await CryptoEngine.decrypt({ payload, password });
    return {
      bytes: plainBytes,
      name: payload.originalName || 'decrypted_image',
      mimeType: payload.mimeType || 'image/png'
    };
  }
}


/* =============================================================================
   6. Moaz's Part: Image Crypto Panel (UI)
   Responsibility: React UI, file selection, and previews.
   ============================================================================= */

const ImageCryptoPanel = ({ user, CryptoEngine, FileProcessor }) => {
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
    if (mode === 'encrypt') {
      if (!FileProcessor.isImage(f)) return setError('Please select an image file (PNG, JPEG, GIF, WebP, etc.).');
      setPreview(URL.createObjectURL(f));
    } else {
      if (!(/\.aes256(\s*\(\d+\))?\.png$/i.test(f.name))) return setError('Please select an .aes256.png encrypted image file.');
    }
    setFile(f);
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
        const pngBlob = await ImageCryptoService.encryptImage({
          plainBytes, password: key, fileName: file.name, fileType: file.type, CryptoEngine
        });
        const outName = `${file.name}.aes256.png`;
        const url = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = url; a.download = outName; a.click();
        URL.revokeObjectURL(url);
        setSuccess(`Encrypted image "${file.name}" and downloaded.`);
      } else {
        const buf = await FileProcessor.readArrayBuffer(file);
        const result = await ImageCryptoService.decryptImage({
          arrayBuffer: buf, password: key, CryptoEngine
        });
        FileProcessor.downloadBytes({ bytes: result.bytes, name: result.name, mimeType: result.mimeType });
        setSuccess(`Decrypted image and downloaded as "${result.name}".`);
      }
    } catch (err) {
      console.error(err);
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
          accept={mode === 'encrypt' ? 'image/*' : '.png'}
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

export default ImageCryptoPanel;
