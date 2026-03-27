import { buildServer } from "./api/server.js"
import { env } from "./config/env.js"

async function start() {
  const app = buildServer()

  try {
    await app.listen({
      port: Number(env.PORT) || 4000,
      host: "0.0.0.0",
    })

    console.log(
      `🚀 Skysirv API listening on http://127.0.0.1:${env.PORT || 4000}`
    )

  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()