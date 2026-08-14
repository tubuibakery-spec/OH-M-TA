import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, The, TrangThai } from '../components/Chung'
import { tien, so, ngay } from '../lib/dinhDang'

const PHONG_BAN_TAI_CHINH = ['ban_gd', 'ke_toan']

function doTinCay(uyTin) {
  if (!uyTin || !uyTin.so_don_da_giao) return { nhan: 'Chưa đủ dữ liệu', mau: 'secondary' }
  const tyLeTre = uyTin.so_don_giao_tre / uyTin.so_don_da_giao
  const tongDaXong = uyTin.so_don_hoan_thanh + uyTin.so_don_huy
  const tyLeHuy = tongDaXong ? uyTin.so_don_huy / tongDaXong : 0
  if (tyLeTre > 0.2 || tyLeHuy > 0.15) return { nhan: 'Cần lưu ý', mau: 'danger' }
  if (tyLeTre > 0.1 || tyLeHuy > 0.05) return { nhan: 'Khá', mau: 'warning' }
  return { nhan: 'Tốt', mau: 'success' }
}

export default function BaoCao() {
  const { chiNhanhId, chiNhanh, phongBanId, coQuyenMoiNoi } = useApp()
  const hienTaiChinh = PHONG_BAN_TAI_CHINH.includes(phongBanId) && coQuyenMoiNoi('tai_chinh', 'xem')
  const hienThuMua = phongBanId === 'thu_mua' && coQuyenMoiNoi('mua_hang', 'xem')
  const [dl, setDl] = useState(null)
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  useEffect(() => {
    let huy = false
    async function nap() {
      setDangTai(true); setLoi(null)
      const tuNgay = new Date(); tuNgay.setDate(tuNgay.getDate() - 30)
      const tuNgayStr = tuNgay.toISOString().slice(0, 10)
      const dauThang = new Date(new Date().setDate(1)).toISOString().slice(0, 10)

      // Nhóm tài chính — chỉ hiện khi phòng ban đang chọn là Ban GĐ/Kế toán
      // VÀ tài khoản có quyền tai_chinh. Tách try/catch riêng để lỗi ở đây
      // không kéo sập nhóm tồn kho bên dưới (trang này là trang chủ '/' cho
      // MỌI vai trò sau đăng nhập).
      let taiChinh = null
      if (hienTaiChinh) {
        try {
          const [tongQuanThang, loiNhuan, giaTriTon, congNoNcc, haoHut] = await Promise.all([
            supabase.from('bi_tong_quan_thang').select('*').maybeSingle(),
            supabase.from('loi_nhuan_gop_theo_ngay').select('*').gte('ngay', tuNgayStr).order('ngay', { ascending: false }),
            supabase.from('gia_tri_ton_kho').select('*').order('gia_tri_ton', { ascending: false }),
            supabase.from('cong_no_phai_tra_theo_ncc').select('*').limit(20),
            supabase.from('phan_tich_hao_hut').select('*')
              .gte('thang', dauThang).order('gia_tri_huy', { ascending: false }).limit(20)
          ])
          for (const r of [tongQuanThang, loiNhuan, giaTriTon, congNoNcc, haoHut]) if (r.error) throw r.error
          taiChinh = {
            thang: tongQuanThang.data,
            loiNhuan: loiNhuan.data || [],
            giaTriTon: giaTriTon.data || [],
            congNoNcc: congNoNcc.data || [],
            haoHut: haoHut.data || []
          }
        } catch (e) {
          if (!huy) setLoi(e.message)
        }
      }

      // Nhóm thu mua — chỉ hiện khi phòng ban đang chọn là Thu mua VÀ có quyền mua_hang.
      let thuMua = null
      if (hienThuMua) {
        try {
          const [congNoNcc, uyTin, ycbg, giaNcc, vatTus, donThang] = await Promise.all([
            supabase.from('cong_no_phai_tra_theo_ncc').select('*'),
            supabase.from('diem_uy_tin_ncc').select('*'),
            supabase.from('yeu_cau_bao_gia').select('id, so_yc, tieu_de, han_bao_gia, trang_thai')
              .in('trang_thai', ['nhap', 'da_gui']).order('han_bao_gia'),
            supabase.from('gia_nha_cung_cap').select('vat_tu_id').eq('la_ncc_chinh', true).eq('dang_ap_dung', true),
            supabase.from('vat_tu').select('id, ten_vat_tu').eq('trang_thai', 'hoat_dong'),
            supabase.from('don_dat_hang_ncc').select('trang_thai, tong_tien').gte('ngay_dat', dauThang)
          ])
          for (const r of [congNoNcc, uyTin, ycbg, giaNcc, vatTus, donThang]) if (r.error) throw r.error

          const coNccChinh = new Set((giaNcc.data || []).map(r => r.vat_tu_id))
          const vatTuThieuNccChinh = (vatTus.data || []).filter(v => !coNccChinh.has(v.id))

          const donTheoTrangThai = {}
          for (const d of donThang.data || []) {
            const key = d.trang_thai
            if (!donTheoTrangThai[key]) donTheoTrangThai[key] = { trang_thai: key, so_don: 0, tong_tien: 0 }
            donTheoTrangThai[key].so_don += 1
            donTheoTrangThai[key].tong_tien += Number(d.tong_tien || 0)
          }

          thuMua = {
            congNoNcc: congNoNcc.data || [],
            uyTin: (uyTin.data || []).filter(u => u.so_don_da_giao > 0 || u.so_don_huy > 0),
            ycbg: ycbg.data || [],
            vatTuThieuNccChinh,
            donTheoTrangThai: Object.values(donTheoTrangThai),
            soDonChoDuyet: (donThang.data || []).filter(d => ['nhap', 'cho_duyet'].includes(d.trang_thai)).length,
            soDonChoHang: (donThang.data || []).filter(d => ['da_gui', 'da_xac_nhan'].includes(d.trang_thai)).length
          }
        } catch (e) {
          if (!huy) setLoi(prev => prev || e.message)
        }
      }

      // Nhóm cảnh báo tồn kho — luôn chạy, mọi vai trò/phòng ban.
      let tonKho = { hsd: [], dangVe: [], giaTriTonChiNhanh: 0, tonThap: [] }
      if (chiNhanhId) {
        try {
          const [hsd, giaTriCn, dangVe, tonThap] = await Promise.all([
            supabase.from('canh_bao_han_su_dung').select('*').eq('chi_nhanh_id', chiNhanhId).order('han_su_dung').limit(20),
            supabase.from('gia_tri_ton_kho').select('gia_tri_ton').eq('chi_nhanh_id', chiNhanhId).maybeSingle(),
            supabase.from('hang_dang_ve').select('*').eq('chi_nhanh_id', chiNhanhId),
            supabase.from('canh_bao_ton_thap').select('*')
          ])
          for (const r of [hsd, giaTriCn, dangVe, tonThap]) if (r.error) throw r.error
          tonKho = {
            hsd: hsd.data || [],
            dangVe: dangVe.data || [],
            giaTriTonChiNhanh: giaTriCn.data?.gia_tri_ton ?? 0,
            tonThap: (tonThap.data || []).filter(r => !chiNhanh || r.ten_chi_nhanh === chiNhanh.ten_chi_nhanh)
          }
        } catch (e) {
          if (!huy) setLoi(prev => prev || e.message)
        }
      }

      if (huy) return
      setDl({ taiChinh, thuMua, tonKho })
      setDangTai(false)
    }
    nap()
    return () => { huy = true }
  }, [chiNhanhId, chiNhanh, hienTaiChinh, hienThuMua])

  if (dangTai) return <DangTai />
  if (!dl) return null

  const tc = dl.taiChinh
  const tm = dl.thuMua
  const tongDoanhThu30Ngay = tc ? tc.loiNhuan.reduce((s, r) => s + Number(r.doanh_thu || 0), 0) : 0
  const tongLoiNhuan30Ngay = tc ? tc.loiNhuan.reduce((s, r) => s + Number(r.loi_nhuan_gop || 0), 0) : 0
  const bienLoiNhuan = tongDoanhThu30Ngay > 0 ? round1(100 * tongLoiNhuan30Ngay / tongDoanhThu30Ngay) : null
  const tongConNoThuMua = tm ? tm.congNoNcc.reduce((s, r) => s + Number(r.con_no || 0), 0) : 0

  const hetHan = dl.tonKho.hsd.filter(r => r.muc_do === 'da_het_han')
  const khanCap = dl.tonKho.hsd.filter(r => r.muc_do === 'khan_cap')

  return (
    <Trang tieuDe="Báo cáo" mota="Chỉ tiêu quan trọng theo phòng ban đang chọn">
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {hienTaiChinh && tc && (
        <>
          <div className="row g-3 mb-4">
            <The nhan="Doanh thu tháng này" gt={tien(tc.thang?.doanh_thu_thang)} mau="dark" />
            <The nhan="Lợi nhuận gộp tháng này" gt={tien(tc.thang?.loi_nhuan_gop_thang)} mau="success" />
            <The nhan="Công nợ phải thu" gt={tien(tc.thang?.cong_no_phai_thu)} mau="warning" />
            <The nhan="Công nợ phải trả NCC" gt={tien(tc.thang?.cong_no_phai_tra)} mau="danger" />
          </div>

          <div className="row g-3 mb-4">
            <div className="col-lg-7">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold d-flex justify-content-between">
                  <span>Doanh thu &amp; lợi nhuận gộp — 30 ngày qua</span>
                  {bienLoiNhuan !== null && (
                    <span className="text-secondary small">Biên LN gộp: {bienLoiNhuan}%</span>
                  )}
                </div>
                <div className="card-body p-0" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <Bang
                    khoa="ngay"
                    trong="Chưa có doanh số trong 30 ngày qua"
                    dong={tc.loiNhuan}
                    cot={[
                      { ten: 'Ngày', render: r => ngay(r.ngay) },
                      { ten: 'Kênh', render: r => r.kenh },
                      { ten: 'Doanh thu', lop: 'text-end', render: r => tien(r.doanh_thu) },
                      { ten: 'LN gộp', lop: 'text-end', render: r => tien(r.loi_nhuan_gop) },
                      { ten: 'Biên (%)', lop: 'text-end', render: r => r.bien_loi_nhuan_gop_pct ?? '—' }
                    ]}
                  />
                </div>
                <div className="card-footer bg-white d-flex justify-content-between fw-semibold">
                  <span>Tổng 30 ngày</span>
                  <span>{tien(tongDoanhThu30Ngay)} / LN {tien(tongLoiNhuan30Ngay)}</span>
                </div>
              </div>
            </div>

            <div className="col-lg-5">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold">Giá trị tồn kho theo chi nhánh</div>
                <div className="card-body p-0">
                  <Bang
                    khoa="chi_nhanh_id"
                    trong="Chưa có tồn kho"
                    dong={tc.giaTriTon}
                    cot={[
                      { ten: 'Chi nhánh', render: r => r.ten_chi_nhanh },
                      { ten: 'Giá trị tồn', lop: 'text-end', render: r => tien(r.gia_tri_ton) }
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold">Công nợ phải trả nhà cung cấp</div>
                <div className="card-body p-0">
                  <Bang
                    khoa="ten_ncc"
                    trong="Không còn nợ nhà cung cấp nào"
                    dong={tc.congNoNcc}
                    cot={[
                      { ten: 'Nhà cung cấp', render: r => r.ten_ncc },
                      { ten: 'Tổng mua', lop: 'text-end', render: r => tien(r.tong_mua) },
                      { ten: 'Đã trả', lop: 'text-end', render: r => tien(r.da_tra) },
                      { ten: 'Còn nợ', lop: 'text-end', render: r => (
                        <span className="fw-semibold">{tien(r.con_no)}</span>
                      ) }
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold">Hao hụt tháng này (theo lý do)</div>
                <div className="card-body p-0">
                  <Bang
                    khoa="ten_vat_tu"
                    trong="Chưa ghi nhận hao hụt tháng này"
                    dong={tc.haoHut}
                    cot={[
                      { ten: 'Chi nhánh', render: r => r.ten_chi_nhanh },
                      { ten: 'Vật tư', render: r => r.ten_vat_tu },
                      { ten: 'Lý do', render: r => r.ly_do || '—' },
                      { ten: 'SL hủy', lop: 'text-end', render: r => so(r.so_luong_huy) },
                      { ten: 'Giá trị', lop: 'text-end', render: r => tien(r.gia_tri_huy) }
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {hienThuMua && tm && (
        <>
          <div className="row g-3 mb-4">
            <The nhan="Đơn chờ duyệt/gửi (tháng này)" gt={tm.soDonChoDuyet} mau="warning" />
            <The nhan="Đơn đang chờ hàng về (tháng này)" gt={tm.soDonChoHang} mau="info" />
            <The nhan="Tổng công nợ phải trả NCC" gt={tien(tongConNoThuMua)} mau="danger" />
            <The nhan="Vật tư thiếu NCC chính" gt={tm.vatTuThieuNccChinh.length} mau={tm.vatTuThieuNccChinh.length ? 'warning' : 'success'} />
          </div>

          <div className="row g-3 mb-4">
            <div className="col-lg-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold">Công nợ phải trả nhà cung cấp</div>
                <div className="card-body p-0">
                  <Bang
                    khoa="ten_ncc"
                    trong="Không còn nợ nhà cung cấp nào"
                    dong={tm.congNoNcc}
                    cot={[
                      { ten: 'Nhà cung cấp', render: r => r.ten_ncc },
                      { ten: 'Tổng mua', lop: 'text-end', render: r => tien(r.tong_mua) },
                      { ten: 'Đã trả', lop: 'text-end', render: r => tien(r.da_tra) },
                      { ten: 'Còn nợ', lop: 'text-end', render: r => <span className="fw-semibold">{tien(r.con_no)}</span> }
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold">Độ tin cậy nhà cung cấp</div>
                <div className="card-body p-0">
                  <Bang
                    khoa="nha_cung_cap_id"
                    trong="Chưa có NCC nào phát sinh đơn hàng"
                    dong={tm.uyTin}
                    cot={[
                      { ten: 'Nhà cung cấp', render: r => r.ten_ncc },
                      { ten: 'Hoàn thành', lop: 'text-end', render: r => so(r.so_don_hoan_thanh) },
                      { ten: 'Đã hủy', lop: 'text-end', render: r => so(r.so_don_huy) },
                      { ten: 'Giao trễ', lop: 'text-end', render: r => so(r.so_don_giao_tre) },
                      { ten: 'Độ tin cậy', render: r => {
                          const dtc = doTinCay(r)
                          return <span className={`badge text-bg-${dtc.mau}`}>{dtc.nhan}</span>
                        } }
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold">Yêu cầu báo giá đang mở</div>
                <div className="card-body p-0">
                  <Bang
                    khoa="id"
                    trong="Không có yêu cầu báo giá nào đang mở"
                    dong={tm.ycbg}
                    cot={[
                      { ten: 'Số YC', render: r => <a href="/yeu-cau-bao-gia">{r.so_yc}</a> },
                      { ten: 'Tiêu đề', render: r => r.tieu_de },
                      { ten: 'Hạn báo giá', render: r => r.han_bao_gia || '—' },
                      { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> }
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white fw-semibold">Vật tư chưa có NCC chính</div>
                <div className="card-body p-0" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <Bang
                    khoa="id"
                    trong="Tất cả vật tư đều đã có NCC chính"
                    dong={tm.vatTuThieuNccChinh}
                    cot={[{ ten: 'Vật tư', render: r => r.ten_vat_tu }]}
                  />
                </div>
              </div>
            </div>

            <div className="col-12">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white fw-semibold">Đơn đặt NCC tháng này theo trạng thái</div>
                <div className="card-body p-0">
                  <Bang
                    khoa="trang_thai"
                    trong="Chưa có đơn đặt hàng nào trong tháng này"
                    dong={tm.donTheoTrangThai}
                    cot={[
                      { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
                      { ten: 'Số đơn', lop: 'text-end', render: r => so(r.so_don) },
                      { ten: 'Tổng giá trị', lop: 'text-end', render: r => tien(r.tong_tien) }
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <h2 className="h5 fw-bold mb-3">Cảnh báo tồn kho{chiNhanh ? ` — ${chiNhanh.ten_chi_nhanh}` : ''}</h2>
      <div className="row g-3 mb-4">
        <The nhan="Giá trị tồn kho" gt={tien(dl.tonKho.giaTriTonChiNhanh)} mau="dark" />
        <The nhan="Dưới tồn tối thiểu" gt={dl.tonKho.tonThap.length} mau={dl.tonKho.tonThap.length ? 'warning' : 'success'} />
        <The nhan="Lô đã hết hạn" gt={hetHan.length} mau={hetHan.length ? 'danger' : 'success'} />
        <The nhan="Đang về" gt={dl.tonKho.dangVe.length} phu="mặt hàng" mau="info" />
      </div>

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">
              Hạn sử dụng cần xử lý
              {(hetHan.length + khanCap.length > 0) &&
                <span className="badge text-bg-danger ms-2">{hetHan.length + khanCap.length}</span>}
            </div>
            <div className="card-body p-0">
              <Bang
                khoa="ma_lo"
                trong="Không có lô nào sắp hết hạn"
                dong={dl.tonKho.hsd}
                cot={[
                  { ten: 'Vật tư', render: r => r.ten_vat_tu },
                  { ten: 'Lô', render: r => <code className="small">{r.ma_lo}</code> },
                  { ten: 'HSD', render: r => ngay(r.han_su_dung) },
                  { ten: 'Còn', lop: 'text-end', render: r => `${r.con_lai_ngay} ngày` },
                  { ten: 'Tồn', lop: 'text-end', render: r => so(r.so_luong_ton) }
                ]}
              />
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">Dưới tồn tối thiểu</div>
            <div className="card-body p-0">
              <Bang
                khoa="ten_vat_tu"
                trong="Tồn kho đang đủ"
                dong={dl.tonKho.tonThap}
                cot={[
                  { ten: 'Vật tư', render: r => r.ten_vat_tu },
                  { ten: 'Tồn', lop: 'text-end', render: r => so(r.so_luong_ton) },
                  { ten: 'Tối thiểu', lop: 'text-end', render: r => so(r.ton_toi_thieu) }
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </Trang>
  )
}

function round1(n) {
  return Math.round(n * 10) / 10
}
