import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useApp } from '../context/AppContext'

const MENU = [
  { duong: '/', nhan: 'Tổng quan', bieuTuong: '📊', module: null },
  { duong: '/ban-le', nhan: 'Bán lẻ', bieuTuong: '🛒', module: 'ban_le' },
  { duong: '/ton-kho', nhan: 'Tồn kho', bieuTuong: '📦', module: 'kho' },
  { duong: '/nhap-hang', nhan: 'Nhập hàng', bieuTuong: '📥', module: 'mua_hang' },
  { duong: '/xuat-kho', nhan: 'Xuất / Điều chuyển', bieuTuong: '📤', module: 'kho' },
  { duong: '/kiem-ke', nhan: 'Kiểm kê', bieuTuong: '📋', module: 'kho' },
  { duong: '/san-xuat', nhan: 'Sản xuất', bieuTuong: '🏭', module: 'san_xuat' },
  { duong: '/de-xuat-don-hang', nhan: 'Đề xuất đặt hàng', bieuTuong: '🧮', module: 'mua_hang' },
  { duong: '/don-dat-hang', nhan: 'Đơn đặt NCC', bieuTuong: '🧾', module: 'mua_hang' },
  { duong: '/khach-hang-b2b', nhan: 'Khách hàng B2B', bieuTuong: '🤝', module: 'b2b' },
  { duong: '/co-hoi-ban-hang', nhan: 'Cơ hội bán hàng', bieuTuong: '🎯', module: 'b2b' },
  { duong: '/don-hang-b2b', nhan: 'Đơn hàng B2B', bieuTuong: '📑', module: 'b2b' },
  { duong: '/cong-no', nhan: 'Công nợ', bieuTuong: '💰', module: 'cong_no' },
  { duong: '/bao-cao', nhan: 'Báo cáo', bieuTuong: '📈', module: 'tai_chinh' },
  { duong: '/ke-toan', nhan: 'Kế toán', bieuTuong: '🧾', module: 'tai_chinh' },
  { duong: '/chuyen-giao-hang', nhan: 'Chuyến giao hàng', bieuTuong: '🚛', module: 'logistics' },
  { duong: '/phuong-tien', nhan: 'Phương tiện', bieuTuong: '🚐', module: 'logistics' },
  { duong: '/vat-tu', nhan: 'Vật tư', bieuTuong: '🏷️', module: 'danh_muc' },
  { duong: '/nha-cung-cap', nhan: 'Nhà cung cấp', bieuTuong: '🚚', module: 'danh_muc' },
  { duong: '/nhan-vien', nhan: 'Nhân viên', bieuTuong: '👤', module: 'nhan_su' }
]

// Phòng ban chỉ lọc MENU HIỂN THỊ — không phải phân quyền thật (đó là việc
// của coQuyenMoiNoi/RLS). "duongChoPhep: null" nghĩa là hiện toàn bộ menu
// mà tài khoản có quyền xem (dành cho Ban Giám đốc).
const PHONG_BAN = [
  // Chỉ báo cáo/chỉ tiêu tổng hợp toàn chuỗi — KHÔNG hiện màn hình tác
  // nghiệp (nhập hàng, bán lẻ, đơn hàng...) của từng phòng ban.
  { id: 'ban_gd', nhan: 'Ban Giám đốc', bieuTuong: '👔', canChiNhanh: false,
    duongChoPhep: ['/bao-cao', '/ke-toan', '/cong-no'] },
  { id: 'ke_toan', nhan: 'Kế toán', bieuTuong: '🧾', canChiNhanh: false,
    duongChoPhep: ['/ke-toan', '/cong-no', '/bao-cao'] },
  { id: 'hr', nhan: 'Nhân sự', bieuTuong: '👤', canChiNhanh: false,
    duongChoPhep: ['/nhan-vien'] },
  { id: 'thu_mua', nhan: 'Thu mua', bieuTuong: '🛍️', canChiNhanh: true,
    duongChoPhep: ['/nhap-hang', '/don-dat-hang', '/de-xuat-don-hang', '/vat-tu', '/nha-cung-cap'] },
  { id: 'san_xuat', nhan: 'Sản xuất', bieuTuong: '🏭', canChiNhanh: true,
    duongChoPhep: ['/san-xuat', '/ton-kho', '/kiem-ke', '/vat-tu'] },
  { id: 'sale_b2b', nhan: 'Sale B2B', bieuTuong: '🤝', canChiNhanh: true,
    duongChoPhep: ['/khach-hang-b2b', '/co-hoi-ban-hang', '/don-hang-b2b', '/cong-no'] },
  { id: 'logistic', nhan: 'Logistics', bieuTuong: '🚛', canChiNhanh: true,
    duongChoPhep: ['/chuyen-giao-hang', '/phuong-tien', '/xuat-kho'] },
  { id: 'cua_hang', nhan: 'Cửa hàng (Bán hàng)', bieuTuong: '🏪', canChiNhanh: true,
    duongChoPhep: ['/ban-le', '/ton-kho', '/kiem-ke', '/xuat-kho', '/vat-tu'] }
]

export default function Layout() {
  const {
    chiNhanhs, chiNhanhId, setChiNhanhId, chiNhanh,
    phongBanId, setPhongBanId,
    nguoiDung, vaiTro, dangXuat, coQuyenMoiNoi
  } = useApp()
  const [moMenu, setMoMenu] = useState(false)

  const phongBan = PHONG_BAN.find(p => p.id === phongBanId) || PHONG_BAN[0]

  const menuHienThi = MENU.filter(m => {
    if (m.module && !coQuyenMoiNoi(m.module, 'xem')) return false
    if (m.duong === '/') return true   // Tổng quan luôn hiện, mọi phòng ban
    if (!phongBan.duongChoPhep) return true   // Ban Giám đốc: hiện hết
    return phongBan.duongChoPhep.includes(m.duong)
  })

  const canChonChiNhanh = phongBan.canChiNhanh

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

          <select
            className="form-select form-select-sm w-auto"
            value={phongBanId}
            onChange={e => setPhongBanId(e.target.value)}
            title="Phòng ban đang làm việc"
          >
            {PHONG_BAN.map(p => (
              <option key={p.id} value={p.id}>{p.bieuTuong} {p.nhan}</option>
            ))}
          </select>

          {canChonChiNhanh && chiNhanhs.length > 0 && (
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
            <div className="px-3 pb-2 text-secondary small text-uppercase fw-semibold">
              {phongBan.bieuTuong} {phongBan.nhan}
            </div>
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
            {canChonChiNhanh && !chiNhanh && (
              <div className="alert alert-warning">
                Tài khoản chưa được gán chi nhánh nào. Nhờ quản trị viên gán vai trò kèm chi nhánh.
              </div>
            )}
            <Outlet />
          </main>
        </div>
      </div>

      <footer className="border-top py-3 text-center text-secondary small">
        OH! MÊ TA · {phongBan.nhan}{canChonChiNhanh && chiNhanh ? ` · ${chiNhanh.ten_chi_nhanh}` : ''}
      </footer>
    </div>
  )
}
