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

const KENH_BAN = [
  { gt: 'tai_cho', nhan: 'Tại chỗ' },
  { gt: 'online', nhan: 'Online' }
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
  const [kenhBan, setKenhBan] = useState('tai_cho')
  const [giamGia, setGiamGia] = useState('0')
  const [khuyenMaiId, setKhuyenMaiId] = useState('')
  const [khuyenMais, setKhuyenMais] = useState([])
  const [khachHangId, setKhachHangId] = useState('')
  const [khachHangs, setKhachHangs] = useState([])
  const [moKhachMoi, setMoKhachMoi] = useState(false)
  const [khachMoi, setKhachMoi] = useState({ ten_khach_hang: '', so_dien_thoai: '' })
  const [gioHang, setGioHang] = useState([{ ...DONG_TRONG }])

  const [xem, setXem] = useState(null)
  const [ctXem, setCtXem] = useState([])

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    try {
      const homNayIso = new Date().toISOString().slice(0, 10)
      const [h, v, km, kh] = await Promise.all([
        supabase.from('hoa_don_ban')
          .select('id, so_hoa_don, ngay_ban, tong_tien_hang, giam_gia, thanh_tien, tong_thanh_toan, hinh_thuc_thanh_toan, kenh_ban, trang_thai, khach_hang(ten_khach_hang)')
          .eq('chi_nhanh_id', chiNhanhId)
          .order('ngay_ban', { ascending: false }).limit(100),
        supabase.from('vat_tu')
          .select('id, ten_vat_tu, don_vi_tinh(ma_dvt)')
          .eq('duoc_ban', true).eq('trang_thai', 'hoat_dong').order('ten_vat_tu'),
        supabase.from('chuong_trinh_khuyen_mai')
          .select('id, ten_ctkm, loai_giam, gia_tri_giam, gia_tri_don_toi_thieu, ap_dung_kenh')
          .eq('dang_hoat_dong', true)
          .in('ap_dung_kenh', ['ban_le', 'ca_hai'])
          .lte('ap_dung_tu', homNayIso)
          .or(`ap_dung_den.is.null,ap_dung_den.gte.${homNayIso}`)
          .order('ten_ctkm'),
        supabase.from('khach_hang').select('id, ma_khach_hang, ten_khach_hang, so_dien_thoai')
          .order('ten_khach_hang').limit(500)
      ])
      if (h.error) throw h.error
      if (v.error) throw v.error
      if (km.error) throw km.error
      if (kh.error) throw kh.error
      setHoaDon(h.data || []); setVatTus(v.data || []); setKhuyenMais(km.data || [])
      setKhachHangs(kh.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  function suaDong(i, truong, gt) {
    setGioHang(g => g.map((r, j) => j === i ? { ...r, [truong]: gt } : r))
  }

  const tongTamTinh = gioHang.reduce((s, r) =>
    s + (Number(r.so_luong) || 0) * (Number(r.don_gia) || 0), 0)

  // Cập nhật lại số giảm gợi ý mỗi khi đổi chương trình hoặc giỏ hàng thay
  // đổi. Chỉ là GỢI Ý — nhân viên vẫn có thể sửa tay ô "Giảm giá" bên dưới.
  useEffect(() => {
    if (!khuyenMaiId) return
    const km = khuyenMais.find(k => k.id === khuyenMaiId)
    if (!km) return
    if (tongTamTinh < Number(km.gia_tri_don_toi_thieu || 0)) {
      setGiamGia('0')
      return
    }
    const goiY = km.loai_giam === 'phan_tram'
      ? Math.round(tongTamTinh * Number(km.gia_tri_giam) / 100)
      : Number(km.gia_tri_giam)
    setGiamGia(String(Math.min(goiY, tongTamTinh)))
  }, [khuyenMaiId, khuyenMais, tongTamTinh])

  async function taoKhachMoi() {
    if (!khachMoi.ten_khach_hang.trim()) { setLoi('Chưa điền tên khách hàng.'); return }
    setLoi(null)
    try {
      const ma = 'KH' + Date.now().toString().slice(-8)
      const { data, error } = await supabase.from('khach_hang')
        .insert({
          ma_khach_hang: ma,
          ten_khach_hang: khachMoi.ten_khach_hang.trim(),
          so_dien_thoai: khachMoi.so_dien_thoai || null
        })
        .select('id, ten_khach_hang, so_dien_thoai').single()
      if (error) throw error
      setKhachHangs(ds => [...ds, data].sort((a, b) => a.ten_khach_hang.localeCompare(b.ten_khach_hang, 'vi')))
      setKhachHangId(data.id)
      setMoKhachMoi(false); setKhachMoi({ ten_khach_hang: '', so_dien_thoai: '' })
    } catch (e) { setLoi(e.message) }
  }

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
          kenh_ban: kenhBan,
          giam_gia: Number(giamGia || 0),
          khuyen_mai_id: khuyenMaiId || null,
          khach_hang_id: khachHangId || null
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

      setMoTao(false); setGioHang([{ ...DONG_TRONG }]); setGiamGia('0')
      setKhuyenMaiId(''); setKhachHangId(''); setHinhThuc('tien_mat'); setKenhBan('tai_cho')
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
              { ten: 'Khách hàng', render: r => r.khach_hang?.ten_khach_hang || '—' },
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
        <div className="row g-3 mb-3">
          <div className="col-md-8">
            <label className="form-label">Khách hàng (không bắt buộc)</label>
            <div className="d-flex gap-2">
              <select className="form-select" value={khachHangId} onChange={e => setKhachHangId(e.target.value)}>
                <option value="">— Khách lẻ, không lưu thông tin —</option>
                {khachHangs.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.ten_khach_hang}{k.so_dien_thoai ? ` — ${k.so_dien_thoai}` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-outline-secondary text-nowrap"
                onClick={() => setMoKhachMoi(true)}>+ Khách mới</button>
            </div>
          </div>
          <div className="col-md-4">
            <label className="form-label">Kênh bán</label>
            <select className="form-select" value={kenhBan} onChange={e => setKenhBan(e.target.value)}>
              {KENH_BAN.map(k => <option key={k.gt} value={k.gt}>{k.nhan}</option>)}
            </select>
          </div>
        </div>

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
            <label className="form-label">Chương trình khuyến mãi</label>
            <select className="form-select" value={khuyenMaiId} onChange={e => setKhuyenMaiId(e.target.value)}>
              <option value="">— Không áp dụng —</option>
              {khuyenMais.map(k => (
                <option key={k.id} value={k.id}>
                  {k.ten_ctkm} ({k.loai_giam === 'phan_tram' ? `${k.gia_tri_giam}%` : tien(k.gia_tri_giam)})
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Giảm giá</label>
            <input type="number" min="0" className="form-control" value={giamGia}
              onChange={e => setGiamGia(e.target.value)} />
            {khuyenMaiId && <div className="form-text">Số gợi ý từ chương trình — có thể sửa tay.</div>}
          </div>
        </div>

        <div className="d-flex justify-content-end mt-3">
          <div className="text-end">
            <div className="text-secondary small">Tổng cộng</div>
            <div className="fs-4 fw-bold">{tien(tongTamTinh - Number(giamGia || 0))}</div>
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

      <Modal
        mo={moKhachMoi} tieuDe="Thêm khách hàng mới"
        onDong={() => setMoKhachMoi(false)} onLuu={taoKhachMoi} nhanLuu="Thêm"
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label">Tên khách hàng *</label>
            <input className="form-control" value={khachMoi.ten_khach_hang}
              onChange={e => setKhachMoi({ ...khachMoi, ten_khach_hang: e.target.value })} autoFocus />
          </div>
          <div className="col-12">
            <label className="form-label">Số điện thoại</label>
            <input className="form-control" value={khachMoi.so_dien_thoai}
              onChange={e => setKhachMoi({ ...khachMoi, so_dien_thoai: e.target.value })} />
          </div>
        </div>
      </Modal>
    </Trang>
  )
}
