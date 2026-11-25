
'use client'
import { useState, useRef, useEffect } from 'react'
import EthioTelecomLogo from '@/components/EthioTelecomLogo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)

  async function login() {
    try {
      setLoading(true)
      setErrorMessage('')
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      // A handler that throws (a Prisma error, an unhandled exception) makes Next
      // return its HTML error page instead of JSON, so the status code is the
      // only reliable signal telling the user whether their credentials were
      // refused or the server itself is broken. Previously both cases collapsed
      // into "Login failed" and the real cause only appeared in the console.
      let data: { error?: string; mustChangePassword?: boolean } | null = null
      let isJson = true
      try {
        data = await res.json()
      } catch {
        isJson = false
        console.error(`Login response was not JSON (HTTP ${res.status})`)
      }
      if (res.ok) {
        // First login on the built-in default password (or an admin reset) →
        // the app stays closed until it is changed.
        window.location.href = data?.mustChangePassword ? '/change-password' : '/dashboard'
      } else if (res.status === 429) {
        // Rate limited (lib/rateLimit.ts — 10 per 15 min per IP). The server
        // already sends JSON here, so this only adds the "wait" instruction.
        setErrorMessage(data?.error || 'Too many login attempts. Please wait and try again.')
        setShake(true)
      } else if (!isJson) {
        setErrorMessage(`Server error (HTTP ${res.status}). Please try again.`)
        setShake(true)
      } else {
        setErrorMessage(data?.error || 'Login failed')
        setShake(true)
      }
    } catch (err) {
      console.error(err)
      setErrorMessage('Unable to connect to server')
      setShake(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (errorMessage && errorRef.current) errorRef.current.focus()
  }, [errorMessage])

  useEffect(() => {
    if (!shake) return
    const t = setTimeout(() => setShake(false), 500)
    return () => clearTimeout(t)
  }, [shake])

  useEffect(() => {
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setErrorMessage('')
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') login()
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px); }
          30% { transform: translateX(6px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(4px); }
          75% { transform: translateX(-2px); }
          90% { transform: translateX(2px); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-6px); max-height: 0; }
          to { opacity: 1; transform: translateY(0); max-height: 120px; }
        }
        .shake { animation: shake 0.5s ease-in-out; }
        .error-banner { animation: slideDown 0.25s ease-out forwards; overflow: hidden; }
        .page-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #fff;
          overflow: hidden;
        }
        .main-area {
          display: grid;
          grid-template-columns: 1fr 420px;
          flex: 1;
          overflow: hidden;
          min-height: 0;
        }
        .left-panel {
          position: relative;
          overflow: hidden;
        }
        .bg-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
        }
        .right-panel {
          background: #fff;
          padding: 36px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow-y: auto;
        }
        .form-inner {
          width: 100%;
          max-width: 340px;
        }
        .form-icon {
          width: 52px;
          height: 52px;
          margin: 0 auto 14px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          color: white;
        }
        .footer-bar {
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          padding: 10px 24px;
          text-align: center;
          font-size: 11px;
          color: #94a3b8;
          flex-shrink: 0;
        }
        .footer-bar a { color: #10b981; text-decoration: none; }
        input:focus {
          outline: 2px solid #10b981;
          outline-offset: -1px;
        }
        /* Mobile responsive */
        @media (max-width: 768px) {
          html, body { overflow: auto; }
          .page-root { height: auto; min-height: 100vh; overflow: auto; }
          .main-area {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto;
          }
          .left-panel { min-height: 260px; max-height: 300px; }
          .right-panel { padding: 28px 20px; }
        }
      `}</style>

      <div className="page-root">
        <div className="main-area">
          {/* Left Panel — composite image contains text + logo overlay already baked in */}
          <div className="left-panel">
            {/*
              Place login_background.png in your Next.js /public folder.
              This image already contains:
                - The asset-tracking background photo
                - Dark gradient overlay
                - Text: "Real-time asset visibility and control", "Asset Tracking",
                        "Track. Manage. Optimize.", description paragraph
                - Ethio Telecom logo (transparent, top-right)
              To edit text or logo position, regenerate with the Python script
              or edit directly in any image editor (Photoshop, GIMP, Figma, etc.)
            */}
            <img
  src="/bg2-optimized.webp"
  alt="Asset Tracking"
  className="bg-image"
/>
            {/* Logo overlay — top left, white card overriding the photo background */}
            <div style={{
              position: 'absolute',
              top: 20,
              left: 20,
              zIndex: 2,
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '12px 20px',
              borderRadius: 12,
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            }}>
              <EthioTelecomLogo className="h-12 md:h-16" />
            </div>
          </div>

          {/* Right Panel: Login Form */}
          <div className="right-panel">
            <div className="form-inner">
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div className="form-icon">🔐</div>
                <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '5px' }}>Sign in</h2>
                <p style={{ fontSize: '13px', color: '#64748b' }}>Access your asset tracking dashboard</p>
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  className="error-banner"
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    padding: '12px', background: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#991b1b',
                  }}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: '18px', height: '18px', flexShrink: 0, marginTop: '2px' }}>
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <span style={{ flex: 1 }}>{errorMessage}</span>
                  <button onClick={() => setErrorMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '16px', lineHeight: 1 }}>×</button>
                </div>
              )}

              {/* Form */}
              <form onSubmit={(e) => { e.preventDefault(); login() }}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Email or Username
                  </label>
                  <input
                    type="text"
                    autoComplete="username"
                    spellCheck={false}
                    autoCapitalize="none"
                    placeholder="your.email@ethiotelecom.com or username"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (errorMessage) setErrorMessage('') }}
                    onKeyDown={handleKeyDown}
                    style={{
                      width: '100%', padding: '10px 12px',
                      border: `1px solid ${errorMessage ? '#fecaca' : '#e2e8f0'}`,
                      borderRadius: '8px', fontSize: '13px',
                      background: errorMessage ? '#fef2f2' : '#f8fafc',
                      fontFamily: 'inherit', outline: 'none', transition: 'all 0.2s',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (errorMessage) setErrorMessage('') }}
                    onKeyDown={handleKeyDown}
                    style={{
                      width: '100%', padding: '10px 12px',
                      border: `1px solid ${errorMessage ? '#fecaca' : '#e2e8f0'}`,
                      borderRadius: '8px', fontSize: '13px',
                      background: errorMessage ? '#fef2f2' : '#f8fafc',
                      fontFamily: 'inherit', outline: 'none', transition: 'all 0.2s',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={shake ? 'shake' : ''}
                  style={{
                    width: '100%', padding: '11px 16px',
                    background: loading ? '#6ee7b7' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff', border: 'none', borderRadius: '8px',
                    fontSize: '14px', fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s', marginTop: '4px',
                    opacity: loading ? 0.8 : 1,
                  }}
                >
                  {loading ? '⏳ Signing in...' : '✓ Sign in'}
                </button>
              </form>

              {/* Support contact — deliberately no credentials are shown here.
                  This page is publicly reachable, so any hint printed here is
                  effectively a published password for a live account. */}
              <div style={{
                marginTop: '20px', padding: '11px',
                background: '#f8fafc', borderRadius: '6px',
                border: '1px solid #e2e8f0', fontSize: '12px',
                color: '#475569', textAlign: 'center',
              }}>
                Forgot your password? Contact your system administrator.
              </div>
            </div>
          </div>
        </div>

        {/* Single footer spanning full width */}
        <div className="footer-bar">
          © 2024 EthioTelecom. All rights reserved.&nbsp;|&nbsp;
          <a href="#">Privacy</a>&nbsp;|&nbsp;
          <a href="#">Terms</a>
        </div>
      </div>
    </>
  )
}
