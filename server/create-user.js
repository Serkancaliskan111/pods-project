/**
 * Simple Express server providing a secure endpoint to create Supabase users
 * using the service role key. Run this separately:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node server/create-user.js
 *
 * WARNING: Keep SUPABASE_SERVICE_ROLE_KEY secret and never expose it to the browser.
 */
const express = require('express')
const bodyParser = require('body-parser')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const app = express()
app.use(bodyParser.json())

app.post('/create-user', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'email and password required' })

    const { user, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) {
      console.error('createUser error', error)
      return res.status(500).json({ error: error.message })
    }

    return res.json({ user })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Create-user server running on http://localhost:${PORT}`)
})

