const db = require("../src/db/database");

const routeHash = "0e8a7dd724894e495ce29939255f0c630ce87e22d77c2611767b65042077c9a2";

const row = db.prepare(`
  SELECT MIN(price) as minPrice
  FROM flight_price_history
  WHERE route_hash = ?
`).get(routeHash);

console.log("Current historical minimum:", row.minPrice);