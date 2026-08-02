import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { ngayGio } from '../lib/dinhDang'

const LOAI_DICH = {
  chi_nhanh: 'Chi nhánh khác',
  khach_hang: 'Khách hàng B2B'
}

const MOI = {
  loai_dich: 'chi_nhanh', diem_den_id: '', khach_hang_b2b_id: '',
  phuong_tien_id: '', tai_xe_id: '', thoi_gian_du_kien: '', ghi_chu: ''
}

export default function ChuyenGiaoHang() {
  const { chiNhanhId, chiNhanhs, coQuyen } = useApp()
  const [chuyens, setChuyens] = useState([])
  const [phuongTiens, setPhuongTiens] = useState([])
  const [nhanViens, setNhanViens] = useState([])
  const [khachHangs, setKhachHangs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [moTao, setMoTao] = useState(false)
  const [dangXuLy, setDangXuLy] = useState(false)
  const [form, setForm] = useState({ ...MOI })

  const tenChiNhanh = id => chiNhanhs.find(c => c.id === id)?.ten_chi_nhanh || '—'

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    try {
      const [c, pt, nv, kh] = await Promise.all([
        supabase.from('chuyen_giao_hang')
          .select('id, ma_chuyen, diem_di_id, diem_den_id, khach_hang_b2b(ten_doanh_nghiep), phuong_tien(bien_so), nhan_vien(ho_ten), thoi_gian_du_kien, thoi_gian_khoi_hanh, thoi_gian_hoan_thanh, trang_thai')
          .or(`diem_di_id.eq.${chiNhanhId},diem_den_id.eq.${chiNhanhId}`)
          .order('thoi_gian_du_kien', { ascending: false, nullsFirst: false }).limit(100),
        supabase.from('phuong_tien').select('id, bien_so').eq('trang_thai', 'san_sang').order('bien_so'),
        supabase.from('nhan_vien').select('id, ho_ten').eq('trang_thai', 'dang_lam_viec').order('ho_ten'),
        supabase.from('khach_hang_b2b').select('id, ten_doanh_nghiep').eq('trang_thai', 'hoat_dong').order('ten_doanh_nghiep')
      ])
      if (c.error) throw c.error
      if (pt.error) throw pt.error
      if (nv.error) throw nv.error
      if (kh.error) throw kh.error
      setChuyens(c.data || []); setPhuongTiens(pt.data || []); setNhanViens(nv.data || []); setKhachHangs(kh.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  async function taoChuyen() {
    if (form.loai_dich === 'chi_nhanh' && !form.diem_den_id) { setLoi('Chưa chọn chi nhánh nhận.'); return }
    if (form.loai_dich === 'khach_hang' && !form.khach_hang_b2b_id) { setLoi('Chưa chọn khách hàng.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('chuyen_giao_hang').insert({
        diem_di_id: chiNhanhId,
        diem_den_id: form.loai_dich === 'chi_nhanh' ? form.diem_den_id : null,
        khach_hang_b2b_id: form.loai_dich === 'khach_hang' ? form.khach_hang_b2b_id : null,
        phuong_tien_id: form.phuong_tien_id || null,
        tai_xe_id: form.tai_xe_id || null,
        thoi_gian_du_kien: form.thoi_gian_du_kien || null,
        ghi_chu: form.ghi_chu || null
      })
      if (error) throw error
      setMoTao(false); setForm({ ...MOI })
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function doiTrangThai(c, tt) {
    setDangXuLy(true); setLoi(null)
    const patch = { trang_thai: tt }
    if (tt === 'dang_giao') patch.thoi_gian_khoi_hanh = new Date().toISOString()
    if (tt === 'da_giao') patch.thoi_gian_hoan_thanh = new Date().toISOString()
    const { error } = await supabase.from('chuyen_giao_hang').update(patch).eq('id', c.id)
    if (error) setLoi(error.message)
    await napDs()
    setDangXuLy(false)
  }

  const duocTao = coQuyen('logistics', 'tao')
  const duocSua = coQuyen('logistics', 'sua')

  return (
    <Trang
      tieuDe="Chuyến giao hàng"
      mota="Theo dõi xe và tài xế cho hàng điều chuyển / giao khách B2B"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Lên chuyến</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={chuyens}
            trong="Chưa có chuyến nào"
            cot={[
              { ten: 'Mã chuyến', render: r => r.ma_chuyen },
              { ten: 'Điểm đi → đến', render: r => (
                <span className="small">
                  {tenChiNhanh(r.diem_di_id)} → {r.diem_den_id ? tenChiNhanh(r.diem_den_id) : r.khach_hang_b2b?.ten_doanh_nghiep}
                </span>
              ) },
              { ten: 'Xe / Tài xế', render: r => (
                <span className="small">{r.phuong_tien?.bien_so || '—'} · {r.nhan_vien?.ho_ten || '—'}</span>
              ) },
              { ten: 'Dự kiến', render: r => ngayGio(r.thoi_gian_du_kien) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
              { ten: '', lop: 'text-end', render: r => {
                if (!duocSua) return null
                if (r.trang_thai === 'len_ke_hoach') {
                  return <button className="btn btn-sm btn-warning" onClick={() => doiTrangThai(r, 'dang_giao')}>Khởi hành</button>
                }
                if (r.trang_thai === 'dang_giao') {
                  return <button className="btn btn-sm btn-success" onClick={() => doiTrangThai(r, 'da_giao')}>Đã giao</button>
                }
                return null
              } }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moTao} tieuDe="Lên chuyến giao hàng"
        onDong={() => setMoTao(false)} onLuu={taoChuyen} dangLuu={dangXuLy}
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label">Giao cho</label>
            <select className="form-select" value={form.loai_dich}
              onChange={e => setForm({ ...form, loai_dich: e.target.value })}>
              {Object.entries(LOAI_DICH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {form.loai_dich === 'chi_nhanh' ? (
            <div className="col-12">
              <label className="form-label">Chi nhánh nhận</label>
              <select className="form-select" value={form.diem_den_id}
                onChange={e => setForm({ ...form, diem_den_id: e.target.value })}>
                <option value="">— Chọn —</option>
                {chiNhanhs.filter(c => c.id !== chiNhanhId).map(c => (
                  <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="col-12">
              <label className="form-label">Khách hàng B2B</label>
              <select className="form-select" value={form.khach_hang_b2b_id}
                onChange={e => setForm({ ...form, khach_hang_b2b_id: e.target.value })}>
                <option value="">— Chọn —</option>
                {khachHangs.map(k => <option key={k.id} value={k.id}>{k.ten_doanh_nghiep}</option>)}
              </select>
            </div>
          )}

          <div className="col-md-6">
            <label className="form-label">Phương tiện</label>
            <select className="form-select" value={form.phuong_tien_id}
              onChange={e => setForm({ ...form, phuong_tien_id: e.target.value })}>
              <option value="">— Chưa gán —</option>
              {phuongTiens.map(p => <option key={p.id} value={p.id}>{p.bien_so}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Tài xế</label>
            <select className="form-select" value={form.tai_xe_id}
              onChange={e => setForm({ ...form, tai_xe_id: e.target.value })}>
              <option value="">— Chưa gán —</option>
              {nhanViens.map(n => <option key={n.id} value={n.id}>{n.ho_ten}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Thời gian dự kiến</label>
            <input type="datetime-local" className="form-control" value={form.thoi_gian_du_kien}
              onChange={e => setForm({ ...form, thoi_gian_du_kien: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label">Ghi chú</label>
            <input className="form-control" value={form.ghi_chu}
              onChange={e => setForm({ ...form, ghi_chu: e.target.value })} />
          </div>
        </div>
      </Modal>
    </Trang>
  )
}
