import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi } from '../components/Chung'
import { so, ngay, homNay } from '../lib/dinhDang'

const DONG_TRONG = { vat_tu_id: '', so_luong_du_bao: '' }

function congNgay(iso, n) {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function DuBaoBan() {
  const { chiNhanhId, coQuyen } = useApp()
  const [ngayChon, setNgayChon] = useState(homNay())
  const [duBao, setDuBao] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [soSanh, setSoSanh] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [dangLuu, setDangLuu] = useState(false)
  const [loi, setLoi] = useState(null)
  const [ok, setOk] = useState(null)

  const [dongMoi, setDongMoi] = useState([{ ...DONG_TRONG }])

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    try {
      const [db, v, ss] = await Promise.all([
        supabase.from('du_bao_ban')
          .select('id, vat_tu_id, so_luong_du_bao, nguon, ghi_chu, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))')
          .eq('chi_nhanh_id', chiNhanhId).eq('ngay', ngayChon),
        supabase.from('vat_tu').select('id, ten_vat_tu, don_vi_tinh(ma_dvt)')
          .eq('duoc_ban', true).eq('trang_thai', 'hoat_dong').order('ten_vat_tu'),
        supabase.from('so_sanh_du_bao_thuc_te').select('*')
          .eq('chi_nhanh_id', chiNhanhId)
          .gte('ngay', congNgay(homNay(), -7)).lte('ngay', homNay())
          .order('ngay', { ascending: false })
      ])
      if (db.error) throw db.error
      if (v.error) throw v.error
      if (ss.error) throw ss.error
      setDuBao(db.data || []); setVatTus(v.data || []); setSoSanh(ss.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [chiNhanhId, ngayChon])

  useEffect(() => { napDs() }, [napDs])

  function suaDongMoi(i, truong, gt) {
    setDongMoi(d => d.map((r, j) => j === i ? { ...r, [truong]: gt } : r))
  }

  async function luuDuBao() {
    const hopLe = dongMoi.filter(d => d.vat_tu_id && Number(d.so_luong_du_bao) >= 0 && d.so_luong_du_bao !== '')
    if (!hopLe.length) { setLoi('Cần ít nhất một dòng có vật tư và số lượng.'); return }
    setDangLuu(true); setLoi(null); setOk(null)
    try {
      const { error } = await supabase.from('du_bao_ban').upsert(
        hopLe.map(d => ({
          chi_nhanh_id: chiNhanhId,
          ngay: ngayChon,
          vat_tu_id: d.vat_tu_id,
          so_luong_du_bao: Number(d.so_luong_du_bao),
          nguon: 'thu_cong'
        })),
        { onConflict: 'chi_nhanh_id,ngay,vat_tu_id' }
      )
      if (error) throw error
      setDongMoi([{ ...DONG_TRONG }])
      setOk(`Đã lưu dự báo cho ngày ${ngay(ngayChon)}.`)
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function xoaDong(id) {
    if (!confirm('Xóa dòng dự báo này?')) return
    setLoi(null)
    const { error } = await supabase.from('du_bao_ban').delete().eq('id', id)
    if (error) setLoi(error.message)
    await napDs()
  }

  async function tongHopHomQua() {
    setDangLuu(true); setLoi(null); setOk(null)
    try {
      const { error } = await supabase.rpc('rpc_tong_hop_doanh_so', { p_ngay: congNgay(homNay(), -1) })
      if (error) throw error
      setOk('Đã tổng hợp doanh số thực tế của ngày hôm qua.')
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  const duocSua = coQuyen('du_bao', 'sua') || coQuyen('du_bao', 'tao')

  return (
    <Trang
      tieuDe="Dự báo bán hàng"
      mota="Số liệu ở đây là đầu vào cho trang Đề xuất đặt hàng — không có dự báo thì không đề xuất được"
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />
      {ok && <div className="alert alert-success">{ok}</div>}

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white d-flex align-items-center gap-3">
              <span className="fw-semibold">Dự báo ngày</span>
              <input type="date" className="form-control form-control-sm w-auto"
                value={ngayChon} onChange={e => setNgayChon(e.target.value)} />
            </div>
            <div className="card-body p-0">
              {dangTai ? <DangTai /> : (
                <Bang
                  dong={duBao}
                  trong="Chưa có dự báo cho ngày này"
                  cot={[
                    { ten: 'Vật tư', render: r => r.vat_tu?.ten_vat_tu },
                    { ten: 'SL dự báo', lop: 'text-end', render: r => `${so(r.so_luong_du_bao)} ${r.vat_tu?.don_vi_tinh?.ma_dvt || ''}` },
                    { ten: 'Nguồn', render: r => <span className="badge text-bg-secondary">{r.nguon}</span> },
                    { ten: '', lop: 'text-end', render: r => duocSua && (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => xoaDong(r.id)}>Xóa</button>
                    ) }
                  ]}
                />
              )}
            </div>
          </div>

          {duocSua && (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white fw-semibold">Thêm / cập nhật dự báo</div>
              <div className="card-body">
                <table className="table table-sm align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ minWidth: 200 }}>Vật tư</th>
                      <th style={{ width: 140 }}>Số lượng dự báo</th>
                      <th style={{ width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {dongMoi.map((d, i) => (
                      <tr key={i}>
                        <td>
                          <select className="form-select form-select-sm" value={d.vat_tu_id}
                            onChange={e => suaDongMoi(i, 'vat_tu_id', e.target.value)}>
                            <option value="">— Chọn vật tư —</option>
                            {vatTus.map(v => (
                              <option key={v.id} value={v.id}>{v.ten_vat_tu} ({v.don_vi_tinh?.ma_dvt})</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input type="number" step="0.001" min="0" className="form-control form-control-sm"
                            value={d.so_luong_du_bao}
                            onChange={e => suaDongMoi(i, 'so_luong_du_bao', e.target.value)} />
                        </td>
                        <td>
                          <button className="btn btn-sm btn-outline-danger"
                            onClick={() => setDongMoi(dongMoi.filter((_, j) => j !== i))}
                            disabled={dongMoi.length === 1}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-secondary"
                    onClick={() => setDongMoi([...dongMoi, { ...DONG_TRONG }])}>+ Thêm dòng</button>
                  <button className="btn btn-sm btn-primary ms-auto" onClick={luuDuBao} disabled={dangLuu}>
                    {dangLuu ? 'Đang lưu…' : 'Lưu dự báo'}
                  </button>
                </div>
                <div className="form-text mt-2">
                  Nhập lại vật tư đã có sẵn ở bảng trên sẽ GHI ĐÈ số dự báo cũ của ngày đó (không cộng dồn).
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="col-lg-5">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Dự báo so với thực tế (7 ngày qua)</span>
              {duocSua && (
                <button className="btn btn-sm btn-outline-secondary" onClick={tongHopHomQua} disabled={dangLuu}>
                  Tổng hợp hôm qua
                </button>
              )}
            </div>
            <div className="card-body p-0">
              <Bang
                khoa="id"
                trong="Chưa có số liệu so sánh"
                dong={soSanh}
                cot={[
                  { ten: 'Ngày', render: r => ngay(r.ngay) },
                  { ten: 'Vật tư', render: r => r.ten_vat_tu },
                  { ten: 'Dự báo', lop: 'text-end', render: r => so(r.du_bao) },
                  { ten: 'Thực tế', lop: 'text-end', render: r => so(r.thuc_te) },
                  { ten: 'Lệch %', lop: 'text-end', render: r => (
                    <span className={Math.abs(r.lech_pct || 0) > 20 ? 'text-danger fw-semibold' : ''}>
                      {r.lech_pct === null ? '—' : `${r.lech_pct > 0 ? '+' : ''}${r.lech_pct}%`}
                    </span>
                  ) }
                ]}
              />
            </div>
            <div className="card-footer bg-white small text-secondary">
              "Tổng hợp hôm qua" đọc từ hóa đơn bán lẻ đã hoàn thành để tính số bán thực tế —
              chạy tay ở đây, hoặc để hệ thống tự chạy hằng ngày nếu đã bật lịch tự động (pg_cron).
            </div>
          </div>
        </div>
      </div>
    </Trang>
  )
}
