import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal, Trong } from '../components/Chung'
import { tien, so, ngay, homNay } from '../lib/dinhDang'

const DONG_MOI = { vat_tu_id: '', so_luong_can_mua: '' }

export default function YeuCauBaoGia() {
  const { chiNhanhId, coQuyen } = useApp()
  const [ds, setDs] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [nccs, setNccs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [ok, setOk] = useState(null)

  const [moTao, setMoTao] = useState(false)
  const [dangLuu, setDangLuu] = useState(false)
  const [tieuDe, setTieuDe] = useState('')
  const [hanBaoGia, setHanBaoGia] = useState('')
  const [ngayNhanDuKien, setNgayNhanDuKien] = useState('')
  const [ghiChu, setGhiChu] = useState('')
  const [dsDong, setDsDong] = useState([{ ...DONG_MOI }])
  const [nccChon, setNccChon] = useState({})

  const [xem, setXem] = useState(null)
  const [ctYC, setCtYC] = useState([])
  const [nccMoi, setNccMoi] = useState([])
  const [baoGia, setBaoGia] = useState([])
  const [nccDangNhap, setNccDangNhap] = useState(null)
  const [giaNhap, setGiaNhap] = useState({})
  const [chonTheoDong, setChonTheoDong] = useState({})
  const [dangXuLy, setDangXuLy] = useState(false)

  const nap = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    try {
      const [ycbg, vt, ncc] = await Promise.all([
        supabase.from('yeu_cau_bao_gia')
          .select('id, so_yc, tieu_de, han_bao_gia, ngay_nhan_du_kien, trang_thai, yeu_cau_bao_gia_ncc(id)')
          .eq('chi_nhanh_id', chiNhanhId).order('created_at', { ascending: false }).limit(100),
        supabase.from('vat_tu').select('id, ten_vat_tu').eq('trang_thai', 'hoat_dong').order('ten_vat_tu'),
        supabase.from('nha_cung_cap').select('id, ten_ncc').order('ten_ncc')
      ])
      if (ycbg.error) throw ycbg.error
      if (vt.error) throw vt.error
      if (ncc.error) throw ncc.error
      setDs(ycbg.data || []); setVatTus(vt.data || []); setNccs(ncc.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [chiNhanhId])

  useEffect(() => { nap() }, [nap])

  function moModalTao() {
    setTieuDe(''); setHanBaoGia(''); setNgayNhanDuKien(''); setGhiChu('')
    setDsDong([{ ...DONG_MOI }]); setNccChon({})
    setMoTao(true)
  }

  function suaDong(i, truong, gt) {
    setDsDong(ds => ds.map((d, idx) => idx === i ? { ...d, [truong]: gt } : d))
  }
  function themDong() { setDsDong(ds => [...ds, { ...DONG_MOI }]) }
  function xoaDong(i) { setDsDong(ds => ds.filter((_, idx) => idx !== i)) }

  async function taoYC() {
    const dongHopLe = dsDong.filter(d => d.vat_tu_id && Number(d.so_luong_can_mua) > 0)
    const nccHopLe = Object.keys(nccChon).filter(id => nccChon[id])
    if (!tieuDe.trim()) { setLoi('Chưa nhập tiêu đề.'); return }
    if (!dongHopLe.length) { setLoi('Cần ít nhất 1 dòng vật tư hợp lệ.'); return }
    if (!nccHopLe.length) { setLoi('Chọn ít nhất 1 nhà cung cấp để mời báo giá.'); return }

    setDangLuu(true); setLoi(null); setOk(null)
    try {
      const { data: moi, error: e1 } = await supabase.from('yeu_cau_bao_gia')
        .insert({
          tieu_de: tieuDe.trim(), chi_nhanh_id: chiNhanhId,
          han_bao_gia: hanBaoGia || null, ngay_nhan_du_kien: ngayNhanDuKien || null,
          ghi_chu: ghiChu || null
        }).select('id, so_yc').single()
      if (e1) throw e1

      const { error: e2 } = await supabase.from('chi_tiet_yeu_cau_bao_gia').insert(
        dongHopLe.map(d => ({
          yeu_cau_bao_gia_id: moi.id, vat_tu_id: d.vat_tu_id, so_luong_can_mua: Number(d.so_luong_can_mua)
        }))
      )
      if (e2) throw e2

      const { error: e3 } = await supabase.from('yeu_cau_bao_gia_ncc').insert(
        nccHopLe.map(id => ({ yeu_cau_bao_gia_id: moi.id, nha_cung_cap_id: id }))
      )
      if (e3) throw e3

      setOk(`Đã tạo yêu cầu báo giá ${moi.so_yc}.`)
      setMoTao(false)
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function moXem(r) {
    setXem(r); setCtYC([]); setNccMoi([]); setBaoGia([]); setNccDangNhap(null); setGiaNhap({}); setChonTheoDong({})
    setLoi(null)
    try {
      const [ct, nm] = await Promise.all([
        supabase.from('chi_tiet_yeu_cau_bao_gia')
          .select('id, vat_tu_id, so_luong_can_mua, vat_tu(ten_vat_tu)')
          .eq('yeu_cau_bao_gia_id', r.id),
        supabase.from('yeu_cau_bao_gia_ncc')
          .select('id, nha_cung_cap_id, trang_thai, nha_cung_cap(ten_ncc)')
          .eq('yeu_cau_bao_gia_id', r.id)
      ])
      if (ct.error) throw ct.error
      if (nm.error) throw nm.error
      setCtYC(ct.data || []); setNccMoi(nm.data || [])

      const idsNm = (nm.data || []).map(n => n.id)
      if (idsNm.length) {
        const { data: bg, error: e3 } = await supabase.from('bao_gia_ncc')
          .select('id, yeu_cau_bao_gia_ncc_id, chi_tiet_yeu_cau_id, don_gia, thoi_gian_giao_ngay')
          .in('yeu_cau_bao_gia_ncc_id', idsNm)
        if (e3) throw e3
        setBaoGia(bg || [])
      }
    } catch (e) { setLoi(e.message) }
  }

  function moNhapGia(nccId) {
    const cuHien = {}
    for (const b of baoGia.filter(b => b.yeu_cau_bao_gia_ncc_id === nccId)) cuHien[b.chi_tiet_yeu_cau_id] = String(b.don_gia)
    setGiaNhap(cuHien)
    setNccDangNhap(nccId)
  }

  async function luuBaoGia() {
    const rows = ctYC
      .filter(ct => Number(giaNhap[ct.id]) >= 0 && giaNhap[ct.id] !== '' && giaNhap[ct.id] !== undefined)
      .map(ct => ({
        yeu_cau_bao_gia_ncc_id: nccDangNhap, chi_tiet_yeu_cau_id: ct.id, don_gia: Number(giaNhap[ct.id])
      }))
    if (!rows.length) { setLoi('Chưa nhập đơn giá cho dòng nào.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { error: e1 } = await supabase.from('bao_gia_ncc')
        .upsert(rows, { onConflict: 'yeu_cau_bao_gia_ncc_id,chi_tiet_yeu_cau_id' })
      if (e1) throw e1
      const { error: e2 } = await supabase.from('yeu_cau_bao_gia_ncc')
        .update({ trang_thai: 'da_bao_gia' }).eq('id', nccDangNhap)
      if (e2) throw e2
      setNccDangNhap(null)
      await moXem(xem)
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  function giaThapNhat(ctId) {
    const gia = baoGia.filter(b => b.chi_tiet_yeu_cau_id === ctId).map(b => Number(b.don_gia))
    return gia.length ? Math.min(...gia) : null
  }

  function nccGoiY(ctId) {
    const dong = baoGia.filter(b => b.chi_tiet_yeu_cau_id === ctId)
    if (!dong.length) return ''
    const re = dong.reduce((a, b) => Number(a.don_gia) <= Number(b.don_gia) ? a : b)
    return re.yeu_cau_bao_gia_ncc_id
  }

  useEffect(() => {
    if (!ctYC.length || !baoGia.length) return
    setChonTheoDong(cur => {
      const moi = { ...cur }
      for (const ct of ctYC) if (!moi[ct.id]) moi[ct.id] = nccGoiY(ct.id)
      return moi
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctYC, baoGia])

  async function taoDonTuBaoGia() {
    const theoNcc = {}
    for (const ct of ctYC) {
      const nccId = chonTheoDong[ct.id]
      if (!nccId) continue
      const bg = baoGia.find(b => b.yeu_cau_bao_gia_ncc_id === nccId && b.chi_tiet_yeu_cau_id === ct.id)
      if (!bg) continue
      const nm = nccMoi.find(n => n.id === nccId)
      if (!nm) continue
      ;(theoNcc[nm.nha_cung_cap_id] ||= []).push({ vat_tu_id: ct.vat_tu_id, so_luong_mua: ct.so_luong_can_mua, don_gia: bg.don_gia })
    }
    if (!Object.keys(theoNcc).length) { setLoi('Chưa có dòng nào được chọn NCC + có báo giá.'); return }

    setDangXuLy(true); setLoi(null)
    try {
      const daTao = []
      for (const [nccId, dsD] of Object.entries(theoNcc)) {
        const { data: don, error: e1 } = await supabase.from('don_dat_hang_ncc')
          .insert({ nha_cung_cap_id: nccId, chi_nhanh_id: chiNhanhId })
          .select('id, so_don').single()
        if (e1) throw e1
        const { error: e2 } = await supabase.from('chi_tiet_don_dat_hang_ncc').insert(
          dsD.map(d => ({ don_dat_hang_id: don.id, vat_tu_id: d.vat_tu_id, so_luong_mua: Number(d.so_luong_mua), don_gia: Number(d.don_gia) }))
        )
        if (e2) throw e2
        daTao.push(don.so_don)
      }
      const { error: e3 } = await supabase.from('yeu_cau_bao_gia').update({ trang_thai: 'da_chon_ncc' }).eq('id', xem.id)
      if (e3) throw e3
      setOk(`Đã tạo ${daTao.length} đơn đặt hàng: ${daTao.join(', ')}. Vào mục "Đơn đặt NCC" để kiểm tra và gửi.`)
      setXem(null)
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const duocTao = coQuyen('mua_hang', 'tao')

  return (
    <Trang
      tieuDe="Yêu cầu báo giá"
      mota="Mời nhiều NCC báo giá cho cùng 1 đợt mua, so sánh rồi chọn NCC tạo đơn đặt hàng"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={moModalTao}>+ Tạo yêu cầu</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />
      {ok && <div className="alert alert-success alert-dismissible" role="alert">{ok}
        <button type="button" className="btn-close" onClick={() => setOk(null)} /></div>}

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            trong="Chưa có yêu cầu báo giá nào"
            cot={[
              { ten: 'Số YC', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>{r.so_yc}</button>
              ) },
              { ten: 'Tiêu đề', render: r => r.tieu_de },
              { ten: 'Hạn báo giá', render: r => ngay(r.han_bao_gia) },
              { ten: 'Nhận dự kiến', render: r => ngay(r.ngay_nhan_du_kien) },
              { ten: 'Số NCC mời', lop: 'text-end', render: r => r.yeu_cau_bao_gia_ncc?.length ?? 0 },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> }
            ]}
          />
        </div>
      )}

      <Modal mo={moTao} tieuDe="Tạo yêu cầu báo giá" onDong={() => setMoTao(false)} onLuu={taoYC} dangLuu={dangLuu} rong>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">Tiêu đề *</label>
            <input className="form-control" value={tieuDe} onChange={e => setTieuDe(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Hạn báo giá</label>
            <input type="date" className="form-control" value={hanBaoGia} min={homNay()}
              onChange={e => setHanBaoGia(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Ngày nhận dự kiến</label>
            <input type="date" className="form-control" value={ngayNhanDuKien}
              onChange={e => setNgayNhanDuKien(e.target.value)} />
          </div>
          <div className="col-12">
            <label className="form-label">Ghi chú</label>
            <input className="form-control" value={ghiChu} onChange={e => setGhiChu(e.target.value)} />
          </div>
        </div>

        <label className="form-label fw-semibold">Vật tư cần mua</label>
        <div className="table-responsive mb-2">
          <table className="table table-sm align-middle">
            <thead><tr><th>Vật tư</th><th style={{ width: 160 }}>Số lượng</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {dsDong.map((d, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-select form-select-sm" value={d.vat_tu_id}
                      onChange={e => suaDong(i, 'vat_tu_id', e.target.value)}>
                      <option value="">— Chọn vật tư —</option>
                      {vatTus.map(v => <option key={v.id} value={v.id}>{v.ten_vat_tu}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="number" min="0" step="0.001" className="form-control form-control-sm"
                      value={d.so_luong_can_mua} onChange={e => suaDong(i, 'so_luong_can_mua', e.target.value)} />
                  </td>
                  <td>
                    {dsDong.length > 1 && (
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => xoaDong(i)}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary mb-3" onClick={themDong}>+ Thêm dòng</button>

        <label className="form-label fw-semibold">Mời nhà cung cấp báo giá</label>
        <div className="row g-2">
          {nccs.map(n => (
            <div className="col-md-4" key={n.id}>
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id={`ncc-${n.id}`}
                  checked={!!nccChon[n.id]}
                  onChange={e => setNccChon({ ...nccChon, [n.id]: e.target.checked })} />
                <label className="form-check-label" htmlFor={`ncc-${n.id}`}>{n.ten_ncc}</label>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal mo={!!xem} tieuDe={`Yêu cầu báo giá ${xem?.so_yc || ''} — ${xem?.tieu_de || ''}`} onDong={() => setXem(null)} rong>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {nccMoi.map(n => (
            <button key={n.id} type="button"
              className={`btn btn-sm ${n.trang_thai === 'da_bao_gia' ? 'btn-outline-success' : 'btn-outline-secondary'}`}
              onClick={() => moNhapGia(n.id)}>
              {n.nha_cung_cap?.ten_ncc} — <TrangThai gt={n.trang_thai} />
            </button>
          ))}
        </div>

        {nccDangNhap && (
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              <div className="fw-semibold mb-2">
                Nhập báo giá — {nccMoi.find(n => n.id === nccDangNhap)?.nha_cung_cap?.ten_ncc}
              </div>
              <div className="table-responsive">
                <table className="table table-sm align-middle">
                  <thead><tr><th>Vật tư</th><th className="text-end">SL cần</th><th style={{ width: 160 }}>Đơn giá</th></tr></thead>
                  <tbody>
                    {ctYC.map(ct => (
                      <tr key={ct.id}>
                        <td>{ct.vat_tu?.ten_vat_tu}</td>
                        <td className="text-end">{so(ct.so_luong_can_mua)}</td>
                        <td>
                          <input type="number" min="0" className="form-control form-control-sm"
                            value={giaNhap[ct.id] ?? ''}
                            onChange={e => setGiaNhap({ ...giaNhap, [ct.id]: e.target.value })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-sm btn-primary" onClick={luuBaoGia} disabled={dangXuLy}>
                  {dangXuLy ? 'Đang lưu…' : 'Lưu báo giá'}
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setNccDangNhap(null)}>Đóng</button>
              </div>
            </div>
          </div>
        )}

        <div className="fw-semibold mb-2">Bảng so sánh báo giá</div>
        {!baoGia.length ? <Trong text="Chưa có NCC nào báo giá" /> : (
          <div className="table-responsive mb-3">
            <table className="table table-sm table-bordered align-middle">
              <thead className="table-light">
                <tr>
                  <th>Vật tư</th>
                  {nccMoi.map(n => <th key={n.id} className="text-end">{n.nha_cung_cap?.ten_ncc}</th>)}
                  <th>Chọn NCC → tạo đơn</th>
                </tr>
              </thead>
              <tbody>
                {ctYC.map(ct => {
                  const min = giaThapNhat(ct.id)
                  return (
                    <tr key={ct.id}>
                      <td>{ct.vat_tu?.ten_vat_tu}</td>
                      {nccMoi.map(n => {
                        const bg = baoGia.find(b => b.yeu_cau_bao_gia_ncc_id === n.id && b.chi_tiet_yeu_cau_id === ct.id)
                        const laThapNhat = bg && Number(bg.don_gia) === min
                        return (
                          <td key={n.id} className={`text-end ${laThapNhat ? 'table-success fw-semibold' : ''}`}>
                            {bg ? tien(bg.don_gia) : '—'}
                          </td>
                        )
                      })}
                      <td>
                        <select className="form-select form-select-sm" value={chonTheoDong[ct.id] || ''}
                          onChange={e => setChonTheoDong({ ...chonTheoDong, [ct.id]: e.target.value })}>
                          <option value="">— Chưa chọn —</option>
                          {nccMoi.filter(n => baoGia.some(b => b.yeu_cau_bao_gia_ncc_id === n.id && b.chi_tiet_yeu_cau_id === ct.id))
                            .map(n => <option key={n.id} value={n.id}>{n.nha_cung_cap?.ten_ncc}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {duocTao && baoGia.length > 0 && xem?.trang_thai !== 'da_chon_ncc' && (
          <button type="button" className="btn btn-success" onClick={taoDonTuBaoGia} disabled={dangXuLy}>
            {dangXuLy ? 'Đang tạo…' : 'Chọn NCC & tạo đơn đặt hàng'}
          </button>
        )}
        {xem?.trang_thai === 'da_chon_ncc' && (
          <div className="alert alert-secondary small mb-0">Đã tạo đơn đặt hàng từ yêu cầu này.</div>
        )}
      </Modal>
    </Trang>
  )
}
