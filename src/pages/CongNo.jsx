import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal, The } from '../components/Chung'
import { tien, ngay } from '../lib/dinhDang'

export default function CongNo() {
  const { coQuyen } = useApp()
  const [hoaDon, setHoaDon] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [thu, setThu] = useState(null)
  const [soTien, setSoTien] = useState('')
  const [hinhThuc, setHinhThuc] = useState('tien_mat')
  const [dangLuu, setDangLuu] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase
      .from('hoa_don_b2b')
      .select('id, so_hoa_don, ngay_xuat_hoa_don, han_thanh_toan, tong_tien, da_thanh_toan, con_lai, trang_thai_thanh_toan, trang_thai, khach_hang_b2b(ten_doanh_nghiep)')
      .eq('trang_thai', 'hieu_luc')
      .order('han_thanh_toan')
      .limit(200)
    if (error) setLoi(error.message)
    setHoaDon(data || []); setDangTai(false)
  }, [])

  useEffect(() => { nap() }, [nap])

  async function ghiThu() {
    if (!Number(soTien) || Number(soTien) <= 0) { setLoi('Số tiền phải lớn hơn 0.'); return }
    setDangLuu(true); setLoi(null)
    try {
      const { error } = await supabase.from('phieu_thu_cong_no').insert({
        hoa_don_b2b_id: thu.id,
        so_tien: Number(soTien),
        hinh_thuc: hinhThuc
      })
      if (error) throw error
      setThu(null); setSoTien(''); setHinhThuc('tien_mat')
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const duocThu = coQuyen('cong_no', 'tao')
  const homNay = new Date().toISOString().slice(0, 10)
  const tongConLai = hoaDon.reduce((s, r) => s + Number(r.con_lai || 0), 0)
  const soQuaHan = hoaDon.filter(r => r.con_lai > 0 && r.han_thanh_toan < homNay).length
  const tongQuaHan = hoaDon
    .filter(r => r.con_lai > 0 && r.han_thanh_toan < homNay)
    .reduce((s, r) => s + Number(r.con_lai), 0)

  return (
    <Trang tieuDe="Công nợ phải thu" mota="Hóa đơn B2B chưa thu hết tiền, sắp xếp theo hạn thanh toán gần nhất">
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="row g-3 mb-4">
        <The nhan="Tổng còn phải thu" gt={tien(tongConLai)} mau="dark" />
        <The nhan="Số hóa đơn quá hạn" gt={soQuaHan} mau={soQuaHan ? 'danger' : 'success'} />
        <The nhan="Giá trị quá hạn" gt={tien(tongQuaHan)} mau={tongQuaHan ? 'danger' : 'success'} />
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={hoaDon}
            trong="Không có công nợ nào"
            cot={[
              { ten: 'Số HĐ', render: r => r.so_hoa_don },
              { ten: 'Khách hàng', render: r => r.khach_hang_b2b?.ten_doanh_nghiep },
              { ten: 'Ngày xuất', render: r => ngay(r.ngay_xuat_hoa_don) },
              { ten: 'Hạn thanh toán', render: r => (
                <span className={r.con_lai > 0 && r.han_thanh_toan < homNay ? 'text-danger fw-semibold' : ''}>
                  {ngay(r.han_thanh_toan)}
                </span>
              ) },
              { ten: 'Tổng tiền', lop: 'text-end', render: r => tien(r.tong_tien) },
              { ten: 'Đã thu', lop: 'text-end', render: r => tien(r.da_thanh_toan) },
              { ten: 'Còn lại', lop: 'text-end', render: r => (
                <span className="fw-semibold">{tien(r.con_lai)}</span>
              ) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai_thanh_toan} /> },
              { ten: '', lop: 'text-end', render: r => duocThu && r.con_lai > 0 && (
                <button className="btn btn-sm btn-success" onClick={() => { setThu(r); setSoTien(String(r.con_lai)) }}>
                  Ghi thu
                </button>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!thu} tieuDe={`Ghi phiếu thu — ${thu?.so_hoa_don || ''}`}
        onDong={() => setThu(null)} onLuu={ghiThu} dangLuu={dangLuu} nhanLuu="Ghi thu"
      >
        {thu && (
          <div className="row g-3">
            <div className="col-12">
              <div className="text-secondary small">Khách hàng</div>
              <div className="fw-semibold">{thu.khach_hang_b2b?.ten_doanh_nghiep}</div>
            </div>
            <div className="col-md-6">
              <label className="form-label">Số tiền thu (còn lại {tien(thu.con_lai)})</label>
              <input type="number" min="0" max={thu.con_lai} className="form-control"
                value={soTien} onChange={e => setSoTien(e.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Hình thức</label>
              <select className="form-select" value={hinhThuc} onChange={e => setHinhThuc(e.target.value)}>
                <option value="tien_mat">Tiền mặt</option>
                <option value="chuyen_khoan">Chuyển khoản</option>
              </select>
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
