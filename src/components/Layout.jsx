import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

const ICON_LOAI_CHI_NHANH = {
  bep_trung_tam: '🏭',
  cua_hang: '🏪',
  kho_tong: '🏬'
}

const MENU = [
  { duong: '/', nhan: 'Tổng quan', icon: 'bi-speedometer2', module: null, nhom: 'TỔNG QUAN' },

  { duong: '/ban-le', nhan: 'Bán lẻ', icon: 'bi-cart3', module: 'ban_le', nhom: 'BÁN HÀNG' },
  { duong: '/ca-ban-hang', nhan: 'Ca bán hàng', icon: 'bi-clock-history', module: 'ban_le', nhom: 'BÁN HÀNG' },
  { duong: '/khuyen-mai', nhan: 'Khuyến mãi', icon: 'bi-gift', module: 'marketing', nhom: 'BÁN HÀNG' },

  { duong: '/ton-kho', nhan: 'Tồn kho', icon: 'bi-boxes', module: 'kho', nhom: 'KHO' },
  { duong: '/nhap-hang', nhan: 'Nhập hàng', icon: 'bi-box-arrow-in-down', module: 'mua_hang', nhom: 'KHO' },
  { duong: '/xuat-kho', nhan: 'Xuất / Điều chuyển', icon: 'bi-box-arrow-up', module: 'kho', nhom: 'KHO' },
  { duong: '/kiem-ke', nhan: 'Kiểm kê', icon: 'bi-clipboard-check', module: 'kho', nhom: 'KHO' },

  { duong: '/du-bao-ban', nhan: 'Dự báo bán hàng', icon: 'bi-graph-up-arrow', module: 'du_bao', nhom: 'MUA HÀNG' },
  { duong: '/de-xuat-don-hang', nhan: 'Đề xuất đặt hàng', icon: 'bi-calculator', module: 'mua_hang', nhom: 'MUA HÀNG' },
  { duong: '/don-dat-hang', nhan: 'Đơn đặt NCC', icon: 'bi-receipt', module: 'mua_hang', nhom: 'MUA HÀNG' },
  { duong: '/bang-gia-ncc', nhan: 'Bảng giá NCC', icon: 'bi-tag', module: 'mua_hang', nhom: 'MUA HÀNG' },

  { duong: '/san-xuat', nhan: 'Sản xuất', icon: 'bi-tools', module: 'san_xuat', nhom: 'SẢN XUẤT' },
  { duong: '/cong-thuc-san-xuat', nhan: 'Công thức sản xuất', icon: 'bi-diagram-3', module: 'cong_thuc', nhom: 'SẢN XUẤT' },

  { duong: '/khach-hang-b2b', nhan: 'Khách hàng B2B', icon: 'bi-briefcase', module: 'b2b', nhom: 'B2B' },
  { duong: '/bang-gia-b2b', nhan: 'Bảng giá B2B', icon: 'bi-tags', module: 'b2b', nhom: 'B2B' },
  { duong: '/co-hoi-ban-hang', nhan: 'Cơ hội bán hàng', icon: 'bi-bullseye', module: 'b2b', nhom: 'B2B' },
  { duong: '/don-hang-b2b', nhan: 'Đơn hàng B2B', icon: 'bi-file-earmark-text', module: 'b2b', nhom: 'B2B' },

  { duong: '/cong-no', nhan: 'Công nợ', icon: 'bi-cash-stack', module: 'cong_no', nhom: 'TÀI CHÍNH' },
  { duong: '/cong-no-ncc', nhan: 'Công nợ phải trả NCC', icon: 'bi-wallet2', module: 'cong_no', nhom: 'TÀI CHÍNH' },
  { duong: '/bao-cao', nhan: 'Báo cáo', icon: 'bi-bar-chart-line', module: 'tai_chinh', nhom: 'TÀI CHÍNH' },
  { duong: '/ke-toan', nhan: 'Kế toán', icon: 'bi-journal-text', module: 'tai_chinh', nhom: 'TÀI CHÍNH' },
  { duong: '/so-quy', nhan: 'Sổ quỹ tiền mặt & NH', icon: 'bi-cash-coin', module: 'tai_chinh', nhom: 'TÀI CHÍNH' },
  { duong: '/chi-phi', nhan: 'Chi phí vận hành', icon: 'bi-receipt-cutoff', module: 'tai_chinh', nhom: 'TÀI CHÍNH' },

  { duong: '/chuyen-giao-hang', nhan: 'Chuyến giao hàng', icon: 'bi-signpost-split', module: 'logistics', nhom: 'LOGISTICS' },
  { duong: '/phuong-tien', nhan: 'Phương tiện', icon: 'bi-truck-front', module: 'logistics', nhom: 'LOGISTICS' },

  { duong: '/vat-tu', nhan: 'Vật tư', icon: 'bi-box-seam', module: 'danh_muc', nhom: 'DANH MỤC' },
  { duong: '/nha-cung-cap', nhan: 'Nhà cung cấp', icon: 'bi-truck', module: 'danh_muc', nhom: 'DANH MỤC' },

  { duong: '/nhan-vien', nhan: 'Nhân viên', icon: 'bi-people', module: 'nhan_su', nhom: 'NHÂN SỰ' },
  { duong: '/cham-cong', nhan: 'Chấm công', icon: 'bi-clock', module: 'nhan_su', nhom: 'NHÂN SỰ' },
  { duong: '/nghi-phep', nhan: 'Nghỉ phép', icon: 'bi-calendar2-week', module: 'nhan_su', nhom: 'NHÂN SỰ' },
  { duong: '/bang-luong', nhan: 'Bảng lương', icon: 'bi-cash', module: 'nhan_su', nhom: 'NHÂN SỰ' },

  { duong: '/quan-tri-nguoi-dung', nhan: 'Người dùng & phân quyền', icon: 'bi-shield-lock', module: 'he_thong', nhom: 'QUẢN TRỊ' }
]

// Phòng ban chỉ lọc MENU HIỂN THỊ — không phải phân quyền thật (đó là việc
// của coQuyenMoiNoi/RLS). "duongChoPhep: null" nghĩa là hiện toàn bộ menu
// mà tài khoản có quyền xem (dành cho Ban Giám đốc).
const PHONG_BAN = [
  // Chỉ báo cáo/chỉ tiêu tổng hợp toàn chuỗi — KHÔNG hiện màn hình tác
  // nghiệp (nhập hàng, bán lẻ, đơn hàng...) của từng phòng ban.
  { id: 'ban_gd', nhan: 'Ban Giám đốc', bieuTuong: '👔', canChiNhanh: false,
    duongChoPhep: ['/bao-cao', '/ke-toan', '/so-quy', '/chi-phi', '/cong-no', '/cong-no-ncc', '/quan-tri-nguoi-dung'] },
  { id: 'ke_toan', nhan: 'Kế toán', bieuTuong: '🧾', canChiNhanh: false,
    duongChoPhep: ['/ke-toan', '/so-quy', '/chi-phi', '/cong-no', '/cong-no-ncc', '/bao-cao'] },
  { id: 'hr', nhan: 'Nhân sự', bieuTuong: '👤', canChiNhanh: false,
    duongChoPhep: ['/nhan-vien', '/cham-cong', '/nghi-phep', '/bang-luong'] },
  { id: 'thu_mua', nhan: 'Thu mua', bieuTuong: '🛍️', canChiNhanh: true,
    duongChoPhep: ['/du-bao-ban', '/nhap-hang', '/don-dat-hang', '/de-xuat-don-hang', '/vat-tu', '/nha-cung-cap', '/bang-gia-ncc'] },
  { id: 'san_xuat', nhan: 'Sản xuất', bieuTuong: '🏭', canChiNhanh: true,
    duongChoPhep: ['/san-xuat', '/du-bao-ban', '/ton-kho', '/kiem-ke', '/vat-tu', '/cong-thuc-san-xuat'] },
  { id: 'sale_b2b', nhan: 'Sale B2B', bieuTuong: '🤝', canChiNhanh: true,
    duongChoPhep: ['/khach-hang-b2b', '/bang-gia-b2b', '/co-hoi-ban-hang', '/don-hang-b2b', '/cong-no', '/khuyen-mai'] },
  { id: 'logistic', nhan: 'Logistics', bieuTuong: '🚛', canChiNhanh: true,
    duongChoPhep: ['/chuyen-giao-hang', '/phuong-tien', '/xuat-kho'] },
  { id: 'cua_hang', nhan: 'Cửa hàng (Bán hàng)', bieuTuong: '🏪', canChiNhanh: true,
    duongChoPhep: ['/ban-le', '/ca-ban-hang', '/khuyen-mai', '/du-bao-ban', '/ton-kho', '/kiem-ke', '/xuat-kho', '/vat-tu'] }
]

export default function Layout() {
  const {
    chiNhanhs, chiNhanhId, setChiNhanhId, chiNhanh,
    phongBanId, setPhongBanId,
    nguoiDung, vaiTro, dangXuat, coQuyenMoiNoi
  } = useApp()
  const [moMenu, setMoMenu] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const phongBan = PHONG_BAN.find(p => p.id === phongBanId) || PHONG_BAN[0]

  const menuHienThi = MENU.filter(m => {
    if (m.module && !coQuyenMoiNoi(m.module, 'xem')) return false
    if (m.duong === '/') return true   // Tổng quan luôn hiện, mọi phòng ban
    if (!phongBan.duongChoPhep) return true   // Ban Giám đốc: hiện hết
    return phongBan.duongChoPhep.includes(m.duong)
  })

  // Đổi phòng ban mà trang đang xem không còn thuộc menu của phòng ban mới
  // → tự điều hướng về Tổng quan, tránh kẹt lại ở trang cũ không liên quan.
  useEffect(() => {
    const duongHopLe = menuHienThi.map(m => m.duong)
    if (!duongHopLe.includes(location.pathname)) {
      navigate('/')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phongBanId])

  // Giữ đúng thứ tự nhóm xuất hiện đầu tiên trong MENU (mảng gốc đã sắp
  // theo nhóm) — nhóm nào không còn mục nào sau khi lọc thì không hiện.
  const nhomThuTu = [...new Set(menuHienThi.map(m => m.nhom))]

  const canChonChiNhanh = phongBan.canChiNhanh

  return (
    <div className="d-flex flex-column min-vh-100">
      <aside className={`sidebar d-flex flex-column ${moMenu ? '' : 'd-none d-lg-flex'}`}>
        <div className="brand-area px-3 py-4">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-shop fs-4" style={{ color: 'var(--ohmeta-do)' }} />
            <div>
              <div className="fw-bold text-white lh-1">OH! MÊ TA</div>
              <small className="text-white-50" style={{ fontSize: 11 }}>Quản lý chuỗi</small>
            </div>
          </div>
        </div>

        <div className="flex-grow-1 overflow-auto px-2 pb-2">
          {nhomThuTu.map(nhom => (
            <div key={nhom} className="mb-1">
              <div className="nav-label px-2 pt-3 pb-1">{nhom}</div>
              <ul className="nav flex-column gap-1">
                {menuHienThi.filter(m => m.nhom === nhom).map(m => (
                  <li key={m.duong} className="nav-item">
                    <NavLink
                      to={m.duong}
                      end={m.duong === '/'}
                      className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                      onClick={() => setMoMenu(false)}
                    >
                      <i className={`bi ${m.icon}`} />{m.nhan}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-2 py-2 mt-auto" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <div className="dropdown">
            <button className="btn btn-sm btn-outline-light dropdown-toggle w-100 text-start" data-bs-toggle="dropdown">
              <i className="bi bi-person-circle me-1" />{nguoiDung?.email?.split('@')[0] || 'Tài khoản'}
            </button>
            <ul className="dropdown-menu">
              <li className="dropdown-header">
                {nguoiDung?.email}
                <div className="small text-secondary">
                  {vaiTro.map(v => v.ten_vai_tro).filter(Boolean).join(', ') || 'Chưa gán vai trò'}
                </div>
              </li>
              <li><hr className="dropdown-divider" /></li>
              <li><button className="dropdown-item" onClick={dangXuat}>
                <i className="bi bi-box-arrow-left me-1" />Đăng xuất
              </button></li>
            </ul>
          </div>
        </div>
      </aside>

      {moMenu && (
        <div
          className="d-lg-none"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1025 }}
          onClick={() => setMoMenu(false)}
        />
      )}

      <div className="ohmeta-content d-flex flex-column flex-grow-1">
        <nav className="topbar sticky-top d-flex align-items-center gap-2 px-3 py-2">
          <button
            className="btn btn-sm btn-outline-secondary d-lg-none"
            onClick={() => setMoMenu(v => !v)}
            aria-label="Menu"
          ><i className="bi bi-list fs-5" /></button>

          <div className="d-flex align-items-center gap-2 ms-auto">
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
                title="Địa điểm đang làm việc — bao gồm cửa hàng, bếp trung tâm, kho tổng"
              >
                {chiNhanhs.map(c => (
                  <option key={c.id} value={c.id}>
                    {ICON_LOAI_CHI_NHANH[c.loai_chi_nhanh] || '📍'} {c.ten_chi_nhanh}
                  </option>
                ))}
              </select>
            )}
          </div>
        </nav>

        <main className="flex-grow-1 p-3 p-md-4">
          {canChonChiNhanh && !chiNhanh && (
            <div className="alert alert-warning">
              Tài khoản chưa được gán chi nhánh nào. Nhờ quản trị viên gán vai trò kèm chi nhánh.
            </div>
          )}
          <Outlet />
        </main>

        <footer className="border-top py-3 text-center text-secondary small bg-white">
          OH! MÊ TA · {phongBan.nhan}
          {canChonChiNhanh && chiNhanh ? ` · ${ICON_LOAI_CHI_NHANH[chiNhanh.loai_chi_nhanh] || '📍'} ${chiNhanh.ten_chi_nhanh}` : ''}
        </footer>
      </div>
    </div>
  )
}
