#ifndef MESH_CRYPTO_H
#define MESH_CRYPTO_H

#include <Arduino.h>
#include "MeshConfig.h"
#include "MeshProtocol.h"
#include "mbedtls/gcm.h"

// =============================================================================
// MESH CRYPTOGRAPHY & OBFUSCATION MODULE
// Supports:
// 1. Authenticated Encryption: AES-128-GCM (Hardware Accelerated via mbedtls)
// 2. DEMO Obfuscation: Cyclic XOR Masking (Clearly labelled, NOT secure)
// =============================================================================

class MeshCrypto {
public:
    // -------------------------------------------------------------------------
    // 1. Generate Unique 12-byte Nonce/IV for AES-GCM
    // Guarantee: Every packet transmitted has a unique Nonce derived from
    // session_id (4 bytes) + sequence_id (4 bytes) + created_at_ms (4 bytes)
    // -------------------------------------------------------------------------
    static void generateGcmIV(uint32_t sessionId, uint32_t sequenceId, uint32_t timestamp, uint8_t *ivOut) {
        ivOut[0]  = (uint8_t)(sessionId >> 24);
        ivOut[1]  = (uint8_t)(sessionId >> 16);
        ivOut[2]  = (uint8_t)(sessionId >> 8);
        ivOut[3]  = (uint8_t)(sessionId);

        ivOut[4]  = (uint8_t)(sequenceId >> 24);
        ivOut[5]  = (uint8_t)(sequenceId >> 16);
        ivOut[6]  = (uint8_t)(sequenceId >> 8);
        ivOut[7]  = (uint8_t)(sequenceId);

        ivOut[8]  = (uint8_t)(timestamp >> 24);
        ivOut[9]  = (uint8_t)(timestamp >> 16);
        ivOut[10] = (uint8_t)(timestamp >> 8);
        ivOut[11] = (uint8_t)(timestamp);
    }

    // -------------------------------------------------------------------------
    // 2. AES-128-GCM Authenticated Encryption
    // Authenticates Additional Authenticated Data (AAD) + Encrypts Payload
    // Outputs Ciphertext + 16-byte PolyVAL Authentication Tag
    // -------------------------------------------------------------------------
    static bool encryptAES_GCM(
        const uint8_t *plain, size_t plainLen,
        const uint8_t *aad, size_t aadLen,
        const uint8_t *iv, size_t ivLen,
        uint8_t *cipherOut,
        uint8_t *tagOut)
    {
        mbedtls_gcm_context gcm;
        mbedtls_gcm_init(&gcm);

        int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, MESH_AES_KEY, 128);
        if (ret != 0) {
            mbedtls_gcm_free(&gcm);
            return false;
        }

        ret = mbedtls_gcm_crypt_and_tag(
            &gcm,
            MBEDTLS_GCM_ENCRYPT,
            plainLen,
            iv, ivLen,
            aad, aadLen,
            plain,
            cipherOut,
            AES_GCM_TAG_LEN,
            tagOut
        );

        mbedtls_gcm_free(&gcm);
        return (ret == 0);
    }

    // -------------------------------------------------------------------------
    // 3. AES-128-GCM Authenticated Decryption
    // Verifies 16-byte Authentication Tag + AAD before Decrypting Ciphertext
    // Returns false if payload was modified, corrupted, or tampered with!
    // -------------------------------------------------------------------------
    static bool decryptAES_GCM(
        const uint8_t *cipher, size_t cipherLen,
        const uint8_t *aad, size_t aadLen,
        const uint8_t *iv, size_t ivLen,
        const uint8_t *tag, size_t tagLen,
        uint8_t *plainOut)
    {
        mbedtls_gcm_context gcm;
        mbedtls_gcm_init(&gcm);

        int ret = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, MESH_AES_KEY, 128);
        if (ret != 0) {
            mbedtls_gcm_free(&gcm);
            return false;
        }

        ret = mbedtls_gcm_auth_decrypt(
            &gcm,
            cipherLen,
            iv, ivLen,
            aad, aadLen,
            tag, tagLen,
            cipher,
            plainOut
        );

        mbedtls_gcm_free(&gcm);
        return (ret == 0);
    }

    // -------------------------------------------------------------------------
    // 4. DEMO XOR Obfuscation Mode
    // WARNING: This is a trivial toy transform for educational testing only.
    // It provides ZERO cryptographic security and MUST NEVER be used in production!
    // -------------------------------------------------------------------------
    static void applyDemoXOR(const uint8_t *in, size_t len, uint8_t *out) {
        for (size_t i = 0; i < len; i++) {
            out[i] = in[i] ^ DEMO_XOR_MASK[i % sizeof(DEMO_XOR_MASK)];
        }
    }
};

#endif // MESH_CRYPTO_H
