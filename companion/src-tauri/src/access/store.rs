//! Where the beta session and the last verification live: the macOS
//! Keychain, under the app's existing service name (as credentials.rs does).
//! Never the WebView's storage, never SQLite.

pub const SERVICE: &str = "ai.eudonomia.companion";
/// Supabase access + refresh token.
pub const SESSION_ACCOUNT: &str = "beta-auth-session";
/// Last server verification, pending waitlist email, clock high-water mark.
pub const CACHE_ACCOUNT: &str = "beta-access-cache";

pub trait SecretStore: Send + Sync {
    fn get(&self, account: &str) -> Result<Option<String>, String>;
    fn set(&self, account: &str, value: &str) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

const NOT_FOUND: i32 = -25300; // errSecItemNotFound

pub struct Keychain;

impl SecretStore for Keychain {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        match security_framework::passwords::get_generic_password(SERVICE, account) {
            Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|_| "keychain_invalid".to_string()),
            Err(error) if error.code() == NOT_FOUND => Ok(None),
            Err(_) => Err("keychain_unavailable".to_string()),
        }
    }

    fn set(&self, account: &str, value: &str) -> Result<(), String> {
        security_framework::passwords::set_generic_password(SERVICE, account, value.as_bytes())
            .map_err(|_| "keychain_unavailable".to_string())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        match security_framework::passwords::delete_generic_password(SERVICE, account) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == NOT_FOUND => Ok(()),
            Err(_) => Err("keychain_unavailable".to_string()),
        }
    }
}

#[cfg(test)]
pub mod memory {
    use super::SecretStore;
    use std::{collections::HashMap, sync::Mutex};

    #[derive(Default)]
    pub struct MemoryStore(pub Mutex<HashMap<String, String>>);

    impl SecretStore for MemoryStore {
        fn get(&self, account: &str) -> Result<Option<String>, String> {
            Ok(self.0.lock().unwrap().get(account).cloned())
        }
        fn set(&self, account: &str, value: &str) -> Result<(), String> {
            self.0.lock().unwrap().insert(account.to_string(), value.to_string());
            Ok(())
        }
        fn delete(&self, account: &str) -> Result<(), String> {
            self.0.lock().unwrap().remove(account);
            Ok(())
        }
    }
}
