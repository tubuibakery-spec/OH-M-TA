import { useEffect, useState, useCallback, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi } from '../components/Chung'
import { tien, ngay, homNay } from '../lib/dinhDang'

const TK_DOANH_THU = ['511', '515', '711']
const TK_CHI_PHI = ['632', '641', '642', '635', '811', '821']
const LOAI_TK = { tai_san: 'Tài sản', no_phai_tra: 'Nợ phải trả', von_chu_so_huu: 'Vốn chủ sở hữu' }

// Nhóm tài khoản cho Báo cáo lưu chuyển tiền tệ (B03-DN, phương pháp gián tiếp) —
// hard-code theo loại đã biết trước, giống phong cách TK_DOANH_THU/TK_CHI_PHI.
const TK_TS_NGAN_HAN = ['131', '133', '138', '141', '152', '153', '154', '155', '156'] // tăng bên Nợ
const TK_NO_NGAN_HAN = ['331', '3331', '3334', '3335', '334', '335', '338']            // tăng bên Có
const TK_TSCD_NG = ['211']  // tăng bên Nợ
const TK_VON = ['411']      // tăng bên Có
const TK_TIEN = ['111', '112'] // tăng bên Nợ
const TK_LCTT = [...TK_TS_NGAN_HAN, ...TK_NO_NGAN_HAN, ...TK_TSCD_NG, ...TK_VON, ...TK_TIEN]

function soDu(rows, dsSoHieu, tangBenNo) {
  const s = new Set(dsSoHieu)
  return rows.filter(r => s.has(r.so_hieu))
    .reduce((sum, r) => sum + (tangBenNo ? Number(r.no) - Number(r.co) : Number(r.co) - Number(r.no)), 0)
}

function dauThang() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function thangHomNay() {
  return new Date().toISOString().slice(0, 7)
}

export default function BaoCaoTaiChinh() {
  const { coQuyenMoiNoi, coQuyen } = useApp()
  const [tuNgay, setTuNgay] = useState(dauThang())
  const [denNgay, setDenNgay] = useState(homNay())
  const [thangKetChuyen, setThangKetChuyen] = useState(thangHomNay())

  const [canDoiThu, setCanDoiThu] = useState([])
  const [dongKqkd, setDongKqkd] = useState([])
  const [nhatKy, setNhatKy] = useState([])
  const [congTy, setCongTy] = useState(null)
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [dangKetChuyen, setDangKetChuyen] = useState(false)

  // Báo cáo lưu chuyển tiền tệ (B03-DN)
  const [soDuDauKy, setSoDuDauKy] = useState([])
  const [soDuCuoiKy, setSoDuCuoiKy] = useState([])
  const [khauHaoTrongKy, setKhauHaoTrongKy] = useState(0)

  // Thuyết minh BCTC (B09-DN tóm lược)
  const [taiSanList, setTaiSanList] = useState([])
  const [khauHaoLuyKe, setKhauHaoLuyKe] = useState([])
  const [congNoPhaiThu, setCongNoPhaiThu] = useState([])
  const [congNoPhaiTraNcc, setCongNoPhaiTraNcc] = useState([])
  const [doanhThuTheoKenh, setDoanhThuTheoKenh] = useState([])

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [cdt, kqkd, nk, ct, dauKy, cuoiKy, khKy, ts, khLuyKe, khPhaiThu, congNoNcc, dtKenh] = await Promise.all([
        supabase.from('bang_can_doi_thu_nghiem').select('*').order('so_hieu'),
        supabase.from('so_cai').select('so_hieu, no, co')
          .in('so_hieu', [...TK_DOANH_THU, ...TK_CHI_PHI])
          .gte('ngay_hach_toan', tuNgay).lte('ngay_hach_toan', denNgay),
        supabase.from('so_cai').select('*')
          .gte('ngay_hach_toan', tuNgay).lte('ngay_hach_toan', denNgay)
          .order('ngay_hach_toan').order('so_but_toan').limit(500),
        supabase.from('cau_hinh_cong_ty').select('*').eq('id', 1).maybeSingle(),
        supabase.from('so_cai').select('so_hieu, no, co').in('so_hieu', TK_LCTT).lt('ngay_hach_toan', tuNgay),
        supabase.from('so_cai').select('so_hieu, no, co').in('so_hieu', TK_LCTT).lte('ngay_hach_toan', denNgay),
        supabase.from('khau_hao_thang').select('so_tien').gte('ky', tuNgay).lte('ky', denNgay),
        supabase.from('tai_san').select('id, ten_tai_san, phan_loai_ke_toan, nguyen_gia, ngay_dua_vao_su_dung, so_thang_khau_hao')
          .in('phan_loai_ke_toan', ['tscd', 'ccdc']),
        supabase.from('khau_hao_thang').select('tai_san_id, so_tien').lte('ky', denNgay),
        supabase.from('khach_hang_b2b').select('ten_doanh_nghiep, du_no_hien_tai')
          .gt('du_no_hien_tai', 0).order('du_no_hien_tai', { ascending: false }).limit(20),
        supabase.from('cong_no_phai_tra_theo_ncc').select('*').gt('con_no', 0),
        supabase.from('loi_nhuan_gop_theo_ngay').select('kenh, doanh_thu').gte('ngay', tuNgay).lte('ngay', denNgay)
      ])
      for (const r of [cdt, kqkd, nk, ct, dauKy, cuoiKy, khKy, ts, khLuyKe, khPhaiThu, congNoNcc, dtKenh]) {
        if (r.error) throw r.error
      }
      setCanDoiThu(cdt.data || []); setDongKqkd(kqkd.data || []); setNhatKy(nk.data || [])
      setCongTy(ct.data || null)
      setSoDuDauKy(dauKy.data || []); setSoDuCuoiKy(cuoiKy.data || [])
      setKhauHaoTrongKy((khKy.data || []).reduce((s, r) => s + Number(r.so_tien), 0))
      setTaiSanList(ts.data || []); setKhauHaoLuyKe(khLuyKe.data || [])
      setCongNoPhaiThu(khPhaiThu.data || []); setCongNoPhaiTraNcc(congNoNcc.data || [])
      setDoanhThuTheoKenh(dtKenh.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [tuNgay, denNgay])

  useEffect(() => { nap() }, [nap])

  async function ketChuyen() {
    if (!confirm(`Kết chuyển lãi/lỗ tháng ${thangKetChuyen}? Có thể chạy lại an toàn (không nhân đôi).`)) return
    setDangKetChuyen(true); setLoi(null)
    try {
      const { error } = await supabase.rpc('rpc_ket_chuyen_thang', { p_thang: `${thangKetChuyen}-01` })
      if (error) throw error
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangKetChuyen(false) }
  }

  const tongTheoTk = {}
  for (const r of dongKqkd) {
    const delta = TK_DOANH_THU.includes(r.so_hieu) ? Number(r.co) - Number(r.no) : Number(r.no) - Number(r.co)
    tongTheoTk[r.so_hieu] = (tongTheoTk[r.so_hieu] || 0) + delta
  }
  const dt511 = tongTheoTk['511'] || 0
  const dt515 = tongTheoTk['515'] || 0
  const tn711 = tongTheoTk['711'] || 0
  const gv632 = tongTheoTk['632'] || 0
  const loiNhuanGop = dt511 + dt515 + tn711 - gv632
  const cp641 = tongTheoTk['641'] || 0
  const cp642 = tongTheoTk['642'] || 0
  const cp635 = tongTheoTk['635'] || 0
  const cpKhac = (tongTheoTk['811'] || 0) + (tongTheoTk['821'] || 0)
  const loiNhuanThuan = loiNhuanGop - cp641 - cp642 - cp635 - cpKhac

  const nhomTaiSan = canDoiThu.filter(r => r.loai === 'tai_san')
  const nhomNguonVon = canDoiThu.filter(r => r.loai === 'no_phai_tra' || r.loai === 'von_chu_so_huu')
  const tongTaiSan = nhomTaiSan.reduce((s, r) => s + Number(r.so_du), 0)
  const tongNguonVon = nhomNguonVon.reduce((s, r) => s + Number(r.so_du), 0)

  // ---- Báo cáo lưu chuyển tiền tệ (B03-DN, phương pháp gián tiếp) ----
  const dauTS = soDu(soDuDauKy, TK_TS_NGAN_HAN, true), cuoiTS = soDu(soDuCuoiKy, TK_TS_NGAN_HAN, true)
  const dauNo = soDu(soDuDauKy, TK_NO_NGAN_HAN, false), cuoiNo = soDu(soDuCuoiKy, TK_NO_NGAN_HAN, false)
  const dauTSCD = soDu(soDuDauKy, TK_TSCD_NG, true), cuoiTSCD = soDu(soDuCuoiKy, TK_TSCD_NG, true)
  const dauVon = soDu(soDuDauKy, TK_VON, false), cuoiVon = soDu(soDuCuoiKy, TK_VON, false)
  const dauTien = soDu(soDuDauKy, TK_TIEN, true), cuoiTienThucTe = soDu(soDuCuoiKy, TK_TIEN, true)

  const bienDongTS = cuoiTS - dauTS
  const bienDongNo = cuoiNo - dauNo
  const lctHdkd = loiNhuanThuan + khauHaoTrongKy - bienDongTS + bienDongNo

  const bienDongTSCD = cuoiTSCD - dauTSCD
  const lctDauTu = -bienDongTSCD || 0

  const bienDongVon = cuoiVon - dauVon
  const lctTaiChinh = bienDongVon

  const tongLct = lctHdkd + lctDauTu + lctTaiChinh
  const cuoiTienTinh = dauTien + tongLct
  const lechTienLct = cuoiTienTinh - cuoiTienThucTe

  // ---- Thuyết minh BCTC (B09-DN tóm lược) ----
  const khauHaoTheoTaiSan = {}
  for (const r of khauHaoLuyKe) {
    khauHaoTheoTaiSan[r.tai_san_id] = (khauHaoTheoTaiSan[r.tai_san_id] || 0) + Number(r.so_tien)
  }
  const taiSanChiTiet = taiSanList.map(t => {
    const haoMonLuyKe = khauHaoTheoTaiSan[t.id] || 0
    return { ...t, haoMonLuyKe, giaTriConLai: Number(t.nguyen_gia || 0) - haoMonLuyKe }
  })

  const doanhThuKenhGop = {}
  for (const r of doanhThuTheoKenh) {
    doanhThuKenhGop[r.kenh || 'Khác'] = (doanhThuKenhGop[r.kenh || 'Khác'] || 0) + Number(r.doanh_thu || 0)
  }
  const doanhThuKenhList = Object.entries(doanhThuKenhGop).sort((a, b) => b[1] - a[1])

  const duocKetChuyen = coQuyen('tai_chinh', 'duyet')

  if (!coQuyenMoiNoi('tai_chinh', 'xem')) return null
  if (dangTai) return <DangTai />

  return (
    <Trang
      tieuDe="Báo cáo tài chính"
      mota="Báo cáo tình hình tài chính (lũy kế tới hiện tại) + Kết quả kinh doanh & Nhật ký chung (theo khoảng ngày đã chọn)"
      hanhDong={
        <button className="btn btn-outline-secondary no-print" onClick={() => window.print()}>In báo cáo</button>
      }
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {congTy && (congTy.ten_cong_ty || congTy.ma_so_thue) && (
        <div className="text-center mb-3">
          {congTy.ten_cong_ty && <div className="fw-bold">{congTy.ten_cong_ty}</div>}
          <div className="small text-secondary">
            {congTy.ma_so_thue && <>MST: {congTy.ma_so_thue}</>}
            {congTy.ma_so_thue && congTy.dia_chi && ' — '}
            {congTy.dia_chi}
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm mb-3 no-print">
        <div className="card-body d-flex flex-wrap align-items-center gap-3">
          <label className="form-label mb-0 small">Từ ngày</label>
          <input type="date" className="form-control form-control-sm w-auto" value={tuNgay}
            onChange={e => setTuNgay(e.target.value)} />
          <label className="form-label mb-0 small">Đến ngày</label>
          <input type="date" className="form-control form-control-sm w-auto" value={denNgay}
            onChange={e => setDenNgay(e.target.value)} />

          {duocKetChuyen && (
            <div className="d-flex align-items-center gap-2 ms-auto">
              <label className="form-label mb-0 small">Tháng kết chuyển</label>
              <input type="month" className="form-control form-control-sm w-auto" value={thangKetChuyen}
                onChange={e => setThangKetChuyen(e.target.value)} />
              <button className="btn btn-sm btn-warning" onClick={ketChuyen} disabled={dangKetChuyen}>
                {dangKetChuyen ? 'Đang kết chuyển…' : 'Kết chuyển lãi/lỗ tháng này'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold">Báo cáo tình hình tài chính (Mẫu số B01-DN, tính đến hiện tại)</div>
        <div className="card-body p-0">
          <div className="row g-0">
            <div className="col-md-6 border-end">
              <table className="table table-sm mb-0">
                <thead className="table-light"><tr><th colSpan={2}>TÀI SẢN</th></tr></thead>
                <tbody>
                  {nhomTaiSan.map(r => (
                    <tr key={r.tai_khoan_id}>
                      <td>{r.so_hieu} — {r.ten_tai_khoan}</td>
                      <td className="text-end">{tien(r.so_du)}</td>
                    </tr>
                  ))}
                  <tr className="table-light fw-bold">
                    <td>TỔNG TÀI SẢN</td>
                    <td className="text-end">{tien(tongTaiSan)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="col-md-6">
              <table className="table table-sm mb-0">
                <thead className="table-light"><tr><th colSpan={2}>NGUỒN VỐN</th></tr></thead>
                <tbody>
                  {['no_phai_tra', 'von_chu_so_huu'].map(loai => (
                    <Fragment key={loai}>
                      <tr className="table-light">
                        <td colSpan={2} className="small text-secondary text-uppercase">{LOAI_TK[loai]}</td>
                      </tr>
                      {nhomNguonVon.filter(r => r.loai === loai).map(r => (
                        <tr key={r.tai_khoan_id}>
                          <td>{r.so_hieu} — {r.ten_tai_khoan}</td>
                          <td className="text-end">{tien(r.so_du)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  <tr className="table-light fw-bold">
                    <td>TỔNG NGUỒN VỐN</td>
                    <td className="text-end">{tien(tongNguonVon)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {Math.abs(tongTaiSan - tongNguonVon) >= 1 && (
            <div className="alert alert-danger small m-3 mb-0">
              Lệch {tien(tongTaiSan - tongNguonVon)} — có thể do chưa kết chuyển lãi/lỗ hết các kỳ trước.
            </div>
          )}
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold">Kết quả kinh doanh ({ngay(tuNgay)} – {ngay(denNgay)})</div>
        <div className="card-body p-0">
          <table className="table table-sm mb-0">
            <tbody>
              <tr><td>Doanh thu bán hàng (511)</td><td className="text-end">{tien(dt511)}</td></tr>
              <tr><td>Doanh thu hoạt động tài chính (515)</td><td className="text-end">{tien(dt515)}</td></tr>
              <tr><td>Thu nhập khác (711)</td><td className="text-end">{tien(tn711)}</td></tr>
              <tr><td>Giá vốn hàng bán (632)</td><td className="text-end">({tien(gv632)})</td></tr>
              <tr className="table-light fw-semibold"><td>Lợi nhuận gộp</td><td className="text-end">{tien(loiNhuanGop)}</td></tr>
              <tr><td>Chi phí bán hàng (641)</td><td className="text-end">({tien(cp641)})</td></tr>
              <tr><td>Chi phí quản lý doanh nghiệp (642)</td><td className="text-end">({tien(cp642)})</td></tr>
              <tr><td>Chi phí tài chính (635)</td><td className="text-end">({tien(cp635)})</td></tr>
              <tr><td>Chi phí khác (811, 821)</td><td className="text-end">({tien(cpKhac)})</td></tr>
              <tr className="table-light fw-bold">
                <td>Lợi nhuận thuần</td>
                <td className={`text-end ${loiNhuanThuan < 0 ? 'text-danger' : 'text-success'}`}>{tien(loiNhuanThuan)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold">Báo cáo lưu chuyển tiền tệ (Mẫu số B03-DN, phương pháp gián tiếp, {ngay(tuNgay)} – {ngay(denNgay)})</div>
        <div className="card-body p-0">
          <table className="table table-sm mb-0">
            <tbody>
              <tr><td>Lợi nhuận trước thuế</td><td className="text-end">{tien(loiNhuanThuan)}</td></tr>
              <tr><td>Khấu hao TSCĐ, phân bổ CCDC trong kỳ</td><td className="text-end">{tien(khauHaoTrongKy)}</td></tr>
              <tr><td>Biến động các khoản phải thu &amp; hàng tồn kho</td><td className="text-end">{tien(-bienDongTS || 0)}</td></tr>
              <tr><td>Biến động các khoản phải trả</td><td className="text-end">{tien(bienDongNo)}</td></tr>
              <tr className="table-light fw-bold">
                <td>Lưu chuyển tiền thuần từ hoạt động kinh doanh</td>
                <td className="text-end">{tien(lctHdkd)}</td>
              </tr>
              <tr><td>Tiền chi mua sắm, xây dựng TSCĐ</td><td className="text-end">{tien(lctDauTu)}</td></tr>
              <tr className="table-light fw-bold">
                <td>Lưu chuyển tiền thuần từ hoạt động đầu tư</td>
                <td className="text-end">{tien(lctDauTu)}</td>
              </tr>
              <tr><td>Biến động vốn góp chủ sở hữu</td><td className="text-end">{tien(bienDongVon)}</td></tr>
              <tr className="table-light fw-bold">
                <td>Lưu chuyển tiền thuần từ hoạt động tài chính</td>
                <td className="text-end">{tien(lctTaiChinh)}</td>
              </tr>
              <tr className="table-light fw-bold">
                <td>Lưu chuyển tiền thuần trong kỳ</td>
                <td className="text-end">{tien(tongLct)}</td>
              </tr>
              <tr><td>Tiền và tương đương tiền đầu kỳ</td><td className="text-end">{tien(dauTien)}</td></tr>
              <tr className="fw-bold">
                <td>Tiền và tương đương tiền cuối kỳ (tính theo lưu chuyển)</td>
                <td className="text-end">{tien(cuoiTienTinh)}</td>
              </tr>
              <tr>
                <td>Tiền và tương đương tiền cuối kỳ (thực tế, từ sổ cái)</td>
                <td className="text-end">{tien(cuoiTienThucTe)}</td>
              </tr>
            </tbody>
          </table>
          {Math.abs(lechTienLct) >= 1 && (
            <div className="alert alert-warning small m-3 mb-0">
              Lệch {tien(lechTienLct)} giữa tiền cuối kỳ tính theo lưu chuyển và số thực tế trên sổ cái — có thể do
              1 biến động tài khoản chưa được phân loại vào HĐKD/đầu tư/tài chính. Phương pháp gián tiếp giản lược,
              dùng để đối chiếu tổng thể, không thay thế rà soát của kế toán viên.
            </div>
          )}
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold">Thuyết minh Báo cáo tài chính (Mẫu số B09-DN, tóm lược)</div>
        <div className="card-body">
          <h6 className="fw-bold">I. Đặc điểm hoạt động</h6>
          <p className="small mb-3">
            {congTy?.ten_cong_ty || '— chưa cấu hình tên công ty —'}
            {congTy?.ma_so_thue && <> — MST: {congTy.ma_so_thue}</>}. Đơn vị tiền tệ sử dụng trong kế toán:{' '}
            {congTy?.don_vi_tien_te || 'VND'}.
          </p>

          <h6 className="fw-bold">II. Chính sách kế toán áp dụng</h6>
          <ul className="small mb-3">
            <li>Đơn vị tiền tệ ghi sổ kế toán: Đồng Việt Nam (VND).</li>
            <li>Nguyên tắc ghi nhận hàng tồn kho: theo giá đích danh lô nhập (FEFO đối với hàng có hạn sử dụng).</li>
            <li>Nguyên tắc khấu hao TSCĐ và phân bổ công cụ dụng cụ: phương pháp đường thẳng theo số tháng sử dụng ước tính.</li>
            <li>Nguyên tắc ghi nhận doanh thu: tại thời điểm giao dịch bán hàng/cung cấp dịch vụ hoàn tất.</li>
          </ul>

          <h6 className="fw-bold">III. Thông tin bổ sung Bảng cân đối kế toán</h6>
          <div className="row g-3 mb-2">
            <div className="col-lg-4">
              <div className="small fw-semibold mb-1">Chi tiết TSCĐ &amp; CCDC</div>
              <Bang
                khoa="id"
                trong="Chưa có TSCĐ/CCDC nào"
                dong={taiSanChiTiet}
                cot={[
                  { ten: 'Tên', render: r => r.ten_tai_san },
                  { ten: 'Nguyên giá', lop: 'text-end', render: r => tien(r.nguyen_gia) },
                  { ten: 'Hao mòn luỹ kế', lop: 'text-end', render: r => tien(r.haoMonLuyKe) },
                  { ten: 'Giá trị còn lại', lop: 'text-end', render: r => tien(r.giaTriConLai) }
                ]}
              />
            </div>
            <div className="col-lg-4">
              <div className="small fw-semibold mb-1">Chi tiết phải thu khách hàng (B2B)</div>
              <Bang
                khoa="ten_doanh_nghiep"
                trong="Không còn công nợ phải thu"
                dong={congNoPhaiThu}
                cot={[
                  { ten: 'Khách hàng', render: r => r.ten_doanh_nghiep },
                  { ten: 'Còn nợ', lop: 'text-end', render: r => tien(r.du_no_hien_tai) }
                ]}
              />
              {congNoPhaiThu.length === 0 && (
                <div className="small text-secondary mt-1">
                  Nếu thực tế đang có công nợ B2B mà bảng trống, có thể do tài khoản đang xem chưa có quyền module B2B.
                </div>
              )}
            </div>
            <div className="col-lg-4">
              <div className="small fw-semibold mb-1">Chi tiết phải trả người bán</div>
              <Bang
                khoa="ten_ncc"
                trong="Không còn công nợ phải trả"
                dong={congNoPhaiTraNcc}
                cot={[
                  { ten: 'Nhà cung cấp', render: r => r.ten_ncc },
                  { ten: 'Còn nợ', lop: 'text-end', render: r => tien(r.con_no) }
                ]}
              />
            </div>
          </div>

          <h6 className="fw-bold">IV. Thông tin bổ sung Báo cáo kết quả kinh doanh</h6>
          <div className="small fw-semibold mb-1">Doanh thu theo kênh bán ({ngay(tuNgay)} – {ngay(denNgay)})</div>
          <Bang
            khoa="kenh"
            trong="Chưa có doanh số trong khoảng ngày này"
            dong={doanhThuKenhList.map(([kenh, doanhThu]) => ({ kenh, doanhThu }))}
            cot={[
              { ten: 'Kênh', render: r => r.kenh },
              { ten: 'Doanh thu', lop: 'text-end', render: r => tien(r.doanhThu) }
            ]}
          />
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Nhật ký chung ({ngay(tuNgay)} – {ngay(denNgay)})</div>
        <div className="card-body p-0">
          <Bang
            trong="Không có bút toán nào trong khoảng ngày này"
            dong={nhatKy}
            cot={[
              { ten: 'Ngày', render: r => ngay(r.ngay_hach_toan) },
              { ten: 'Số CT', render: r => r.so_but_toan },
              { ten: 'Diễn giải', render: r => r.dien_giai },
              { ten: 'Tài khoản', render: r => `${r.so_hieu} — ${r.ten_tai_khoan}` },
              { ten: 'Người lập', render: r => r.nguoi_lap_email || '—' },
              { ten: 'Nợ', lop: 'text-end', render: r => r.no > 0 ? tien(r.no) : '—' },
              { ten: 'Có', lop: 'text-end', render: r => r.co > 0 ? tien(r.co) : '—' }
            ]}
          />
        </div>
      </div>
    </Trang>
  )
}
