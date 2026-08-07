import { useEffect, useState, useCallback, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi } from '../components/Chung'
import { tien, ngay, homNay } from '../lib/dinhDang'

const TK_DOANH_THU = ['511', '515', '711']
const TK_CHI_PHI = ['632', '641', '642', '635', '811', '821']
const LOAI_TK = { tai_san: 'Tài sản', no_phai_tra: 'Nợ phải trả', von_chu_so_huu: 'Vốn chủ sở hữu' }

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
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [dangKetChuyen, setDangKetChuyen] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [cdt, kqkd, nk] = await Promise.all([
        supabase.from('bang_can_doi_thu_nghiem').select('*').order('so_hieu'),
        supabase.from('so_cai').select('so_hieu, no, co')
          .in('so_hieu', [...TK_DOANH_THU, ...TK_CHI_PHI])
          .gte('ngay_hach_toan', tuNgay).lte('ngay_hach_toan', denNgay),
        supabase.from('so_cai').select('*')
          .gte('ngay_hach_toan', tuNgay).lte('ngay_hach_toan', denNgay)
          .order('ngay_hach_toan').order('so_but_toan').limit(500)
      ])
      if (cdt.error) throw cdt.error
      if (kqkd.error) throw kqkd.error
      if (nk.error) throw nk.error
      setCanDoiThu(cdt.data || []); setDongKqkd(kqkd.data || []); setNhatKy(nk.data || [])
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

  const duocKetChuyen = coQuyen('tai_chinh', 'duyet')

  if (!coQuyenMoiNoi('tai_chinh', 'xem')) return null
  if (dangTai) return <DangTai />

  return (
    <Trang
      tieuDe="Báo cáo tài chính"
      mota="Bảng cân đối kế toán (lũy kế tới hiện tại) + Kết quả kinh doanh & Nhật ký chung (theo khoảng ngày đã chọn)"
      hanhDong={
        <button className="btn btn-outline-secondary no-print" onClick={() => window.print()}>In báo cáo</button>
      }
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

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
        <div className="card-header bg-white fw-semibold">Bảng cân đối kế toán (tính đến hiện tại)</div>
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

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Nhật ký chung ({ngay(tuNgay)} – {ngay(denNgay)})</div>
        <div className="card-body p-0">
          <Bang
            khoa="but_toan_id"
            trong="Không có bút toán nào trong khoảng ngày này"
            dong={nhatKy}
            cot={[
              { ten: 'Ngày', render: r => ngay(r.ngay_hach_toan) },
              { ten: 'Số CT', render: r => r.so_but_toan },
              { ten: 'Diễn giải', render: r => r.dien_giai },
              { ten: 'Tài khoản', render: r => `${r.so_hieu} — ${r.ten_tai_khoan}` },
              { ten: 'Nợ', lop: 'text-end', render: r => r.no > 0 ? tien(r.no) : '—' },
              { ten: 'Có', lop: 'text-end', render: r => r.co > 0 ? tien(r.co) : '—' }
            ]}
          />
        </div>
      </div>
    </Trang>
  )
}
