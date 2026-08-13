import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { so, tien, donGiaSuDung } from '../lib/dinhDang'

const TAO_MOI = { vat_tu_dau_ra_id: '', ten_cong_thuc: '', so_luong_dau_ra: '1', ty_le_hao_hut_phan_tram: '0' }

export default function CongThucSanXuat() {
  const { coQuyenMoiNoi, coQuyen } = useApp()
  const [congThucs, setCongThucs] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [giaNccChinh, setGiaNccChinh] = useState({})
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [hienLichSu, setHienLichSu] = useState(false)

  const [moTao, setMoTao] = useState(false)
  const [formTao, setFormTao] = useState({ ...TAO_MOI })
  const [dangXuLy, setDangXuLy] = useState(false)

  const [xem, setXem] = useState(null)
  const [ctForm, setCtForm] = useState(null)
  const [chiTiet, setChiTiet] = useState([])
  const [dongMoi, setDongMoi] = useState({ vat_tu_id: '', so_luong_dinh_muc: '', ty_le_hao_hut_dong_pct: '0' })

  const [phienBanMoiCho, setPhienBanMoiCho] = useState(null)
  const [formPhienBan, setFormPhienBan] = useState(null)
  const [chiTietCu, setChiTietCu] = useState([])
  const [copyNguyenLieu, setCopyNguyenLieu] = useState(true)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [ct, vt, g] = await Promise.all([
        supabase.from('cong_thuc_san_xuat')
          .select('id, vat_tu_dau_ra_id, ten_cong_thuc, so_luong_dau_ra, ty_le_hao_hut_phan_tram, phien_ban, dang_ap_dung, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))')
          .order('ten_cong_thuc'),
        supabase.from('vat_tu').select('id, ma_vat_tu, ten_vat_tu, loai_vat_tu, don_vi_tinh(ma_dvt)').order('ten_vat_tu'),
        supabase.from('gia_nha_cung_cap').select('vat_tu_id, don_gia')
          .eq('la_ncc_chinh', true).eq('dang_ap_dung', true)
      ])
      if (ct.error) throw ct.error
      if (vt.error) throw vt.error
      if (g.error) throw g.error
      setCongThucs(ct.data || []); setVatTus(vt.data || [])
      setGiaNccChinh(Object.fromEntries((g.data || []).map(r => [r.vat_tu_id, r.don_gia])))
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { nap() }, [nap])

  const dsHienThi = useMemo(
    () => congThucs.filter(c => hienLichSu || c.dang_ap_dung),
    [congThucs, hienLichSu]
  )

  const vatTuDauRaChuaCoCongThuc = useMemo(() => {
    const daCo = new Set(congThucs.filter(c => c.dang_ap_dung).map(c => c.vat_tu_dau_ra_id))
    return vatTus.filter(v => ['ban_thanh_pham', 'thanh_pham'].includes(v.loai_vat_tu) && !daCo.has(v.id))
  }, [congThucs, vatTus])

  async function napChiTiet(congThucId) {
    const { data, error } = await supabase
      .from('chi_tiet_cong_thuc')
      .select('id, vat_tu_id, so_luong_dinh_muc, ty_le_hao_hut_dong_pct, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt), ty_le_thu_hoi_so_che_pct, ty_le_su_dung_van_hanh_pct)')
      .eq('cong_thuc_id', congThucId)
      .order('id')
    if (error) { setLoi(error.message); return [] }
    return data || []
  }

  function giaTriDong(r) {
    const donGia = donGiaSuDung(giaNccChinh[r.vat_tu_id], r.vat_tu?.ty_le_thu_hoi_so_che_pct, r.vat_tu?.ty_le_su_dung_van_hanh_pct)
    if (!donGia) return 0
    return Math.round(donGia * Number(r.so_luong_dinh_muc) * (1 + Number(r.ty_le_hao_hut_dong_pct || 0) / 100))
  }

  async function taoCongThuc() {
    if (!formTao.vat_tu_dau_ra_id || !formTao.ten_cong_thuc.trim()) {
      setLoi('Cần chọn vật tư đầu ra và điền tên công thức.'); return
    }
    setDangXuLy(true); setLoi(null)
    try {
      const { data, error } = await supabase.from('cong_thuc_san_xuat').insert({
        vat_tu_dau_ra_id: formTao.vat_tu_dau_ra_id,
        ten_cong_thuc: formTao.ten_cong_thuc.trim(),
        so_luong_dau_ra: Number(formTao.so_luong_dau_ra || 1),
        ty_le_hao_hut_phan_tram: Number(formTao.ty_le_hao_hut_phan_tram || 0),
        phien_ban: 1,
        dang_ap_dung: true
      }).select('id, vat_tu_dau_ra_id, ten_cong_thuc, so_luong_dau_ra, ty_le_hao_hut_phan_tram, phien_ban, dang_ap_dung, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))').single()
      if (error) throw error
      setMoTao(false); setFormTao({ ...TAO_MOI })
      await nap()
      await moXem(data)
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const moXem = useCallback(async (c) => {
    setXem(c)
    setCtForm({
      ten_cong_thuc: c.ten_cong_thuc,
      so_luong_dau_ra: String(c.so_luong_dau_ra),
      ty_le_hao_hut_phan_tram: String(c.ty_le_hao_hut_phan_tram ?? 0)
    })
    setDongMoi({ vat_tu_id: '', so_luong_dinh_muc: '', ty_le_hao_hut_dong_pct: '0' })
    setChiTiet(await napChiTiet(c.id))
  }, [])

  async function luuThongTinCongThuc() {
    setDangXuLy(true); setLoi(null)
    try {
      const ban = {
        ten_cong_thuc: ctForm.ten_cong_thuc.trim(),
        so_luong_dau_ra: Number(ctForm.so_luong_dau_ra || 1),
        ty_le_hao_hut_phan_tram: Number(ctForm.ty_le_hao_hut_phan_tram || 0)
      }
      const { error } = await supabase.from('cong_thuc_san_xuat').update(ban).eq('id', xem.id)
      if (error) throw error
      await nap()
      setXem(null)
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function themDongNguyenLieu() {
    if (!dongMoi.vat_tu_id || !(Number(dongMoi.so_luong_dinh_muc) > 0)) {
      setLoi('Chọn nguyên liệu và nhập định mức > 0.'); return
    }
    setLoi(null)
    const { error } = await supabase.from('chi_tiet_cong_thuc').insert({
      cong_thuc_id: xem.id,
      vat_tu_id: dongMoi.vat_tu_id,
      so_luong_dinh_muc: Number(dongMoi.so_luong_dinh_muc),
      ty_le_hao_hut_dong_pct: Number(dongMoi.ty_le_hao_hut_dong_pct || 0)
    })
    if (error) { setLoi(error.message); return }
    setDongMoi({ vat_tu_id: '', so_luong_dinh_muc: '', ty_le_hao_hut_dong_pct: '0' })
    setChiTiet(await napChiTiet(xem.id))
  }

  async function xoaDongNguyenLieu(id) {
    setLoi(null)
    const { error } = await supabase.from('chi_tiet_cong_thuc').delete().eq('id', id)
    if (error) { setLoi(error.message); return }
    setChiTiet(await napChiTiet(xem.id))
  }

  async function suaHaoHutDong(id, gt) {
    setChiTiet(ct => ct.map(r => r.id === id ? { ...r, ty_le_hao_hut_dong_pct: gt } : r))
    const soMoi = Number(gt)
    if (!(soMoi >= 0)) return
    const { error } = await supabase.from('chi_tiet_cong_thuc').update({ ty_le_hao_hut_dong_pct: soMoi }).eq('id', id)
    if (error) setLoi(error.message)
  }

  const vatTuNguyenLieuChon = useMemo(() => {
    if (!xem) return []
    const daCo = new Set(chiTiet.map(r => r.vat_tu_id))
    return vatTus.filter(v => v.id !== xem.vat_tu_dau_ra_id && !daCo.has(v.id))
  }, [vatTus, xem, chiTiet])

  async function moPhienBanMoi(c) {
    setPhienBanMoiCho(c)
    setFormPhienBan({
      ten_cong_thuc: c.ten_cong_thuc,
      so_luong_dau_ra: String(c.so_luong_dau_ra),
      ty_le_hao_hut_phan_tram: String(c.ty_le_hao_hut_phan_tram ?? 0)
    })
    setCopyNguyenLieu(true)
    setChiTietCu(await napChiTiet(c.id))
  }

  async function taoPhienBanMoi() {
    setDangXuLy(true); setLoi(null)
    try {
      const { error: e1 } = await supabase.from('cong_thuc_san_xuat')
        .update({ dang_ap_dung: false }).eq('id', phienBanMoiCho.id)
      if (e1) throw e1

      const phienBanKeTiep = Math.max(
        ...congThucs.filter(c => c.vat_tu_dau_ra_id === phienBanMoiCho.vat_tu_dau_ra_id).map(c => c.phien_ban),
        phienBanMoiCho.phien_ban
      ) + 1

      const { data: moi, error: e2 } = await supabase.from('cong_thuc_san_xuat').insert({
        vat_tu_dau_ra_id: phienBanMoiCho.vat_tu_dau_ra_id,
        ten_cong_thuc: formPhienBan.ten_cong_thuc.trim(),
        so_luong_dau_ra: Number(formPhienBan.so_luong_dau_ra || 1),
        ty_le_hao_hut_phan_tram: Number(formPhienBan.ty_le_hao_hut_phan_tram || 0),
        phien_ban: phienBanKeTiep,
        dang_ap_dung: true
      }).select().single()
      if (e2) throw e2

      if (copyNguyenLieu && chiTietCu.length) {
        const { error: e3 } = await supabase.from('chi_tiet_cong_thuc').insert(
          chiTietCu.map(r => ({ cong_thuc_id: moi.id, vat_tu_id: r.vat_tu_id, so_luong_dinh_muc: r.so_luong_dinh_muc }))
        )
        if (e3) throw e3
      }

      setPhienBanMoiCho(null)
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const duocTao = coQuyen('cong_thuc', 'tao', null)
  const duocSua = coQuyen('cong_thuc', 'sua', null)

  return (
    <Trang
      tieuDe="Công thức sản xuất"
      mota="Mỗi vật tư (BTP/thành phẩm) chỉ có 1 công thức đang áp dụng — bản cũ giữ lại làm lịch sử phiên bản."
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Tạo công thức</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="form-check mb-3">
        <input className="form-check-input" type="checkbox" id="hienLichSu"
          checked={hienLichSu} onChange={e => setHienLichSu(e.target.checked)} />
        <label className="form-check-label small" htmlFor="hienLichSu">Hiện cả phiên bản cũ (lịch sử)</label>
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={dsHienThi}
            trong="Chưa có công thức nào"
            cot={[
              { ten: 'Tên công thức', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>{r.ten_cong_thuc}</button>
              ) },
              { ten: 'Sản phẩm đầu ra', render: r => r.vat_tu?.ten_vat_tu },
              { ten: 'SL đầu ra/mẻ', lop: 'text-end', render: r => `${so(r.so_luong_dau_ra)} ${r.vat_tu?.don_vi_tinh?.ma_dvt || ''}` },
              { ten: 'Hao hụt %', lop: 'text-end', render: r => so(r.ty_le_hao_hut_phan_tram) },
              { ten: 'Phiên bản', lop: 'text-end', render: r => r.phien_ban },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.dang_ap_dung ? 'hieu_luc' : 'da_huy'} /> },
              { ten: '', lop: 'text-end', render: r => (
                <div className="d-flex gap-1 justify-content-end">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => moXem(r)}>Xem/Sửa</button>
                  {duocTao && r.dang_ap_dung && (
                    <button className="btn btn-sm btn-outline-primary" onClick={() => moPhienBanMoi(r)}>Tạo phiên bản mới</button>
                  )}
                </div>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moTao} tieuDe="Tạo công thức mới"
        onDong={() => setMoTao(false)} onLuu={taoCongThuc} dangLuu={dangXuLy}
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label">Vật tư đầu ra *</label>
            <select className="form-select" value={formTao.vat_tu_dau_ra_id}
              onChange={e => setFormTao({ ...formTao, vat_tu_dau_ra_id: e.target.value })}>
              <option value="">— Chọn BTP/thành phẩm chưa có công thức —</option>
              {vatTuDauRaChuaCoCongThuc.map(v => <option key={v.id} value={v.id}>{v.ten_vat_tu}</option>)}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">Tên công thức *</label>
            <input className="form-control" value={formTao.ten_cong_thuc}
              onChange={e => setFormTao({ ...formTao, ten_cong_thuc: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Số lượng đầu ra / mẻ</label>
            <input type="number" min="0.001" step="0.001" className="form-control" value={formTao.so_luong_dau_ra}
              onChange={e => setFormTao({ ...formTao, so_luong_dau_ra: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Hao hụt (%)</label>
            <input type="number" min="0" step="0.01" className="form-control" value={formTao.ty_le_hao_hut_phan_tram}
              onChange={e => setFormTao({ ...formTao, ty_le_hao_hut_phan_tram: e.target.value })} />
          </div>
        </div>
      </Modal>

      <Modal
        mo={!!xem} rong
        tieuDe={`Công thức — ${xem?.ten_cong_thuc || ''}`}
        onDong={() => setXem(null)}
        onLuu={duocSua ? luuThongTinCongThuc : null}
        nhanLuu="Lưu thông tin công thức"
        dangLuu={dangXuLy}
      >
        {ctForm && (
          <div className="row g-3 mb-4 border-bottom pb-3">
            <div className="col-md-6">
              <label className="form-label">Tên công thức</label>
              <input className="form-control" value={ctForm.ten_cong_thuc} disabled={!duocSua}
                onChange={e => setCtForm({ ...ctForm, ten_cong_thuc: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">SL đầu ra/mẻ</label>
              <input type="number" min="0.001" step="0.001" className="form-control" value={ctForm.so_luong_dau_ra}
                disabled={!duocSua}
                onChange={e => setCtForm({ ...ctForm, so_luong_dau_ra: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Hao hụt (%)</label>
              <input type="number" min="0" step="0.01" className="form-control" value={ctForm.ty_le_hao_hut_phan_tram}
                disabled={!duocSua}
                onChange={e => setCtForm({ ...ctForm, ty_le_hao_hut_phan_tram: e.target.value })} />
            </div>
          </div>
        )}

        <table className="table table-sm align-middle">
          <thead className="table-light">
            <tr>
              <th>Nguyên liệu</th><th className="text-end">Định mức</th>
              <th className="text-end" style={{ width: 130 }}>Hao hụt dòng (%)</th>
              <th className="text-end">Giá trị</th><th />
            </tr>
          </thead>
          <tbody>
            {chiTiet.length === 0 && (
              <tr><td colSpan={5} className="text-center text-secondary py-4">Chưa có nguyên liệu nào</td></tr>
            )}
            {chiTiet.map(r => (
              <tr key={r.id}>
                <td>{r.vat_tu?.ten_vat_tu} <span className="text-secondary small">({r.vat_tu?.don_vi_tinh?.ma_dvt})</span></td>
                <td className="text-end">{so(r.so_luong_dinh_muc)}</td>
                <td className="text-end">
                  {duocSua ? (
                    <input type="number" min="0" step="0.1" className="form-control form-control-sm text-end"
                      value={r.ty_le_hao_hut_dong_pct ?? 0}
                      onChange={e => suaHaoHutDong(r.id, e.target.value)} />
                  ) : so(r.ty_le_hao_hut_dong_pct)}
                </td>
                <td className="text-end">{giaTriDong(r) ? tien(giaTriDong(r)) : '—'}</td>
                <td className="text-end">
                  {duocSua && (
                    <button className="btn btn-sm btn-outline-danger" onClick={() => xoaDongNguyenLieu(r.id)}>Xóa</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {chiTiet.length > 0 && (
            <tfoot className="table-light">
              <tr>
                <td colSpan={3} className="text-end fw-semibold">Tổng giá trị/mẻ</td>
                <td className="text-end fw-semibold">{tien(chiTiet.reduce((s, r) => s + giaTriDong(r), 0))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>

        {duocSua && (
          <div className="row g-2 align-items-end border-top pt-3">
            <div className="col-md-6">
              <label className="form-label small">Thêm nguyên liệu</label>
              <select className="form-select form-select-sm" value={dongMoi.vat_tu_id}
                onChange={e => setDongMoi({ ...dongMoi, vat_tu_id: e.target.value })}>
                <option value="">— Chọn nguyên liệu —</option>
                {vatTuNguyenLieuChon.map(v => <option key={v.id} value={v.id}>{v.ten_vat_tu}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small">Định mức</label>
              <input type="number" min="0.001" step="0.001" className="form-control form-control-sm"
                value={dongMoi.so_luong_dinh_muc}
                onChange={e => setDongMoi({ ...dongMoi, so_luong_dinh_muc: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label small">Hao hụt (%)</label>
              <input type="number" min="0" step="0.1" className="form-control form-control-sm"
                value={dongMoi.ty_le_hao_hut_dong_pct}
                onChange={e => setDongMoi({ ...dongMoi, ty_le_hao_hut_dong_pct: e.target.value })} />
            </div>
            <div className="col-md-2">
              <button className="btn btn-sm btn-outline-primary w-100" onClick={themDongNguyenLieu}>+ Thêm dòng</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        mo={!!phienBanMoiCho}
        tieuDe={`Tạo phiên bản mới — ${phienBanMoiCho?.ten_cong_thuc || ''}`}
        onDong={() => setPhienBanMoiCho(null)} onLuu={taoPhienBanMoi} dangLuu={dangXuLy}
      >
        {formPhienBan && (
          <div className="row g-3">
            <div className="col-12 text-secondary small">
              Bản hiện tại (phiên bản {phienBanMoiCho?.phien_ban}) sẽ chuyển thành lịch sử, bản mới trở thành "Đang áp dụng".
            </div>
            <div className="col-12">
              <label className="form-label">Tên công thức</label>
              <input className="form-control" value={formPhienBan.ten_cong_thuc}
                onChange={e => setFormPhienBan({ ...formPhienBan, ten_cong_thuc: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">SL đầu ra/mẻ</label>
              <input type="number" min="0.001" step="0.001" className="form-control" value={formPhienBan.so_luong_dau_ra}
                onChange={e => setFormPhienBan({ ...formPhienBan, so_luong_dau_ra: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Hao hụt (%)</label>
              <input type="number" min="0" step="0.01" className="form-control" value={formPhienBan.ty_le_hao_hut_phan_tram}
                onChange={e => setFormPhienBan({ ...formPhienBan, ty_le_hao_hut_phan_tram: e.target.value })} />
            </div>
            <div className="col-12">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id="copyNguyenLieu"
                  checked={copyNguyenLieu} onChange={e => setCopyNguyenLieu(e.target.checked)} />
                <label className="form-check-label" htmlFor="copyNguyenLieu">
                  Copy {chiTietCu.length} nguyên liệu từ phiên bản hiện tại
                </label>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
