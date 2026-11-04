// Works out what every NBA team gives up per game in the league's categories
// (opponent FG%, FT%, 3P%, REB, AST, A/TO, STL, BLK, PTS) from ESPN's public box scores,
// and writes it to data/opponent-stats.js so the dashboard can show how tough each of
// your players' upcoming matchups is.
//
// Box scores are cached in the output file, so each run only downloads games it hasn't seen.
//
// Usage: node scripts/fetch-opponent-stats.mjs

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = new URL("../data/opponent-stats.js", import.meta.url);
const SCHEDULE = new URL("../data/schedule.js", import.meta.url);
const API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
// ESPN's own abbreviations differ from the ones in data/players.js and data/schedule.js.
const RENAME = { NY: "NYK", GS: "GSW", SA: "SAS", NO: "NOP", UTAH: "UTA", WSH: "WAS" };
const abbr = (a) => RENAME[(a || "").toUpperCase()] || (a || "").toUpperCase();
const KEYS = ["fgm", "fga", "ftm", "fta", "tpm", "tpa", "reb", "ast", "to", "stl", "blk", "pts"];

const readWindowJson = (url, name) => {
  if (!existsSync(url)) return null;
  const text = readFileSync(url, "utf8");
  const start = text.indexOf(`window.${name} = `);
  if (start < 0) return null;
  return JSON.parse(text.slice(start + `window.${name} = `.length).trim().replace(/;\s*$/, ""));
};

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (fantasy-cat-checker)" } });
    if (res.ok) return res.json();
    if (attempt >= 3) throw new Error(`HTTP ${res.status} for ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

// ESPN box score team stats come as [{ name, label, displayValue }], with made-attempted pairs as "40-85".
function parseTeamStats(list, points) {
  const find = (names, labels) => list.find((s) => names.includes(s.name)) || list.find((s) => labels.includes((s.label || "").toUpperCase()));
  const pair = (names, labels) => {
    const m = String(find(names, labels)?.displayValue || "").match(/^(\d+)\s*-\s*(\d+)$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const num = (names, labels) => {
    const v = Number(find(names, labels)?.displayValue);
    return Number.isFinite(v) ? v : null;
  };
  const fg = pair(["fieldGoalsMade-fieldGoalsAttempted"], ["FG"]);
  const tp = pair(["threePointFieldGoalsMade-threePointFieldGoalsAttempted"], ["3PT", "3P"]);
  const ft = pair(["freeThrowsMade-freeThrowsAttempted"], ["FT"]);
  const s = {
    fgm: fg?.[0], fga: fg?.[1], tpm: tp?.[0], tpa: tp?.[1], ftm: ft?.[0], fta: ft?.[1],
    reb: num(["totalRebounds", "rebounds"], ["REB"]),
    ast: num(["assists"], ["AST"]),
    stl: num(["steals"], ["STL"]),
    blk: num(["blocks"], ["BLK"]),
    // Player turnovers (what fantasy counts), not team turnovers like shot-clock violations.
    to: num(["turnovers"], ["TO"]) ?? num(["totalTurnovers"], ["TOT TO"]),
  };
  s.pts = Number.isFinite(points) ? points : fg && tp && ft ? 2 * fg[0] + tp[0] + ft[0] : null;
  return KEYS.every((k) => Number.isFinite(s[k])) ? s : null;
}

const cache = readWindowJson(OUT, "OPPONENT_STATS") || {};
const games = cache.games || {};
const schedule = readWindowJson(SCHEDULE, "SCHEDULE");

// Every date with NBA games from opening night to today (US Eastern), using the synced schedule.
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
let dates = [];
if (schedule?.teams) dates = [...new Set(Object.values(schedule.teams).flat().map((g) => g.date))].filter((d) => d <= today).sort();
if (!dates.length) throw new Error("No schedule dates found; run scripts/fetch-schedule.mjs first.");
const done = new Set(cache.doneDates || []);

let added = 0, skipped = 0;
for (const date of dates) {
  if (done.has(date)) continue;
  const board = await getJson(`${API}/scoreboard?dates=${date.replaceAll("-", "")}`);
  const events = (board.events || []).filter((e) => (e.season?.type ?? 2) === 2); // regular season only
  let allFinal = events.length > 0;
  for (const ev of events) {
    if (!ev.status?.type?.completed) { allFinal = false; continue; }
    if (games[ev.id]) continue;
    const comp = ev.competitions?.[0];
    const score = Object.fromEntries((comp?.competitors || []).map((c) => [abbr(c.team?.abbreviation), Number(c.score)]));
    const sum = await getJson(`${API}/summary?event=${ev.id}`);
    const sides = (sum.boxscore?.teams || []).map((t) => {
      const team = abbr(t.team?.abbreviation);
      return { team, stats: parseTeamStats(t.statistics || [], score[team]) };
    });
    if (sides.length !== 2 || sides.some((s) => !s.stats)) {
      console.warn(`Skipping ${date} game ${ev.id}: box score incomplete.`);
      skipped++; allFinal = false;
      continue;
    }
    games[ev.id] = { date, teams: sides.map((s) => s.team), stats: sides.map((s) => s.stats) };
    added++;
  }
  // Dates before today with every game final never need checking again.
  if (allFinal && date < today) done.add(date);
}

// What each team allows: the totals its opponents put up against it.
const teams = {};
for (const g of Object.values(games)) {
  for (let i = 0; i < 2; i++) {
    const t = (teams[g.teams[i]] ||= { gp: 0, allowed: Object.fromEntries(KEYS.map((k) => [k, 0])) });
    t.gp++;
    for (const k of KEYS) t.allowed[k] += g.stats[1 - i][k];
  }
}

const nGames = Object.keys(games).length;
if (!nGames) throw new Error("No completed box scores found; not saving.");
writeFileSync(
  OUT,
  `// Auto-generated by scripts/fetch-opponent-stats.mjs - do not edit by hand.\n` +
    `// teams[ABBR].allowed = season totals that opponents have put up against that team (divide by gp for per game).\n` +
    `window.OPPONENT_STATS = ${JSON.stringify({ updated: new Date().toISOString(), teams, doneDates: [...done].sort(), games })};\n`,
);
console.log(`Saved opponent stats for ${Object.keys(teams).length} teams from ${nGames} games (${added} new, ${skipped} skipped).`);
