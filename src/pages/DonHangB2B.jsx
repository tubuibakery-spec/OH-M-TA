import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, so, ngay, ngayGio } from '../lib/dinhDang'

const DONG_TRONG = { vat_tu_id: '', so_luong: '', don_gia: '' }

export default function DonHangB2B() {
  const { chiNhanhId, coQuyen } = useApp()
  const [don, setDon] = useState([])
  const [khachHangs, setKhachHangs] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [dangXuLy, setDangXuLy] = useState(false)

  const [moTao, setMoTao] = useState(false)
  const [khachHangId, setKhachHangId] = useState('')
  const [ngayGiao, setNgayGiao] = useState('')
  const [dongCt, setDongCt] = useState([{ ...DONG_TRONG }])

  const [xem, setXem] = useState(null)
  const [ct, setCt] = useState([])

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    try {
      const [d, k, v] = await Promise.all([
        supabase.from('don_hang_b2b')
          .select('id, so_don_hang, ngay_dat, ngay_giao_du_kien, tong_tien, trang_thai, khach_hang_b2b(ten_doanh_nghiep)')
          .eq('chi_nhanh_giao_id', chiNhanhId)
          .order('ngay_dat', { ascending: false }).limit(100),
        supabase.from('khach_hang_b2b').select('id, ten_doanh_nghiep')
          .eq('trang_thai', 'hoat_dong').order('ten_doanh_nghiep'),
        supabase.from('vat_tu').select('id, ten_vat_tu, don_vi_tinh(ma_dvt)')
          .eq('duoc_ban', true).eq('trang_thai', 'hoat_dong').order('ten_vat_tu')
      ])
      if (d.error) throw d.error
      if (k.error) throw k.error
      if (v.error) throw v.error
      setDon(d.data || []); setKhachHangs(k.data || []); setVatTus(v.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  async function taoDon() {
    const hopLe = dongCt.filter(d => d.vat_tu_id && Number(d.so_luong) > 0)
    if (!khachHangId) { setLoi('Chưa chọn khách hàng.'); return }
    if (!hopLe.length) { setLoi('Cần ít nhất một dòng có sản phẩm và số lượng > 0.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { data: d, error: e1 } = await supabase.from('don_hang_b2b').insert({
        khach_hang_b2b_id: khachHangId,
        chi_nhanh_giao_id: chiNhanhId,
        ngay_giao_du_kien: ngayGiao || null
      }).select('id').single()
      if (e1) throw e1

      const { error: e2 } = await supabase.from('chi_tiet_don_hang_b2b').insert(
        hopLe.map(r => ({
          don_hang_id: d.id,
          vat_tu_id: r.vat_tu_id,
          so_luong: Number(r.so_luong),
          don_gia: Number(r.don_gia || 0)
        }))
      )
      if (e2) throw e2

      setMoTao(false); setKhachHangId(''); setNgayGiao(''); setDongCt([{ ...DONG_TRONG }])
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function doiTrangThai(d, tt, canhBao) {
    if (canhBao && !confirm(canhBao)) return
    setDangXuLy(true); setLoi(null)
    const { error } = await supabase.from('don_hang_b2b').update({ trang_thai: tt }).eq('id', d.id)
    if (error) setLoi(error.message)
    await napDs()
    setDangXuLy(false)
  }

  const moXem = useCallback(async (d) => {
    setXem(d); setCt([])
    const { data, error } = await supabase
      .from('chi_tiet_don_hang_b2b')
      .select('id, so_luong, don_gia, thanh_tien, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))')
      .eq('don_hang_id', d.id)
    if (error) setLoi(error.message)
    setCt(data || [])
  }, [])

  async function taoHoaDon() {
    if (!confirm(`Tạo hóa đơn công nợ cho đơn ${xem.so_don_hang}?`)) return
    setDangXuLy(true); setLoi(null)
    try {
      const { data: kh, error: e0 } = await supabase
        .from('don_hang_b2b').select('khach_hang_b2b_id, khach_hang_b2b(dieu_khoan_thanh_toan_ngay)')
        .eq('id', xem.id).single()
      if (e0) throw e0
      const soNgay = kh?.khach_hang_b2b?.dieu_khoan_thanh_toan_ngay ?? 30
      const han = new Date(); han.setDate(han.getDate() + soNgay)

      const { error: e1 } = await supabase.from('hoa_don_b2b').insert({
        don_hang_id: xem.id,
        khach_hang_b2b_id: kh.khach_hang_b2b_id,
        han_thanh_toan: han.toISOString().slice(0, 10),
        tien_hang: xem.tong_tien
      })
      if (e1) throw e1
      setXem(null)
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const duocTao = coQuyen('b2b', 'tao')
  const duocSua = coQuyen('b2b', 'sua')

  return (
    <Trang
      tieuDe="Đơn hàng B2B"
      mota="Xác nhận đơn sẽ giữ chỗ kho; chuyển sang Đang giao mới thực xuất theo FEFO"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Tạo đơn hàng</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={don}
            trong="Chưa có đơn hàng B2B nào"
            cot={[
              { ten: 'Số đơn', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>
                  {r.so_don_hang}
                </button>
              ) },
              { ten: 'Khách hàng', render: r => r.khach_hang_b2b?.ten_doanh_nghiep },
              { ten: 'Ngày đặt', render: r => ngayGio(r.ngay_dat) },
              { ten: 'Giao dự kiến', render: r => ngay(r.ngay_giao_du_kien) },
              { ten: 'Tổng tiền', lop: 'text-end', render: r => tien(r.tong_tien) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
              { ten: '', lop: 'text-end', render: r => {
                if (!duocSua) return null
                if (r.trang_thai === 'moi') {
                  return <button className="btn btn-sm btn-primary"
                    onClick={() => doiTrangThai(r, 'da_xac_nhan')}>Xác nhận</button>
                }
                if (r.trang_thai === 'da_xac_nhan') {
                  return <button className="btn btn-sm btn-warning"
                    onClick={() => doiTrangThai(r, 'dang_giao', `Xuất hàng đơn ${r.so_don_hang}? Kho sẽ bị trừ ngay theo FEFO.`)}>
                    Giao hàng
                  </button>
                }
                if (r.trang_thai === 'dang_giao') {
                  return <button className="btn btn-sm btn-success"
                    onClick={() => doiTrangThai(r, 'da_giao')}>Đã giao</button>
                }
                return null
              } }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moTao} rong tieuDe="Tạo đơn hàng B2B"
        onDong={() => setMoTao(false)} onLuu={taoDon} dangLuu={dangXuLy}
      >
        <div className="row g-3 mb-3">
          <div className="col-md-8">
            <label className="form-label">Khách hàng</label>
            <select className="form-select" value={khachHangId} onChange={e => setKhachHangId(e.target.value)}>
              <option value="">— Chọn —</option>
              {khachHangs.map(k => <option key={k.id} value={k.id}>{k.ten_doanh_nghiep}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Ngày giao dự kiến</label>
            <input type="date" className="form-control" value={ngayGiao}
              onChange={e => setNgayGiao(e.target.value)} />
          </div>
        </div>

        <table className="table table-sm align-middle">
          <thead className="table-light">
            <tr>
              <th style={{ minWidth: 220 }}>Sản phẩm</th>
              <th style={{ width: 100 }}>SL</th>
              <th style={{ width: 140 }}>Đơn giá</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {dongCt.map((d, i) => (
              <tr key={i}>
                <td>
                  <select className="form-select form-select-sm" value={d.vat_tu_id}
                    onChange={e => setDongCt(dongCt.map((r, j) => j === i ? { ...r, vat_tu_id: e.target.value } : r))}>
                    <option value="">— Chọn sản phẩm —</option>
                    {vatTus.map(v => <option key={v.id} value={v.id}>{v.ten_vat_tu} ({v.don_vi_tinh?.ma_dvt})</option>)}
                  </select>
                </td>
                <td><input type="number" step="0.001" min="0" className="form-control form-control-sm"
                  value={d.so_luong}
                  onChange={e => setDongCt(dongCt.map((r, j) => j === i ? { ...r, so_luong: e.target.value } : r))} /></td>
                <td><input type="number" step="1" min="0" className="form-control form-control-sm"
                  value={d.don_gia}
                  onChange={e => setDongCt(dongCt.map((r, j) => j === i ? { ...r, don_gia: e.target.value } : r))} /></td>
                <td>
                  <button className="btn btn-sm btn-outline-danger"
                    onClick={() => setDongCt(dongCt.filter((_, j) => j !== i))}
                    disabled={dongCt.length === 1}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-sm btn-outline-secondary"
          onClick={() => setDongCt([...dongCt, { ...DONG_TRONG }])}>+ Thêm dòng</button>
      </Modal>

      <Modal mo={!!xem} rong tieuDe={`Đơn ${xem?.so_don_hang || ''}`} onDong={() => setXem(null)}>
        <Bang
          dong={ct}
          trong="Đơn chưa có dòng nào"
          cot={[
            { ten: 'Sản phẩm', render: r => r.vat_tu?.ten_vat_tu },
            { ten: 'SL', lop: 'text-end', render: r => so(r.so_luong) },
            { ten: 'Đơn giá', lop: 'text-end', render: r => tien(r.don_gia) },
            { ten: 'Thành tiền', lop: 'text-end', render: r => tien(r.thanh_tien) }
          ]}
        />
        {xem?.trang_thai === 'da_giao' && duocSua && (
          <button className="btn btn-success mt-3" onClick={taoHoaDon} disabled={dangXuLy}>
            Tạo hóa đơn công nợ
          </button>
        )}
      </Modal>
    </Trang>
  )
}
