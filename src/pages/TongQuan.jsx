import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, The, Bang, DangTai, Loi } from '../components/Chung'
import { tien, so, ngay } from '../lib/dinhDang'

export default function TongQuan() {
  const { chiNhanhId, chiNhanh } = useApp()
  const [dl, setDl] = useState(null)
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  useEffect(() => {
    if (!chiNhanhId) { setDangTai(false); return }
    let huy = false
    async function nap() {
      setDangTai(true); setLoi(null)
      try {
        const [hsd, giaTri, dangVe, tonThap] = await Promise.all([
          supabase.from('canh_bao_han_su_dung')
            .select('*').eq('chi_nhanh_id', chiNhanhId)
            .order('han_su_dung').limit(20),
          supabase.from('gia_tri_ton_kho')
            .select('gia_tri_ton').eq('chi_nhanh_id', chiNhanhId).maybeSingle(),
          supabase.from('hang_dang_ve')
            .select('*').eq('chi_nhanh_id', chiNhanhId),
          supabase.from('canh_bao_ton_thap').select('*')
        ])
        for (const r of [hsd, giaTri, dangVe, tonThap]) if (r.error) throw r.error
        if (huy) return
        setDl({
          hsd: hsd.data || [],
          giaTri: giaTri.data?.gia_tri_ton ?? 0,
          dangVe: dangVe.data || [],
          tonThap: (tonThap.data || []).filter(
            r => !chiNhanh || r.ten_chi_nhanh === chiNhanh.ten_chi_nhanh
          )
        })
      } catch (e) {
        if (!huy) setLoi(e.message)
      } finally {
        if (!huy) setDangTai(false)
      }
    }
    nap()
    return () => { huy = true }
  }, [chiNhanhId, chiNhanh])

  if (dangTai) return <DangTai />
  if (loi) return <Loi loi={loi} />
  if (!dl) return null

  const hetHan = dl.hsd.filter(r => r.muc_do === 'da_het_han')
  const khanCap = dl.hsd.filter(r => r.muc_do === 'khan_cap')

  return (
    <Trang tieuDe="Tổng quan" mota={chiNhanh?.ten_chi_nhanh}>
      <div className="row g-3 mb-4">
        <The nhan="Giá trị tồn kho" gt={tien(dl.giaTri)} mau="dark" />
        <The nhan="Dưới tồn tối thiểu" gt={dl.tonThap.length} mau={dl.tonThap.length ? 'warning' : 'success'} />
        <The nhan="Lô đã hết hạn" gt={hetHan.length} mau={hetHan.length ? 'danger' : 'success'} />
        <The nhan="Đang về" gt={dl.dangVe.length} phu="mặt hàng" mau="info" />
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
                dong={dl.hsd}
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
                dong={dl.tonThap}
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
