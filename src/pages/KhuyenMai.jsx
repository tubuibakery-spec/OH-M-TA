import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal } from '../components/Chung'
import { tien, so, ngay } from '../lib/dinhDang'

const KENH = { ban_le: 'Bán lẻ', b2b: 'B2B', ca_hai: 'Cả hai' }

const MOI = {
  ten_ctkm: '', mo_ta: '', loai_giam: 'phan_tram', gia_tri_giam: '',
  ap_dung_kenh: 'ca_hai', gia_tri_don_toi_thieu: '0',
  ap_dung_tu: new Date().toISOString().slice(0, 10), ap_dung_den: ''
}

export default function KhuyenMai() {
  const { coQuyenMoiNoi } = useApp()
  const [ds, setDs] = useState([])
  const [hieuQua, setHieuQua] = useState({})
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [form, setForm] = useState(null)
  const [dangLuu, setDangLuu] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [ctkm, hq] = await Promise.all([
        supabase.from('chuong_trinh_khuyen_mai').select('*').order('created_at', { ascending: false }),
        supabase.from('hieu_qua_khuyen_mai').select('*')
      ])
      if (ctkm.error) throw ctkm.error
      if (hq.error) throw hq.error
      setDs(ctkm.data || [])
      setHieuQua(Object.fromEntries((hq.data || []).map(r => [r.khuyen_mai_id, r])))
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { nap() }, [nap])

  async function luu() {
    setDangLuu(true); setLoi(null)
    try {
      const ban = {
        ten_ctkm: form.ten_ctkm.trim(),
        mo_ta: form.mo_ta || null,
        loai_giam: form.loai_giam,
        gia_tri_giam: Number(form.gia_tri_giam || 0),
        ap_dung_kenh: form.ap_dung_kenh,
        gia_tri_don_toi_thieu: Number(form.gia_tri_don_toi_thieu || 0),
        ap_dung_tu: form.ap_dung_tu || new Date().toISOString().slice(0, 10),
        ap_dung_den: form.ap_dung_den || null
      }
      if (!ban.ten_ctkm || ban.gia_tri_giam <= 0) throw new Error('Cần điền tên và giá trị giảm > 0.')
      if (ban.loai_giam === 'phan_tram' && ban.gia_tri_giam > 100) throw new Error('Giảm theo % không được vượt quá 100.')

      const { error } = form.id
        ? await supabase.from('chuong_trinh_khuyen_mai').update(ban).eq('id', form.id)
        : await supabase.from('chuong_trinh_khuyen_mai').insert(ban)
      if (error) throw error
      setForm(null); await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function doiHoatDong(km) {
    setLoi(null)
    const { error } = await supabase.from('chuong_trinh_khuyen_mai')
      .update({ dang_hoat_dong: !km.dang_hoat_dong }).eq('id', km.id)
    if (error) setLoi(error.message)
    await nap()
  }

  const duocSua = coQuyenMoiNoi('marketing', 'sua')
  const duocTao = coQuyenMoiNoi('marketing', 'tao')

  return (
    <Trang
      tieuDe="Khuyến mãi"
      mota="Chương trình để nhân viên bán hàng chọn tại quầy — không tự động áp, luôn xác nhận trước khi tính vào hóa đơn"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setForm({ ...MOI })}>+ Tạo chương trình</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            trong="Chưa có chương trình khuyến mãi nào"
            cot={[
              { ten: 'Mã', render: r => <code>{r.ma_ctkm}</code> },
              { ten: 'Tên', render: r => (
                <>
                  {r.ten_ctkm}
                  {r.mo_ta && <div className="small text-secondary">{r.mo_ta}</div>}
                </>
              ) },
              { ten: 'Giảm', render: r => r.loai_giam === 'phan_tram' ? `${so(r.gia_tri_giam)}%` : tien(r.gia_tri_giam) },
              { ten: 'Kênh', render: r => KENH[r.ap_dung_kenh] },
              { ten: 'Đơn tối thiểu', lop: 'text-end', render: r =>
                  Number(r.gia_tri_don_toi_thieu) > 0 ? tien(r.gia_tri_don_toi_thieu) : '—' },
              { ten: 'Thời gian', render: r => (
                <span className="small">{ngay(r.ap_dung_tu)} → {r.ap_dung_den ? ngay(r.ap_dung_den) : 'không giới hạn'}</span>
              ) },
              { ten: 'Đã dùng', lop: 'text-end', render: r => {
                  const hq = hieuQua[r.id]
                  const soLan = (hq?.so_hoa_don_ban_le || 0) + (hq?.so_don_b2b || 0)
                  return soLan > 0 ? `${soLan} lượt` : '—'
              } },
              { ten: 'Trạng thái', render: r => (
                <span className={`badge text-bg-${r.dang_hoat_dong ? 'success' : 'secondary'}`}>
                  {r.dang_hoat_dong ? 'Đang chạy' : 'Tạm dừng'}
                </span>
              ) },
              { ten: '', lop: 'text-end', render: r => duocSua && (
                <div className="d-flex gap-1 justify-content-end">
                  <button className="btn btn-sm btn-outline-secondary"
                    onClick={() => setForm({
                      ...r,
                      gia_tri_giam: String(r.gia_tri_giam),
                      gia_tri_don_toi_thieu: String(r.gia_tri_don_toi_thieu ?? 0),
                      ap_dung_den: r.ap_dung_den || ''
                    })}>Sửa</button>
                  <button className="btn btn-sm btn-outline-warning" onClick={() => doiHoatDong(r)}>
                    {r.dang_hoat_dong ? 'Dừng' : 'Bật lại'}
                  </button>
                </div>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!form}
        tieuDe={form?.id ? 'Sửa chương trình khuyến mãi' : 'Tạo chương trình khuyến mãi'}
        onDong={() => setForm(null)} onLuu={luu} dangLuu={dangLuu}
      >
        {form && (
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label">Tên chương trình *</label>
              <input className="form-control" value={form.ten_ctkm}
                onChange={e => setForm({ ...form, ten_ctkm: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label">Mô tả</label>
              <input className="form-control" value={form.mo_ta || ''}
                onChange={e => setForm({ ...form, mo_ta: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Loại giảm</label>
              <select className="form-select" value={form.loai_giam}
                onChange={e => setForm({ ...form, loai_giam: e.target.value })}>
                <option value="phan_tram">Theo %</option>
                <option value="so_tien">Số tiền cố định</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Giá trị giảm *</label>
              <input type="number" min="0" max={form.loai_giam === 'phan_tram' ? 100 : undefined}
                className="form-control" value={form.gia_tri_giam}
                onChange={e => setForm({ ...form, gia_tri_giam: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Áp dụng kênh</label>
              <select className="form-select" value={form.ap_dung_kenh}
                onChange={e => setForm({ ...form, ap_dung_kenh: e.target.value })}>
                {Object.entries(KENH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Giá trị đơn tối thiểu (₫)</label>
              <input type="number" min="0" className="form-control" value={form.gia_tri_don_toi_thieu}
                onChange={e => setForm({ ...form, gia_tri_don_toi_thieu: e.target.value })} />
              <div className="form-text">0 = không yêu cầu</div>
            </div>
            <div className="col-md-3">
              <label className="form-label">Áp dụng từ</label>
              <input type="date" className="form-control" value={form.ap_dung_tu}
                onChange={e => setForm({ ...form, ap_dung_tu: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Đến (bỏ trống = không giới hạn)</label>
              <input type="date" className="form-control" value={form.ap_dung_den}
                onChange={e => setForm({ ...form, ap_dung_den: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
