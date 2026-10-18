"""Lightweight rolling-key XOR protection used by the research prototype.

XOR by itself is not secure.  This module therefore derives a different
keystream for every sequence number and adds an 8-byte HMAC tag for integrity.
It should still be presented as a lightweight prototype scheme, not as a
replacement for modern authenticated encryption in production.
"""
from __future__ import annotations

import hashlib
import hmac


def rolling_key(master_key: bytes, sequence: int, length: int) -> bytes:
    if not master_key:
        raise ValueError("master_key must not be empty")
    out = bytearray()
    counter = 0
    while len(out) < length:
        block = hashlib.sha256(
            master_key + sequence.to_bytes(4, "little") + counter.to_bytes(4, "little")
        ).digest()
        out.extend(block)
        counter += 1
    return bytes(out[:length])


def xor_rolling_encrypt(plaintext: bytes, master_key: bytes, sequence: int) -> bytes:
    key = rolling_key(master_key, sequence, len(plaintext))
    return bytes(a ^ b for a, b in zip(plaintext, key))


def xor_rolling_decrypt(ciphertext: bytes, master_key: bytes, sequence: int) -> bytes:
    return xor_rolling_encrypt(ciphertext, master_key, sequence)


def auth_tag(ciphertext: bytes, master_key: bytes, sequence: int) -> bytes:
    msg = sequence.to_bytes(4, "little") + ciphertext
    return hmac.new(master_key, msg, hashlib.sha256).digest()[:8]


def protect(plaintext: bytes, master_key: bytes, sequence: int) -> bytes:
    ciphertext = xor_rolling_encrypt(plaintext, master_key, sequence)
    return ciphertext + auth_tag(ciphertext, master_key, sequence)


def unprotect(packet: bytes, master_key: bytes, sequence: int) -> bytes:
    if len(packet) < 8:
        raise ValueError("Protected packet is too short")
    ciphertext, tag = packet[:-8], packet[-8:]
    expected = auth_tag(ciphertext, master_key, sequence)
    if not hmac.compare_digest(tag, expected):
        raise ValueError("Authentication failed")
    return xor_rolling_decrypt(ciphertext, master_key, sequence)
