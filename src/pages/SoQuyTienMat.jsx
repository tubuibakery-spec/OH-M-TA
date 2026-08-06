import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, The, Modal } from '../components/Chung'
import { tien, ngay, homNay } from '../lib/dinhDang'

const SO_HIEU_TK_TIEN = { 111: 'Tiền mặt', 112: 'Tiền gửi ngân hàng' }

function dauThang() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function SoQuyTienMat() {
  const { chiNhanhs, coQuyen, coQuyenMoiNoi } = useApp()
  const [taiKhoanChon, setTaiKhoanChon] = useState('111')
  const [tuNgay, setTuNgay] = useState(dauThang())
  const [denNgay, setDenNgay] = useState(homNay())

  const [tonDauKy, setTonDauKy] = useState(0)
  const [dsDong, setDsDong] = useState([])
  const [taiKhoans, setTaiKhoans] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [moPhieu, setMoPhieu] = useState(null) // 'thu' | 'chi' | null
  const [dangLuu, setDangLuu] = useState(false)
  const [ngayPhieu, setNgayPhieu] = useState(homNay())
  const [dienGiaiPhieu, setDienGiaiPhieu] = useState('')
  const [chiNhanhPhieu, setChiNhanhPhieu] = useState('')
  const [doiUngChon, setDoiUngChon] = useState('')
  const [soTien, setSoTien] = useState('')

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [dauKy, trongKy, tk] = await Promise.all([
        supabase.from('so_cai').select('no, co').eq('so_hieu', taiKhoanChon).lt('ngay_hach_toan', tuNgay),
        supabase.from('so_cai').select('*').eq('so_hieu', taiKhoanChon)
          .gte('ngay_hach_toan', tuNgay).lte('ngay_hach_toan', denNgay)
          .order('ngay_hach_toan', { ascending: true }),
        supabase.from('he_thong_tai_khoan').select('so_hieu, ten_tai_khoan, loai').eq('dang_su_dung', true).order('so_hieu')
      ])
      if (dauKy.error) throw dauKy.error
      if (trongKy.error) throw trongKy.error
      if (tk.error) throw tk.error

      const tonDauKyTinh = (dauKy.data || []).reduce((s, r) => s + Number(r.no) - Number(r.co), 0)
      let luyKe = tonDauKyTinh
      const dongVoiTon = (trongKy.data || []).map(r => {
        luyKe += Number(r.no) - Number(r.co)
        return { ...r, ton: luyKe }
      })
      setTonDauKy(tonDauKyTinh)
      setDsDong(dongVoiTon)
      setTaiKhoans(tk.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [taiKhoanChon, tuNgay, denNgay])

  useEffect(() => { nap() }, [nap])

  function moPhieuThu() {
    setNgayPhieu(homNay()); setDienGiaiPhieu(''); setChiNhanhPhieu(''); setDoiUngChon(''); setSoTien('')
    setMoPhieu('thu')
  }
  function moPhieuChi() {
    setNgayPhieu(homNay()); setDienGiaiPhieu(''); setChiNhanhPhieu(''); setDoiUngChon(''); setSoTien('')
    setMoPhieu('chi')
  }

  async function luuPhieu() {
    if (!doiUngChon || !(Number(soTien) > 0)) { setLoi('Chọn tài khoản đối ứng và nhập số tiền lớn hơn 0.'); return }
    setDangLuu(true); setLoi(null)
    try {
      const soTienSo = Number(soTien)
      const p_dong = moPhieu === 'thu'
        ? [{ so_hieu: taiKhoanChon, no: soTienSo, co: 0 }, { so_hieu: doiUngChon, no: 0, co: soTienSo }]
        : [{ so_hieu: doiUngChon, no: soTienSo, co: 0 }, { so_hieu: taiKhoanChon, no: 0, co: soTienSo }]
      const { error } = await supabase.rpc('rpc_tao_but_toan_thu_cong', {
        p_ngay: ngayPhieu,
        p_dien_giai: dienGiaiPhieu || null,
        p_chi_nhanh_id: chiNhanhPhieu || null,
        p_dong
      })
      if (error) throw error
      setMoPhieu(null)
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const tongThu = dsDong.reduce((s, r) => s + Number(r.no), 0)
  const tongChi = dsDong.reduce((s, r) => s + Number(r.co), 0)
  const tonCuoiKy = tonDauKy + tongThu - tongChi
  const doiUngOptions = taiKhoans.filter(tk => tk.so_hieu !== taiKhoanChon)

  const duocTao = coQuyen('tai_chinh', 'tao')

  if (!coQuyenMoiNoi('tai_chinh', 'xem')) return null

  return (
    <Trang
      tieuDe="Sổ quỹ tiền mặt & ngân hàng"
      mota="Số dư lũy kế theo từng bút toán — dùng chung sổ cái với trang Kế toán"
      hanhDong={duocTao && (
        <div className="d-flex gap-2">
          <button className="btn btn-success" onClick={moPhieuThu}>+ Phiếu thu</button>
          <button className="btn btn-outline-danger" onClick={moPhieuChi}>+ Phiếu chi</button>
        </div>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body d-flex flex-wrap align-items-center gap-3">
          <div className="btn-group">
            {Object.entries(SO_HIEU_TK_TIEN).map(([so_hieu, ten]) => (
              <button key={so_hieu}
                className={`btn btn-sm ${taiKhoanChon === so_hieu ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setTaiKhoanChon(so_hieu)}>
                {so_hieu} — {ten}
              </button>
            ))}
          </div>
          <div className="d-flex align-items-center gap-2 ms-auto">
            <label className="form-label mb-0 small">Từ ngày</label>
            <input type="date" className="form-control form-control-sm w-auto" value={tuNgay}
              onChange={e => setTuNgay(e.target.value)} />
            <label className="form-label mb-0 small">Đến ngày</label>
            <input type="date" className="form-control form-control-sm w-auto" value={denNgay}
              onChange={e => setDenNgay(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <The nhan="Tồn đầu kỳ" gt={tien(tonDauKy)} mau="secondary" />
        <The nhan="Tổng thu" gt={tien(tongThu)} mau="success" />
        <The nhan="Tổng chi" gt={tien(tongChi)} mau="danger" />
        <The nhan="Tồn cuối kỳ" gt={tien(tonCuoiKy)} mau="dark" />
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            khoa="but_toan_id"
            trong="Không có phát sinh trong khoảng ngày này"
            dong={dsDong}
            cot={[
              { ten: 'Ngày', render: r => ngay(r.ngay_hach_toan) },
              { ten: 'Số BT', render: r => r.so_but_toan },
              { ten: 'Diễn giải', render: r => r.dien_giai },
              { ten: 'Chi nhánh', render: r => r.ten_chi_nhanh || '—' },
              { ten: 'Thu', lop: 'text-end', render: r => r.no > 0 ? tien(r.no) : '—' },
              { ten: 'Chi', lop: 'text-end', render: r => r.co > 0 ? tien(r.co) : '—' },
              { ten: 'Tồn', lop: 'text-end', render: r => <span className="fw-semibold">{tien(r.ton)}</span> }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!moPhieu}
        tieuDe={moPhieu === 'thu' ? `Phiếu thu — ${SO_HIEU_TK_TIEN[taiKhoanChon]}` : `Phiếu chi — ${SO_HIEU_TK_TIEN[taiKhoanChon]}`}
        onDong={() => setMoPhieu(null)} onLuu={luuPhieu} dangLuu={dangLuu}
        nhanLuu={moPhieu === 'thu' ? 'Ghi thu' : 'Ghi chi'}
      >
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Ngày</label>
            <input type="date" className="form-control" value={ngayPhieu}
              onChange={e => setNgayPhieu(e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Chi nhánh</label>
            <select className="form-select" value={chiNhanhPhieu} onChange={e => setChiNhanhPhieu(e.target.value)}>
              <option value="">— Toàn công ty —</option>
              {chiNhanhs.map(c => <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>)}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">
              {moPhieu === 'thu' ? 'Thu từ (tài khoản đối ứng)' : 'Chi cho (tài khoản đối ứng)'}
            </label>
            <select className="form-select" value={doiUngChon} onChange={e => setDoiUngChon(e.target.value)}>
              <option value="">— Chọn tài khoản —</option>
              {doiUngOptions.map(tk => (
                <option key={tk.so_hieu} value={tk.so_hieu}>{tk.so_hieu} — {tk.ten_tai_khoan}</option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Số tiền (₫)</label>
            <input type="number" min="0" className="form-control" value={soTien}
              onChange={e => setSoTien(e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Diễn giải</label>
            <input className="form-control" value={dienGiaiPhieu}
              onChange={e => setDienGiaiPhieu(e.target.value)} />
          </div>
        </div>
      </Modal>
    </Trang>
  )
}
