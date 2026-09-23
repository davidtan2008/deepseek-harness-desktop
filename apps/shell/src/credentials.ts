import { safeStorage } from 'electron'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CREDENTIAL_REF } from '@dhd/shared'
import { credentialsFilePath, userDataDir } from './paths.ts'

const KEYCHAIN_FILE = () => `${userDataDir()}/credentials.bin`

function readKeychain(): string | undefined {
  try {
    if (!existsSync(KEYCHAIN_FILE())) return undefined
    const buf = readFileSync(KEYCHAIN_FILE())
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf)
    }
    return buf.toString('utf8')
  } catch {
    return undefined
  }
}

function writeKeychain(value: string): void {
  mkdirSync(userDataDir(), { recursive: true })
  const buf = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value)
    : Buffer.from(value, 'utf8')
  writeFileSync(KEYCHAIN_FILE(), buf, { mode: 0o600 })
}

function syncDshCredentials(value: string | undefined): void {
  const file = credentialsFilePath()
  mkdirSync(dirname(file), { recursive: true })
  let existing = ''
  try {
    existing = readFileSync(file, 'utf8')
  } catch {
    existing = 'version: 1\nrefs: {}\n'
  }
  if (!existing.includes('version:')) {
    existing = `version: 1\nrefs:\n${existing}`
  }
  const lines = existing.split(/\r?\n/)
  const keyLine = new RegExp(`^(\\s*)${CREDENTIAL_REF}:\\s*.*$`)
  let found = false
  const next = lines.map((line) => {
    if (keyLine.test(line)) {
      found = true
      if (value === undefined) return null
      return `${CREDENTIAL_REF}: ${JSON.stringify(value)}`
    }
    return line
  }).filter((line): line is string => line !== null)

  if (!found && value !== undefined) {
    if (!next.some((line) => line.trim() === 'refs:')) {
      next.push('refs:')
    }
    const idx = next.findIndex((line) => line.trim() === 'refs:')
    next.splice(idx + 1, 0, `  ${CREDENTIAL_REF}: ${JSON.stringify(value)}`)
  }

  writeFileSync(file, `${next.join('\n').trim()}\n`, { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    // Windows
  }
}

export function hasApiKey(): boolean {
  if (readKeychain()?.trim()) return true
  try {
    const text = readFileSync(credentialsFilePath(), 'utf8')
    return new RegExp(`${CREDENTIAL_REF}:\\s*\\S+`).test(text)
  } catch {
    return false
  }
}

export function setApiKey(value: string): void {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('API key is empty')
  writeKeychain(trimmed)
  syncDshCredentials(trimmed)
}

export function clearApiKey(): void {
  try {
    writeFileSync(KEYCHAIN_FILE(), Buffer.alloc(0), { mode: 0o600 })
  } catch {
    // ignore
  }
  syncDshCredentials(undefined)
}

export function getApiKey(): string | undefined {
  const stored = readKeychain()?.trim()
  if (stored) return stored
  try {
    const text = readFileSync(credentialsFilePath(), 'utf8')
    const match = text.match(new RegExp(`${CREDENTIAL_REF}:\\s*(.+)`))
    const raw = match?.[1]?.trim()
    if (!raw) return undefined
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1)
    }
    return raw
  } catch {
    return undefined
  }
}
