import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, so, ngayGio } from '../lib/dinhDang'

const HINH_THUC = [
  { gt: 'tien_mat', nhan: 'Tiền mặt' },
  { gt: 'chuyen_khoan', nhan: 'Chuyển khoản' },
  { gt: 'the', nhan: 'Thẻ' },
  { gt: 'vi_dien_tu', nhan: 'Ví điện tử' }
]

const DONG_TRONG = { vat_tu_id: '', so_luong: '1', don_gia: '' }

export default function BanLe() {
  const { chiNhanhId, coQuyen } = useApp()
  const [hoaDon, setHoaDon] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [moTao, setMoTao] = useState(false)
  const [dangLuu, setDangLuu] = useState(false)
  const [hinhThuc, setHinhThuc] = useState('tien_mat')
  const [giamGia, setGiamGia] = useState('0')
  const [gioHang, setGioHang] = useState([{ ...DONG_TRONG }])

  const [xem, setXem] = useState(null)
  const [ctXem, setCtXem] = useState([])

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    try {
      const [h, v] = await Promise.all([
        supabase.from('hoa_don_ban')
          .select('id, so_hoa_don, ngay_ban, tong_tien_hang, giam_gia, thanh_tien, tong_thanh_toan, hinh_thuc_thanh_toan, trang_thai')
          .eq('chi_nhanh_id', chiNhanhId)
          .order('ngay_ban', { ascending: false }).limit(100),
        supabase.from('vat_tu')
          .select('id, ten_vat_tu, don_vi_tinh(ma_dvt)')
          .eq('duoc_ban', true).eq('trang_thai', 'hoat_dong').order('ten_vat_tu')
      ])
      if (h.error) throw h.error
      if (v.error) throw v.error
      setHoaDon(h.data || []); setVatTus(v.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  function suaDong(i, truong, gt) {
    setGioHang(g => g.map((r, j) => j === i ? { ...r, [truong]: gt } : r))
  }

  const tongTamTinh = gioHang.reduce((s, r) =>
    s + (Number(r.so_luong) || 0) * (Number(r.don_gia) || 0), 0)

  async function thanhToan() {
    const hopLe = gioHang.filter(d => d.vat_tu_id && Number(d.so_luong) > 0)
    if (!hopLe.length) { setLoi('Giỏ hàng trống.'); return }
    setDangLuu(true); setLoi(null)
    try {
      const { data: hd, error: e1 } = await supabase
        .from('hoa_don_ban')
        .insert({
          chi_nhanh_id: chiNhanhId,
          hinh_thuc_thanh_toan: hinhThuc,
          giam_gia: Number(giamGia || 0)
        })
        .select('id, so_hoa_don').single()
      if (e1) throw e1

      const { error: e2 } = await supabase.from('chi_tiet_hoa_don_ban').insert(
        hopLe.map(d => ({
          hoa_don_id: hd.id,
          vat_tu_id: d.vat_tu_id,
          so_luong: Number(d.so_luong),
          don_gia: Number(d.don_gia || 0)
        }))
      )
      if (e2) throw e2

      setMoTao(false); setGioHang([{ ...DONG_TRONG }]); setGiamGia('0'); setHinhThuc('tien_mat')
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function doiTrangThai(hd, tt, canhBao) {
    if (canhBao && !confirm(canhBao)) return
    setLoi(null)
    const { error } = await supabase.from('hoa_don_ban').update({ trang_thai: tt }).eq('id', hd.id)
    if (error) setLoi(error.message)
    await napDs()
  }

  async function moXem(hd) {
    setXem(hd); setCtXem([])
    const { data, error } = await supabase
      .from('chi_tiet_hoa_don_ban')
      .select('id, so_luong, don_gia, thanh_tien, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))')
      .eq('hoa_don_id', hd.id)
    if (error) setLoi(error.message)
    setCtXem(data || [])
  }

  const duocTao = coQuyen('ban_le', 'tao')
  const duocSua = coQuyen('ban_le', 'sua')

  return (
    <Trang
      tieuDe="Bán lẻ"
      mota="Hóa đơn ghi nhận ngay là đã bán — kho trừ tự động theo FEFO"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Hóa đơn mới</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={hoaDon}
            trong="Chưa có hóa đơn nào"
            cot={[
              { ten: 'Số HĐ', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>
                  {r.so_hoa_don}
                </button>
              ) },
              { ten: 'Giờ', render: r => ngayGio(r.ngay_ban) },
              { ten: 'Tổng tiền', lop: 'text-end', render: r => tien(r.tong_thanh_toan ?? r.thanh_tien) },
              { ten: 'Thanh toán', render: r =>
                  HINH_THUC.find(h => h.gt === r.hinh_thuc_thanh_toan)?.nhan || r.hinh_thuc_thanh_toan },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
              { ten: '', lop: 'text-end', render: r => duocSua && r.trang_thai === 'hoan_thanh' && (
                <button className="btn btn-sm btn-outline-danger"
                  onClick={() => doiTrangThai(r, 'da_huy', `Hủy hóa đơn ${r.so_hoa_don}? Kho sẽ được hoàn lại đúng lô đã xuất.`)}>
                  Hủy
                </button>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moTao} rong tieuDe="Hóa đơn bán lẻ mới"
        onDong={() => setMoTao(false)}
        onLuu={thanhToan} dangLuu={dangLuu} nhanLuu="Thanh toán"
      >
        <table className="table table-sm align-middle">
          <thead className="table-light">
            <tr>
              <th style={{ minWidth: 220 }}>Sản phẩm</th>
              <th style={{ width: 100 }}>SL</th>
              <th style={{ width: 140 }}>Đơn giá</th>
              <th style={{ width: 120 }} className="text-end">Thành tiền</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {gioHang.map((d, i) => (
              <tr key={i}>
                <td>
                  <select className="form-select form-select-sm" value={d.vat_tu_id}
                    onChange={e => suaDong(i, 'vat_tu_id', e.target.value)}>
                    <option value="">— Chọn sản phẩm —</option>
                    {vatTus.map(v => (
                      <option key={v.id} value={v.id}>{v.ten_vat_tu} ({v.don_vi_tinh?.ma_dvt})</option>
                    ))}
                  </select>
                </td>
                <td><input type="number" step="0.001" min="0" className="form-control form-control-sm"
                  value={d.so_luong} onChange={e => suaDong(i, 'so_luong', e.target.value)} /></td>
                <td><input type="number" step="1" min="0" className="form-control form-control-sm"
                  value={d.don_gia} onChange={e => suaDong(i, 'don_gia', e.target.value)} /></td>
                <td className="text-end">{tien((Number(d.so_luong) || 0) * (Number(d.don_gia) || 0))}</td>
                <td>
                  <button className="btn btn-sm btn-outline-danger"
                    onClick={() => setGioHang(gioHang.filter((_, j) => j !== i))}
                    disabled={gioHang.length === 1}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-sm btn-outline-secondary mb-3"
          onClick={() => setGioHang([...gioHang, { ...DONG_TRONG }])}>+ Thêm dòng</button>

        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Hình thức thanh toán</label>
            <select className="form-select" value={hinhThuc} onChange={e => setHinhThuc(e.target.value)}>
              {HINH_THUC.map(h => <option key={h.gt} value={h.gt}>{h.nhan}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Giảm giá</label>
            <input type="number" min="0" className="form-control" value={giamGia}
              onChange={e => setGiamGia(e.target.value)} />
          </div>
          <div className="col-md-4 d-flex align-items-end justify-content-end">
            <div className="text-end">
              <div className="text-secondary small">Tổng cộng</div>
              <div className="fs-4 fw-bold">{tien(tongTamTinh - Number(giamGia || 0))}</div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal mo={!!xem} rong tieuDe={`Hóa đơn ${xem?.so_hoa_don || ''}`} onDong={() => setXem(null)}>
        <Bang
          dong={ctXem}
          trong="Hóa đơn chưa có dòng nào"
          cot={[
            { ten: 'Sản phẩm', render: r => r.vat_tu?.ten_vat_tu },
            { ten: 'ĐVT', render: r => r.vat_tu?.don_vi_tinh?.ma_dvt },
            { ten: 'SL', lop: 'text-end', render: r => so(r.so_luong) },
            { ten: 'Đơn giá', lop: 'text-end', render: r => tien(r.don_gia) },
            { ten: 'Thành tiền', lop: 'text-end', render: r => tien(r.thanh_tien) }
          ]}
        />
      </Modal>
    </Trang>
  )
}
