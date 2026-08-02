import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, so, ngay, ngayGio } from '../lib/dinhDang'

export default function DonDatHang() {
  const { chiNhanhId, coQuyen } = useApp()
  const [don, setDon] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [xem, setXem] = useState(null)
  const [ct, setCt] = useState([])

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase
      .from('don_dat_hang_ncc')
      .select('id, so_don, ngay_dat, ngay_giao_du_kien, tong_tien, trang_thai, nha_cung_cap(ten_ncc)')
      .eq('chi_nhanh_id', chiNhanhId)
      .order('ngay_dat', { ascending: false }).limit(100)
    if (error) setLoi(error.message)
    setDon(data || []); setDangTai(false)
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  async function moXem(d) {
    setXem(d); setCt([])
    const { data, error } = await supabase
      .from('chi_tiet_don_dat_hang_ncc')
      .select('id, so_luong_mua, he_so_quy_doi, so_luong_dat, so_luong_da_nhan, don_gia, thanh_tien, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))')
      .eq('don_dat_hang_id', d.id)
    if (error) setLoi(error.message)
    setCt(data || [])
  }

  async function doiTrangThai(d, tt) {
    setLoi(null)
    const { error } = await supabase.from('don_dat_hang_ncc').update({ trang_thai: tt }).eq('id', d.id)
    if (error) setLoi(error.message)
    await napDs()
  }

  const duocSua = coQuyen('mua_hang', 'sua')

  return (
    <Trang tieuDe="Đơn đặt nhà cung cấp" mota="Đơn ở trạng thái Đã gửi / Đã xác nhận mới được tính là “hàng đang về”">
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={don}
            trong="Chưa có đơn đặt hàng nào. Vào mục “Đề xuất đặt hàng” để tạo."
            cot={[
              { ten: 'Số đơn', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>
                  {r.so_don}
                </button>
              ) },
              { ten: 'Ngày đặt', render: r => ngayGio(r.ngay_dat) },
              { ten: 'Nhà cung cấp', render: r => r.nha_cung_cap?.ten_ncc || '—' },
              { ten: 'Giao dự kiến', render: r => ngay(r.ngay_giao_du_kien) },
              { ten: 'Tổng tiền', lop: 'text-end', render: r => tien(r.tong_tien) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
              { ten: '', lop: 'text-end', render: r => {
                if (!duocSua) return null
                if (r.trang_thai === 'nhap') {
                  return <button className="btn btn-sm btn-primary" onClick={() => doiTrangThai(r, 'da_gui')}>Gửi NCC</button>
                }
                if (r.trang_thai === 'da_gui') {
                  return <button className="btn btn-sm btn-outline-primary" onClick={() => doiTrangThai(r, 'da_xac_nhan')}>NCC xác nhận</button>
                }
                return null
              } }
            ]}
          />
        </div>
      )}

      <Modal mo={!!xem} rong tieuDe={`Đơn ${xem?.so_don || ''}`} onDong={() => setXem(null)}>
        <Bang
          dong={ct}
          trong="Đơn chưa có dòng nào"
          cot={[
            { ten: 'Vật tư', render: r => r.vat_tu?.ten_vat_tu },
            { ten: 'Đặt (ĐV mua)', lop: 'text-end', render: r => so(r.so_luong_mua) },
            { ten: 'Quy đổi', lop: 'text-end', render: r => `×${so(r.he_so_quy_doi)}` },
            { ten: 'Thành SL kho', lop: 'text-end', render: r => `${so(r.so_luong_dat)} ${r.vat_tu?.don_vi_tinh?.ma_dvt || ''}` },
            { ten: 'Đã nhận', lop: 'text-end', render: r => (
              <span className={Number(r.so_luong_da_nhan) >= Number(r.so_luong_dat) ? 'text-success fw-semibold' : ''}>
                {so(r.so_luong_da_nhan)}
              </span>
            ) },
            { ten: 'Đơn giá', lop: 'text-end', render: r => tien(r.don_gia) },
            { ten: 'Thành tiền', lop: 'text-end', render: r => tien(r.thanh_tien) }
          ]}
        />
        <div className="alert alert-secondary small mt-3 mb-0">
          “Đã nhận” tự cộng khi phiếu nhập gắn với đơn này được duyệt.
        </div>
      </Modal>
    </Trang>
  )
}
