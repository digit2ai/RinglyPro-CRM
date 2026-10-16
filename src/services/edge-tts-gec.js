'use strict';
/**
 * Sec-MS-GEC v2 — the token Microsoft's Edge read-aloud service has required since
 * October 2026. The v1 token (a plain SHA-256 of the 5-minute Windows tick + the client
 * token) now answers 403 on the websocket handshake, which silenced every voice in this
 * repo at once (/api/tts/edge and everything built on it).
 *
 * This is a line-for-line port of edge-tts's drm.py `generate_sec_ms_gec_v2`
 * (github.com/rany2/edge-tts, src/edge_tts/drm.py): a SHA-256 run from a precomputed
 * state with altered constants, plus a "CS64" checksum keyed by that digest, formatted
 * "<16 hex>-<64 hex>". It is NOT standard SHA-256 — do not "simplify" it to crypto.
 * test-edge-tts-gec.js pins it to vectors produced by the Python reference.
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600;

const SHA256_INITIAL = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
const SHA256_STATE = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2];
const SHA256_SCHEDULE = [0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0,
  0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564];
const K = [
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
];
const SHA256_ADJUSTMENT = 0xC9DC06A7;
const K_BLOCK = K.slice(0, 14).concat([SHA256_ADJUSTMENT], K.slice(15));
const SIGMA0_ADJ = 0x059C0B80;
const SIGMA1_ADJ = 0x000B92C0;
const CS64_COEFFICIENTS = [
  [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038], [0xC89C5933, 0xB328CBDF],
  [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C], [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB],
  [0x06064CF3, 0xFA51A3DA], [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
  [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167],
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJ0 = 0xF2F90B1A;
const CS64_ADJ1 = 0x0B1A0000;

const u = (x) => x >>> 0;
const add = (...xs) => xs.reduce((s, x) => (s + x) >>> 0, 0);
const mul = (a, b) => Math.imul(a, b) >>> 0;
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;
const rol16 = (x) => ((x << 16) | (x >>> 16)) >>> 0;
const sigma0 = (x) => (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
const sigma1 = (x) => (rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10)) >>> 0;
const bigSigma0 = (x) => (rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22)) >>> 0;
const bigSigma1 = (x) => (rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25)) >>> 0;

function rounds(state, words, first = 0) {
  let [a, b, c, d, e, f, g, h] = state;
  const consts = first === 14 ? K_BLOCK : K;
  for (let i = first; i < 64; i++) {
    const t1 = add(h, bigSigma1(e), u(g ^ (e & (f ^ g))), consts[i], words[i]);
    const t2 = add(bigSigma0(a), u((a & b) | (c & (a | b))));
    h = g; g = f; f = e; e = add(d, t1); d = c; c = b; b = a; a = add(t1, t2);
  }
  return [a, b, c, d, e, f, g, h];
}

function expand(words, first = 16) {
  for (let i = first; i < 64; i++) words.push(add(sigma1(words[i - 2]), words[i - 7], sigma0(words[i - 15]), words[i - 16]));
}

function be32(buf, off) { return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0; }

function shaInit(data) {
  const words = new Array(14).fill(0);
  words.push(((data[0] << 16) | (data[1] << 8) | data[2]) >>> 0);
  words.push(be32(data, 3));
  for (let i = 16; i < 30; i++) {
    let v = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) v = add(v, i === 16 ? u(sigma1(words[i - 2]) ^ SIGMA1_ADJ) : sigma1(words[i - 2]));
    if (i - 7 >= 14) v = add(v, words[i - 7]);
    if (i - 15 >= 14) v = add(v, i === 29 ? u(sigma0(words[i - 15]) ^ SIGMA0_ADJ) : sigma0(words[i - 15]));
    words.push(u(v));
  }
  words.push(u(add(sigma1(words[28]), words[23], sigma0(words[15]), words[14], SHA256_ADJUSTMENT) - K[14]));
  expand(words, 31);
  const w = rounds(SHA256_STATE, words, 14);
  return SHA256_INITIAL.map((x, i) => add(x, w[i]));
}

function shaDigest(data) {
  if (data.length < 7) throw new Error('Token salt must contain at least seven bytes');
  const length = 57 + data.length;
  const padLen = ((55 - length) % 64 + 64) % 64;
  const padded = Buffer.alloc(data.length - 7 + 1 + padLen + 8);
  data.copy(padded, 0, 7);
  padded[data.length - 7] = 0x80;
  padded.writeBigUInt64BE(BigInt(length * 8), padded.length - 8);
  let state = shaInit(data.subarray(0, 7));
  for (let off = 0; off < padded.length; off += 64) {
    const words = [];
    for (let j = 0; j < 16; j++) words.push(be32(padded, off + j * 4));
    expand(words);
    const w = rounds(state, words);
    state = state.map((x, i) => add(x, w[i]));
  }
  const out = Buffer.alloc(32);
  state.forEach((x, i) => out.writeUInt32BE(x, i * 4));
  return out;
}

function wordsLe4Even(buf) {
  const pad = (4 - (buf.length % 4)) % 4;
  const p = Buffer.concat([buf, Buffer.alloc(pad)]);
  const words = [];
  for (let i = 0; i < p.length; i += 4) words.push(p.readUInt32LE(i));
  if (words.length % 2) words.push(0);
  return words;
}

function cs64(data, digest) {
  const keyA = u(digest.readUInt32LE(0) | 1);
  const keyB = u(digest.readUInt32LE(4) | 1);
  const factors = [mul(keyA, CS64_FACTOR), mul(keyB, CS64_FACTOR)];
  const terms = CS64_COEFFICIENTS.map(([c], i) => mul(c, factors[i % 2]));
  const offsets = CS64_COEFFICIENTS.map(([, o]) => o);
  wordsLe4Even(Buffer.concat([Buffer.from([0]), data])).forEach((word, i) => {
    let term = mul(word, i % 2 === 0 ? keyA : keyB);
    let offset = mul(rol16(word), i % 2 === 0 ? 0xEF0569FB : 0xC31713DB);
    if (i === 0) { term = add(term, mul(CS64_ADJ0, factors[0])); offset = add(offset, CS64_ADJ1); }
    terms.push(term); offsets.push(offset);
  });
  let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16(add(offsets[i], x));
    let q = mul(t, 0x76F50F34);
    swapAcc = add(swapAcc, add(mul(rol16(q), 0xC3EFEA97), q));
    t = rol16(add(offsets[i + 1], y));
    q = mul(t, 0x1881CE3C);
    swapLast = add(mul(rol16(q), 0x35BD1EC9), q);
    swapAcc = add(swapAcc, swapLast);
    state = add(mul(state, keyA), x);
    state = mul(rol16(state), 0xCF98B111);
    state = mul(rol16(state), 0x87085B9F);
    state = mul(rol16(state), 0x12CEB96D);
    state = mul(rol16(state), 0x257E1D83);
    acc = add(acc, state);
    t = add(mul(state, keyB), y);
    t = mul(rol16(t), 0xA27416F5);
    t = mul(rol16(t), 0xD38396FF);
    state = mul(rol16(mul(rol16(t), 0x7C932B89)), 0xBFA49F69);
    acc = add(acc, state);
  }
  return [u(swapLast ^ state), u(swapAcc ^ acc)];
}

let cache = { key: null, value: null };

/** @param {number} [unixSeconds] for tests; defaults to now (plus `skewSeconds`). */
function generateSecMsGecV2(unixSeconds, skewSeconds = 0) {
  let s = unixSeconds == null ? Date.now() / 1000 + skewSeconds : Number(unixSeconds);
  s += WIN_EPOCH;
  s -= s % 300;
  const ticks = (BigInt(Math.round(s)) * 10000000n).toString();
  if (cache.key === ticks) return cache.value;
  const data = Buffer.from(ticks + TRUSTED_CLIENT_TOKEN, 'ascii');
  const digest = shaDigest(data);
  const [w0, w1] = cs64(data, digest);
  const c = Buffer.alloc(8); c.writeUInt32LE(w0, 0); c.writeUInt32LE(w1, 4);
  const value = c.toString('hex').toUpperCase() + '-' + digest.toString('hex').toUpperCase();
  cache = { key: ticks, value };
  return value;
}

module.exports = { generateSecMsGecV2, TRUSTED_CLIENT_TOKEN };
