import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal } from '../components/Chung'
import { so, tien } from '../lib/dinhDang'

const LOAI = {
  nguyen_vat_lieu: 'Nguyên vật liệu',
  ban_thanh_pham: 'Bán thành phẩm',
  thanh_pham: 'Thành phẩm'
}

const MOI = {
  ma_vat_tu: '', ten_vat_tu: '', loai_vat_tu: 'nguyen_vat_lieu',
  don_vi_tinh_id: '', ton_toi_thieu: '0', han_su_dung_ngay: '', duoc_ban: false
}

export default function VatTu() {
  const { coQuyenMoiNoi } = useApp()
  const [ds, setDs] = useState([])
  const [dvts, setDvts] = useState([])
  const [tim, setTim] = useState('')
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [form, setForm] = useState(null)
  const [dangLuu, setDangLuu] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    const [v, d] = await Promise.all([
      supabase.from('vat_tu')
        .select('id, ma_vat_tu, ten_vat_tu, loai_vat_tu, ton_toi_thieu, han_su_dung_ngay, duoc_ban, gia_von_gan_nhat, trang_thai, don_vi_tinh_id, don_vi_tinh(ma_dvt)')
        .order('ten_vat_tu'),
      supabase.from('don_vi_tinh').select('id, ma_dvt, ten_dvt').order('ma_dvt')
    ])
    if (v.error) setLoi(v.error.message)
    if (d.error) setLoi(d.error.message)
    setDs(v.data || []); setDvts(d.data || []); setDangTai(false)
  }, [])

  useEffect(() => { nap() }, [nap])

  async function luu() {
    setDangLuu(true); setLoi(null)
    try {
      const ban = {
        ma_vat_tu: form.ma_vat_tu.trim(),
        ten_vat_tu: form.ten_vat_tu.trim(),
        loai_vat_tu: form.loai_vat_tu,
        don_vi_tinh_id: form.don_vi_tinh_id,
        ton_toi_thieu: Number(form.ton_toi_thieu || 0),
        han_su_dung_ngay: form.han_su_dung_ngay ? Number(form.han_su_dung_ngay) : null,
        duoc_ban: !!form.duoc_ban
      }
      if (!ban.ma_vat_tu || !ban.ten_vat_tu || !ban.don_vi_tinh_id) {
        throw new Error('Cần điền mã, tên và đơn vị tính.')
      }
      const { error } = form.id
        ? await supabase.from('vat_tu').update(ban).eq('id', form.id)
        : await supabase.from('vat_tu').insert(ban)
      if (error) throw error
      setForm(null); await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const duocSua = coQuyenMoiNoi('danh_muc', 'sua')
  const duocTao = coQuyenMoiNoi('danh_muc', 'tao')
  const loc = ds.filter(r => !tim.trim() ||
    `${r.ma_vat_tu} ${r.ten_vat_tu}`.toLowerCase().includes(tim.toLowerCase()))

  return (
    <Trang
      tieuDe="Vật tư"
      mota="Chỉ vật tư bật “Được bán” mới lên được hóa đơn bán hàng"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setForm({ ...MOI })}>+ Thêm vật tư</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="mb-3" style={{ maxWidth: 360 }}>
        <input className="form-control" placeholder="Tìm mã hoặc tên…"
          value={tim} onChange={e => setTim(e.target.value)} />
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={loc}
            trong="Chưa có vật tư nào"
            cot={[
              { ten: 'Mã', render: r => <code>{r.ma_vat_tu}</code> },
              { ten: 'Tên', render: r => r.ten_vat_tu },
              { ten: 'Loại', render: r => LOAI[r.loai_vat_tu] || r.loai_vat_tu },
              { ten: 'ĐVT', render: r => r.don_vi_tinh?.ma_dvt },
              { ten: 'Tồn tối thiểu', lop: 'text-end', render: r => so(r.ton_toi_thieu) },
              { ten: 'HSD (ngày)', lop: 'text-end', render: r => r.han_su_dung_ngay ?? '—' },
              { ten: 'Được bán', render: r => r.duoc_ban
                  ? <span className="badge text-bg-success">Có</span>
                  : <span className="badge text-bg-secondary">Không</span> },
              { ten: 'Giá vốn', lop: 'text-end', render: r => tien(r.gia_von_gan_nhat) },
              { ten: '', lop: 'text-end', render: r => duocSua && (
                <button className="btn btn-sm btn-outline-secondary"
                  onClick={() => setForm({
                    ...r,
                    ton_toi_thieu: String(r.ton_toi_thieu ?? 0),
                    han_su_dung_ngay: r.han_su_dung_ngay ?? ''
                  })}>Sửa</button>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!form}
        tieuDe={form?.id ? 'Sửa vật tư' : 'Thêm vật tư'}
        onDong={() => setForm(null)} onLuu={luu} dangLuu={dangLuu}
      >
        {form && (
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Mã vật tư *</label>
              <input className="form-control" value={form.ma_vat_tu}
                onChange={e => setForm({ ...form, ma_vat_tu: e.target.value })} />
            </div>
            <div className="col-md-8">
              <label className="form-label">Tên vật tư *</label>
              <input className="form-control" value={form.ten_vat_tu}
                onChange={e => setForm({ ...form, ten_vat_tu: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Loại</label>
              <select className="form-select" value={form.loai_vat_tu}
                onChange={e => setForm({ ...form, loai_vat_tu: e.target.value })}>
                {Object.entries(LOAI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Đơn vị tính *</label>
              <select className="form-select" value={form.don_vi_tinh_id}
                onChange={e => setForm({ ...form, don_vi_tinh_id: e.target.value })}>
                <option value="">— Chọn —</option>
                {dvts.map(d => <option key={d.id} value={d.id}>{d.ma_dvt} — {d.ten_dvt}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Tồn tối thiểu</label>
              <input type="number" step="0.001" min="0" className="form-control"
                value={form.ton_toi_thieu}
                onChange={e => setForm({ ...form, ton_toi_thieu: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Hạn dùng (số ngày)</label>
              <input type="number" min="0" className="form-control"
                value={form.han_su_dung_ngay}
                onChange={e => setForm({ ...form, han_su_dung_ngay: e.target.value })} />
              <div className="form-text">Có giá trị thì hệ thống tự tính HSD cho lô sản xuất.</div>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input type="checkbox" className="form-check-input" id="duocBan"
                  checked={!!form.duoc_ban}
                  onChange={e => setForm({ ...form, duoc_ban: e.target.checked })} />
                <label className="form-check-label" htmlFor="duocBan">
                  Được bán — cho phép xuất hiện trên hóa đơn bán hàng
                </label>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
