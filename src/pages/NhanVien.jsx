import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal } from '../components/Chung'
import { tien, ngay } from '../lib/dinhDang'

const VAI_TRO = {
  admin: 'Quản trị', quan_ly: 'Quản lý', bep: 'Bếp', thu_ngan: 'Thu ngân', kho: 'Kho'
}

const MOI = {
  ma_nv: '', ho_ten: '', chi_nhanh_id: '', vai_tro: 'bep',
  ngay_sinh: '', cccd: '', dia_chi: '', so_dien_thoai: '', email: '',
  ngay_vao_lam: '', luong_co_ban: '0', so_tai_khoan_ngan_hang: '', ten_ngan_hang: ''
}

export default function NhanVien() {
  const { chiNhanhs, coQuyenMoiNoi } = useApp()
  const [ds, setDs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [form, setForm] = useState(null)
  const [dangLuu, setDangLuu] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase
      .from('nhan_vien')
      .select('id, ma_nv, ho_ten, vai_tro, trang_thai, chi_nhanh_id, chi_nhanh(ten_chi_nhanh), so_dien_thoai, ngay_vao_lam, luong_co_ban')
      .order('ho_ten')
    if (error) setLoi(error.message)
    setDs(data || []); setDangTai(false)
  }, [])

  useEffect(() => { nap() }, [nap])

  async function luu() {
    setDangLuu(true); setLoi(null)
    try {
      const ban = {
        ma_nv: form.ma_nv.trim(),
        ho_ten: form.ho_ten.trim(),
        chi_nhanh_id: form.chi_nhanh_id || null,
        vai_tro: form.vai_tro,
        ngay_sinh: form.ngay_sinh || null,
        cccd: form.cccd || null,
        dia_chi: form.dia_chi || null,
        so_dien_thoai: form.so_dien_thoai || null,
        email: form.email || null,
        ngay_vao_lam: form.ngay_vao_lam || null,
        luong_co_ban: Number(form.luong_co_ban || 0),
        so_tai_khoan_ngan_hang: form.so_tai_khoan_ngan_hang || null,
        ten_ngan_hang: form.ten_ngan_hang || null
      }
      if (!ban.ma_nv || !ban.ho_ten) throw new Error('Cần điền mã và họ tên.')
      const { error } = form.id
        ? await supabase.from('nhan_vien').update(ban).eq('id', form.id)
        : await supabase.from('nhan_vien').insert(ban)
      if (error) throw error
      setForm(null); await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function doiTrangThai(nv) {
    const tt = nv.trang_thai === 'dang_lam_viec' ? 'nghi_viec' : 'dang_lam_viec'
    setLoi(null)
    const { error } = await supabase.from('nhan_vien').update({ trang_thai: tt }).eq('id', nv.id)
    if (error) setLoi(error.message)
    await nap()
  }

  async function moSua(r) {
    setLoi(null)
    const { data, error } = await supabase.from('nhan_vien').select('*').eq('id', r.id).single()
    if (error) { setLoi(error.message); return }
    setForm({
      ...data,
      chi_nhanh_id: data.chi_nhanh_id || '',
      ngay_sinh: data.ngay_sinh || '',
      ngay_vao_lam: data.ngay_vao_lam || '',
      luong_co_ban: String(data.luong_co_ban ?? 0)
    })
  }

  const duocSua = coQuyenMoiNoi('nhan_su', 'sua')
  const duocTao = coQuyenMoiNoi('nhan_su', 'tao')

  return (
    <Trang
      tieuDe="Nhân viên"
      mota="Hồ sơ nhân viên — dùng cho chấm công, nghỉ phép, bảng lương và gán người thực hiện ở các phiếu"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setForm({ ...MOI })}>+ Thêm nhân viên</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            trong="Chưa có nhân viên nào"
            cot={[
              { ten: 'Mã NV', render: r => <code>{r.ma_nv}</code> },
              { ten: 'Họ tên', render: r => (
                <>
                  {r.ho_ten}
                  {r.so_dien_thoai && <div className="small text-secondary">{r.so_dien_thoai}</div>}
                </>
              ) },
              { ten: 'Vai trò', render: r => VAI_TRO[r.vai_tro] || r.vai_tro },
              { ten: 'Chi nhánh', render: r => r.chi_nhanh?.ten_chi_nhanh || '—' },
              { ten: 'Ngày vào làm', render: r => ngay(r.ngay_vao_lam) },
              { ten: 'Lương cơ bản', lop: 'text-end', render: r => tien(r.luong_co_ban) },
              { ten: 'Trạng thái', render: r => (
                <span className={`badge text-bg-${r.trang_thai === 'dang_lam_viec' ? 'success' : 'secondary'}`}>
                  {r.trang_thai === 'dang_lam_viec' ? 'Đang làm việc' : 'Nghỉ việc'}
                </span>
              ) },
              { ten: '', lop: 'text-end', render: r => duocSua && (
                <div className="d-flex gap-1 justify-content-end">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => moSua(r)}>Sửa</button>
                  <button className="btn btn-sm btn-outline-warning" onClick={() => doiTrangThai(r)}>
                    {r.trang_thai === 'dang_lam_viec' ? 'Cho nghỉ' : 'Nhận lại'}
                  </button>
                </div>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!form} rong
        tieuDe={form?.id ? 'Sửa nhân viên' : 'Thêm nhân viên'}
        onDong={() => setForm(null)} onLuu={luu} dangLuu={dangLuu}
      >
        {form && (
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Mã NV *</label>
              <input className="form-control" value={form.ma_nv}
                onChange={e => setForm({ ...form, ma_nv: e.target.value })} />
            </div>
            <div className="col-md-9">
              <label className="form-label">Họ tên *</label>
              <input className="form-control" value={form.ho_ten}
                onChange={e => setForm({ ...form, ho_ten: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Vai trò</label>
              <select className="form-select" value={form.vai_tro}
                onChange={e => setForm({ ...form, vai_tro: e.target.value })}>
                {Object.entries(VAI_TRO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Chi nhánh</label>
              <select className="form-select" value={form.chi_nhanh_id}
                onChange={e => setForm({ ...form, chi_nhanh_id: e.target.value })}>
                <option value="">— Không thuộc chi nhánh nào —</option>
                {chiNhanhs.map(c => <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>)}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Ngày vào làm</label>
              <input type="date" className="form-control" value={form.ngay_vao_lam}
                onChange={e => setForm({ ...form, ngay_vao_lam: e.target.value })} />
            </div>

            <div className="col-12"><hr className="my-1" /></div>

            <div className="col-md-4">
              <label className="form-label">Ngày sinh</label>
              <input type="date" className="form-control" value={form.ngay_sinh || ''}
                onChange={e => setForm({ ...form, ngay_sinh: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">CCCD</label>
              <input className="form-control" value={form.cccd || ''}
                onChange={e => setForm({ ...form, cccd: e.target.value })} />
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
              <label className="form-label">Địa chỉ</label>
              <input className="form-control" value={form.dia_chi || ''}
                onChange={e => setForm({ ...form, dia_chi: e.target.value })} />
            </div>

            <div className="col-12"><hr className="my-1" /></div>

            <div className="col-md-4">
              <label className="form-label">Lương cơ bản (₫/tháng)</label>
              <input type="number" min="0" className="form-control" value={form.luong_co_ban}
                onChange={e => setForm({ ...form, luong_co_ban: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Ngân hàng</label>
              <input className="form-control" value={form.ten_ngan_hang || ''}
                onChange={e => setForm({ ...form, ten_ngan_hang: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Số tài khoản</label>
              <input className="form-control" value={form.so_tai_khoan_ngan_hang || ''}
                onChange={e => setForm({ ...form, so_tai_khoan_ngan_hang: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
