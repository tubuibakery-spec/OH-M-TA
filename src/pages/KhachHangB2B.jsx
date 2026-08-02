import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal } from '../components/Chung'
import { tien } from '../lib/dinhDang'

const MOI = {
  ma_khach_hang: '', ten_doanh_nghiep: '', mst: '', nguoi_dai_dien: '',
  so_dien_thoai: '', email: '', dia_chi_giao_hang: '',
  han_muc_cong_no: '0', dieu_khoan_thanh_toan_ngay: '30'
}

export default function KhachHangB2B() {
  const { coQuyenMoiNoi } = useApp()
  const [ds, setDs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [form, setForm] = useState(null)
  const [dangLuu, setDangLuu] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase
      .from('khach_hang_b2b')
      .select('id, ma_khach_hang, ten_doanh_nghiep, mst, nguoi_dai_dien, so_dien_thoai, email, dia_chi_giao_hang, han_muc_cong_no, du_no_hien_tai, dieu_khoan_thanh_toan_ngay, trang_thai')
      .order('ten_doanh_nghiep')
    if (error) setLoi(error.message)
    setDs(data || []); setDangTai(false)
  }, [])

  useEffect(() => { nap() }, [nap])

  async function luu() {
    setDangLuu(true); setLoi(null)
    try {
      const ban = {
        ma_khach_hang: form.ma_khach_hang.trim(),
        ten_doanh_nghiep: form.ten_doanh_nghiep.trim(),
        mst: form.mst || null,
        nguoi_dai_dien: form.nguoi_dai_dien || null,
        so_dien_thoai: form.so_dien_thoai || null,
        email: form.email || null,
        dia_chi_giao_hang: form.dia_chi_giao_hang || null,
        han_muc_cong_no: Number(form.han_muc_cong_no || 0),
        dieu_khoan_thanh_toan_ngay: Number(form.dieu_khoan_thanh_toan_ngay || 30)
      }
      if (!ban.ma_khach_hang || !ban.ten_doanh_nghiep) throw new Error('Cần điền mã và tên doanh nghiệp.')
      const { error } = form.id
        ? await supabase.from('khach_hang_b2b').update(ban).eq('id', form.id)
        : await supabase.from('khach_hang_b2b').insert(ban)
      if (error) throw error
      setForm(null); await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const duocSua = coQuyenMoiNoi('b2b', 'sua')
  const duocTao = coQuyenMoiNoi('b2b', 'tao')

  return (
    <Trang
      tieuDe="Khách hàng B2B"
      mota="Chỉ nhân viên phụ trách (hoặc vai trò toàn hệ thống) mới thấy được khách hàng"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setForm({ ...MOI })}>+ Thêm khách hàng</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            trong="Chưa có khách hàng B2B nào"
            cot={[
              { ten: 'Mã', render: r => <code>{r.ma_khach_hang}</code> },
              { ten: 'Doanh nghiệp', render: r => (
                <>
                  {r.ten_doanh_nghiep}
                  <div className="small text-secondary">{r.nguoi_dai_dien}{r.so_dien_thoai ? ` · ${r.so_dien_thoai}` : ''}</div>
                </>
              ) },
              { ten: 'Hạn mức', lop: 'text-end', render: r => tien(r.han_muc_cong_no) },
              { ten: 'Dư nợ', lop: 'text-end', render: r => (
                <span className={Number(r.du_no_hien_tai) > 0 ? 'text-danger fw-semibold' : ''}>
                  {tien(r.du_no_hien_tai)}
                </span>
              ) },
              { ten: 'Điều khoản', lop: 'text-end', render: r => `${r.dieu_khoan_thanh_toan_ngay} ngày` },
              { ten: '', lop: 'text-end', render: r => duocSua && (
                <button className="btn btn-sm btn-outline-secondary"
                  onClick={() => setForm({
                    ...r,
                    han_muc_cong_no: String(r.han_muc_cong_no ?? 0),
                    dieu_khoan_thanh_toan_ngay: String(r.dieu_khoan_thanh_toan_ngay ?? 30)
                  })}>Sửa</button>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!form}
        tieuDe={form?.id ? 'Sửa khách hàng B2B' : 'Thêm khách hàng B2B'}
        onDong={() => setForm(null)} onLuu={luu} dangLuu={dangLuu}
      >
        {form && (
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Mã khách hàng *</label>
              <input className="form-control" value={form.ma_khach_hang}
                onChange={e => setForm({ ...form, ma_khach_hang: e.target.value })} />
            </div>
            <div className="col-md-8">
              <label className="form-label">Tên doanh nghiệp *</label>
              <input className="form-control" value={form.ten_doanh_nghiep}
                onChange={e => setForm({ ...form, ten_doanh_nghiep: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">MST</label>
              <input className="form-control" value={form.mst || ''}
                onChange={e => setForm({ ...form, mst: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Người đại diện</label>
              <input className="form-control" value={form.nguoi_dai_dien || ''}
                onChange={e => setForm({ ...form, nguoi_dai_dien: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Điện thoại</label>
              <input className="form-control" value={form.so_dien_thoai || ''}
                onChange={e => setForm({ ...form, so_dien_thoai: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={form.email || ''}
                onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Địa chỉ giao hàng</label>
              <input className="form-control" value={form.dia_chi_giao_hang || ''}
                onChange={e => setForm({ ...form, dia_chi_giao_hang: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Hạn mức công nợ (₫)</label>
              <input type="number" min="0" className="form-control" value={form.han_muc_cong_no}
                onChange={e => setForm({ ...form, han_muc_cong_no: e.target.value })} />
              <div className="form-text">0 = không giới hạn</div>
            </div>
            <div className="col-md-6">
              <label className="form-label">Điều khoản thanh toán (ngày)</label>
              <input type="number" min="0" className="form-control" value={form.dieu_khoan_thanh_toan_ngay}
                onChange={e => setForm({ ...form, dieu_khoan_thanh_toan_ngay: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
