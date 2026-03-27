const db = require("../src/db/database");

db.prepare(`
  INSERT INTO watchlist (origin, destination, departure_date)
  VALUES (?, ?, ?)
`).run("MIA", "LAX", "2026-03-10");

console.log("✅ Test route added to watchlist.");