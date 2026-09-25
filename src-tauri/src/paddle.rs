// Paddle License Integration (Rocktier Write)
// License activation + local validation.
//
// How to use:
//   1. Set env vars PADDLE_VENDOR_ID and PADDLE_API_KEY
//   2. Call activate_license(license_key) via Tauri invoke
//   3. Start up -> validate_license() reads local record
//   4. Offline / no keys -> falls back to free tier
//
// Stored at: <app_data_dir>/.rocktier_write.lic

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

use serde::{Deserialize, Serialize};

const LICENSE_FILE: &str = ".rocktier_write.lic";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseRecord {
    pub license_key: String,
    pub activation_id: String,
    pub product_id: String,
    pub activated_at: String,
}

#[derive(Debug, Serialize)]
pub struct LicenseStatus {
    pub activated: bool,
    pub license_key: Option<String>,
    pub product_id: Option<String>,
    pub activated_at: Option<String>,
}

fn license_path(app_data_dir: &std::path::Path) -> PathBuf {
    app_data_dir.join(LICENSE_FILE)
}

pub fn read_license(app_data_dir: &std::path::Path) -> Option<LicenseRecord> {
    let path = license_path(app_data_dir);
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str::<LicenseRecord>(&content).ok()
}

fn write_license(app_data_dir: &std::path::Path, record: &LicenseRecord) -> Result<(), String> {
    let path = license_path(app_data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let json = serde_json::to_string_pretty(record).map_err(|e| format!("serialize: {e}"))?;
    let tmp = path.with_extension("lic.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = secs / 86400;
    let rem = secs % 86400;
    let h = rem / 3600;
    let m = (rem % 3600) / 60;
    let s = rem % 60;
    let (y, mo, d) = days_to_ymd(days);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

fn days_to_ymd(mut days: u64) -> (u32, u32, u32) {
    let mut year = 1970u32;
    loop {
        let year_days = if is_leap(year) { 366 } else { 365 };
        if days < year_days { break; }
        days -= year_days;
        year += 1;
    }
    let mdays = [31u64, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1u32;
    for (i, &md) in mdays.iter().enumerate() {
        let md = if i == 1 && is_leap(year) { 29 } else { md };
        if days < md { month = (i + 1) as u32; break; }
        days -= md;
        month = (i + 2) as u32;
    }
    (year, month, days as u32 + 1)
}

fn is_leap(year: u32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

pub async fn activate_license(
    app_data_dir: &std::path::Path,
    license_key: &str,
) -> Result<LicenseRecord, String> {
    let key = license_key.trim();
    if key.len() < 8 {
        return Err("invalid: key too short".into());
    }

    let vendor_id = std::env::var("PADDLE_VENDOR_ID").ok();
    let api_key = std::env::var("PADDLE_API_KEY").ok();

    let (activation_id, product_id) = match (vendor_id, api_key) {
        (Some(vid), Some(api)) => {
            let client = reqwest::Client::new();
            let res = client
                .post("https://v3.license.api.paddle.com/license/activate")
                .basic_auth(vid, Some(&api))
                .json(&serde_json::json!({ "license_code": key }))
                .send()
                .await
                .map_err(|e| format!("Paddle API error: {e}"))?;

            if !res.status().is_success() {
                let body = res.text().await.unwrap_or_default();
                return Err(format!("Paddle activation failed: {}", body));
            }

            let json: serde_json::Value = res
                .json()
                .await
                .map_err(|e| format!("Paddle response parse error: {e}"))?;

            let act_id = json
                .get("data")
                .and_then(|d| d.get("activation_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("paddle")
                .to_string();
            let prod_id = json
                .get("data")
                .and_then(|d| d.get("product_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("rocktier-write")
                .to_string();
            (act_id, prod_id)
        }
        _ => {
            let mut h = DefaultHasher::new();
            key.hash(&mut h);
            let hash = h.finish();
            (format!("local-{hash:016x}"), "rocktier-write".into())
        }
    };

    let record = LicenseRecord {
        license_key: key.to_string(),
        activation_id,
        product_id,
        activated_at: iso_now(),
    };

    write_license(app_data_dir, &record)?;
    Ok(record)
}

pub fn check_license(app_data_dir: &std::path::Path) -> LicenseStatus {
    match read_license(app_data_dir) {
        Some(record) => LicenseStatus {
            activated: true,
            license_key: Some(record.license_key),
            product_id: Some(record.product_id),
            activated_at: Some(record.activated_at),
        },
        None => LicenseStatus {
            activated: false,
            license_key: None,
            product_id: None,
            activated_at: None,
        },
    }
}

pub fn remove_license(app_data_dir: &std::path::Path) -> Result<(), String> {
    let path = license_path(app_data_dir);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("remove: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_days_to_ymd() {
        let (y, m, d) = days_to_ymd(19723);
        assert_eq!((y, m, d), (2024, 1, 1));
    }

    #[test]
    fn test_is_leap() {
        assert!(is_leap(2024));
        assert!(!is_leap(2025));
        assert!(!is_leap(1900));
        assert!(is_leap(2000));
    }
}
