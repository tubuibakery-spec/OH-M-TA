import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi } from '../components/Chung'
import { so, tien, ngay } from '../lib/dinhDang'

export default function TonKho() {
  const { chiNhanhId } = useApp()
  const [dong, setDong] = useState([])
  const [lo, setLo] = useState({})
  const [moRong, setMoRong] = useState(null)
  const [tim, setTim] = useState('')
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  useEffect(() => {
    if (!chiNhanhId) { setDangTai(false); return }
    let huy = false
    async function nap() {
      setDangTai(true); setLoi(null)
      try {
        const { data, error } = await supabase
          .from('ton_kho')
          .select('id, so_luong_ton, so_luong_giu_cho, gia_von_binh_quan, vat_tu(id, ma_vat_tu, ten_vat_tu, ton_toi_thieu, don_vi_tinh(ma_dvt))')
          .eq('chi_nhanh_id', chiNhanhId)
        if (error) throw error

        const { data: dsLo, error: e2 } = await supabase
          .from('ton_kho_lo')
          .select('vat_tu_id, so_luong_ton, lo_hang(ma_lo, han_su_dung, trang_thai)')
          .eq('chi_nhanh_id', chiNhanhId)
          .gt('so_luong_ton', 0)
        if (e2) throw e2

        if (huy) return
        const nhom = {}
        for (const l of dsLo || []) (nhom[l.vat_tu_id] ||= []).push(l)
        setLo(nhom)
        setDong((data || []).sort((a, b) =>
          (a.vat_tu?.ten_vat_tu || '').localeCompare(b.vat_tu?.ten_vat_tu || '', 'vi')))
      } catch (e) {
        if (!huy) setLoi(e.message)
      } finally {
        if (!huy) setDangTai(false)
      }
    }
    nap()
    return () => { huy = true }
  }, [chiNhanhId])

  const loc = dong.filter(r => {
    if (!tim.trim()) return true
    const t = tim.toLowerCase()
    return (r.vat_tu?.ten_vat_tu || '').toLowerCase().includes(t)
        || (r.vat_tu?.ma_vat_tu || '').toLowerCase().includes(t)
  })

  return (
    <Trang tieuDe="Tồn kho" mota="Nhấn vào dòng để xem chi tiết theo lô">
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="mb-3" style={{ maxWidth: 360 }}>
        <input
          className="form-control" placeholder="Tìm theo tên hoặc mã vật tư…"
          value={tim} onChange={e => setTim(e.target.value)}
        />
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Vật tư</th>
                  <th className="text-end">Tồn</th>
                  <th className="text-end">Giữ chỗ</th>
                  <th className="text-end">Khả dụng</th>
                  <th className="text-end">Giá vốn BQ</th>
                </tr>
              </thead>
              <tbody>
                {loc.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-secondary py-5">Chưa có tồn kho</td></tr>
                )}
                {loc.map(r => {
                  const vtId = r.vat_tu?.id
                  const dsLo = lo[vtId] || []
                  const khaDung = Number(r.so_luong_ton) - Number(r.so_luong_giu_cho)
                  const thap = Number(r.so_luong_ton) <= Number(r.vat_tu?.ton_toi_thieu || 0)
                  return (
                    <Fragment key={r.id}>
                      <tr
                        style={{ cursor: dsLo.length ? 'pointer' : 'default' }}
                        onClick={() => dsLo.length && setMoRong(moRong === r.id ? null : r.id)}
                      >
                        <td>
                          {dsLo.length > 0 && <span className="me-2 text-secondary">{moRong === r.id ? '▾' : '▸'}</span>}
                          {r.vat_tu?.ten_vat_tu}
                          <div className="small text-secondary">
                            {r.vat_tu?.ma_vat_tu} · {r.vat_tu?.don_vi_tinh?.ma_dvt}
                            {dsLo.length > 0 && ` · ${dsLo.length} lô`}
                          </div>
                        </td>
                        <td className={`text-end ${thap ? 'text-danger fw-semibold' : ''}`}>
                          {so(r.so_luong_ton)}
                        </td>
                        <td className="text-end text-secondary">{so(r.so_luong_giu_cho)}</td>
                        <td className="text-end fw-semibold">{so(khaDung)}</td>
                        <td className="text-end">{tien(r.gia_von_binh_quan)}</td>
                      </tr>
                      {moRong === r.id && dsLo.map((l, i) => (
                        <tr key={`${r.id}-${i}`} className="table-light small">
                          <td className="ps-5">
                            Lô <code>{l.lo_hang?.ma_lo}</code>
                            {l.lo_hang?.trang_thai === 'thu_hoi' &&
                              <span className="badge text-bg-danger ms-2">Thu hồi</span>}
                          </td>
                          <td className="text-end">{so(l.so_luong_ton)}</td>
                          <td colSpan={2} className="text-secondary">
                            HSD: {ngay(l.lo_hang?.han_su_dung)}
                          </td>
                          <td />
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Trang>
  )
}
