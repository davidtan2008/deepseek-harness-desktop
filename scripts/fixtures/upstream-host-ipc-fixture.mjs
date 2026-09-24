if (typeof process.send !== 'function') throw new Error('fixture requires an IPC channel')

process.send({ type: 'ready', url: 'http://127.0.0.1:19387/?token=fixture', injections: [] })
process.on('message', (message) => {
  if (message?.type === 'update-tasks') {
    process.send({ type: 'update-tasks', requestId: message.requestId, active: false })
    return
  }
  if (message?.type === 'shutdown') {
    process.send({ type: 'shutdown-complete' })
    setTimeout(() => process.exit(0), 10)
  }
})
