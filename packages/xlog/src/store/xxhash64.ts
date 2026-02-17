// xxHash64 implementation using BigInt (little-endian input)

const PRIME64_1 = 0x9e3779b185ebca87n;
const PRIME64_2 = 0xc2b2ae3d27d4eb4fn;
const PRIME64_3 = 0x165667b19e3779f9n;
const PRIME64_4 = 0x85ebca77c2b2ae63n;
const PRIME64_5 = 0x27d4eb2f165667c5n;

const MASK64 = 0xffffffffffffffffn;

function rotl(x: bigint, r: bigint): bigint {
  return ((x << r) | (x >> (64n - r))) & MASK64;
}

function round(acc: bigint, input: bigint): bigint {
  let a = acc + input * PRIME64_2;
  a &= MASK64;
  a = rotl(a, 31n);
  a = (a * PRIME64_1) & MASK64;
  return a;
}

function mergeRound(acc: bigint, val: bigint): bigint {
  let a = acc ^ round(0n, val);
  a = (a * PRIME64_1 + PRIME64_4) & MASK64;
  return a;
}

function readU64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function readU32LE(buf: Buffer, offset: number): bigint {
  return BigInt(buf.readUInt32LE(offset));
}

export function xxhash64(buf: Buffer, seed = 0n): bigint {
  let p = 0;
  const len = buf.length;
  let h64: bigint;

  if (len >= 32) {
    let v1 = (seed + PRIME64_1 + PRIME64_2) & MASK64;
    let v2 = (seed + PRIME64_2) & MASK64;
    let v3 = seed & MASK64;
    let v4 = (seed - PRIME64_1) & MASK64;

    const limit = len - 32;
    while (p <= limit) {
      v1 = round(v1, readU64LE(buf, p));
      p += 8;
      v2 = round(v2, readU64LE(buf, p));
      p += 8;
      v3 = round(v3, readU64LE(buf, p));
      p += 8;
      v4 = round(v4, readU64LE(buf, p));
      p += 8;
    }

    h64 = (rotl(v1, 1n) + rotl(v2, 7n) + rotl(v3, 12n) + rotl(v4, 18n)) & MASK64;
    h64 = mergeRound(h64, v1);
    h64 = mergeRound(h64, v2);
    h64 = mergeRound(h64, v3);
    h64 = mergeRound(h64, v4);
  } else {
    h64 = (seed + PRIME64_5) & MASK64;
  }

  h64 = (h64 + BigInt(len)) & MASK64;

  while (p <= len - 8) {
    const k1 = round(0n, readU64LE(buf, p));
    h64 ^= k1;
    h64 = (rotl(h64, 27n) * PRIME64_1 + PRIME64_4) & MASK64;
    p += 8;
  }

  if (p <= len - 4) {
    h64 ^= readU32LE(buf, p) * PRIME64_1;
    h64 = (rotl(h64, 23n) * PRIME64_2 + PRIME64_3) & MASK64;
    p += 4;
  }

  while (p < len) {
    h64 ^= BigInt(buf[p]) * PRIME64_5;
    h64 = (rotl(h64, 11n) * PRIME64_1) & MASK64;
    p += 1;
  }

  h64 ^= h64 >> 33n;
  h64 = (h64 * PRIME64_2) & MASK64;
  h64 ^= h64 >> 29n;
  h64 = (h64 * PRIME64_3) & MASK64;
  h64 ^= h64 >> 32n;

  return h64 & MASK64;
}
