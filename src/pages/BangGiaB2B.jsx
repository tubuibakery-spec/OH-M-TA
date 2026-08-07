import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, so, ngay, homNay } from '../lib/dinhDang'

const TAO_MOI = { ten_bang_gia: '', ap_dung_tu: homNay(), ap_dung_den: '' }

export default function BangGiaB2B() {
  const { coQuyenMoiNoi, coQuyen } = useApp()
  const [bangGias, setBangGias] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [moTao, setMoTao] = useState(false)
  const [formTao, setFormTao] = useState({ ...TAO_MOI })
  const [dangXuLy, setDangXuLy] = useState(false)

  const [xem, setXem] = useState(null)
  const [ctForm, setCtForm] = useState(null)
  const [chiTiet, setChiTiet] = useState([])
  const [dongMoi, setDongMoi] = useState({ vat_tu_id: '', so_luong_tu: '', don_gia: '' })

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [bg, vt] = await Promise.all([
        supabase.from('bang_gia_b2b').select('id, ten_bang_gia, ap_dung_tu, ap_dung_den, dang_ap_dung').order('ap_dung_tu', { ascending: false }),
        supabase.from('vat_tu').select('id, ten_vat_tu, don_vi_tinh(ma_dvt)').eq('duoc_ban', true).eq('trang_thai', 'hoat_dong').order('ten_vat_tu')
      ])
      if (bg.error) throw bg.error
      if (vt.error) throw vt.error
      setBangGias(bg.data || []); setVatTus(vt.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { nap() }, [nap])

  async function napChiTiet(bangGiaId) {
    const { data, error } = await supabase
      .from('chi_tiet_bang_gia_b2b')
      .select('id, vat_tu_id, so_luong_tu, don_gia, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))')
      .eq('bang_gia_id', bangGiaId)
      .order('so_luong_tu')
    if (error) { setLoi(error.message); return [] }
    return data || []
  }

  async function taoBangGia() {
    if (!formTao.ten_bang_gia.trim()) { setLoi('Cần điền tên bảng giá.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { data, error } = await supabase.from('bang_gia_b2b').insert({
        ten_bang_gia: formTao.ten_bang_gia.trim(),
        ap_dung_tu: formTao.ap_dung_tu || homNay(),
        ap_dung_den: formTao.ap_dung_den || null,
        dang_ap_dung: true
      }).select('id, ten_bang_gia, ap_dung_tu, ap_dung_den, dang_ap_dung').single()
      if (error) throw error
      setMoTao(false); setFormTao({ ...TAO_MOI })
      await nap()
      await moXem(data)
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const moXem = useCallback(async (bg) => {
    setXem(bg)
    setCtForm({
      ten_bang_gia: bg.ten_bang_gia,
      ap_dung_tu: bg.ap_dung_tu,
      ap_dung_den: bg.ap_dung_den || '',
      dang_ap_dung: bg.dang_ap_dung
    })
    setDongMoi({ vat_tu_id: '', so_luong_tu: '', don_gia: '' })
    setChiTiet(await napChiTiet(bg.id))
  }, [])

  async function luuThongTinBangGia() {
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('bang_gia_b2b').update({
        ten_bang_gia: ctForm.ten_bang_gia.trim(),
        ap_dung_tu: ctForm.ap_dung_tu,
        ap_dung_den: ctForm.ap_dung_den || null,
        dang_ap_dung: ctForm.dang_ap_dung
      }).eq('id', xem.id)
      if (error) throw error
      await nap()
      setXem(null)
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function themDongGia() {
    if (!dongMoi.vat_tu_id || !(Number(dongMoi.don_gia) >= 0)) {
      setLoi('Chọn vật tư và nhập đơn giá hợp lệ.'); return
    }
    setLoi(null)
    const { error } = await supabase.from('chi_tiet_bang_gia_b2b').insert({
      bang_gia_id: xem.id,
      vat_tu_id: dongMoi.vat_tu_id,
      so_luong_tu: Number(dongMoi.so_luong_tu || 0),
      don_gia: Number(dongMoi.don_gia)
    })
    if (error) { setLoi(error.message); return }
    setDongMoi({ vat_tu_id: '', so_luong_tu: '', don_gia: '' })
    setChiTiet(await napChiTiet(xem.id))
  }

  async function xoaDongGia(id) {
    setLoi(null)
    const { error } = await supabase.from('chi_tiet_bang_gia_b2b').delete().eq('id', id)
    if (error) { setLoi(error.message); return }
    setChiTiet(await napChiTiet(xem.id))
  }

  const duocTao = coQuyen('b2b', 'tao', null)
  const duocSua = coQuyen('b2b', 'sua', null)

  return (
    <Trang
      tieuDe="Bảng giá B2B"
      mota="Bậc giá theo số lượng mua, áp dụng chung theo khoảng thời gian hiệu lực (không gắn riêng khách hàng)"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Tạo bảng giá mới</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={bangGias}
            trong="Chưa có bảng giá B2B nào"
            cot={[
              { ten: 'Tên bảng giá', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>{r.ten_bang_gia}</button>
              ) },
              { ten: 'Áp dụng từ', render: r => ngay(r.ap_dung_tu) },
              { ten: 'Áp dụng đến', render: r => r.ap_dung_den ? ngay(r.ap_dung_den) : 'Không giới hạn' },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.dang_ap_dung ? 'hieu_luc' : 'da_huy'} /> },
              { ten: '', lop: 'text-end', render: r => (
                <button className="btn btn-sm btn-outline-secondary" onClick={() => moXem(r)}>Xem/Sửa</button>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moTao} tieuDe="Tạo bảng giá B2B mới"
        onDong={() => setMoTao(false)} onLuu={taoBangGia} dangLuu={dangXuLy}
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label">Tên bảng giá *</label>
            <input className="form-control" value={formTao.ten_bang_gia}
              onChange={e => setFormTao({ ...formTao, ten_bang_gia: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Áp dụng từ</label>
            <input type="date" className="form-control" value={formTao.ap_dung_tu}
              onChange={e => setFormTao({ ...formTao, ap_dung_tu: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Áp dụng đến (không bắt buộc)</label>
            <input type="date" className="form-control" value={formTao.ap_dung_den}
              onChange={e => setFormTao({ ...formTao, ap_dung_den: e.target.value })} />
          </div>
        </div>
      </Modal>

      <Modal
        mo={!!xem} rong
        tieuDe={`Bảng giá — ${xem?.ten_bang_gia || ''}`}
        onDong={() => setXem(null)}
        onLuu={duocSua ? luuThongTinBangGia : null}
        nhanLuu="Lưu thông tin bảng giá"
        dangLuu={dangXuLy}
      >
        {ctForm && (
          <div className="row g-3 mb-4 border-bottom pb-3">
            <div className="col-md-6">
              <label className="form-label">Tên bảng giá</label>
              <input className="form-control" value={ctForm.ten_bang_gia} disabled={!duocSua}
                onChange={e => setCtForm({ ...ctForm, ten_bang_gia: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Áp dụng từ</label>
              <input type="date" className="form-control" value={ctForm.ap_dung_tu} disabled={!duocSua}
                onChange={e => setCtForm({ ...ctForm, ap_dung_tu: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Áp dụng đến</label>
              <input type="date" className="form-control" value={ctForm.ap_dung_den} disabled={!duocSua}
                onChange={e => setCtForm({ ...ctForm, ap_dung_den: e.target.value })} />
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="dangApDung" disabled={!duocSua}
                  checked={!!ctForm.dang_ap_dung}
                  onChange={e => setCtForm({ ...ctForm, dang_ap_dung: e.target.checked })} />
                <label className="form-check-label" htmlFor="dangApDung">Đang áp dụng</label>
              </div>
            </div>
          </div>
        )}

        <table className="table table-sm align-middle">
          <thead className="table-light">
            <tr>
              <th>Vật tư</th>
              <th className="text-end">Số lượng từ</th>
              <th className="text-end">Đơn giá</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {chiTiet.length === 0 && (
              <tr><td colSpan={4} className="text-center text-secondary py-4">Chưa có bậc giá nào</td></tr>
            )}
            {chiTiet.map(r => (
              <tr key={r.id}>
                <td>{r.vat_tu?.ten_vat_tu} <span className="text-secondary small">({r.vat_tu?.don_vi_tinh?.ma_dvt})</span></td>
                <td className="text-end">{so(r.so_luong_tu)}</td>
                <td className="text-end">{tien(r.don_gia)}</td>
                <td className="text-end">
                  {duocSua && (
                    <button className="btn btn-sm btn-outline-danger" onClick={() => xoaDongGia(r.id)}>Xóa</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {duocSua && (
          <div className="row g-2 align-items-end border-top pt-3">
            <div className="col-md-5">
              <label className="form-label small">Vật tư</label>
              <select className="form-select form-select-sm" value={dongMoi.vat_tu_id}
                onChange={e => setDongMoi({ ...dongMoi, vat_tu_id: e.target.value })}>
                <option value="">— Chọn vật tư —</option>
                {vatTus.map(v => <option key={v.id} value={v.id}>{v.ten_vat_tu}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label small">Số lượng từ</label>
              <input type="number" min="0" step="0.001" className="form-control form-control-sm"
                value={dongMoi.so_luong_tu}
                onChange={e => setDongMoi({ ...dongMoi, so_luong_tu: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label small">Đơn giá</label>
              <input type="number" min="0" className="form-control form-control-sm"
                value={dongMoi.don_gia}
                onChange={e => setDongMoi({ ...dongMoi, don_gia: e.target.value })} />
            </div>
            <div className="col-md-1">
              <button className="btn btn-sm btn-outline-primary w-100" onClick={themDongGia}>+</button>
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
