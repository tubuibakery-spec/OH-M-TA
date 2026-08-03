import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, so, ngay } from '../lib/dinhDang'

function thangDauIso(iso) {
  return iso.slice(0, 7) + '-01'
}

export default function BangLuong() {
  const { coQuyenMoiNoi } = useApp()
  const [thangChon, setThangChon] = useState(thangDauIso(new Date().toISOString()))
  const [ds, setDs] = useState([])
  const [nhanViens, setNhanViens] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [dangXuLy, setDangXuLy] = useState(false)
  const [loi, setLoi] = useState(null)

  const [xem, setXem] = useState(null)
  const [phuCap, setPhuCap] = useState('0')
  const [khauTru, setKhauTru] = useState('0')

  const napDs = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [bl, nv] = await Promise.all([
        supabase.from('bang_luong')
          .select('id, so_bang_luong, thang, luong_co_ban, so_ngay_cong, so_ngay_chuan, phu_cap, khau_tru, thuc_linh, trang_thai, nhan_vien(ho_ten, ma_nv)')
          .eq('thang', thangChon)
          .order('created_at', { ascending: false }),
        supabase.from('nhan_vien').select('id, ho_ten, ma_nv').eq('trang_thai', 'dang_lam_viec').order('ho_ten')
      ])
      if (bl.error) throw bl.error
      if (nv.error) throw nv.error
      setDs(bl.data || []); setNhanViens(nv.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [thangChon])

  useEffect(() => { napDs() }, [napDs])

  async function taoBangLuong(nhanVienId) {
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.rpc('rpc_tao_bang_luong', {
        p_nhan_vien_id: nhanVienId, p_thang: thangChon
      })
      if (error) throw error
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function taoTatCa() {
    setDangXuLy(true); setLoi(null)
    try {
      for (const nv of nhanViens) {
        const { error } = await supabase.rpc('rpc_tao_bang_luong', {
          p_nhan_vien_id: nv.id, p_thang: thangChon
        })
        if (error) throw error
      }
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  function moSua(r) {
    setXem(r); setPhuCap(String(r.phu_cap)); setKhauTru(String(r.khau_tru))
  }

  async function luuDieuChinh() {
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('bang_luong')
        .update({ phu_cap: Number(phuCap || 0), khau_tru: Number(khauTru || 0) })
        .eq('id', xem.id)
      if (error) throw error
      setXem(null); await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function danhDauDaChi(r) {
    if (!confirm(`Đánh dấu đã chi trả lương cho ${r.nhan_vien?.ho_ten}?`)) return
    setLoi(null)
    const { error } = await supabase.from('bang_luong')
      .update({ trang_thai: 'da_chi_tra', ngay_chi_tra: new Date().toISOString().slice(0, 10) })
      .eq('id', r.id)
    if (error) setLoi(error.message)
    await napDs()
  }

  const duocTao = coQuyenMoiNoi('nhan_su', 'tao')
  const duocSua = coQuyenMoiNoi('nhan_su', 'sua')
  const nvChuaCoBangLuong = nhanViens.filter(nv => !ds.some(b => b.nhan_vien?.ma_nv === nv.ma_nv))
  const tongThucLinh = ds.reduce((s, r) => s + Number(r.thuc_linh || 0), 0)

  return (
    <Trang
      tieuDe="Bảng lương"
      mota="Lương = lương cơ bản × (công/ngày chuẩn) + phụ cấp − khấu trừ. Chưa tính bảo hiểm/thuế TNCN."
      hanhDong={duocTao && nvChuaCoBangLuong.length > 0 && (
        <button className="btn btn-primary" onClick={taoTatCa} disabled={dangXuLy}>
          {dangXuLy ? 'Đang tạo…' : `Tạo bảng lương cho ${nvChuaCoBangLuong.length} nhân viên còn thiếu`}
        </button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body d-flex align-items-center gap-3 flex-wrap">
          <label className="form-label mb-0 fw-semibold">Tháng</label>
          <input type="month" className="form-control w-auto"
            value={thangChon.slice(0, 7)}
            onChange={e => setThangChon(e.target.value + '-01')} />
          <div className="ms-auto text-end">
            <div className="text-secondary small">Tổng thực lĩnh tháng này</div>
            <div className="fs-5 fw-bold">{tien(tongThucLinh)}</div>
          </div>
        </div>
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            trong="Chưa có bảng lương nào cho tháng này"
            cot={[
              { ten: 'Số bảng lương', render: r => r.so_bang_luong },
              { ten: 'Nhân viên', render: r => r.nhan_vien?.ho_ten },
              { ten: 'Công / chuẩn', lop: 'text-end', render: r => `${so(r.so_ngay_cong)} / ${r.so_ngay_chuan}` },
              { ten: 'Lương cơ bản', lop: 'text-end', render: r => tien(r.luong_co_ban) },
              { ten: 'Phụ cấp', lop: 'text-end', render: r => tien(r.phu_cap) },
              { ten: 'Khấu trừ', lop: 'text-end', render: r => tien(r.khau_tru) },
              { ten: 'Thực lĩnh', lop: 'text-end', render: r => <strong>{tien(r.thuc_linh)}</strong> },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
              { ten: '', lop: 'text-end', render: r => duocSua && r.trang_thai === 'nhap' && (
                <div className="d-flex gap-1 justify-content-end">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => moSua(r)}>Điều chỉnh</button>
                  <button className="btn btn-sm btn-success" onClick={() => danhDauDaChi(r)}>Đã chi</button>
                </div>
              ) }
            ]}
          />
        </div>
      )}

      {duocTao && nvChuaCoBangLuong.length > 0 && (
        <div className="alert alert-secondary small mt-3">
          Chưa có bảng lương: {nvChuaCoBangLuong.map(nv => nv.ho_ten).join(', ')}
        </div>
      )}

      <Modal
        mo={!!xem} tieuDe={`Điều chỉnh lương — ${xem?.nhan_vien?.ho_ten || ''}`}
        onDong={() => setXem(null)} onLuu={luuDieuChinh} dangLuu={dangXuLy}
      >
        {xem && (
          <div className="row g-3">
            <div className="col-12 text-secondary small">
              Công: {so(xem.so_ngay_cong)} / {xem.so_ngay_chuan} ngày — Lương cơ bản: {tien(xem.luong_co_ban)}
            </div>
            <div className="col-md-6">
              <label className="form-label">Phụ cấp (₫)</label>
              <input type="number" min="0" className="form-control" value={phuCap}
                onChange={e => setPhuCap(e.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Khấu trừ (₫)</label>
              <input type="number" min="0" className="form-control" value={khauTru}
                onChange={e => setKhauTru(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
