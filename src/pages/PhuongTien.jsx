import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal } from '../components/Chung'
import { so } from '../lib/dinhDang'

const TRANG_THAI = {
  san_sang: ['Sẵn sàng', 'success'],
  dang_su_dung: ['Đang sử dụng', 'primary'],
  bao_tri: ['Bảo trì', 'warning'],
  ngung_su_dung: ['Ngừng sử dụng', 'secondary']
}

const MOI = { bien_so: '', loai_xe: '', trong_tai_kg: '', co_lanh: false, trang_thai: 'san_sang' }

export default function PhuongTien() {
  const { coQuyenMoiNoi } = useApp()
  const [ds, setDs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [form, setForm] = useState(null)
  const [dangLuu, setDangLuu] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase.from('phuong_tien').select('*').order('bien_so')
    if (error) setLoi(error.message)
    setDs(data || []); setDangTai(false)
  }, [])

  useEffect(() => { nap() }, [nap])

  async function luu() {
    setDangLuu(true); setLoi(null)
    try {
      const ban = {
        bien_so: form.bien_so.trim(),
        loai_xe: form.loai_xe || null,
        trong_tai_kg: form.trong_tai_kg ? Number(form.trong_tai_kg) : null,
        co_lanh: !!form.co_lanh,
        trang_thai: form.trang_thai
      }
      if (!ban.bien_so) throw new Error('Cần điền biển số.')
      const { error } = form.id
        ? await supabase.from('phuong_tien').update(ban).eq('id', form.id)
        : await supabase.from('phuong_tien').insert(ban)
      if (error) throw error
      setForm(null); await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const duocSua = coQuyenMoiNoi('logistics', 'sua')
  const duocTao = coQuyenMoiNoi('logistics', 'tao')

  return (
    <Trang
      tieuDe="Phương tiện"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setForm({ ...MOI })}>+ Thêm xe</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            trong="Chưa có phương tiện nào"
            cot={[
              { ten: 'Biển số', render: r => <code>{r.bien_so}</code> },
              { ten: 'Loại xe', render: r => r.loai_xe || '—' },
              { ten: 'Trọng tải', lop: 'text-end', render: r => r.trong_tai_kg ? `${so(r.trong_tai_kg)} kg` : '—' },
              { ten: 'Xe lạnh', render: r => r.co_lanh
                  ? <span className="badge text-bg-info">Có</span>
                  : <span className="text-secondary">Không</span> },
              { ten: 'Trạng thái', render: r => {
                  const [nhan, mau] = TRANG_THAI[r.trang_thai] || [r.trang_thai, 'secondary']
                  return <span className={`badge text-bg-${mau}`}>{nhan}</span>
              } },
              { ten: '', lop: 'text-end', render: r => duocSua && (
                <button className="btn btn-sm btn-outline-secondary"
                  onClick={() => setForm({ ...r, trong_tai_kg: String(r.trong_tai_kg ?? '') })}>Sửa</button>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!form}
        tieuDe={form?.id ? 'Sửa phương tiện' : 'Thêm phương tiện'}
        onDong={() => setForm(null)} onLuu={luu} dangLuu={dangLuu}
      >
        {form && (
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Biển số *</label>
              <input className="form-control" value={form.bien_so}
                onChange={e => setForm({ ...form, bien_so: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Loại xe</label>
              <input className="form-control" value={form.loai_xe || ''}
                onChange={e => setForm({ ...form, loai_xe: e.target.value })} placeholder="vd Xe tải 1.5 tấn" />
            </div>
            <div className="col-md-6">
              <label className="form-label">Trọng tải (kg)</label>
              <input type="number" min="0" className="form-control" value={form.trong_tai_kg}
                onChange={e => setForm({ ...form, trong_tai_kg: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Trạng thái</label>
              <select className="form-select" value={form.trang_thai}
                onChange={e => setForm({ ...form, trang_thai: e.target.value })}>
                {Object.entries(TRANG_THAI).map(([k, [nhan]]) => <option key={k} value={k}>{nhan}</option>)}
              </select>
            </div>
            <div className="col-12">
              <div className="form-check">
                <input type="checkbox" className="form-check-input" id="coLanh"
                  checked={!!form.co_lanh} onChange={e => setForm({ ...form, co_lanh: e.target.checked })} />
                <label className="form-check-label" htmlFor="coLanh">Xe lạnh (bảo quản đông/mát)</label>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
