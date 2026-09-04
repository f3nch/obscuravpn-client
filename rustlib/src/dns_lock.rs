//! Password hashing for the DNS lock feature: PBKDF2-HMAC-SHA256 with a random salt.
//!
//! Only the salt and derived hash are ever persisted (in `Config`); the plaintext
//! password only exists transiently in memory while handling a `ManagerCmd`.

use base64::prelude::*;
use rand::RngCore;
use rand::rngs::OsRng;
use ring::pbkdf2;
use std::num::NonZeroU32;

const ITERATIONS: u32 = 210_000; // OWASP 2023 baseline for PBKDF2-HMAC-SHA256
const SALT_LEN: usize = 16;
const HASH_LEN: usize = 32;

pub struct HashedPassword {
    pub salt_b64: String,
    pub hash_b64: String,
}

pub fn hash_password(password: &str) -> HashedPassword {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    let mut hash = [0u8; HASH_LEN];
    let iterations = NonZeroU32::new(ITERATIONS).expect("ITERATIONS is nonzero");
    pbkdf2::derive(pbkdf2::PBKDF2_HMAC_SHA256, iterations, &salt, password.as_bytes(), &mut hash);
    HashedPassword { salt_b64: BASE64_STANDARD.encode(salt), hash_b64: BASE64_STANDARD.encode(hash) }
}

/// `ring::pbkdf2::verify` compares the derived hash in constant time.
pub fn verify_password(password: &str, salt_b64: &str, hash_b64: &str) -> bool {
    let (Ok(salt), Ok(hash)) = (BASE64_STANDARD.decode(salt_b64), BASE64_STANDARD.decode(hash_b64)) else {
        return false;
    };
    let iterations = NonZeroU32::new(ITERATIONS).expect("ITERATIONS is nonzero");
    pbkdf2::verify(pbkdf2::PBKDF2_HMAC_SHA256, iterations, &salt, password.as_bytes(), &hash).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correct_password_verifies() {
        let hashed = hash_password("correct horse battery staple");
        assert!(verify_password("correct horse battery staple", &hashed.salt_b64, &hashed.hash_b64));
    }

    #[test]
    fn wrong_password_fails() {
        let hashed = hash_password("correct horse battery staple");
        assert!(!verify_password("wrong password", &hashed.salt_b64, &hashed.hash_b64));
    }

    #[test]
    fn salts_are_random() {
        let a = hash_password("same password");
        let b = hash_password("same password");
        assert_ne!(a.salt_b64, b.salt_b64);
        assert_ne!(a.hash_b64, b.hash_b64);
    }

    #[test]
    fn garbage_stored_values_dont_panic() {
        assert!(!verify_password("anything", "not base64!!", "also not base64!!"));
    }
}
