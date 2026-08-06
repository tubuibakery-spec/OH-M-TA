import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal } from '../components/Chung'
import { tien, so, ngay } from '../lib/dinhDang'

const MOI = {
  vat_tu_id: '', nha_cung_cap_id: '', don_gia: '', don_vi_mua: '',
  he_so_quy_doi: '1', so_luong_toi_thieu: '0', buoc_dat: '1',
  la_ncc_chinh: false, ap_dung_tu: new Date().toISOString().slice(0, 10)
}

export default function BangGiaNhaCungCap() {
  const { coQuyenMoiNoi, coQuyen } = useApp()
  const [ds, setDs] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [nccs, setNccs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [locVatTu, setLocVatTu] = useState('')
  const [locNcc, setLocNcc] = useState('')
  const [hienCaCu, setHienCaCu] = useState(false)

  const [form, setForm] = useState(null)
  const [dangLuu, setDangLuu] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [g, vt, ncc] = await Promise.all([
        supabase.from('gia_nha_cung_cap')
          .select('id, vat_tu_id, nha_cung_cap_id, don_gia, don_vi_mua, he_so_quy_doi, so_luong_toi_thieu, buoc_dat, la_ncc_chinh, ap_dung_tu, dang_ap_dung, vat_tu(ten_vat_tu, ma_vat_tu, loai_vat_tu, trang_thai, don_vi_tinh(ma_dvt)), nha_cung_cap(ten_ncc)')
          .order('ap_dung_tu', { ascending: false }),
        supabase.from('vat_tu').select('id, ma_vat_tu, ten_vat_tu, loai_vat_tu, trang_thai').order('ten_vat_tu'),
        supabase.from('nha_cung_cap').select('id, ma_ncc, ten_ncc').order('ten_ncc')
      ])
      if (g.error) throw g.error
      if (vt.error) throw vt.error
      if (ncc.error) throw ncc.error
      setDs(g.data || []); setVatTus(vt.data || []); setNccs(ncc.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { nap() }, [nap])

  const dsLoc = useMemo(() => ds.filter(r =>
    (hienCaCu || r.dang_ap_dung) &&
    (!locVatTu || r.vat_tu_id === locVatTu) &&
    (!locNcc || r.nha_cung_cap_id === locNcc)
  ), [ds, hienCaCu, locVatTu, locNcc])

  const vatTuThieuNccChinh = useMemo(() => {
    const coNccChinh = new Set(ds.filter(r => r.dang_ap_dung && r.la_ncc_chinh).map(r => r.vat_tu_id))
    return vatTus.filter(v => v.trang_thai !== 'ngung_su_dung' && !coNccChinh.has(v.id))
  }, [ds, vatTus])

  async function luu() {
    setDangLuu(true); setLoi(null)
    try {
      if (!form.vat_tu_id || !form.nha_cung_cap_id) throw new Error('Cần chọn vật tư và nhà cung cấp.')
      if (!(Number(form.don_gia) >= 0)) throw new Error('Đơn giá không hợp lệ.')

      if (form.la_ncc_chinh) {
        let q = supabase.from('gia_nha_cung_cap')
          .update({ la_ncc_chinh: false })
          .eq('vat_tu_id', form.vat_tu_id).eq('la_ncc_chinh', true)
        if (form.id) q = q.neq('id', form.id)
        const { error: eBo } = await q
        if (eBo) throw eBo
      }

      const ban = {
        vat_tu_id: form.vat_tu_id,
        nha_cung_cap_id: form.nha_cung_cap_id,
        don_gia: Number(form.don_gia),
        don_vi_mua: form.don_vi_mua || null,
        he_so_quy_doi: Number(form.he_so_quy_doi || 1),
        so_luong_toi_thieu: Number(form.so_luong_toi_thieu || 0),
        buoc_dat: Number(form.buoc_dat || 1),
        la_ncc_chinh: !!form.la_ncc_chinh,
        ap_dung_tu: form.ap_dung_tu,
        dang_ap_dung: form.dang_ap_dung ?? true
      }
      const { error } = form.id
        ? await supabase.from('gia_nha_cung_cap').update(ban).eq('id', form.id)
        : await supabase.from('gia_nha_cung_cap').insert(ban)
      if (error) throw error
      setForm(null); await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function ngungApDung(r) {
    if (!confirm(`Ngừng áp dụng giá này (${r.vat_tu?.ten_vat_tu} — ${r.nha_cung_cap?.ten_ncc})?`)) return
    setLoi(null)
    const { error } = await supabase.from('gia_nha_cung_cap').update({ dang_ap_dung: false }).eq('id', r.id)
    if (error) setLoi(error.message)
    await nap()
  }

  const duocTao = coQuyen('mua_hang', 'tao', null)
  const duocSua = coQuyen('mua_hang', 'sua', null)

  return (
    <Trang
      tieuDe="Bảng giá Nhà cung cấp"
      mota="Nguồn dữ liệu bắt buộc để Đề xuất đặt hàng tính đúng giá — mỗi vật tư cần đúng 1 NCC chính."
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setForm({ ...MOI })}>+ Thêm giá NCC</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {!dangTai && vatTuThieuNccChinh.length > 0 && (
        <div className="alert alert-warning small">
          ⚠️ {vatTuThieuNccChinh.length} vật tư chưa có NCC chính — Đề xuất đặt hàng sẽ không tính được giá:{' '}
          {vatTuThieuNccChinh.slice(0, 10).map(v => v.ten_vat_tu).join(', ')}
          {vatTuThieuNccChinh.length > 10 ? '…' : ''}
        </div>
      )}

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body d-flex flex-wrap gap-3 align-items-end">
          <div>
            <label className="form-label mb-0 small">Lọc theo vật tư</label>
            <select className="form-select form-select-sm" value={locVatTu} onChange={e => setLocVatTu(e.target.value)}>
              <option value="">— Tất cả —</option>
              {vatTus.map(v => <option key={v.id} value={v.id}>{v.ten_vat_tu}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label mb-0 small">Lọc theo NCC</label>
            <select className="form-select form-select-sm" value={locNcc} onChange={e => setLocNcc(e.target.value)}>
              <option value="">— Tất cả —</option>
              {nccs.map(n => <option key={n.id} value={n.id}>{n.ten_ncc}</option>)}
            </select>
          </div>
          <div className="form-check ms-auto">
            <input className="form-check-input" type="checkbox" id="hienCaCu"
              checked={hienCaCu} onChange={e => setHienCaCu(e.target.checked)} />
            <label className="form-check-label small" htmlFor="hienCaCu">Hiện cả giá đã ngừng áp dụng</label>
          </div>
        </div>
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={dsLoc}
            trong="Chưa có dòng giá nào"
            cot={[
              { ten: 'Vật tư', render: r => r.vat_tu?.ten_vat_tu },
              { ten: 'NCC', render: r => r.nha_cung_cap?.ten_ncc },
              { ten: 'Đơn giá', lop: 'text-end', render: r => tien(r.don_gia) },
              { ten: 'Đơn vị mua', render: r => r.don_vi_mua || r.vat_tu?.don_vi_tinh?.ma_dvt || '—' },
              { ten: 'Hệ số quy đổi', lop: 'text-end', render: r => so(r.he_so_quy_doi) },
              { ten: 'MOQ dòng', lop: 'text-end', render: r => so(r.so_luong_toi_thieu) },
              { ten: 'Bước đặt', lop: 'text-end', render: r => so(r.buoc_dat) },
              { ten: 'NCC chính', render: r => r.la_ncc_chinh ? '★' : '' },
              { ten: 'Áp dụng từ', render: r => ngay(r.ap_dung_tu) },
              { ten: '', lop: 'text-end', render: r => duocSua && (
                <div className="d-flex gap-1 justify-content-end">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setForm({
                    ...r,
                    don_gia: String(r.don_gia),
                    he_so_quy_doi: String(r.he_so_quy_doi),
                    so_luong_toi_thieu: String(r.so_luong_toi_thieu),
                    buoc_dat: String(r.buoc_dat),
                    don_vi_mua: r.don_vi_mua || ''
                  })}>Sửa</button>
                  {r.dang_ap_dung && (
                    <button className="btn btn-sm btn-outline-danger" onClick={() => ngungApDung(r)}>Ngừng áp dụng</button>
                  )}
                </div>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!form}
        tieuDe={form?.id ? 'Sửa giá NCC' : 'Thêm giá NCC'}
        onDong={() => setForm(null)} onLuu={luu} dangLuu={dangLuu}
      >
        {form && (
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Vật tư *</label>
              <select className="form-select" value={form.vat_tu_id}
                onChange={e => setForm({ ...form, vat_tu_id: e.target.value })}>
                <option value="">— Chọn vật tư —</option>
                {vatTus.map(v => <option key={v.id} value={v.id}>{v.ten_vat_tu}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Nhà cung cấp *</label>
              <select className="form-select" value={form.nha_cung_cap_id}
                onChange={e => setForm({ ...form, nha_cung_cap_id: e.target.value })}>
                <option value="">— Chọn NCC —</option>
                {nccs.map(n => <option key={n.id} value={n.id}>{n.ten_ncc}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Đơn giá (₫) *</label>
              <input type="number" min="0" className="form-control" value={form.don_gia}
                onChange={e => setForm({ ...form, don_gia: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Đơn vị mua</label>
              <input className="form-control" placeholder="vd thùng" value={form.don_vi_mua}
                onChange={e => setForm({ ...form, don_vi_mua: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Hệ số quy đổi</label>
              <input type="number" min="0.001" step="0.001" className="form-control" value={form.he_so_quy_doi}
                onChange={e => setForm({ ...form, he_so_quy_doi: e.target.value })} />
              <div className="form-text">VD mua "thùng 12 chai" → 12</div>
            </div>
            <div className="col-md-4">
              <label className="form-label">MOQ dòng (đơn vị mua)</label>
              <input type="number" min="0" step="0.001" className="form-control" value={form.so_luong_toi_thieu}
                onChange={e => setForm({ ...form, so_luong_toi_thieu: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Bước đặt</label>
              <input type="number" min="0.001" step="0.001" className="form-control" value={form.buoc_dat}
                onChange={e => setForm({ ...form, buoc_dat: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Áp dụng từ</label>
              <input type="date" className="form-control" value={form.ap_dung_tu}
                onChange={e => setForm({ ...form, ap_dung_tu: e.target.value })} />
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="laNccChinh"
                  checked={!!form.la_ncc_chinh}
                  onChange={e => setForm({ ...form, la_ncc_chinh: e.target.checked })} />
                <label className="form-check-label" htmlFor="laNccChinh">Là NCC chính</label>
              </div>
              <div className="form-text">Chọn ô này sẽ tự bỏ NCC chính hiện tại của vật tư (mỗi vật tư chỉ 1 NCC chính).</div>
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
