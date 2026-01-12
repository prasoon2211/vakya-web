#!/usr/bin/env node

const { spawn } = require('node:child_process')

const env = { ...process.env }

;(async() => {
  // If running the web server then prerender pages
  if (process.argv.slice(-3).join(' ') === 'npm run start') {
    await exec('npx next build --experimental-build-mode generate')
  }

  // Download dictionary databases from R2 if not present
  console.log('[Entrypoint] Checking dictionary databases...')
  try {
    await exec('node lib/dictionary/download-dictionaries.js')
  } catch (err) {
    // Non-fatal - app can run without dictionaries (falls back to AI)
    console.log('[Entrypoint] Dictionary download failed, continuing anyway')
  }

  // launch application
  await exec(process.argv.slice(2).join(' '))
})()

function exec(command) {
  const child = spawn(command, { shell: true, stdio: 'inherit', env })
  return new Promise((resolve, reject) => {
    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} failed rc=${code}`))
      }
    })
  })
}
