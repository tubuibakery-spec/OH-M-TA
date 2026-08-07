import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, The } from '../components/Chung'
import { tien, so, ngay } from '../lib/dinhDang'

export default function BaoCao() {
  const { chiNhanhId, chiNhanh, coQuyenMoiNoi } = useApp()
  const coTaiChinh = coQuyenMoiNoi('tai_chinh', 'xem')
  const [dl, setDl] = useState(null)
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  useEffect(() => {
    let huy = false
    async function nap() {
      setDangTai(true); setLoi(null)
      const tuNgay = new Date(); tuNgay.setDate(tuNgay.getDate() - 30)
      const tuNgayStr = tuNgay.toISOString().slice(0, 10)

      // Nhóm tài chính — chỉ chạy khi có quyền, tách riêng try/catch để lỗi
      // ở đây (RLS chặn, view lỗi...) không kéo sập nhóm tồn kho bên dưới,
      // vì trang này giờ là trang chủ '/' cho MỌI vai trò sau đăng nhập.
      let taiChinh = null
      if (coTaiChinh) {
        try {
          const [tongQuanThang, loiNhuan, giaTriTon, congNoNcc, haoHut] = await Promise.all([
            supabase.from('bi_tong_quan_thang').select('*').maybeSingle(),
            supabase.from('loi_nhuan_gop_theo_ngay').select('*').gte('ngay', tuNgayStr).order('ngay', { ascending: false }),
            supabase.from('gia_tri_ton_kho').select('*').order('gia_tri_ton', { ascending: false }),
            supabase.from('cong_no_phai_tra_theo_ncc').select('*').limit(20),
            supabase.from('phan_tich_hao_hut').select('*')
              .gte('thang', new Date(new Date().setDate(1)).toISOString().slice(0, 10))
              .order('gia_tri_huy', { ascending: false }).limit(20)
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

      // Nhóm cảnh báo tồn kho — luôn chạy, mọi vai trò (thay cho TongQuan.jsx cũ).
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
      setDl({ taiChinh, tonKho })
      setDangTai(false)
    }
    nap()
    return () => { huy = true }
  }, [chiNhanhId, chiNhanh, coTaiChinh])

  if (dangTai) return <DangTai />
  if (!dl) return null

  const tc = dl.taiChinh
  const tongDoanhThu30Ngay = tc ? tc.loiNhuan.reduce((s, r) => s + Number(r.doanh_thu || 0), 0) : 0
  const tongLoiNhuan30Ngay = tc ? tc.loiNhuan.reduce((s, r) => s + Number(r.loi_nhuan_gop || 0), 0) : 0
  const bienLoiNhuan = tongDoanhThu30Ngay > 0 ? round1(100 * tongLoiNhuan30Ngay / tongDoanhThu30Ngay) : null

  const hetHan = dl.tonKho.hsd.filter(r => r.muc_do === 'da_het_han')
  const khanCap = dl.tonKho.hsd.filter(r => r.muc_do === 'khan_cap')

  return (
    <Trang tieuDe="Báo cáo" mota="Số liệu toàn chuỗi — theo phạm vi quyền của tài khoản">
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {coTaiChinh && tc && (
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
