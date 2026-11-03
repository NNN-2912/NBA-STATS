# NBA 9-Cat Checker

**The home page (`index.html`) is the league view.** It shows every matchup this week as an ESPN-style box score (the winner of each category shaded green), then a table of every team in all 9 categories, colored by league rank, and where our team ranks. Pick a week, the average week so far, or what each current roster adds up to per game. It opens in dark mode; tap **Light mode** to switch. The player rankings tool described below is now at `players.html`.

A player-value tool for our **ESPN fantasy basketball head-to-head league** (YTBBB), scoring **FG%, FT%, 3P%, REB, AST, A/TO, STL, BLK and PTS**. It is modeled on Hashtag Basketball's projections page.

- Ranks every player by z-score in each of the 9 categories, colored green (helps you) to red (hurts you). The categories are set in the `CATS` list in `index.html`.
- **Punt builds:** tap a category to switch it off and the rankings recalculate.
- **League settings:** number of teams and roster size set the player pool the values are measured against.
- **Per game / totals**, **2026-27 projections**, **2026-27 season so far** (once games start) and **2025-26 actual**.
- **My Team:** star (★) your players to see which categories you're strong in, which you need, and the best players to add for those needs.
- **Taken:** mark players other managers own (✕) so suggestions only show free agents.
- **CSV import** if you want to use your own projections.

Your starred and taken players are saved in your browser.

**Your roster and the league update automatically.** `scripts/fetch-league.mjs` downloads every team's roster from ESPN league 1306956773 every hour and rewrites `data/my-team.js` (our team, team #24) and `data/league.js` (everyone else). Trades, adds and drops show up on the site on their own. It also saves this week's live head-to-head score, category by category, to `data/matchup.js`, which the **League** panel shows at the top. The standings and every matchup this week go to `data/standings.js`, shown at the bottom of the **League** panel. The notes in `data/my-team.js` are kept for players who stay on the team. If the league is ever made private, add the `ESPN_S2` and `SWID` cookies from espn.com as repository secrets (**Settings → Secrets and variables → Actions**).

In the **League** panel you can pick any team and see a head-to-head matchup preview against yours.

## Where the data comes from

`scripts/fetch-espn.mjs` downloads ESPN Fantasy's own player projections and season stats.
The GitHub Action in `.github/workflows/update-data.yml` runs it (and the league roster download) **every 3 hours** and saves the result to `data/players.js`, so the app stays current as the season goes on.

If `data/players.js` is missing, the app falls back to `data/seed-players.js`, a set of hand-made estimates.

## Using it

**Option 1: on your computer.** Download the repository (green **Code** button, then **Download ZIP**), unzip it, and double-click `index.html`.

**Option 2: as a website (recommended, free).**
1. Merge this branch into `main`.
2. On GitHub, open **Settings → Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.
3. After a minute your site is live at `https://<your-username>.github.io/<repo-name>/`. Bookmark it on your phone.

To get the latest data on the site, tap **Refresh data** at the top right. It reloads the newest files the hourly sync saved. To pull from ESPN right away instead of waiting for the next hourly sync, tap **Sync from ESPN now** (or open **Actions → Update player data → Run workflow**), wait about a minute, then tap **Refresh data**.

## How values are calculated

For each category, a player's z-score is `(player − pool average) ÷ pool standard deviation`, where the pool is the top `teams × roster` players. FG%, FT%, 3P% and A/TO are team ratios, so they use volume-weighted impact (`makes − league% × attempts`, or `assists − league A/TO × turnovers`). **Value** is the sum of the categories you have switched on.
