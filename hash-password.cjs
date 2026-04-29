const bcrypt = require("bcrypt");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("New password: ", async (password) => {
  try {
    const hash = await bcrypt.hash(password, 10);
    console.log("\nBCRYPT_HASH_START");
    console.log(hash);
    console.log("BCRYPT_HASH_END\n");
  } catch (error) {
    console.error(error);
  } finally {
    rl.close();
  }
});