const db = require("../src/db/database");

const routeHash = "0e8a7dd724894e495ce29939255f0c630ce87e22d77c2611767b65042077c9a2";

// Delete rows equal to current price
db.prepare(`
  DELETE FROM flight_price_history
  WHERE route_hash = ?
  AND price <= 121.66
`).run(routeHash);

console.log("Removed current low-price snapshots");