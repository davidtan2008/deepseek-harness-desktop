import type { InlineEditRequest, InlineEditResult } from '@dhd/shared'
import { getApiKey } from './credentials.ts'

export async function runInlineEdit(request: InlineEditRequest): Promise<InlineEditResult> {
  const key = getApiKey()
  if (!key) {
    throw new Error('Set a DeepSeek API key in Settings before using inline edit.')
  }
  const selected = request.selectedText || request.fullText
  const system = [
    'You are the inline-edit engine inside DeepSeek Harness Desktop.',
    'Return ONLY the replacement text for the selected region.',
    'Do not wrap in markdown fences. Do not explain.',
    'Preserve surrounding style, imports, and indentation.',
  ].join(' ')
  const user = [
    `File: ${request.path}`,
    `Language: ${request.language}`,
    `Instruction: ${request.instruction}`,
    '',
    'Selected region:',
    selected,
  ].join('\n')

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Inline edit failed (${res.status}): ${body.slice(0, 400)}`)
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string }
  let replacement = json.choices?.[0]?.message?.content ?? ''
  replacement = replacement.replace(/^```[\w-]*\n/, '').replace(/\n```$/, '')
  return { replacement, model: json.model ?? 'deepseek-chat' }
}
