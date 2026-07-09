import { spawn } from 'node:child_process'
import dotenv from 'dotenv'

dotenv.config()

const commandName = (base) => (process.platform === 'win32' ? `${base}.cmd` : base)
const migrateRetries = Number.parseInt(process.env.MIGRATE_RETRIES || '5', 10)
const migrateRetryDelayMs = Number.parseInt(process.env.MIGRATE_RETRY_DELAY_MS || '10000', 10)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const normalizeDatabaseUrl = () => {
  const rawUrl = process.env.DATABASE_URL

  if (!rawUrl) {
    console.error('DATABASE_URL is missing. Set it in Render environment variables.')
    process.exit(1)
  }

  let normalizedUrl = rawUrl.trim()

  normalizedUrl = normalizedUrl
    .replace(/^export\s+/i, '')
    .replace(/^DATABASE_URL\s*=\s*/i, '')
    .replace(/;$/, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()

  if (!/^postgres(ql)?:\/\//.test(normalizedUrl) && /postgres(ql)?%3A%2F%2F/i.test(normalizedUrl)) {
    try {
      normalizedUrl = decodeURIComponent(normalizedUrl)
    } catch {
      // Keep the original value so the validation message below is still shown.
    }
  }

  process.env.DATABASE_URL = normalizedUrl

  if (!/^postgres(ql)?:\/\//.test(normalizedUrl)) {
    const detectedShape = normalizedUrl.includes('=')
      ? 'contains "="'
      : normalizedUrl.includes('://')
        ? `starts with "${normalizedUrl.split('://')[0]}://"`
        : `starts with "${normalizedUrl.slice(0, 12) || 'empty'}"`

    console.error(
      `DATABASE_URL must start with postgresql:// or postgres://. Current value ${detectedShape}. ` +
        'In Render, set key DATABASE_URL and paste only the database URL as the value.'
    )
    process.exit(1)
  }
}

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
      }
    })
  })

const runWithRetry = async (command, args, { retries = 3, delayMs = 5000 } = {}) => {
  let lastError = null

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await run(command, args)
      return
    } catch (error) {
      lastError = error

      if (attempt >= retries) {
        break
      }

      const waitMs = delayMs * attempt
      console.error(`${error.message}. Retrying in ${Math.round(waitMs / 1000)}s (${attempt}/${retries})...`)
      await sleep(waitMs)
    }
  }

  throw lastError
}

normalizeDatabaseUrl()

try {
  await run(commandName('npx'), ['prisma', 'generate'])
  await runWithRetry(commandName('npx'), ['prisma', 'migrate', 'deploy'], {
    retries: Number.isFinite(migrateRetries) && migrateRetries > 0 ? migrateRetries : 5,
    delayMs: Number.isFinite(migrateRetryDelayMs) && migrateRetryDelayMs > 0 ? migrateRetryDelayMs : 10000,
  })

  if (process.env.RUN_DB_SEED === 'true') {
    await run('node', ['scripts/seed.js'])
  }

  await run('node', ['src/server.js'])
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
