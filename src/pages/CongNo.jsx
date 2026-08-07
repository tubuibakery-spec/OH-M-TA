import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal, The } from '../components/Chung'
import { tien, ngay } from '../lib/dinhDang'

function PhaiThu() {
  const { coQuyen } = useApp()
  const [hoaDon, setHoaDon] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [thu, setThu] = useState(null)
  const [soTien, setSoTien] = useState('')
  const [hinhThuc, setHinhThuc] = useState('tien_mat')
  const [dangLuu, setDangLuu] = useState(false)

  const [xemLichSu, setXemLichSu] = useState(null)
  const [lichSuThu, setLichSuThu] = useState([])

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase
      .from('hoa_don_b2b')
      .select('id, so_hoa_don, ngay_xuat_hoa_don, han_thanh_toan, tong_tien, da_thanh_toan, con_lai, trang_thai_thanh_toan, trang_thai, khach_hang_b2b(ten_doanh_nghiep)')
      .eq('trang_thai', 'hieu_luc')
      .order('han_thanh_toan')
      .limit(200)
    if (error) setLoi(error.message)
    setHoaDon(data || []); setDangTai(false)
  }, [])

  useEffect(() => { nap() }, [nap])

  async function ghiThu() {
    if (!Number(soTien) || Number(soTien) <= 0) { setLoi('Số tiền phải lớn hơn 0.'); return }
    setDangLuu(true); setLoi(null)
    try {
      const { error } = await supabase.from('phieu_thu_cong_no').insert({
        hoa_don_b2b_id: thu.id,
        so_tien: Number(soTien),
        hinh_thuc: hinhThuc
      })
      if (error) throw error
      setThu(null); setSoTien(''); setHinhThuc('tien_mat')
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function huyHoaDon(hd) {
    if (!confirm(`Hủy hóa đơn ${hd.so_hoa_don}? Công nợ khách hàng sẽ tự cập nhật lại.`)) return
    setLoi(null)
    const { error } = await supabase.from('hoa_don_b2b').update({ trang_thai: 'da_huy' }).eq('id', hd.id)
    if (error) setLoi(error.message)
    await nap()
  }

  async function moLichSu(hd) {
    setXemLichSu(hd); setLichSuThu([])
    const { data, error } = await supabase
      .from('phieu_thu_cong_no')
      .select('so_phieu_thu, ngay_thu, so_tien, hinh_thuc, ghi_chu')
      .eq('hoa_don_b2b_id', hd.id)
      .order('ngay_thu')
    if (error) setLoi(error.message)
    setLichSuThu(data || [])
  }

  const duocThu = coQuyen('cong_no', 'tao')
  const duocSua = coQuyen('cong_no', 'sua')
  const homNay = new Date().toISOString().slice(0, 10)
  const tongConLai = hoaDon.reduce((s, r) => s + Number(r.con_lai || 0), 0)
  const soQuaHan = hoaDon.filter(r => r.con_lai > 0 && r.han_thanh_toan < homNay).length
  const tongQuaHan = hoaDon
    .filter(r => r.con_lai > 0 && r.han_thanh_toan < homNay)
    .reduce((s, r) => s + Number(r.con_lai), 0)

  return (
    <>
      <div className="text-secondary small mb-3">Hóa đơn B2B chưa thu hết tiền, sắp xếp theo hạn thanh toán gần nhất</div>
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="row g-3 mb-4">
        <The nhan="Tổng còn phải thu" gt={tien(tongConLai)} mau="dark" />
        <The nhan="Số hóa đơn quá hạn" gt={soQuaHan} mau={soQuaHan ? 'danger' : 'success'} />
        <The nhan="Giá trị quá hạn" gt={tien(tongQuaHan)} mau={tongQuaHan ? 'danger' : 'success'} />
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={hoaDon}
            trong="Không có công nợ nào"
            cot={[
              { ten: 'Số HĐ', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moLichSu(r)}>
                  {r.so_hoa_don}
                </button>
              ) },
              { ten: 'Khách hàng', render: r => r.khach_hang_b2b?.ten_doanh_nghiep },
              { ten: 'Ngày xuất', render: r => ngay(r.ngay_xuat_hoa_don) },
              { ten: 'Hạn thanh toán', render: r => (
                <span className={r.con_lai > 0 && r.han_thanh_toan < homNay ? 'text-danger fw-semibold' : ''}>
                  {ngay(r.han_thanh_toan)}
                </span>
              ) },
              { ten: 'Tổng tiền', lop: 'text-end', render: r => tien(r.tong_tien) },
              { ten: 'Đã thu', lop: 'text-end', render: r => tien(r.da_thanh_toan) },
              { ten: 'Còn lại', lop: 'text-end', render: r => (
                <span className="fw-semibold">{tien(r.con_lai)}</span>
              ) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai_thanh_toan} /> },
              { ten: '', lop: 'text-end', render: r => (
                <div className="d-flex gap-1 justify-content-end">
                  {duocThu && r.con_lai > 0 && (
                    <button className="btn btn-sm btn-success" onClick={() => { setThu(r); setSoTien(String(r.con_lai)) }}>
                      Ghi thu
                    </button>
                  )}
                  {duocSua && Number(r.da_thanh_toan) === 0 && (
                    <button className="btn btn-sm btn-outline-danger" onClick={() => huyHoaDon(r)}>Hủy</button>
                  )}
                </div>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!thu} tieuDe={`Ghi phiếu thu — ${thu?.so_hoa_don || ''}`}
        onDong={() => setThu(null)} onLuu={ghiThu} dangLuu={dangLuu} nhanLuu="Ghi thu"
      >
        {thu && (
          <div className="row g-3">
            <div className="col-12">
              <div className="text-secondary small">Khách hàng</div>
              <div className="fw-semibold">{thu.khach_hang_b2b?.ten_doanh_nghiep}</div>
            </div>
            <div className="col-md-6">
              <label className="form-label">Số tiền thu (còn lại {tien(thu.con_lai)})</label>
              <input type="number" min="0" max={thu.con_lai} className="form-control"
                value={soTien} onChange={e => setSoTien(e.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Hình thức</label>
              <select className="form-select" value={hinhThuc} onChange={e => setHinhThuc(e.target.value)}>
                <option value="tien_mat">Tiền mặt</option>
                <option value="chuyen_khoan">Chuyển khoản</option>
              </select>
            </div>
          </div>
        )}
      </Modal>

      <Modal mo={!!xemLichSu} tieuDe={`Lịch sử thu — ${xemLichSu?.so_hoa_don || ''}`} onDong={() => setXemLichSu(null)}>
        <Bang
          khoa="so_phieu_thu"
          trong="Chưa có phiếu thu nào"
          dong={lichSuThu}
          cot={[
            { ten: 'Số phiếu', render: r => r.so_phieu_thu },
            { ten: 'Ngày thu', render: r => ngay(r.ngay_thu) },
            { ten: 'Số tiền', lop: 'text-end', render: r => tien(r.so_tien) },
            { ten: 'Hình thức', render: r => r.hinh_thuc === 'chuyen_khoan' ? 'Chuyển khoản' : 'Tiền mặt' },
            { ten: 'Ghi chú', render: r => r.ghi_chu || '—' }
          ]}
        />
      </Modal>
    </>
  )
}

function PhaiTra() {
  const { coQuyen } = useApp()
  const [ds, setDs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [ncc, setNcc] = useState(null)
  const [soTien, setSoTien] = useState('')
  const [hinhThuc, setHinhThuc] = useState('tien_mat')
  const [phieuNhaps, setPhieuNhaps] = useState([])
  const [phieuNhapChon, setPhieuNhapChon] = useState('')
  const [dangLuu, setDangLuu] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase
      .from('cong_no_phai_tra_theo_ncc')
      .select('*')
    if (error) setLoi(error.message)
    setDs(data || []); setDangTai(false)
  }, [])

  useEffect(() => { nap() }, [nap])

  async function moGhiChi(r) {
    setNcc(r); setSoTien(String(r.con_no)); setHinhThuc('tien_mat'); setPhieuNhapChon('')
    const { data, error } = await supabase
      .from('phieu_nhap_kho')
      .select('id, so_phieu, tong_tien, ngay_nhap')
      .eq('nha_cung_cap_id', r.nha_cung_cap_id)
      .eq('trang_thai', 'da_duyet')
      .order('ngay_nhap', { ascending: false })
      .limit(20)
    if (error) setLoi(error.message)
    setPhieuNhaps(data || [])
  }

  async function ghiChi() {
    if (!Number(soTien) || Number(soTien) <= 0) { setLoi('Số tiền phải lớn hơn 0.'); return }
    if (Number(soTien) > ncc.con_no) { setLoi(`Số tiền vượt quá số còn nợ (${tien(ncc.con_no)}).`); return }
    setDangLuu(true); setLoi(null)
    try {
      const { error } = await supabase.from('phieu_chi_ncc').insert({
        nha_cung_cap_id: ncc.nha_cung_cap_id,
        phieu_nhap_id: phieuNhapChon || null,
        so_tien: Number(soTien),
        hinh_thuc: hinhThuc
      })
      if (error) throw error
      setNcc(null); setSoTien(''); setPhieuNhapChon(''); setHinhThuc('tien_mat')
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const duocChi = coQuyen('cong_no', 'tao')
  const tongConLai = ds.filter(r => r.con_no > 0).reduce((s, r) => s + Number(r.con_no), 0)
  const soNccConNo = ds.filter(r => r.con_no > 0).length
  const tongTraLai = ds.reduce((s, r) => s + Number(r.gia_tri_tra_lai || 0), 0)

  return (
    <>
      <div className="text-secondary small mb-3">Mua − đã trả − giá trị hàng trả lại, tính theo từng nhà cung cấp</div>
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="row g-3 mb-4">
        <The nhan="Tổng còn phải trả" gt={tien(tongConLai)} mau="dark" />
        <The nhan="Số NCC còn nợ" gt={soNccConNo} mau={soNccConNo ? 'danger' : 'success'} />
        <The nhan="Giá trị hàng đã trả lại NCC" gt={tien(tongTraLai)} mau="secondary" />
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            khoa="ten_ncc"
            trong="Không còn công nợ NCC nào"
            cot={[
              { ten: 'Nhà cung cấp', render: r => r.ten_ncc },
              { ten: 'Tổng mua', lop: 'text-end', render: r => tien(r.tong_mua) },
              { ten: 'Đã trả', lop: 'text-end', render: r => tien(r.da_tra) },
              { ten: 'Giá trị trả lại NCC', lop: 'text-end', render: r => tien(r.gia_tri_tra_lai) },
              { ten: 'Còn nợ', lop: 'text-end', render: r => (
                <span className="fw-semibold">{tien(r.con_no)}</span>
              ) },
              { ten: '', lop: 'text-end', render: r => duocChi && r.con_no > 0 && (
                <button className="btn btn-sm btn-success" onClick={() => moGhiChi(r)}>Ghi chi trả</button>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!ncc} tieuDe={`Ghi phiếu chi — ${ncc?.ten_ncc || ''}`}
        onDong={() => setNcc(null)} onLuu={ghiChi} dangLuu={dangLuu} nhanLuu="Ghi chi"
      >
        {ncc && (
          <div className="row g-3">
            <div className="col-12 text-secondary small">
              Còn nợ: <strong>{tien(ncc.con_no)}</strong>
            </div>
            <div className="col-md-6">
              <label className="form-label">Số tiền chi (còn lại {tien(ncc.con_no)})</label>
              <input type="number" min="0" max={ncc.con_no} className="form-control"
                value={soTien} onChange={e => setSoTien(e.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Hình thức</label>
              <select className="form-select" value={hinhThuc} onChange={e => setHinhThuc(e.target.value)}>
                <option value="tien_mat">Tiền mặt</option>
                <option value="chuyen_khoan">Chuyển khoản</option>
              </select>
            </div>
            <div className="col-12">
              <label className="form-label">Gắn với phiếu nhập (không bắt buộc)</label>
              <select className="form-select" value={phieuNhapChon} onChange={e => setPhieuNhapChon(e.target.value)}>
                <option value="">— Không gắn phiếu nhập cụ thể —</option>
                {phieuNhaps.map(p => (
                  <option key={p.id} value={p.id}>{p.so_phieu} — {tien(p.tong_tien)} ({ngay(p.ngay_nhap)})</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export default function CongNo() {
  const [tab, setTab] = useState('thu')

  return (
    <Trang tieuDe="Công nợ">
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${tab === 'thu' ? 'active' : ''}`} onClick={() => setTab('thu')}>
            Phải thu
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${tab === 'tra' ? 'active' : ''}`} onClick={() => setTab('tra')}>
            Phải trả NCC
          </button>
        </li>
      </ul>
      {tab === 'thu' ? <PhaiThu /> : <PhaiTra />}
    </Trang>
  )
}
