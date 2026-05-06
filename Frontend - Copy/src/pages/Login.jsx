import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { loginStart, loginSuccess, loginFailure, clearError } from '../store/slices/authSlice'
import { login } from '../services/authService'

export default function Login() {
  const dispatch        = useDispatch()
  const navigate        = useNavigate()
  const { loading, error, isAuthenticated } = useSelector((s) => s.auth)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    return () => dispatch(clearError())
  }, [dispatch])

  const handleSubmit = async (e) => {
    e.preventDefault()
    dispatch(loginStart())
    try {
      const data = await login(email, password)
      dispatch(loginSuccess(data))
    } catch (err) {
      dispatch(loginFailure(err.response?.data?.message || 'Invalid credentials'))
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <span className="bg-[#c41a1a] text-white text-sm font-bold px-2.5 py-1.5 rounded-lg">SRS</span>
          <div>
            <p className="text-[#1a1f36] font-bold text-lg leading-none">Rotem SRS</p>
            <p className="text-[#8892ab] text-xs mt-0.5">Industrial Operations Portal</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#e2e4ea] rounded-2xl shadow-sm overflow-hidden">

          <div className="px-6 pt-6 pb-2">
            <h1 className="text-[#1a1f36] font-bold text-lg">Sign in</h1>
            <p className="text-[#8892ab] text-sm mt-1">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-[#4a5073] uppercase tracking-wide mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@srs.com"
                required
                className="w-full px-3 py-2.5 text-sm bg-white border border-[#e2e4ea] rounded-lg text-[#1a1f36] placeholder-[#c0c4d0] outline-none focus:border-[#1e2d5a] focus:ring-2 focus:ring-[#1e2d5a]/10 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-[#4a5073] uppercase tracking-wide mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 text-sm bg-white border border-[#e2e4ea] rounded-lg text-[#1a1f36] placeholder-[#c0c4d0] outline-none focus:border-[#1e2d5a] focus:ring-2 focus:ring-[#1e2d5a]/10 transition-all"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#1e2d5a] hover:bg-[#253468] text-white font-semibold text-sm rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

          </form>
        </div>

        <p className="text-center text-xs text-[#8892ab] mt-6">
          © {new Date().getFullYear()} Rotem Industrial SRS
        </p>
      </div>
    </div>
  )
}