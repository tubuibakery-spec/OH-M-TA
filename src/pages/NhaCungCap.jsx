import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal } from '../components/Chung'
import { tien } from '../lib/dinhDang'

const MOI = {
  ma_ncc: '', ten_ncc: '', nguoi_lien_he: '', so_dien_thoai: '', email: '', dia_chi: '', mst: '',
  thoi_gian_giao_ngay: '1', gia_tri_don_toi_thieu: '0', ngay_dat_trong_tuan: '', diem_danh_gia: ''
}

function doTinCay(uyTin) {
  if (!uyTin || !uyTin.so_don_da_giao) return { nhan: 'Chưa đủ dữ liệu', mau: 'secondary' }
  const tyLeTre = uyTin.so_don_giao_tre / uyTin.so_don_da_giao
  const tongDaXong = uyTin.so_don_hoan_thanh + uyTin.so_don_huy
  const tyLeHuy = tongDaXong ? uyTin.so_don_huy / tongDaXong : 0
  if (tyLeTre > 0.2 || tyLeHuy > 0.15) return { nhan: 'Cần lưu ý', mau: 'danger' }
  if (tyLeTre > 0.1 || tyLeHuy > 0.05) return { nhan: 'Khá', mau: 'warning' }
  return { nhan: 'Tốt', mau: 'success' }
}

export default function NhaCungCap() {
  const { coQuyenMoiNoi } = useApp()
  const [ds, setDs] = useState([])
  const [uyTins, setUyTins] = useState({})
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [form, setForm] = useState(null)
  const [dangLuu, setDangLuu] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    const [ncc, ut] = await Promise.all([
      supabase.from('nha_cung_cap')
        .select('id, ma_ncc, ten_ncc, nguoi_lien_he, so_dien_thoai, email, dia_chi, mst, trang_thai, thoi_gian_giao_ngay, gia_tri_don_toi_thieu, ngay_dat_trong_tuan, diem_danh_gia')
        .order('ten_ncc'),
      supabase.from('diem_uy_tin_ncc').select('*')
    ])
    if (ncc.error) setLoi(ncc.error.message)
    setDs(ncc.data || [])
    setUyTins(Object.fromEntries((ut.data || []).map(u => [u.nha_cung_cap_id, u])))
    setDangTai(false)
  }, [])

  useEffect(() => { nap() }, [nap])

  async function luu() {
    setDangLuu(true); setLoi(null)
    try {
      const ban = {
        ma_ncc: form.ma_ncc.trim(),
        ten_ncc: form.ten_ncc.trim(),
        nguoi_lien_he: form.nguoi_lien_he || null,
        so_dien_thoai: form.so_dien_thoai || null,
        email: form.email || null,
        dia_chi: form.dia_chi || null,
        mst: form.mst || null,
        thoi_gian_giao_ngay: Number(form.thoi_gian_giao_ngay || 1),
        gia_tri_don_toi_thieu: Number(form.gia_tri_don_toi_thieu || 0),
        ngay_dat_trong_tuan: form.ngay_dat_trong_tuan || null,
        diem_danh_gia: form.diem_danh_gia === '' ? null : Number(form.diem_danh_gia)
      }
      if (!ban.ma_ncc || !ban.ten_ncc) throw new Error('Cần điền mã và tên nhà cung cấp.')
      const { error } = form.id
        ? await supabase.from('nha_cung_cap').update(ban).eq('id', form.id)
        : await supabase.from('nha_cung_cap').insert(ban)
      if (error) throw error
      setForm(null); await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const duocSua = coQuyenMoiNoi('danh_muc', 'sua')
  const duocTao = coQuyenMoiNoi('danh_muc', 'tao')

  return (
    <Trang
      tieuDe="Nhà cung cấp"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setForm({ ...MOI })}>+ Thêm NCC</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            trong="Chưa có nhà cung cấp nào"
            cot={[
              { ten: 'Mã', render: r => <code>{r.ma_ncc}</code> },
              { ten: 'Tên', render: r => r.ten_ncc },
              { ten: 'Liên hệ', render: r => (
                <span className="small">
                  {r.nguoi_lien_he || '—'}
                  {r.so_dien_thoai && <div className="text-secondary">{r.so_dien_thoai}</div>}
                  {r.email && <div className="text-secondary">{r.email}</div>}
                </span>
              ) },
              { ten: 'Lead time', lop: 'text-end', render: r => `${r.thoi_gian_giao_ngay} ngày` },
              { ten: 'Đơn tối thiểu', lop: 'text-end', render: r =>
                  Number(r.gia_tri_don_toi_thieu) > 0 ? tien(r.gia_tri_don_toi_thieu) : '—' },
              { ten: 'Ngày đặt', render: r => r.ngay_dat_trong_tuan || 'Mọi ngày' },
              { ten: 'Đánh giá', render: r => r.diem_danh_gia != null ? `★ ${r.diem_danh_gia}` : '—' },
              { ten: 'Độ tin cậy', render: r => {
                const { nhan, mau } = doTinCay(uyTins[r.id])
                return <span className={`badge text-bg-${mau}`} title={uyTins[r.id]
                  ? `Hoàn thành: ${uyTins[r.id].so_don_hoan_thanh} · Hủy: ${uyTins[r.id].so_don_huy} · Giao trễ: ${uyTins[r.id].so_don_giao_tre}/${uyTins[r.id].so_don_da_giao}`
                  : ''}>{nhan}</span>
              } },
              { ten: '', lop: 'text-end', render: r => duocSua && (
                <button className="btn btn-sm btn-outline-secondary"
                  onClick={() => setForm({
                    ...r,
                    thoi_gian_giao_ngay: String(r.thoi_gian_giao_ngay ?? 1),
                    gia_tri_don_toi_thieu: String(r.gia_tri_don_toi_thieu ?? 0),
                    ngay_dat_trong_tuan: r.ngay_dat_trong_tuan ?? '',
                    diem_danh_gia: r.diem_danh_gia != null ? String(r.diem_danh_gia) : ''
                  })}>Sửa</button>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!form}
        tieuDe={form?.id ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
        onDong={() => setForm(null)} onLuu={luu} dangLuu={dangLuu}
      >
        {form && (
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Mã NCC *</label>
              <input className="form-control" value={form.ma_ncc}
                onChange={e => setForm({ ...form, ma_ncc: e.target.value })} />
            </div>
            <div className="col-md-8">
              <label className="form-label">Tên nhà cung cấp *</label>
              <input className="form-control" value={form.ten_ncc}
                onChange={e => setForm({ ...form, ten_ncc: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Người liên hệ</label>
              <input className="form-control" value={form.nguoi_lien_he || ''}
                onChange={e => setForm({ ...form, nguoi_lien_he: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Điện thoại</label>
              <input className="form-control" value={form.so_dien_thoai || ''}
                onChange={e => setForm({ ...form, so_dien_thoai: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={form.email || ''}
                onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-md-8">
              <label className="form-label">Địa chỉ</label>
              <input className="form-control" value={form.dia_chi || ''}
                onChange={e => setForm({ ...form, dia_chi: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">MST</label>
              <input className="form-control" value={form.mst || ''}
                onChange={e => setForm({ ...form, mst: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Lead time (ngày)</label>
              <input type="number" min="0" className="form-control" value={form.thoi_gian_giao_ngay}
                onChange={e => setForm({ ...form, thoi_gian_giao_ngay: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Đơn tối thiểu (₫)</label>
              <input type="number" min="0" className="form-control" value={form.gia_tri_don_toi_thieu}
                onChange={e => setForm({ ...form, gia_tri_don_toi_thieu: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Ngày nhận đặt</label>
              <input className="form-control" placeholder="vd 2,4,6" value={form.ngay_dat_trong_tuan}
                onChange={e => setForm({ ...form, ngay_dat_trong_tuan: e.target.value })} />
              <div className="form-text">Để trống = mọi ngày</div>
            </div>
            <div className="col-md-4">
              <label className="form-label">Đánh giá (0-5 sao)</label>
              <input type="number" min="0" max="5" step="0.5" className="form-control" value={form.diem_danh_gia}
                onChange={e => setForm({ ...form, diem_danh_gia: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
