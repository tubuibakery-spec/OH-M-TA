import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { so, ngayGio } from '../lib/dinhDang'

const LOAI_XUAT = [
  { gt: 'dieu_chuyen', nhan: 'Điều chuyển sang chi nhánh khác' },
  { gt: 'huy_hang', nhan: 'Hủy hàng / hao hụt' },
  { gt: 'tra_ncc', nhan: 'Trả hàng nhà cung cấp' },
  { gt: 'khac', nhan: 'Khác' }
]

const DONG_TRONG = { vat_tu_id: '', so_luong: '', don_gia: '' }

export default function XuatKho() {
  const { chiNhanhId, chiNhanhs, coQuyen } = useApp()
  const [phieu, setPhieu] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [lyDos, setLyDos] = useState([])
  const [nccs, setNccs] = useState([])
  const [phieuNhapGocs, setPhieuNhapGocs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [moTao, setMoTao] = useState(false)
  const [dangLuu, setDangLuu] = useState(false)
  const [form, setForm] = useState({ loai_xuat: 'dieu_chuyen', kho_nhan_id: '', ly_do_huy_id: '', nha_cung_cap_id: '', phieu_nhap_goc_id: '' })
  const [dongCt, setDongCt] = useState([{ ...DONG_TRONG }])

  const tenChiNhanh = id => chiNhanhs.find(c => c.id === id)?.ten_chi_nhanh || '—'

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    try {
      const [p, v, l, n] = await Promise.all([
        supabase.from('phieu_xuat_kho')
          .select('id, so_phieu, loai_xuat, ngay_xuat, trang_thai, kho_xuat_id, kho_nhan_id')
          .or(`kho_xuat_id.eq.${chiNhanhId},kho_nhan_id.eq.${chiNhanhId}`)
          .order('ngay_xuat', { ascending: false }).limit(100),
        supabase.from('vat_tu').select('id, ten_vat_tu, don_vi_tinh(ma_dvt)')
          .eq('trang_thai', 'hoat_dong').order('ten_vat_tu'),
        supabase.from('ly_do_huy').select('id, ten, nhom').order('ten'),
        supabase.from('nha_cung_cap').select('id, ten_ncc').eq('trang_thai', 'hoat_dong').order('ten_ncc')
      ])
      for (const r of [p, v, l, n]) if (r.error) throw r.error
      setPhieu(p.data || []); setVatTus(v.data || []); setLyDos(l.data || []); setNccs(n.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  useEffect(() => {
    if (form.loai_xuat !== 'tra_ncc' || !form.nha_cung_cap_id) { setPhieuNhapGocs([]); return }
    supabase.from('phieu_nhap_kho')
      .select('id, so_phieu, tong_tien')
      .eq('nha_cung_cap_id', form.nha_cung_cap_id)
      .eq('trang_thai', 'da_duyet')
      .order('ngay_nhap', { ascending: false }).limit(20)
      .then(({ data, error }) => { if (error) setLoi(error.message); setPhieuNhapGocs(data || []) })
  }, [form.loai_xuat, form.nha_cung_cap_id])

  async function luuPhieu() {
    const hopLe = dongCt.filter(d => d.vat_tu_id && Number(d.so_luong) > 0)
    if (!hopLe.length) { setLoi('Cần ít nhất một dòng có vật tư và số lượng > 0.'); return }
    if (form.loai_xuat === 'dieu_chuyen' && !form.kho_nhan_id) {
      setLoi('Điều chuyển thì phải chọn kho nhận.'); return
    }
    setDangLuu(true); setLoi(null)
    try {
      const { data: p, error: e1 } = await supabase.from('phieu_xuat_kho').insert({
        kho_xuat_id: chiNhanhId,
        loai_xuat: form.loai_xuat,
        kho_nhan_id: form.loai_xuat === 'dieu_chuyen' ? form.kho_nhan_id : null,
        ly_do_huy_id: form.loai_xuat === 'huy_hang' ? (form.ly_do_huy_id || null) : null,
        nha_cung_cap_id: form.loai_xuat === 'tra_ncc' ? (form.nha_cung_cap_id || null) : null,
        phieu_nhap_goc_id: form.loai_xuat === 'tra_ncc' ? (form.phieu_nhap_goc_id || null) : null
      }).select('id').single()
      if (e1) throw e1

      const { error: e2 } = await supabase.from('chi_tiet_phieu_xuat').insert(
        hopLe.map(d => ({
          phieu_xuat_id: p.id,
          vat_tu_id: d.vat_tu_id,
          so_luong: Number(d.so_luong),
          don_gia: form.loai_xuat === 'tra_ncc' ? Number(d.don_gia || 0) : null
        }))
      )
      if (e2) throw e2

      setMoTao(false)
      setForm({ loai_xuat: 'dieu_chuyen', kho_nhan_id: '', ly_do_huy_id: '', nha_cung_cap_id: '', phieu_nhap_goc_id: '' })
      setDongCt([{ ...DONG_TRONG }])
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function doiTrangThai(p, tt, canhBao) {
    if (canhBao && !confirm(canhBao)) return
    setLoi(null)
    const { error } = await supabase.from('phieu_xuat_kho').update({ trang_thai: tt }).eq('id', p.id)
    if (error) setLoi(error.message)
    await napDs()
  }

  const duocTao = coQuyen('kho', 'tao')
  const duocSua = coQuyen('kho', 'sua')

  return (
    <Trang
      tieuDe="Xuất kho / Điều chuyển"
      mota="Kho chỉ bị trừ khi bấm Gửi. Điều chuyển giữ nguyên lô sang kho nhận."
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Tạo phiếu xuất</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={phieu}
            trong="Chưa có phiếu xuất nào"
            cot={[
              { ten: 'Số phiếu', render: r => r.so_phieu },
              { ten: 'Ngày', render: r => ngayGio(r.ngay_xuat) },
              { ten: 'Loại', render: r => LOAI_XUAT.find(l => l.gt === r.loai_xuat)?.nhan || r.loai_xuat },
              { ten: 'Từ → Đến', render: r => (
                <span className="small">
                  {tenChiNhanh(r.kho_xuat_id)}
                  {r.kho_nhan_id && <> → {tenChiNhanh(r.kho_nhan_id)}</>}
                </span>
              ) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
              { ten: '', lop: 'text-end', render: r => {
                if (!duocSua) return null
                if (r.trang_thai === 'nhap' && r.kho_xuat_id === chiNhanhId) {
                  return <button className="btn btn-sm btn-warning"
                    onClick={() => doiTrangThai(r, 'da_gui', `Gửi phiếu ${r.so_phieu}? Kho sẽ bị trừ ngay.`)}>
                    Gửi
                  </button>
                }
                if (r.trang_thai === 'da_gui' && r.loai_xuat === 'dieu_chuyen' && r.kho_nhan_id === chiNhanhId) {
                  return <button className="btn btn-sm btn-success"
                    onClick={() => doiTrangThai(r, 'da_nhan', `Xác nhận đã nhận đủ hàng của phiếu ${r.so_phieu}?`)}>
                    Nhận hàng
                  </button>
                }
                return null
              } }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moTao} rong tieuDe="Tạo phiếu xuất"
        onDong={() => setMoTao(false)}
        onLuu={luuPhieu} dangLuu={dangLuu} nhanLuu="Lưu phiếu nháp"
      >
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">Loại xuất</label>
            <select className="form-select" value={form.loai_xuat}
              onChange={e => setForm({ ...form, loai_xuat: e.target.value })}>
              {LOAI_XUAT.map(l => <option key={l.gt} value={l.gt}>{l.nhan}</option>)}
            </select>
          </div>

          {form.loai_xuat === 'dieu_chuyen' && (
            <div className="col-md-6">
              <label className="form-label">Kho nhận</label>
              <select className="form-select" value={form.kho_nhan_id}
                onChange={e => setForm({ ...form, kho_nhan_id: e.target.value })}>
                <option value="">— Chọn —</option>
                {chiNhanhs.filter(c => c.id !== chiNhanhId).map(c => (
                  <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>
                ))}
              </select>
            </div>
          )}

          {form.loai_xuat === 'huy_hang' && (
            <div className="col-md-6">
              <label className="form-label">Lý do hủy</label>
              <select className="form-select" value={form.ly_do_huy_id}
                onChange={e => setForm({ ...form, ly_do_huy_id: e.target.value })}>
                <option value="">— Chọn —</option>
                {lyDos.map(l => <option key={l.id} value={l.id}>{l.ten}</option>)}
              </select>
            </div>
          )}

          {form.loai_xuat === 'tra_ncc' && (
            <div className="col-md-6">
              <label className="form-label">Trả cho nhà cung cấp</label>
              <select className="form-select" value={form.nha_cung_cap_id}
                onChange={e => setForm({ ...form, nha_cung_cap_id: e.target.value, phieu_nhap_goc_id: '' })}>
                <option value="">— Chọn —</option>
                {nccs.map(n => <option key={n.id} value={n.id}>{n.ten_ncc}</option>)}
              </select>
            </div>
          )}

          {form.loai_xuat === 'tra_ncc' && form.nha_cung_cap_id && (
            <div className="col-md-6">
              <label className="form-label">Phiếu nhập gốc (không bắt buộc)</label>
              <select className="form-select" value={form.phieu_nhap_goc_id}
                onChange={e => setForm({ ...form, phieu_nhap_goc_id: e.target.value })}>
                <option value="">— Không gắn phiếu nhập cụ thể —</option>
                {phieuNhapGocs.map(p => <option key={p.id} value={p.id}>{p.so_phieu}</option>)}
              </select>
            </div>
          )}
        </div>

        <table className="table table-sm align-middle">
          <thead className="table-light">
            <tr>
              <th style={{ minWidth: 240 }}>Vật tư</th>
              <th style={{ width: 140 }}>Số lượng</th>
              {form.loai_xuat === 'tra_ncc' && <th style={{ width: 140 }}>Đơn giá</th>}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {dongCt.map((d, i) => (
              <tr key={i}>
                <td>
                  <select className="form-select form-select-sm" value={d.vat_tu_id}
                    onChange={e => setDongCt(dongCt.map((r, j) => j === i ? { ...r, vat_tu_id: e.target.value } : r))}>
                    <option value="">— Chọn vật tư —</option>
                    {vatTus.map(v => (
                      <option key={v.id} value={v.id}>{v.ten_vat_tu} ({v.don_vi_tinh?.ma_dvt})</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="number" step="0.001" min="0" className="form-control form-control-sm"
                    value={d.so_luong}
                    onChange={e => setDongCt(dongCt.map((r, j) => j === i ? { ...r, so_luong: e.target.value } : r))} />
                </td>
                {form.loai_xuat === 'tra_ncc' && (
                  <td>
                    <input type="number" step="1" min="0" className="form-control form-control-sm"
                      value={d.don_gia}
                      onChange={e => setDongCt(dongCt.map((r, j) => j === i ? { ...r, don_gia: e.target.value } : r))} />
                  </td>
                )}
                <td>
                  <button className="btn btn-sm btn-outline-danger"
                    onClick={() => setDongCt(dongCt.filter((_, j) => j !== i))}
                    disabled={dongCt.length === 1}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-sm btn-outline-secondary"
          onClick={() => setDongCt([...dongCt, { ...DONG_TRONG }])}>+ Thêm dòng</button>

        <div className="alert alert-secondary small mt-3 mb-0">
          Không cần chọn lô — hệ thống tự xuất theo FEFO (lô hết hạn sớm nhất đi trước).
        </div>
      </Modal>
    </Trang>
  )
}
