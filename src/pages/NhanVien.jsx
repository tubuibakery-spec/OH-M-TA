import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal } from '../components/Chung'

const VAI_TRO = {
  admin: 'Quản trị', quan_ly: 'Quản lý', bep: 'Bếp', thu_ngan: 'Thu ngân', kho: 'Kho'
}

const MOI = { ma_nv: '', ho_ten: '', chi_nhanh_id: '', vai_tro: 'bep' }

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
      .select('id, ma_nv, ho_ten, vai_tro, trang_thai, chi_nhanh_id, chi_nhanh(ten_chi_nhanh)')
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
        vai_tro: form.vai_tro
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

  const duocSua = coQuyenMoiNoi('nhan_su', 'sua')
  const duocTao = coQuyenMoiNoi('nhan_su', 'tao')

  return (
    <Trang
      tieuDe="Nhân viên"
      mota="Danh sách rút gọn — dùng để gán người thực hiện/tài xế ở các phiếu"
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
              { ten: 'Họ tên', render: r => r.ho_ten },
              { ten: 'Vai trò', render: r => VAI_TRO[r.vai_tro] || r.vai_tro },
              { ten: 'Chi nhánh', render: r => r.chi_nhanh?.ten_chi_nhanh || '—' },
              { ten: 'Trạng thái', render: r => (
                <span className={`badge text-bg-${r.trang_thai === 'dang_lam_viec' ? 'success' : 'secondary'}`}>
                  {r.trang_thai === 'dang_lam_viec' ? 'Đang làm việc' : 'Nghỉ việc'}
                </span>
              ) },
              { ten: '', lop: 'text-end', render: r => duocSua && (
                <div className="d-flex gap-1 justify-content-end">
                  <button className="btn btn-sm btn-outline-secondary"
                    onClick={() => setForm({ ...r, chi_nhanh_id: r.chi_nhanh_id || '' })}>Sửa</button>
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
        mo={!!form}
        tieuDe={form?.id ? 'Sửa nhân viên' : 'Thêm nhân viên'}
        onDong={() => setForm(null)} onLuu={luu} dangLuu={dangLuu}
      >
        {form && (
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Mã NV *</label>
              <input className="form-control" value={form.ma_nv}
                onChange={e => setForm({ ...form, ma_nv: e.target.value })} />
            </div>
            <div className="col-md-8">
              <label className="form-label">Họ tên *</label>
              <input className="form-control" value={form.ho_ten}
                onChange={e => setForm({ ...form, ho_ten: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Vai trò</label>
              <select className="form-select" value={form.vai_tro}
                onChange={e => setForm({ ...form, vai_tro: e.target.value })}>
                {Object.entries(VAI_TRO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Chi nhánh</label>
              <select className="form-select" value={form.chi_nhanh_id}
                onChange={e => setForm({ ...form, chi_nhanh_id: e.target.value })}>
                <option value="">— Không thuộc chi nhánh nào —</option>
                {chiNhanhs.map(c => <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>)}
              </select>
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
