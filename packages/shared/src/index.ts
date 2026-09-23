export * from './protocol.js'

export const PRODUCT_NAME = 'DeepSeek Harness Desktop'
export const PRODUCT_ID = 'deepseek-harness-desktop'
export const PROTOCOL = 'dsh-desktop'
export const CREDENTIAL_REF = 'DEEPSEEK_API_KEY'

export function dshHome(): string {
  const override = process.env.DSH_HOME?.trim()
  if (override) return override
  const home = process.env.HOME || process.env.USERPROFILE || ''
  return `${home}/.dsh`
}

export function languageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    mdx: 'markdown',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    vue: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    ini: 'ini',
    xml: 'xml',
    svg: 'xml',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'dockerfile',
    txt: 'plaintext',
  }
  const base = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (base === 'dockerfile') return 'dockerfile'
  if (base === 'makefile') return 'plaintext'
  return map[ext] ?? 'plaintext'
}
