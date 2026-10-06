//! The beta backend over HTTPS: the same Supabase Auth and database calls the
//! website makes, from Rust, so no token ever enters the WebView.
//!
//! Every failure becomes one short code (see `error_code`). Codes never carry
//! server text, tokens or the email address, so they are safe to show, store
//! and log.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::config::{REQUEST_TIMEOUT_SECS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL};

pub struct HttpResponse {
    pub status: u16,
    pub body: Value,
}

/// `Err(())` means the request never got an HTTP answer (offline, DNS, TLS,
/// timeout). An HTTP error status is an `Ok` response: the server answered.
pub trait Transport: Send + Sync {
    fn post(&self, path: &str, bearer: Option<&str>, body: &Value) -> Result<HttpResponse, ()>;
}

pub struct UreqTransport {
    agent: ureq::Agent,
    base_url: String,
    key: String,
}

impl UreqTransport {
    pub fn new() -> Self {
        Self::with_backend(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    }

    /// Another backend (the local test stack).
    pub fn with_backend(base_url: &str, publishable_key: &str) -> Self {
        let config = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(REQUEST_TIMEOUT_SECS)))
            .build();
        Self {
            agent: ureq::Agent::new_with_config(config),
            base_url: base_url.trim_end_matches('/').to_string(),
            key: publishable_key.to_string(),
        }
    }
}

impl Transport for UreqTransport {
    fn post(&self, path: &str, bearer: Option<&str>, body: &Value) -> Result<HttpResponse, ()> {
        let mut request = self
            .agent
            .post(&format!("{}{path}", self.base_url))
            .header("apikey", &self.key)
            .header("content-type", "application/json");
        if let Some(token) = bearer {
            request = request.header("authorization", &format!("Bearer {token}"));
        }
        let mut response = request.send(body.to_string()).map_err(|_| ())?;
        let status = response.status().as_u16();
        let text = response.body_mut().read_to_string().unwrap_or_default();
        Ok(HttpResponse { status, body: serde_json::from_str(&text).unwrap_or(Value::Null) })
    }
}

pub const NETWORK: &str = "network";

const DATABASE_CODES: &[&str] = &[
    "rate_limited",
    "invalid_email",
    "already_activated",
    "no_valid_invitation",
    "email_not_verified",
    "not_authenticated",
];

/// Turns a non-success answer into a stable code.
pub fn error_code(status: u16, body: &Value) -> &'static str {
    let text = ["code", "error_code", "message", "msg", "error", "error_description"]
        .iter()
        .filter_map(|key| body.get(*key).and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    let has_word = |word: &str| {
        text.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_')).any(|part| part == word)
    };
    if let Some(code) = DATABASE_CODES.iter().find(|code| has_word(code)) {
        return code;
    }
    if text.contains("invite-only") {
        return "not_invited";
    }
    if status == 429 || text.contains("rate limit") || has_word("over_email_send_rate_limit") {
        return "rate_limited";
    }
    if has_word("otp_expired") || text.contains("expired or is invalid") {
        return "code_invalid";
    }
    if has_word("refresh_token_not_found") || has_word("refresh_token_already_used")
        || has_word("session_not_found") || has_word("user_not_found") || has_word("bad_jwt")
        || text.contains("invalid refresh token") || status == 401
    {
        return "session_expired";
    }
    if has_word("otp_disabled") || text.contains("signups not allowed") {
        return "no_account";
    }
    if status >= 500 {
        return "server_error";
    }
    "unknown"
}

fn call(transport: &dyn Transport, path: &str, bearer: Option<&str>, body: Value) -> Result<Value, &'static str> {
    let response = transport.post(path, bearer, &body).map_err(|_| NETWORK)?;
    if (200..300).contains(&response.status) {
        Ok(response.body)
    } else {
        Err(error_code(response.status, &response.body))
    }
}

/// A signed-in Supabase session. Lives in memory and in the Keychain only.
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub access_token: String,
    pub refresh_token: String,
    /// Unix seconds.
    pub expires_at: i64,
    pub user_id: String,
    pub email: String,
}

// Hand-written so a stray `{:?}` can never print a token.
impl std::fmt::Debug for AuthSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthSession").field("user_id", &self.user_id).field("expires_at", &self.expires_at).finish_non_exhaustive()
    }
}

fn parse_session(body: &Value) -> Result<AuthSession, &'static str> {
    let text = |key: &str| body.get(key).and_then(Value::as_str).map(str::to_string);
    let user = body.get("user").unwrap_or(&Value::Null);
    let expires_at = body.get("expires_at").and_then(Value::as_i64).or_else(|| {
        body.get("expires_in").and_then(Value::as_i64).map(|seconds| chrono::Utc::now().timestamp() + seconds)
    });
    match (text("access_token"), text("refresh_token"), expires_at, user.get("id").and_then(Value::as_str)) {
        (Some(access_token), Some(refresh_token), Some(expires_at), Some(user_id)) => Ok(AuthSession {
            access_token,
            refresh_token,
            expires_at,
            user_id: user_id.to_string(),
            email: user.get("email").and_then(Value::as_str).unwrap_or_default().to_string(),
        }),
        _ => Err("unknown"),
    }
}

/// `get_my_access`, reduced to what the app needs.
#[derive(Clone, Debug, PartialEq)]
pub struct AccessAnswer {
    pub has_access: bool,
    pub state: String,
    pub access_until_ms: Option<i64>,
    pub server_time_ms: i64,
}

fn parse_time_ms(value: &Value) -> Option<i64> {
    value.as_str()
        .and_then(|text| chrono::DateTime::parse_from_rfc3339(text).ok())
        .map(|time| time.timestamp_millis())
}

pub fn parse_access(body: &Value) -> Result<AccessAnswer, &'static str> {
    let server_time_ms = parse_time_ms(body.get("server_time").unwrap_or(&Value::Null)).ok_or("unknown")?;
    Ok(AccessAnswer {
        has_access: body.get("has_access").and_then(Value::as_bool).ok_or("unknown")?,
        state: body.get("state").and_then(Value::as_str).unwrap_or("NONE").to_string(),
        access_until_ms: parse_time_ms(body.get("access_until").unwrap_or(&Value::Null)),
        server_time_ms,
    })
}

pub fn join_waitlist(t: &dyn Transport, email: &str) -> Result<(), &'static str> {
    call(t, "/rest/v1/rpc/join_waitlist", None, json!({ "p_email": email, "p_source": "macos_app" })).map(|_| ())
}

/// Sends an 8-digit code. Account creation is attempted, but the database
/// hook refuses it unless the address holds a live invitation.
pub fn request_code(t: &dyn Transport, email: &str) -> Result<(), &'static str> {
    call(t, "/auth/v1/otp", None, json!({ "email": email, "create_user": true })).map(|_| ())
}

pub fn verify_code(t: &dyn Transport, email: &str, code: &str) -> Result<AuthSession, &'static str> {
    let body = call(t, "/auth/v1/verify", None, json!({ "type": "email", "email": email, "token": code }))?;
    parse_session(&body)
}

pub fn refresh(t: &dyn Transport, refresh_token: &str) -> Result<AuthSession, &'static str> {
    let body = call(t, "/auth/v1/token?grant_type=refresh_token", None, json!({ "refresh_token": refresh_token }))?;
    parse_session(&body)
}

pub fn logout(t: &dyn Transport, access_token: &str) -> Result<(), &'static str> {
    call(t, "/auth/v1/logout?scope=local", Some(access_token), json!({})).map(|_| ())
}

pub fn my_access(t: &dyn Transport, access_token: &str) -> Result<AccessAnswer, &'static str> {
    parse_access(&call(t, "/rest/v1/rpc/get_my_access", Some(access_token), json!({}))?)
}

pub fn claim_invitation(t: &dyn Transport, access_token: &str) -> Result<(), &'static str> {
    call(t, "/rest/v1/rpc/claim_beta_invitation", Some(access_token), json!({})).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_database_exceptions_to_their_code() {
        assert_eq!(error_code(400, &json!({ "code": "P0001", "message": "already_activated" })), "already_activated");
        assert_eq!(error_code(400, &json!({ "code": "P0001", "message": "rate_limited" })), "rate_limited");
    }

    #[test]
    fn maps_auth_answers() {
        assert_eq!(error_code(403, &json!({ "msg": "Eudaimonai is invite-only right now. Request access on the website." })), "not_invited");
        assert_eq!(error_code(403, &json!({ "error_code": "otp_expired", "msg": "Token has expired or is invalid" })), "code_invalid");
        assert_eq!(error_code(429, &json!({ "error_code": "over_email_send_rate_limit" })), "rate_limited");
        assert_eq!(error_code(400, &json!({ "error_code": "refresh_token_not_found" })), "session_expired");
        assert_eq!(error_code(401, &json!({ "message": "JWT expired" })), "session_expired");
        assert_eq!(error_code(503, &json!({})), "server_error");
        assert_eq!(error_code(400, &json!({ "message": "something new" })), "unknown");
    }

    #[test]
    fn parses_access_with_server_time() {
        let answer = parse_access(&json!({
            "has_access": true, "state": "BETA",
            "access_until": "2026-11-05T10:00:00.5+00:00",
            "server_time": "2026-10-06T10:00:00+00:00",
        })).unwrap();
        assert!(answer.has_access);
        assert_eq!(answer.state, "BETA");
        assert_eq!(answer.access_until_ms, Some(1_793_872_800_500));
        assert_eq!(answer.server_time_ms, 1_791_280_800_000);
        let internal = parse_access(&json!({ "has_access": true, "state": "INTERNAL", "access_until": null, "server_time": "2026-10-06T10:00:00Z" })).unwrap();
        assert_eq!(internal.access_until_ms, None);
    }

    #[test]
    fn refuses_an_access_answer_without_server_time() {
        assert!(parse_access(&json!({ "has_access": true, "state": "BETA" })).is_err());
    }

    #[test]
    fn debug_output_never_contains_tokens() {
        let session = AuthSession {
            access_token: "secret-access".into(), refresh_token: "secret-refresh".into(),
            expires_at: 1, user_id: "u".into(), email: "e@example.com".into(),
        };
        let printed = format!("{session:?}");
        assert!(!printed.contains("secret"));
    }
}
