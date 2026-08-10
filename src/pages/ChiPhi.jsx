import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal } from '../components/Chung'
import { tien, ngay, homNay } from '../lib/dinhDang'

const NHOM_CHI_PHI = {
  van_hanh: 'Vận hành', nhan_su: 'Nhân sự', marketing: 'Marketing', mat_bang: 'Mặt bằng', khac: 'Khác'
}

export default function ChiPhi() {
  const { chiNhanhs, coQuyen } = useApp()
  const [dsChiPhi, setDsChiPhi] = useState([])
  const [loaiChiPhis, setLoaiChiPhis] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [moGhi, setMoGhi] = useState(false)
  const [dangLuu, setDangLuu] = useState(false)
  const [ngayPhatSinh, setNgayPhatSinh] = useState(homNay())
  const [loaiChiPhiId, setLoaiChiPhiId] = useState('')
  const [chiNhanhChon, setChiNhanhChon] = useState('')
  const [soTien, setSoTien] = useState('')
  const [moTa, setMoTa] = useState('')

  const [moLoaiMoi, setMoLoaiMoi] = useState(false)
  const [tenLoaiMoi, setTenLoaiMoi] = useState('')
  const [nhomLoaiMoi, setNhomLoaiMoi] = useState('van_hanh')

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [cp, lcp] = await Promise.all([
        supabase.from('chi_phi')
          .select('id, so_tien, ngay_phat_sinh, mo_ta, nguoi_lap_email, chi_nhanh(ten_chi_nhanh), loai_chi_phi(ten_loai, nhom)')
          .order('ngay_phat_sinh', { ascending: false }).limit(200),
        supabase.from('loai_chi_phi').select('id, ten_loai, nhom').order('ten_loai')
      ])
      if (cp.error) throw cp.error
      if (lcp.error) throw lcp.error
      setDsChiPhi(cp.data || []); setLoaiChiPhis(lcp.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { nap() }, [nap])

  function moModalGhi() {
    setNgayPhatSinh(homNay()); setLoaiChiPhiId(''); setChiNhanhChon(''); setSoTien(''); setMoTa('')
    setMoGhi(true)
  }

  async function ghiChiPhi() {
    if (!loaiChiPhiId || !(Number(soTien) > 0)) { setLoi('Chọn loại chi phí và nhập số tiền lớn hơn 0.'); return }
    setDangLuu(true); setLoi(null)
    try {
      const { error } = await supabase.from('chi_phi').insert({
        loai_chi_phi_id: loaiChiPhiId,
        chi_nhanh_id: chiNhanhChon || null,
        so_tien: Number(soTien),
        ngay_phat_sinh: ngayPhatSinh,
        mo_ta: moTa || null
      })
      if (error) throw error
      setMoGhi(false)
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function themLoaiMoi() {
    if (!tenLoaiMoi.trim()) { setLoi('Chưa điền tên loại chi phí.'); return }
    setDangLuu(true); setLoi(null)
    try {
      const { data, error } = await supabase.from('loai_chi_phi')
        .insert({ ten_loai: tenLoaiMoi.trim(), nhom: nhomLoaiMoi })
        .select('id, ten_loai, nhom').single()
      if (error) throw error
      setLoaiChiPhis(ds => [...ds, data].sort((a, b) => a.ten_loai.localeCompare(b.ten_loai, 'vi')))
      setLoaiChiPhiId(data.id)
      setMoLoaiMoi(false); setTenLoaiMoi(''); setNhomLoaiMoi('van_hanh')
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const duocGhi = coQuyen('tai_chinh', 'tao')
  const duocTaoDanhMuc = coQuyen('tai_chinh', 'tao', null)

  return (
    <Trang
      tieuDe="Chi phí vận hành"
      mota="Ghi nhận là tự động hạch toán Nợ 642 (Chi phí quản lý vận hành) / Có 111 (Tiền mặt)"
      hanhDong={duocGhi && (
        <button className="btn btn-primary" onClick={moModalGhi}>+ Ghi chi phí</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={dsChiPhi}
            trong="Chưa có chi phí nào được ghi"
            cot={[
              { ten: 'Ngày', render: r => ngay(r.ngay_phat_sinh) },
              { ten: 'Loại chi phí', render: r => (
                <>
                  {r.loai_chi_phi?.ten_loai}
                  <div className="small text-secondary">{NHOM_CHI_PHI[r.loai_chi_phi?.nhom] || r.loai_chi_phi?.nhom}</div>
                </>
              ) },
              { ten: 'Chi nhánh', render: r => r.chi_nhanh?.ten_chi_nhanh || 'Toàn công ty' },
              { ten: 'Số tiền', lop: 'text-end', render: r => <span className="fw-semibold">{tien(r.so_tien)}</span> },
              { ten: 'Mô tả', render: r => r.mo_ta || '—' },
              { ten: 'Người lập', render: r => r.nguoi_lap_email || '—' }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moGhi} tieuDe="Ghi chi phí vận hành"
        onDong={() => setMoGhi(false)} onLuu={ghiChiPhi} dangLuu={dangLuu}
      >
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Ngày phát sinh</label>
            <input type="date" className="form-control" value={ngayPhatSinh}
              onChange={e => setNgayPhatSinh(e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Chi nhánh</label>
            <select className="form-select" value={chiNhanhChon} onChange={e => setChiNhanhChon(e.target.value)}>
              <option value="">— Toàn công ty —</option>
              {chiNhanhs.map(c => <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>)}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">Loại chi phí</label>
            <div className="d-flex gap-2">
              <select className="form-select" value={loaiChiPhiId} onChange={e => setLoaiChiPhiId(e.target.value)}>
                <option value="">— Chọn loại chi phí —</option>
                {loaiChiPhis.map(l => (
                  <option key={l.id} value={l.id}>{l.ten_loai} ({NHOM_CHI_PHI[l.nhom] || l.nhom})</option>
                ))}
              </select>
              {duocTaoDanhMuc && (
                <button type="button" className="btn btn-outline-secondary text-nowrap"
                  onClick={() => setMoLoaiMoi(true)}>+ Loại mới</button>
              )}
            </div>
          </div>
          <div className="col-md-6">
            <label className="form-label">Số tiền (₫)</label>
            <input type="number" min="0" className="form-control" value={soTien}
              onChange={e => setSoTien(e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Mô tả</label>
            <input className="form-control" value={moTa} onChange={e => setMoTa(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Modal
        mo={moLoaiMoi} tieuDe="Thêm loại chi phí mới"
        onDong={() => setMoLoaiMoi(false)} onLuu={themLoaiMoi} dangLuu={dangLuu} nhanLuu="Thêm"
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label">Tên loại chi phí *</label>
            <input className="form-control" value={tenLoaiMoi}
              onChange={e => setTenLoaiMoi(e.target.value)} autoFocus />
          </div>
          <div className="col-12">
            <label className="form-label">Nhóm</label>
            <select className="form-select" value={nhomLoaiMoi} onChange={e => setNhomLoaiMoi(e.target.value)}>
              {Object.entries(NHOM_CHI_PHI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </Trang>
  )
}
