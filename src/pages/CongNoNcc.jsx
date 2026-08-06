import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal, The } from '../components/Chung'
import { tien, ngay } from '../lib/dinhDang'

export default function CongNoNcc() {
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
    <Trang tieuDe="Công nợ phải trả NCC" mota="Mua − đã trả − giá trị hàng trả lại, tính theo từng nhà cung cấp">
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
    </Trang>
  )
}
