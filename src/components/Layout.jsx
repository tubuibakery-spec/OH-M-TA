import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useApp } from '../context/AppContext'

const MENU = [
  { duong: '/', nhan: 'Tổng quan', bieuTuong: '📊', module: null },
  { duong: '/ton-kho', nhan: 'Tồn kho', bieuTuong: '📦', module: 'kho' },
  { duong: '/nhap-hang', nhan: 'Nhập hàng', bieuTuong: '📥', module: 'mua_hang' },
  { duong: '/xuat-kho', nhan: 'Xuất / Điều chuyển', bieuTuong: '📤', module: 'kho' },
  { duong: '/kiem-ke', nhan: 'Kiểm kê', bieuTuong: '📋', module: 'kho' },
  { duong: '/de-xuat-don-hang', nhan: 'Đề xuất đặt hàng', bieuTuong: '🧮', module: 'mua_hang' },
  { duong: '/don-dat-hang', nhan: 'Đơn đặt NCC', bieuTuong: '🧾', module: 'mua_hang' },
  { duong: '/vat-tu', nhan: 'Vật tư', bieuTuong: '🏷️', module: 'danh_muc' },
  { duong: '/nha-cung-cap', nhan: 'Nhà cung cấp', bieuTuong: '🚚', module: 'danh_muc' }
]

export default function Layout() {
  const { chiNhanhs, chiNhanhId, setChiNhanhId, chiNhanh, nguoiDung, vaiTro, dangXuat, coQuyenMoiNoi } = useApp()
  const [moMenu, setMoMenu] = useState(false)

  const menuHienThi = MENU.filter(m => !m.module || coQuyenMoiNoi(m.module, 'xem'))

  return (
    <div className="d-flex flex-column min-vh-100">
      <nav className="navbar navbar-dark sticky-top" style={{ backgroundColor: '#c1121f' }}>
        <div className="container-fluid gap-2">
          <button
            className="btn btn-sm btn-outline-light d-lg-none"
            onClick={() => setMoMenu(v => !v)}
            aria-label="Menu"
          >☰</button>

          <span className="navbar-brand fw-bold mb-0 me-auto">
            OH! MÊ TA
          </span>

          {chiNhanhs.length > 0 && (
            <select
              className="form-select form-select-sm w-auto"
              value={chiNhanhId || ''}
              onChange={e => setChiNhanhId(e.target.value)}
              title="Chi nhánh đang làm việc"
            >
              {chiNhanhs.map(c => (
                <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>
              ))}
            </select>
          )}

          <div className="dropdown">
            <button className="btn btn-sm btn-outline-light dropdown-toggle" data-bs-toggle="dropdown">
              {nguoiDung?.email?.split('@')[0] || 'Tài khoản'}
            </button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li className="dropdown-header">
                {nguoiDung?.email}
                <div className="small text-secondary">
                  {vaiTro.map(v => v.ten_vai_tro).filter(Boolean).join(', ') || 'Chưa gán vai trò'}
                </div>
              </li>
              <li><hr className="dropdown-divider" /></li>
              <li><button className="dropdown-item" onClick={dangXuat}>Đăng xuất</button></li>
            </ul>
          </div>
        </div>
      </nav>

      <div className="container-fluid flex-grow-1">
        <div className="row">
          <aside className={`col-lg-2 bg-light border-end py-3 ${moMenu ? '' : 'd-none d-lg-block'}`}>
            <ul className="nav nav-pills flex-column gap-1">
              {menuHienThi.map(m => (
                <li key={m.duong} className="nav-item">
                  <NavLink
                    to={m.duong}
                    end={m.duong === '/'}
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : 'link-dark'}`}
                    onClick={() => setMoMenu(false)}
                  >
                    <span className="me-2">{m.bieuTuong}</span>{m.nhan}
                  </NavLink>
                </li>
              ))}
            </ul>
          </aside>

          <main className="col-lg-10 py-4">
            {!chiNhanh && (
              <div className="alert alert-warning">
                Tài khoản chưa được gán chi nhánh nào. Nhờ quản trị viên gán vai trò kèm chi nhánh.
              </div>
            )}
            <Outlet />
          </main>
        </div>
      </div>

      <footer className="border-top py-3 text-center text-secondary small">
        OH! MÊ TA · {chiNhanh?.ten_chi_nhanh || '—'}
      </footer>
    </div>
  )
}
