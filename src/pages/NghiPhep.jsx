import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { ngay, ngayGio, homNay } from '../lib/dinhDang'

function soNgayGiua(tu, den) {
  if (!tu || !den) return 0
  const a = new Date(tu), b = new Date(den)
  const diff = Math.round((b - a) / 86400000) + 1
  return diff > 0 ? diff : 0
}

const MOI = { nhan_vien_id: '', tu_ngay: homNay(), den_ngay: homNay(), ly_do: '' }

export default function NghiPhep() {
  const { coQuyenMoiNoi, nguoiDung } = useApp()
  const [ds, setDs] = useState([])
  const [nhanViens, setNhanViens] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [dangXuLy, setDangXuLy] = useState(false)
  const [loi, setLoi] = useState(null)

  const [moTao, setMoTao] = useState(false)
  const [form, setForm] = useState({ ...MOI })

  const napDs = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [d, nv] = await Promise.all([
        supabase.from('don_xin_nghi_phep')
          .select('id, so_don, tu_ngay, den_ngay, so_ngay, ly_do, trang_thai, ngay_duyet, ghi_chu_duyet, created_at, nhan_vien(ho_ten), nguoi_duyet:nguoi_duyet_id(ho_ten)')
          .order('created_at', { ascending: false }).limit(100),
        supabase.from('nhan_vien').select('id, ho_ten').eq('trang_thai', 'dang_lam_viec').order('ho_ten')
      ])
      if (d.error) throw d.error
      if (nv.error) throw nv.error
      setDs(d.data || []); setNhanViens(nv.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { napDs() }, [napDs])

  async function taoDon() {
    const soNgay = soNgayGiua(form.tu_ngay, form.den_ngay)
    if (!form.nhan_vien_id) { setLoi('Chưa chọn nhân viên.'); return }
    if (soNgay <= 0) { setLoi('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('don_xin_nghi_phep').insert({
        nhan_vien_id: form.nhan_vien_id,
        tu_ngay: form.tu_ngay,
        den_ngay: form.den_ngay,
        so_ngay: soNgay,
        ly_do: form.ly_do || null
      })
      if (error) throw error
      setMoTao(false); setForm({ ...MOI })
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function duyet(d, trangThai) {
    const ghiChu = trangThai === 'tu_choi' ? prompt('Lý do từ chối (không bắt buộc):') : null
    setDangXuLy(true); setLoi(null)
    const { error } = await supabase.from('don_xin_nghi_phep')
      .update({
        trang_thai: trangThai,
        nguoi_duyet_id: nguoiDung?.nhan_vien_id || null,
        ghi_chu_duyet: ghiChu || null
      })
      .eq('id', d.id)
    if (error) setLoi(error.message)
    await napDs()
    setDangXuLy(false)
  }

  const duocTao = coQuyenMoiNoi('nhan_su', 'tao')
  const duocDuyet = coQuyenMoiNoi('nhan_su', 'duyet')

  return (
    <Trang
      tieuDe="Nghỉ phép"
      mota="Duyệt xong tự động ghi chấm công 'nghỉ phép' cho đúng số ngày — không cần chấm tay lại"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Tạo đơn xin nghỉ</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            trong="Chưa có đơn xin nghỉ phép nào"
            cot={[
              { ten: 'Số đơn', render: r => r.so_don },
              { ten: 'Nhân viên', render: r => r.nhan_vien?.ho_ten },
              { ten: 'Thời gian nghỉ', render: r => (
                <span className="small">{ngay(r.tu_ngay)} → {ngay(r.den_ngay)} ({r.so_ngay} ngày)</span>
              ) },
              { ten: 'Lý do', render: r => r.ly_do || '—' },
              { ten: 'Nộp lúc', render: r => ngayGio(r.created_at) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
              { ten: 'Người duyệt', render: r => r.trang_thai !== 'cho_duyet'
                  ? <span className="small">{r.nguoi_duyet?.ho_ten}<br />{ngayGio(r.ngay_duyet)}</span> : '—' },
              { ten: '', lop: 'text-end', render: r => duocDuyet && r.trang_thai === 'cho_duyet' && (
                <div className="d-flex gap-1 justify-content-end">
                  <button className="btn btn-sm btn-success" disabled={dangXuLy}
                    onClick={() => duyet(r, 'da_duyet')}>Duyệt</button>
                  <button className="btn btn-sm btn-outline-danger" disabled={dangXuLy}
                    onClick={() => duyet(r, 'tu_choi')}>Từ chối</button>
                </div>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moTao} tieuDe="Tạo đơn xin nghỉ phép"
        onDong={() => setMoTao(false)} onLuu={taoDon} dangLuu={dangXuLy}
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label">Nhân viên</label>
            <select className="form-select" value={form.nhan_vien_id}
              onChange={e => setForm({ ...form, nhan_vien_id: e.target.value })}>
              <option value="">— Chọn —</option>
              {nhanViens.map(n => <option key={n.id} value={n.id}>{n.ho_ten}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Từ ngày</label>
            <input type="date" className="form-control" value={form.tu_ngay}
              onChange={e => setForm({ ...form, tu_ngay: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Đến ngày</label>
            <input type="date" className="form-control" value={form.den_ngay}
              onChange={e => setForm({ ...form, den_ngay: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label">Lý do</label>
            <input className="form-control" value={form.ly_do}
              onChange={e => setForm({ ...form, ly_do: e.target.value })} />
          </div>
          <div className="col-12 text-secondary small">
            Số ngày nghỉ: <strong>{soNgayGiua(form.tu_ngay, form.den_ngay)}</strong>
          </div>
        </div>
      </Modal>
    </Trang>
  )
}
