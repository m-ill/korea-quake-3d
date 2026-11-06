use anyhow::{Context, Result, bail, ensure};
use chrono::{DateTime, Days, NaiveDate, NaiveDateTime, Utc};
use reqwest::blocking::Client;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::{HashMap, HashSet}, env, fs, path::Path, time::Duration};

const KMA: &str = "https://www.weather.go.kr/w/earthquake-volcano/search/korea.do";
const USGS: &str = "https://earthquake.usgs.gov/fdsnws/event/1/query";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Event {
    id: String, time: String, lat: f64, lon: f64,
    depth: Option<f64>, mag: f64, mag_type: String,
    intensity: Option<String>, place: String, source: String, url: String,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    alternate: Vec<Alternate>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Alternate { id: String, source: String, mag: f64, mag_type: String, depth: Option<f64>, url: String }

fn parse_number(s: &str) -> Option<f64> {
    s.split_whitespace().next()?.parse::<f64>().ok().filter(|v| v.is_finite())
}
fn parse_kma(body: &str) -> Result<Vec<Event>> {
    let html = Html::parse_document(body);
    let row = Selector::parse("#excel_body tr").unwrap();
    let cell = Selector::parse("td").unwrap();
    let mut out = Vec::new();
    for tr in html.select(&row) {
        let c: Vec<String> = tr.select(&cell).map(|td| td.text().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")).collect();
        if c.len() < 8 { continue; }
        let dt = NaiveDateTime::parse_from_str(&c[1], "%Y/%m/%d %H:%M:%S")
            .with_context(|| format!("KMA time format changed: {}", c[1]))?;
        let timestamp = dt.and_utc().timestamp() - 9 * 3600;
        let time = DateTime::from_timestamp(timestamp, 0).context("Invalid timestamp")?.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let mag = parse_number(&c[2]).context("Missing KMA magnitude")?;
        let depth = parse_number(&c[3]);
        // KMA's current export has intensity; older exports may have 7 data columns.
        let lat = parse_number(&c[5]).context("Missing KMA latitude")?;
        let lon = parse_number(&c[6]).context("Missing KMA longitude")?;
        let intensity = if c[4].is_empty() || c[4] == "-" { None } else { Some(c[4].clone()) };
        let year = &c[1][..4];
        out.push(Event { id: format!("kma-{year}-{}", c[0]), time, lat, lon, depth, mag, mag_type: "M".into(), intensity,
            place: c[7].clone(), source: "KMA".into(), url: format!("{KMA}?startTm={year}-01-01&endTm={year}-12-31"), alternate: vec![] });
    }
    ensure!(!out.is_empty(), "KMA export had no parsable records; retaining previous catalog");
    Ok(out)
}
fn parse_usgs(body: &str) -> Result<Vec<Event>> {
    let doc: Value = serde_json::from_str(body)?;
    let features = doc["features"].as_array().context("USGS features missing")?;
    ensure!(features.len() < 20000, "USGS result may be truncated; shorten time range");
    features.iter().map(|f| {
        let p = &f["properties"];
        let c = &f["geometry"]["coordinates"];
        let time = DateTime::from_timestamp_millis(p["time"].as_i64().context("USGS time")?).context("USGS timestamp")?.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        Ok(Event { id: f["id"].as_str().context("USGS id")?.into(), time,
            lon: c[0].as_f64().context("USGS longitude")?, lat: c[1].as_f64().context("USGS latitude")?, depth: c[2].as_f64(),
            mag: p["mag"].as_f64().context("USGS magnitude")?, mag_type: p["magType"].as_str().unwrap_or("M").into(),
            intensity: None, place: p["place"].as_str().unwrap_or("동북아 지역").into(), source: "USGS".into(),
            url: p["url"].as_str().unwrap_or("https://earthquake.usgs.gov/").into(), alternate: vec![] })
    }).collect()
}
fn distance(a: &Event, b: &Event) -> f64 {
    let dlat = (a.lat - b.lat).to_radians();
    let dlon = (a.lon - b.lon).to_radians();
    let h = (dlat / 2.).sin().powi(2) + a.lat.to_radians().cos() * b.lat.to_radians().cos() * (dlon / 2.).sin().powi(2);
    6371.0088 * 2. * h.sqrt().min(1.).asin()
}
fn seconds(e: &Event) -> i64 { DateTime::parse_from_rfc3339(&e.time).unwrap().timestamp() }
fn merge(mut kma: Vec<Event>, usgs: Vec<Event>) -> (Vec<Event>, usize) {
    let mut bins: HashMap<i64, Vec<usize>> = HashMap::new();
    for (i, e) in kma.iter().enumerate() { bins.entry(seconds(e) / 60).or_default().push(i); }
    let mut linked = 0;
    for e in usgs {
        let t = seconds(&e);
        let candidates: Vec<usize> = ((t/60 - 1)..=(t/60 + 1)).flat_map(|b| bins.get(&b).into_iter().flatten().copied())
            .filter(|i| (seconds(&kma[*i]) - t).abs() <= 30 && (kma[*i].mag - e.mag).abs() <= 0.8 && distance(&kma[*i], &e) <= 30.).collect();
        // Ambiguous matches stay separate. Never invent a depth or silently replace an agency estimate.
        if candidates.len() == 1 {
            let target = &mut kma[candidates[0]];
            target.alternate.push(Alternate { id: e.id, source: e.source, mag: e.mag, mag_type: e.mag_type, depth: e.depth, url: e.url });
            linked += 1;
        } else { kma.push(e); }
    }
    kma.sort_by(|a,b| a.time.cmp(&b.time).then(a.id.cmp(&b.id)));
    (kma, linked)
}
fn validate(events: &[Event]) -> Result<()> {
    let mut ids = HashSet::new();
    for e in events {
        ensure!(ids.insert(&e.id), "Duplicate id: {}", e.id);
        ensure!(e.lat.is_finite() && (-90. ..=90.).contains(&e.lat) && e.lon.is_finite() && (-180. ..=180.).contains(&e.lon), "Invalid coordinate: {}", e.id);
        ensure!(e.mag.is_finite() && (-3. ..=10.).contains(&e.mag), "Invalid magnitude: {}", e.id);
        ensure!(e.depth.is_none_or(|d| d.is_finite() && (-10. ..=800.).contains(&d)), "Invalid depth: {}", e.id);
        DateTime::parse_from_rfc3339(&e.time)?;
        ensure!(e.url.starts_with("https://"), "Invalid source link");
    }
    Ok(())
}
fn fetch(client: &Client, url: &str, cache: &Path, refresh: bool) -> Result<String> {
    if cache.exists() && !refresh { return Ok(fs::read_to_string(cache)?); }
    let mut last = String::new();
    for attempt in 0..3 {
        match client.get(url).send().and_then(|r| r.error_for_status()).and_then(|r| r.text()) {
            Ok(body) => { fs::write(cache, &body)?; return Ok(body); }
            Err(e) => { last = e.to_string(); std::thread::sleep(Duration::from_secs(1 + attempt)); }
        }
    }
    bail!("Download failed: {last}")
}
fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|a| a == "--help") { println!("Run from repository root: cargo run --release --manifest-path tools/catalog/Cargo.toml -- [--end YYYY-MM-DD] [--refresh]\nNo API key required. Cached responses live under .cache/catalog/."); return Ok(()); }
    let end = match args.iter().position(|a| a == "--end") {
        Some(i) => NaiveDate::parse_from_str(args.get(i+1).context("--end requires YYYY-MM-DD")?, "%Y-%m-%d")?,
        None => (Utc::now() + chrono::Duration::hours(9)).date_naive(),
    };
    let refresh = args.iter().any(|a| a == "--refresh");
    let cache = Path::new(".cache/catalog"); fs::create_dir_all(cache)?;
    let client = Client::builder().user_agent("KoreaQuake3D/1.0 (historical research visualization)").timeout(Duration::from_secs(90)).build()?;
    use chrono::Datelike;
    let mut kma = Vec::new();
    for year in 1978..=end.year() {
        let year_end = NaiveDate::from_ymd_opt(year,12,31).unwrap().min(end);
        let kma_url = format!("{KMA}?startTm={year}-01-01&endTm={year_end}&startSize=0&dpType=a&xls=1");
        let body = fetch(&client, &kma_url, &cache.join(format!("kma-year-{year}-{year_end}.html")), refresh)?;
        let mut records = parse_kma(&body)?;
        ensure!(records.len() < 4000, "KMA export reached 4000-row cap in {year}; split into shorter periods");
        ensure!(records.iter().all(|e| { let t=DateTime::parse_from_rfc3339(&e.time).unwrap() + chrono::Duration::hours(9); t.year() == year }), "KMA ignored year filter: {year}");
        println!("KMA {year}: {} events", records.len()); kma.append(&mut records);
    }
    let kma_count = kma.len();
    println!("KMA: {kma_count} events");
    let mut usgs = Vec::new();
    let stop = end.checked_add_days(Days::new(1)).context("End date overflow")?;
    for year in 2000..=end.year() {
        let start = NaiveDate::from_ymd_opt(year,1,1).unwrap();
        let next = NaiveDate::from_ymd_opt(year+1,1,1).unwrap().min(stop);
        // Fetch one year at a time; UTC boundaries are filtered after merging to the KST snapshot end.
        let url = format!("{USGS}?format=geojson&starttime={start}&endtime={next}&minlatitude=29&maxlatitude=47&minlongitude=118&maxlongitude=148&minmagnitude=4.5&eventtype=earthquake&orderby=time-asc");
        let body = fetch(&client, &url, &cache.join(format!("usgs-{year}-{next}.json")), refresh)?;
        let mut events = parse_usgs(&body)?; println!("USGS {year}: {} events", events.len()); usgs.append(&mut events);
    }
    // Inclusive service boundaries can repeat an event at January 1 midnight.
    let mut seen = HashSet::new(); usgs.retain(|e| seen.insert(e.id.clone()));
    let end_timestamp = stop.and_hms_opt(0,0,0).unwrap().and_utc().timestamp() - 9*3600;
    usgs.retain(|e| seconds(e) < end_timestamp);
    let usgs_count = usgs.len();
    let (events, linked) = merge(kma, usgs);
    validate(&events)?;
    let unknown = events.iter().filter(|e| e.depth.is_none()).count();
    let catalog = json!({ "schemaVersion": 1, "generatedAt": Utc::now().to_rfc3339(), "snapshotEnd": end.to_string(),
        "sources": [
            {"id":"KMA", "name":"기상청", "url":KMA, "start":"1978-01-01", "end":end.to_string(), "rawCount":kma_count, "coverage":"국내 공개 목록 · 미소지진 포함. 연도별 관측·공개 기준이 다릅니다."},
            {"id":"USGS", "name":"USGS ComCat", "url":"https://earthquake.usgs.gov/fdsnws/event/1/", "start":"2000-01-01", "end":end.to_string(), "rawCount":usgs_count, "coverage":"북위 29–47°, 동경 118–148° · M4.5 이상. 국내 소규모 지진을 대표하지 않습니다."}],
        "stats":{"total":events.len(), "unknownDepth":unknown, "linkedDuplicates":linked},
        "matchingRule":"KMA 우선. 시각 차이 ≤30초·거리 ≤30km·규모 차이 ≤0.8의 유일 후보만 연결. 원본 추정치는 alternate에 보존하며 깊이를 대체하지 않음.",
        "events":events });
    fs::create_dir_all("public/data")?;
    let target = Path::new("public/data/catalog.json");
    let temp = target.with_extension("json.tmp"); fs::write(&temp, serde_json::to_vec(&catalog)?)?;
    fs::rename(temp, target)?;
    println!("Saved {} events ({unknown} depth unknown, {linked} cross-source matches)", catalog["stats"]["total"]);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn event(id: &str, time: &str, lat: f64) -> Event { Event { id:id.into(), time:time.into(), lat, lon:129., depth:None, mag:5., mag_type:"M".into(), intensity:None, place:"test".into(), source:"KMA".into(), url:KMA.into(), alternate:vec![] } }
    #[test] fn kma_time_and_null_depth() {
        let h = "<table id='excel_body'><tr><td>1</td><td>2016/09/12 20:32:54</td><td>5.8</td><td>-</td><td>Ⅵ</td><td>35.77 N</td><td>129.18 E</td><td>경주</td></tr></table>";
        let e = parse_kma(h).unwrap(); assert_eq!(e[0].time,"2016-09-12T11:32:54Z"); assert_eq!(e[0].depth,None); assert_eq!(e[0].lat,35.77);
    }
    #[test] fn conservative_merge_preserves_measurements() {
        let a = event("kma-1", "2020-01-01T00:00:00Z", 35.);
        let mut b = event("us-1", "2020-01-01T00:00:10Z", 35.01); b.depth=Some(12.); b.source="USGS".into();
        let (out,n) = merge(vec![a.clone()],vec![b.clone()]); assert_eq!(n,1); assert_eq!(out.len(),1); assert_eq!(out[0].depth,None); assert_eq!(out[0].alternate[0].depth,Some(12.));
        let mut c = a.clone(); c.id="kma-2".into(); let (out,n) = merge(vec![a,c],vec![b]); assert_eq!(n,0); assert_eq!(out.len(),3);
    }
    #[test] fn invalid_coordinates_fail_closed() { let e=event("bad","2020-01-01T00:00:00Z",91.); assert!(validate(&[e]).is_err()); }
}
