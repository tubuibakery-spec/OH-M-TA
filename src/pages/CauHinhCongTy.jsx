import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, DangTai, Loi } from '../components/Chung'

const MOI = {
  ten_cong_ty: '', ma_so_thue: '', dia_chi: '',
  dai_dien_phap_luat: '', chuc_vu_dai_dien: '', so_dien_thoai: '', don_vi_tien_te: 'VND',
  han_muc_duyet_don_mua: ''
}

export default function CauHinhCongTy() {
  const { coQuyen } = useApp()
  const [form, setForm] = useState(MOI)
  const [dangTai, setDangTai] = useState(true)
  const [dangLuu, setDangLuu] = useState(false)
  const [loi, setLoi] = useState(null)
  const [luuXong, setLuuXong] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase.from('cau_hinh_cong_ty').select('*').eq('id', 1).maybeSingle()
    if (error) setLoi(error.message)
    if (data) setForm({ ...MOI, ...data, han_muc_duyet_don_mua: data.han_muc_duyet_don_mua ?? '' })
    setDangTai(false)
  }, [])

  useEffect(() => { nap() }, [nap])

  function sua(truong, gt) {
    setForm(f => ({ ...f, [truong]: gt }))
    setLuuXong(false)
  }

  async function luu() {
    setDangLuu(true); setLoi(null); setLuuXong(false)
    try {
      const { error } = await supabase.from('cau_hinh_cong_ty').update({
        ten_cong_ty: form.ten_cong_ty || null,
        ma_so_thue: form.ma_so_thue || null,
        dia_chi: form.dia_chi || null,
        dai_dien_phap_luat: form.dai_dien_phap_luat || null,
        chuc_vu_dai_dien: form.chuc_vu_dai_dien || null,
        so_dien_thoai: form.so_dien_thoai || null,
        don_vi_tien_te: form.don_vi_tien_te || 'VND',
        han_muc_duyet_don_mua: form.han_muc_duyet_don_mua === '' ? null : Number(form.han_muc_duyet_don_mua)
      }).eq('id', 1)
      if (error) throw error
      setLuuXong(true)
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const duocSua = coQuyen('he_thong', 'sua', null)

  if (dangTai) return <DangTai />

  return (
    <Trang tieuDe="Cấu hình công ty" mota="Thông tin pháp lý hiển thị trên các mẫu báo cáo tài chính chính thức (B01-DN, B02-DN, B03-DN, B09-DN)">
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="card border-0 shadow-sm" style={{ maxWidth: 640 }}>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label">Tên công ty</label>
              <input className="form-control" value={form.ten_cong_ty || ''}
                onChange={e => sua('ten_cong_ty', e.target.value)} disabled={!duocSua} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Mã số thuế</label>
              <input className="form-control" value={form.ma_so_thue || ''}
                onChange={e => sua('ma_so_thue', e.target.value)} disabled={!duocSua} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Số điện thoại</label>
              <input className="form-control" value={form.so_dien_thoai || ''}
                onChange={e => sua('so_dien_thoai', e.target.value)} disabled={!duocSua} />
            </div>
            <div className="col-12">
              <label className="form-label">Địa chỉ</label>
              <input className="form-control" value={form.dia_chi || ''}
                onChange={e => sua('dia_chi', e.target.value)} disabled={!duocSua} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Người đại diện pháp luật</label>
              <input className="form-control" value={form.dai_dien_phap_luat || ''}
                onChange={e => sua('dai_dien_phap_luat', e.target.value)} disabled={!duocSua} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Chức vụ</label>
              <input className="form-control" value={form.chuc_vu_dai_dien || ''}
                onChange={e => sua('chuc_vu_dai_dien', e.target.value)} disabled={!duocSua} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Đơn vị tiền tệ</label>
              <input className="form-control" value={form.don_vi_tien_te || 'VND'}
                onChange={e => sua('don_vi_tien_te', e.target.value)} disabled={!duocSua} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Hạn mức cần duyệt đơn mua hàng (₫)</label>
              <input type="number" min="0" className="form-control" value={form.han_muc_duyet_don_mua}
                onChange={e => sua('han_muc_duyet_don_mua', e.target.value)} disabled={!duocSua} />
              <div className="form-text">Đơn có tổng tiền vượt mức này phải gửi duyệt trước khi gửi NCC. Để trống = không bắt buộc duyệt.</div>
            </div>
          </div>

          {duocSua && (
            <div className="d-flex align-items-center gap-2 mt-4">
              <button className="btn btn-primary" onClick={luu} disabled={dangLuu}>
                {dangLuu ? 'Đang lưu…' : 'Lưu'}
              </button>
              {luuXong && <span className="text-success small">Đã lưu.</span>}
            </div>
          )}
        </div>
      </div>
    </Trang>
  )
}
