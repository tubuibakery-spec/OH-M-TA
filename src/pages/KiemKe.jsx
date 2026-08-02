import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { so, ngayGio, ngay } from '../lib/dinhDang'

export default function KiemKe() {
  const { chiNhanhId, coQuyen } = useApp()
  const [phieu, setPhieu] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [dangXuLy, setDangXuLy] = useState(false)

  const [xem, setXem] = useState(null)
  const [ct, setCt] = useState([])

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase
      .from('phieu_kiem_ke')
      .select('id, so_phieu, ngay_kiem_ke, loai, trang_thai, ghi_chu')
      .eq('chi_nhanh_id', chiNhanhId)
      .order('ngay_kiem_ke', { ascending: false }).limit(50)
    if (error) setLoi(error.message)
    setPhieu(data || []); setDangTai(false)
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  async function taoPhieu() {
    setDangXuLy(true); setLoi(null)
    try {
      const { data: p, error } = await supabase
        .from('phieu_kiem_ke').insert({ chi_nhanh_id: chiNhanhId })
        .select('id, so_phieu, ngay_kiem_ke, loai, trang_thai').single()
      if (error) throw error

      // Chốt số hệ thống ngay lúc tạo — sau đó tồn có đổi cũng không ảnh hưởng phiếu
      const { error: e2 } = await supabase.rpc('rpc_nap_kiem_ke', { p_phieu_id: p.id })
      if (e2) throw e2

      await napDs()
      await moXem(p)
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const moXem = useCallback(async (p) => {
    setXem(p); setCt([])
    const { data, error } = await supabase
      .from('chi_tiet_phieu_kiem_ke')
      .select('id, so_luong_he_thong, so_luong_thuc_te, chenh_lech, ly_do, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt)), lo_hang(ma_lo, han_su_dung)')
      .eq('phieu_kiem_ke_id', p.id)
    if (error) setLoi(error.message)
    setCt(data || [])
  }, [])

  function suaThucTe(id, gt) {
    setCt(c => c.map(r => r.id === id ? { ...r, so_luong_thuc_te: gt } : r))
  }

  async function luuDem() {
    setDangXuLy(true); setLoi(null)
    try {
      for (const r of ct) {
        if (r.so_luong_thuc_te === '' || r.so_luong_thuc_te === null) continue
        const { error } = await supabase
          .from('chi_tiet_phieu_kiem_ke')
          .update({ so_luong_thuc_te: Number(r.so_luong_thuc_te), ly_do: r.ly_do || null })
          .eq('id', r.id)
        if (error) throw error
      }
      await moXem(xem)
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function duyet() {
    if (!confirm('Duyệt phiếu kiểm kê? Chênh lệch sẽ được ghi thẳng vào tồn kho.')) return
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase
        .from('phieu_kiem_ke').update({ trang_thai: 'da_duyet' }).eq('id', xem.id)
      if (error) throw error
      setXem(null)
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const duocTao = coQuyen('kho', 'tao')
  const duocDuyet = coQuyen('kho', 'duyet')
  const dangNhap = xem?.trang_thai === 'nhap'

  return (
    <Trang
      tieuDe="Kiểm kê"
      mota="Tạo phiếu là chốt số hệ thống ngay tại thời điểm đó"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={taoPhieu} disabled={dangXuLy}>
          {dangXuLy ? 'Đang tạo…' : '+ Tạo phiếu kiểm kê'}
        </button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={phieu}
            trong="Chưa có phiếu kiểm kê nào"
            cot={[
              { ten: 'Số phiếu', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>
                  {r.so_phieu}
                </button>
              ) },
              { ten: 'Ngày', render: r => ngayGio(r.ngay_kiem_ke) },
              { ten: 'Loại', render: r => r.loai },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!xem} rong
        tieuDe={`Kiểm kê ${xem?.so_phieu || ''}`}
        onDong={() => setXem(null)}
        onLuu={dangNhap ? luuDem : null}
        nhanLuu="Lưu số đếm"
        dangLuu={dangXuLy}
      >
        {dangNhap && (
          <div className="alert alert-info small">
            Nhập <strong>số đếm thực tế</strong> rồi bấm “Lưu số đếm”. Chỉ khi bấm
            <strong> Duyệt</strong> thì tồn kho mới bị điều chỉnh.
          </div>
        )}

        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead className="table-light">
              <tr>
                <th>Vật tư</th>
                <th>Lô</th>
                <th className="text-end">Hệ thống</th>
                <th className="text-end" style={{ width: 130 }}>Thực tế</th>
                <th className="text-end">Chênh lệch</th>
              </tr>
            </thead>
            <tbody>
              {ct.length === 0 && (
                <tr><td colSpan={5} className="text-center text-secondary py-4">Không có dòng nào</td></tr>
              )}
              {ct.map(r => {
                const lech = r.so_luong_thuc_te === '' || r.so_luong_thuc_te === null
                  ? null
                  : Number(r.so_luong_thuc_te) - Number(r.so_luong_he_thong)
                return (
                  <tr key={r.id}>
                    <td>
                      {r.vat_tu?.ten_vat_tu}
                      <div className="small text-secondary">{r.vat_tu?.don_vi_tinh?.ma_dvt}</div>
                    </td>
                    <td className="small">
                      {r.lo_hang?.ma_lo
                        ? <>
                            <code>{r.lo_hang.ma_lo}</code>
                            <div className="text-secondary">HSD {ngay(r.lo_hang.han_su_dung)}</div>
                          </>
                        : <span className="text-secondary">không lô</span>}
                    </td>
                    <td className="text-end">{so(r.so_luong_he_thong)}</td>
                    <td>
                      {dangNhap ? (
                        <input type="number" step="0.001" min="0"
                          className="form-control form-control-sm text-end"
                          value={r.so_luong_thuc_te ?? ''}
                          onChange={e => suaThucTe(r.id, e.target.value)} />
                      ) : (
                        <div className="text-end">{so(r.so_luong_thuc_te)}</div>
                      )}
                    </td>
                    <td className={`text-end fw-semibold ${lech > 0 ? 'text-success' : lech < 0 ? 'text-danger' : ''}`}>
                      {lech === null ? '—' : (lech > 0 ? '+' : '') + so(lech)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {dangNhap && duocDuyet && (
          <button className="btn btn-success" onClick={duyet} disabled={dangXuLy}>
            Duyệt &amp; áp chênh lệch vào kho
          </button>
        )}
      </Modal>
    </Trang>
  )
}
