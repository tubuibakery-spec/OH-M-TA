import { useState } from 'react'
import { supabase, thieuCauHinh } from '../lib/supabase'
import { Loi } from '../components/Chung'

export default function DangNhap() {
  const [email, setEmail] = useState('')
  const [matKhau, setMatKhau] = useState('')
  const [dangGui, setDangGui] = useState(false)
  const [loi, setLoi] = useState(null)

  async function guiForm(e) {
    e.preventDefault()
    setDangGui(true); setLoi(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: matKhau })
    if (error) setLoi(error.message === 'Invalid login credentials'
      ? 'Sai email hoặc mật khẩu.'
      : error.message)
    setDangGui(false)
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light p-3">
      <div className="card border-0 shadow-sm" style={{ maxWidth: 420, width: '100%' }}>
        <div className="card-body p-4">
          <div className="text-center mb-4">
            <div className="fw-bold fs-3" style={{ color: '#c1121f' }}>OH! MÊ TA</div>
            <div className="text-secondary small">Quản lý chuỗi sản xuất &amp; bán hàng</div>
          </div>

          {thieuCauHinh && (
            <div className="alert alert-warning small">
              Chưa cấu hình kết nối. Sao chép <code>.env.example</code> thành <code>.env</code>,
              điền <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code>,
              rồi khởi động lại <code>npm run dev</code>.
            </div>
          )}

          <Loi loi={loi} onDong={() => setLoi(null)} />

          <form onSubmit={guiForm}>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email" className="form-control" required autoFocus
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <label className="form-label">Mật khẩu</label>
              <input
                type="password" className="form-control" required
                value={matKhau} onChange={e => setMatKhau(e.target.value)}
              />
            </div>
            <button
              className="btn w-100 text-white"
              style={{ backgroundColor: '#c1121f' }}
              disabled={dangGui || thieuCauHinh}
            >
              {dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>

          <div className="text-center text-secondary small mt-3">
            Tài khoản do quản trị viên cấp.
          </div>
        </div>
      </div>
    </div>
  )
}
