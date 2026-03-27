import { Migrator, type Migration, type MigrationProvider } from 'kysely'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { db } from './kysely.js'

class ESMigrationProvider implements MigrationProvider {
  constructor(private readonly migrationFolder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const entries = await fs.readdir(this.migrationFolder, { withFileTypes: true })

    const files = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => name.endsWith('.ts') || name.endsWith('.js'))
      .sort((a, b) => a.localeCompare(b))

    const migrations: Record<string, Migration> = {}

    for (const fileName of files) {
      const migrationName = fileName.replace(/\.(ts|js)$/, '')
      const fullPath = path.join(this.migrationFolder, fileName)

      // ✅ Critical: Node ESM on Windows requires file:// URLs
      const fileUrl = pathToFileURL(fullPath).href

      const mod: any = await import(fileUrl)

      if (typeof mod.up !== 'function') {
        throw new Error(`Migration "${fileName}" is missing an "up" export`)
      }

      migrations[migrationName] = {
        up: mod.up,
        down: typeof mod.down === 'function' ? mod.down : async () => {},
      }
    }

    return migrations
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function migrate() {
  const migrationFolder = path.join(__dirname, 'migrations')

  const migrator = new Migrator({
    db,
    provider: new ESMigrationProvider(migrationFolder),
  })

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((it) => {
    if (it.status === 'Success') console.log(`✔ Migrated: ${it.migrationName}`)
    if (it.status === 'Error') console.error(`✖ Failed: ${it.migrationName}`)
  })

  if (error) {
    console.error('Migration failed')
    console.error(error)
    process.exit(1)
  }

  console.log('✅ All migrations complete')
  process.exit(0)
}

migrate()