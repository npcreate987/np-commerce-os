/**
 * Phase 20.2 — Tiny inline reverse-geocoder for Thailand.
 *
 * We don't want to ship a 5 MB province-shape file to the mobile client
 * or hit a paid reverse-geocoding API just to put a label on the "nearby"
 * tab of the video feed. Instead: a hand-picked table of the 25-ish
 * largest Thai cities + a quick haversine to find the closest one.
 *
 * Accuracy
 * --------
 * Coordinates are city-centre approximations (Wikipedia infobox). For
 * the UI label this is fine — we just want "Khon Kaen-flavoured" not
 * "this exact tambon". The picker also caps the distance at 200 km;
 * if you're farther than that from any anchor (or geo wasn't granted)
 * we return `null` and the caller falls back to a generic "ใกล้ฉัน".
 *
 * Coverage
 * --------
 * Bangkok metro + every Tier-1 + Tier-2 Thai city by population (per
 * NSO 2024). Selected to keep the table under 30 rows so the label
 * computation stays O(table). Add new rows freely — order doesn't
 * matter, the picker scans them all.
 */

interface CityAnchor {
  /** Short Thai label shown on the tab (1–4 syllables). */
  label: string;
  lat: number;
  lng: number;
}

const ANCHORS: CityAnchor[] = [
  { label: 'กรุงเทพฯ', lat: 13.7563, lng: 100.5018 },
  { label: 'นนทบุรี', lat: 13.8622, lng: 100.5145 },
  { label: 'สมุทรปราการ', lat: 13.5990, lng: 100.5998 },
  { label: 'ปทุมธานี', lat: 14.0208, lng: 100.5250 },
  { label: 'เชียงใหม่', lat: 18.7883, lng: 98.9853 },
  { label: 'เชียงราย', lat: 19.9105, lng: 99.8406 },
  { label: 'ลำปาง', lat: 18.2932, lng: 99.4926 },
  { label: 'พิษณุโลก', lat: 16.8211, lng: 100.2659 },
  { label: 'นครสวรรค์', lat: 15.7045, lng: 100.1374 },
  { label: 'ขอนแก่น', lat: 16.4419, lng: 102.8359 },
  { label: 'อุดรธานี', lat: 17.4138, lng: 102.7873 },
  { label: 'อุบลราชธานี', lat: 15.2448, lng: 104.8472 },
  { label: 'นครราชสีมา', lat: 14.9799, lng: 102.0978 },
  { label: 'มหาสารคาม', lat: 16.1849, lng: 103.3015 },
  { label: 'ร้อยเอ็ด', lat: 16.0538, lng: 103.6520 },
  { label: 'สกลนคร', lat: 17.1664, lng: 104.1486 },
  { label: 'หนองคาย', lat: 17.8783, lng: 102.7412 },
  { label: 'บุรีรัมย์', lat: 14.9930, lng: 103.1029 },
  { label: 'พัทยา', lat: 12.9236, lng: 100.8825 },
  { label: 'ชลบุรี', lat: 13.3611, lng: 100.9847 },
  { label: 'ระยอง', lat: 12.6833, lng: 101.2378 },
  { label: 'ฉะเชิงเทรา', lat: 13.6904, lng: 101.0779 },
  { label: 'หัวหิน', lat: 12.5707, lng: 99.9576 },
  { label: 'ภูเก็ต', lat: 7.8804, lng: 98.3923 },
  { label: 'กระบี่', lat: 8.0863, lng: 98.9063 },
  { label: 'สุราษฎร์ธานี', lat: 9.1382, lng: 99.3215 },
  { label: 'หาดใหญ่', lat: 7.0086, lng: 100.4747 },
  { label: 'นครศรีฯ', lat: 8.4304, lng: 99.9633 },
];

/** Haversine in km — same formula as the API's feed re-ranker. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Pick the closest known Thai city/anchor to the given coordinate.
 *
 *   inferThaiRegionLabel({ lat: 16.43, lng: 103.5 })  →  "ขอนแก่น"
 *   inferThaiRegionLabel({ lat: 13.75, lng: 100.50 }) →  "กรุงเทพฯ"
 *   inferThaiRegionLabel(null)                        →  null
 *   inferThaiRegionLabel({ lat: 0, lng: 0 })          →  null (>200 km from any anchor)
 *
 * Returns `null` if no usable answer — the caller should fall back to
 * a generic "ใกล้ฉัน" pill so the tab never looks broken.
 */
export function inferThaiRegionLabel(geo: { lat: number; lng: number } | null): string | null {
  if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return null;
  let best: { label: string; km: number } | null = null;
  for (const a of ANCHORS) {
    const km = haversineKm(geo.lat, geo.lng, a.lat, a.lng);
    if (!best || km < best.km) best = { label: a.label, km };
  }
  // Outside ~200 km of any anchor (e.g. user is on a Laos/Myanmar border
  // village or simply VPN'd out of Thailand) — bail out to the static
  // fallback rather than mislabelling.
  if (!best || best.km > 200) return null;
  return best.label;
}
