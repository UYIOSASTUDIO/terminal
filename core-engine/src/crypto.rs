// HIER WAR DER FEHLER: Dieser Import hat gefehlt
use wasm_bindgen::prelude::*;

use rand::rngs::OsRng;
use x25519_dalek::{StaticSecret, PublicKey};
use chacha20poly1305::{ChaCha20Poly1305, Key, KeyInit, Nonce};
use chacha20poly1305::aead::{Aead};
use base64::{Engine as _, engine::general_purpose};

#[wasm_bindgen]
pub struct CryptoEngine {
    secret: StaticSecret,
    public: PublicKey,
    shared_secret: Option<Key>,
}

#[wasm_bindgen]
impl CryptoEngine {
    pub fn new() -> Self {
        let secret = StaticSecret::random_from_rng(OsRng);
        let public = PublicKey::from(&secret);

        CryptoEngine {
            secret,
            public,
            shared_secret: None,
        }
    }

    pub fn get_public_key_as_hex(&self) -> String {
        hex::encode(self.public.as_bytes())
    }

    pub fn derive_secret(&mut self, other_public_hex: &str) -> Result<String, String> {
        let clean_hex = other_public_hex.trim();

        let bytes = hex::decode(clean_hex).map_err(|_| "Invalid Hex Key")?;

        if bytes.len() != 32 {
            return Err("Invalid Key Length".to_string());
        }

        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        let other_public = PublicKey::from(arr);

        let shared = self.secret.diffie_hellman(&other_public);
        self.shared_secret = Some(Key::from_slice(shared.as_bytes()).clone());

        Ok("Shared Secret established.".to_string())
    }

    pub fn encrypt(&self, plaintext: &str) -> Result<String, String> {
        if let Some(key) = &self.shared_secret {
            let cipher = ChaCha20Poly1305::new(key);
            let nonce = Nonce::from_slice(&[0u8; 12]);

            let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes())
                .map_err(|_| "Encryption failed")?;

            Ok(general_purpose::STANDARD.encode(ciphertext))
        } else {
            Err("No secure connection established.".to_string())
        }
    }

    pub fn decrypt(&self, ciphertext_b64: &str) -> Result<String, String> {
        if let Some(key) = &self.shared_secret {
            let cipher = ChaCha20Poly1305::new(key);
            let nonce = Nonce::from_slice(&[0u8; 12]);

            let ciphertext = general_purpose::STANDARD.decode(ciphertext_b64)
                .map_err(|_| "Invalid Base64".to_string())?;

            let plaintext = cipher.decrypt(nonce, ciphertext.as_ref())
                .map_err(|_| "Decryption failed (Wrong Key?)".to_string())?;

            String::from_utf8(plaintext).map_err(|_| "Invalid UTF-8".to_string())
        } else {
            Err("No secure connection established.".to_string())
        }
    }

    pub fn get_secret_checksum(&self) -> String {
        if let Some(key) = &self.shared_secret {
            return hex::encode(&key[0..2]);
        }
        "NONE".to_string()
    }
}