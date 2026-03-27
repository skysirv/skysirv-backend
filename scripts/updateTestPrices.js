// updateTestPrices.js

const db = require("../src/db/database");

const routeHash = "0e8a7dd724894e495ce29939255f0c630ce87e22d77c2611767b65042077c9a2";

const result = db.prepare(`
  UPDATE flight_price_history
  SET price = price * 1.10
  WHERE route_hash = ?
`).run(routeHash);

console.log("Rows updated:", result.changes);
console.log("Historical prices artificially increased by 10%");