import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, so, ngay, ngayGio } from '../lib/dinhDang'

const DONG_TAO_TRONG = { vat_tu_id: '', so_luong_mua: '', he_so_quy_doi: '1', don_gia: '' }

export default function DonDatHang() {
  const { chiNhanhId, coQuyen, nguoiDung } = useApp()
  const [don, setDon] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [ok, setOk] = useState(null)
  const [xem, setXem] = useState(null)
  const [ct, setCt] = useState([])
  const [hanMucDuyet, setHanMucDuyet] = useState(null)
  const [tabXem, setTabXem] = useState('chi_tiet')
  const [ghiChuList, setGhiChuList] = useState([])
  const [noiDungMoi, setNoiDungMoi] = useState('')
  const [dangGuiGhiChu, setDangGuiGhiChu] = useState(false)
  const [lichSu, setLichSu] = useState([])

  const [nccs, setNccs] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [moTao, setMoTao] = useState(false)
  const [nccTaoId, setNccTaoId] = useState('')
  const [ngayGiaoTao, setNgayGiaoTao] = useState('')
  const [giaTheoNcc, setGiaTheoNcc] = useState({})
  const [dsDongTao, setDsDongTao] = useState([{ ...DONG_TAO_TRONG }])
  const [dangTao, setDangTao] = useState(false)

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    const [d, ch, ncc, vt] = await Promise.all([
      supabase.from('don_dat_hang_ncc')
        .select('id, so_don, ngay_dat, ngay_giao_du_kien, tong_tien, trang_thai, ghi_chu, nguoi_duyet_id, ngay_duyet, nha_cung_cap(ten_ncc)')
        .eq('chi_nhanh_id', chiNhanhId)
        .order('ngay_dat', { ascending: false }).limit(100),
      supabase.from('cau_hinh_cong_ty').select('han_muc_duyet_don_mua').eq('id', 1).maybeSingle(),
      supabase.from('nha_cung_cap').select('id, ten_ncc').order('ten_ncc'),
      supabase.from('vat_tu').select('id, ten_vat_tu, don_vi_tinh(ma_dvt)').eq('trang_thai', 'hoat_dong').order('ten_vat_tu')
    ])
    if (d.error) setLoi(d.error.message)
    setDon(d.data || [])
    setHanMucDuyet(ch.data?.han_muc_duyet_don_mua ?? null)
    setNccs(ncc.data || []); setVatTus(vt.data || [])
    setDangTai(false)
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  function moModalTao() {
    setNccTaoId(''); setNgayGiaoTao(''); setGiaTheoNcc({})
    setDsDongTao([{ ...DONG_TAO_TRONG }])
    setMoTao(true)
  }

  async function chonNccTao(id) {
    setNccTaoId(id)
    setDsDongTao([{ ...DONG_TAO_TRONG }])
    if (!id) { setGiaTheoNcc({}); return }
    const { data, error } = await supabase.from('gia_nha_cung_cap')
      .select('vat_tu_id, don_gia, he_so_quy_doi, don_vi_mua')
      .eq('nha_cung_cap_id', id).eq('dang_ap_dung', true)
    if (error) { setLoi(error.message); return }
    setGiaTheoNcc(Object.fromEntries((data || []).map(r => [r.vat_tu_id, r])))
  }

  function suaDongTao(i, truong, gt) {
    setDsDongTao(ds => ds.map((d, idx) => {
      if (idx !== i) return d
      const moi = { ...d, [truong]: gt }
      if (truong === 'vat_tu_id') {
        const g = giaTheoNcc[gt]
        if (g) { moi.he_so_quy_doi = String(g.he_so_quy_doi ?? 1); moi.don_gia = String(g.don_gia ?? '') }
      }
      return moi
    }))
  }
  function themDongTao() { setDsDongTao(ds => [...ds, { ...DONG_TAO_TRONG }]) }
  function xoaDongTao(i) { setDsDongTao(ds => ds.filter((_, idx) => idx !== i)) }

  const tongTienTao = dsDongTao.reduce((s, d) =>
    s + (Number(d.so_luong_mua) || 0) * (Number(d.don_gia) || 0), 0)

  async function taoDonThuCong() {
    if (!nccTaoId) { setLoi('Chọn nhà cung cấp.'); return }
    const hopLe = dsDongTao.filter(d => d.vat_tu_id && Number(d.so_luong_mua) > 0)
    if (!hopLe.length) { setLoi('Cần ít nhất 1 dòng vật tư hợp lệ.'); return }
    setDangTao(true); setLoi(null); setOk(null)
    try {
      const { data: moi, error: e1 } = await supabase.from('don_dat_hang_ncc')
        .insert({ nha_cung_cap_id: nccTaoId, chi_nhanh_id: chiNhanhId, ngay_giao_du_kien: ngayGiaoTao || null })
        .select('id, so_don').single()
      if (e1) throw e1
      const { error: e2 } = await supabase.from('chi_tiet_don_dat_hang_ncc').insert(
        hopLe.map(d => ({
          don_dat_hang_id: moi.id, vat_tu_id: d.vat_tu_id,
          so_luong_mua: Number(d.so_luong_mua), he_so_quy_doi: Number(d.he_so_quy_doi) || 1,
          don_gia: Number(d.don_gia || 0)
        }))
      )
      if (e2) throw e2
      setOk(`Đã tạo đơn ${moi.so_don}.`)
      setMoTao(false)
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangTao(false) }
  }

  async function moXem(d) {
    setXem(d); setCt([]); setGhiChuList([]); setLichSu([]); setNoiDungMoi(''); setTabXem('chi_tiet')
    const [ctRes, gcRes, nkRes] = await Promise.all([
      supabase.from('chi_tiet_don_dat_hang_ncc')
        .select('id, so_luong_mua, he_so_quy_doi, so_luong_dat, so_luong_da_nhan, don_gia, thanh_tien, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))')
        .eq('don_dat_hang_id', d.id),
      supabase.from('ghi_chu_don_dat_hang')
        .select('id, nguoi_dung_email, noi_dung, created_at')
        .eq('don_dat_hang_id', d.id).order('created_at'),
      supabase.from('nhat_ky_he_thong')
        .select('hanh_dong, nguoi_dung_email, thoi_gian')
        .eq('bang_du_lieu', 'don_dat_hang_ncc').eq('ban_ghi_id', d.id).order('thoi_gian')
    ])
    if (ctRes.error) setLoi(ctRes.error.message)
    setCt(ctRes.data || [])
    setGhiChuList(gcRes.data || [])
    setLichSu(nkRes.data || [])
  }

  async function guiGhiChu() {
    if (!noiDungMoi.trim()) return
    setDangGuiGhiChu(true); setLoi(null)
    try {
      const { error } = await supabase.from('ghi_chu_don_dat_hang')
        .insert({ don_dat_hang_id: xem.id, noi_dung: noiDungMoi.trim() })
      if (error) throw error
      setNoiDungMoi('')
      const { data } = await supabase.from('ghi_chu_don_dat_hang')
        .select('id, nguoi_dung_email, noi_dung, created_at')
        .eq('don_dat_hang_id', xem.id).order('created_at')
      setGhiChuList(data || [])
    } catch (e) { setLoi(e.message) } finally { setDangGuiGhiChu(false) }
  }

  async function doiTrangThai(d, tt) {
    setLoi(null)
    const { error } = await supabase.from('don_dat_hang_ncc').update({ trang_thai: tt }).eq('id', d.id)
    if (error) setLoi(error.message)
    await napDs()
  }

  async function huyDon(d) {
    if (!confirm(`Hủy đơn đặt hàng ${d.so_don}?`)) return
    await doiTrangThai(d, 'da_huy')
  }

  function gui(d) {
    const vuotHanMuc = hanMucDuyet && Number(d.tong_tien) > Number(hanMucDuyet)
    if (vuotHanMuc && !duocDuyet) {
      doiTrangThai(d, 'cho_duyet')
    } else {
      doiTrangThai(d, 'da_gui')
    }
  }

  async function duyet(d) {
    setLoi(null)
    const { error } = await supabase.from('don_dat_hang_ncc')
      .update({ trang_thai: 'da_gui', nguoi_duyet_id: nguoiDung?.nhan_vien_id || null, ngay_duyet: new Date().toISOString() })
      .eq('id', d.id)
    if (error) setLoi(error.message)
    await napDs()
  }

  async function tuChoi(d) {
    const lyDo = prompt('Lý do từ chối:')
    if (lyDo === null) return
    setLoi(null)
    const { error } = await supabase.from('don_dat_hang_ncc')
      .update({ trang_thai: 'tu_choi', ghi_chu: lyDo || null })
      .eq('id', d.id)
    if (error) setLoi(error.message)
    await napDs()
  }

  const duocSua = coQuyen('mua_hang', 'sua')
  const duocTao = coQuyen('mua_hang', 'tao')
  const duocDuyet = coQuyen('mua_hang', 'duyet')

  return (
    <Trang
      tieuDe="Đơn đặt nhà cung cấp"
      mota="Đơn ở trạng thái Đã gửi / Đã xác nhận mới được tính là “hàng đang về”"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={moModalTao}>+ Tạo đơn hàng</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />
      {ok && <div className="alert alert-success alert-dismissible" role="alert">{ok}
        <button type="button" className="btn-close" onClick={() => setOk(null)} /></div>}

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={don}
            trong="Chưa có đơn đặt hàng nào. Vào mục “Đề xuất đặt hàng” để tạo."
            cot={[
              { ten: 'Số đơn', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>
                  {r.so_don}
                </button>
              ) },
              { ten: 'Ngày đặt', render: r => ngayGio(r.ngay_dat) },
              { ten: 'Nhà cung cấp', render: r => r.nha_cung_cap?.ten_ncc || '—' },
              { ten: 'Giao dự kiến', render: r => ngay(r.ngay_giao_du_kien) },
              { ten: 'Tổng tiền', lop: 'text-end', render: r => tien(r.tong_tien) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
              { ten: '', lop: 'text-end', render: r => {
                const daKetThuc = ['hoan_thanh', 'da_huy', 'tu_choi'].includes(r.trang_thai)
                const vuotHanMuc = hanMucDuyet && Number(r.tong_tien) > Number(hanMucDuyet)
                return (
                  <div className="d-flex gap-1 justify-content-end">
                    {duocSua && r.trang_thai === 'nhap' && (
                      <button className="btn btn-sm btn-primary" onClick={() => gui(r)}>
                        {vuotHanMuc && !duocDuyet ? 'Gửi duyệt' : 'Gửi NCC'}
                      </button>
                    )}
                    {r.trang_thai === 'cho_duyet' && duocDuyet && (
                      <>
                        <button className="btn btn-sm btn-success" onClick={() => duyet(r)}>Duyệt</button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => tuChoi(r)}>Từ chối</button>
                      </>
                    )}
                    {duocSua && r.trang_thai === 'da_gui' && (
                      <button className="btn btn-sm btn-outline-primary" onClick={() => doiTrangThai(r, 'da_xac_nhan')}>NCC xác nhận</button>
                    )}
                    {duocSua && !daKetThuc && (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => huyDon(r)}>Hủy</button>
                    )}
                  </div>
                )
              } }
            ]}
          />
        </div>
      )}

      <Modal mo={!!xem} rong tieuDe={`Đơn ${xem?.so_don || ''}`} onDong={() => setXem(null)}>
        <ul className="nav nav-tabs mb-3">
          {[['chi_tiet', 'Chi tiết'], ['trao_doi', `Trao đổi nội bộ (${ghiChuList.length})`], ['lich_su', 'Lịch sử']].map(([k, nhan]) => (
            <li className="nav-item" key={k}>
              <button type="button" className={`nav-link ${tabXem === k ? 'active' : ''}`} onClick={() => setTabXem(k)}>{nhan}</button>
            </li>
          ))}
        </ul>

        {tabXem === 'chi_tiet' && (
          <>
            <Bang
              dong={ct}
              trong="Đơn chưa có dòng nào"
              cot={[
                { ten: 'Vật tư', render: r => r.vat_tu?.ten_vat_tu },
                { ten: 'Đặt (ĐV mua)', lop: 'text-end', render: r => so(r.so_luong_mua) },
                { ten: 'Quy đổi', lop: 'text-end', render: r => `×${so(r.he_so_quy_doi)}` },
                { ten: 'Thành SL kho', lop: 'text-end', render: r => `${so(r.so_luong_dat)} ${r.vat_tu?.don_vi_tinh?.ma_dvt || ''}` },
                { ten: 'Đã nhận', lop: 'text-end', render: r => (
                  <span className={Number(r.so_luong_da_nhan) >= Number(r.so_luong_dat) ? 'text-success fw-semibold' : ''}>
                    {so(r.so_luong_da_nhan)}
                  </span>
                ) },
                { ten: 'Đơn giá', lop: 'text-end', render: r => tien(r.don_gia) },
                { ten: 'Thành tiền', lop: 'text-end', render: r => tien(r.thanh_tien) }
              ]}
            />
            <div className="alert alert-secondary small mt-3 mb-0">
              “Đã nhận” tự cộng khi phiếu nhập gắn với đơn này được duyệt.
            </div>
          </>
        )}

        {tabXem === 'trao_doi' && (
          <div>
            {ghiChuList.length === 0 && <div className="text-secondary small mb-3">Chưa có trao đổi nào.</div>}
            <div className="d-flex flex-column gap-2 mb-3">
              {ghiChuList.map(g => (
                <div key={g.id} className="border rounded p-2">
                  <div className="d-flex justify-content-between small text-secondary">
                    <span>{g.nguoi_dung_email || '—'}</span>
                    <span>{ngayGio(g.created_at)}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{g.noi_dung}</div>
                </div>
              ))}
            </div>
            <div className="d-flex gap-2">
              <input className="form-control" placeholder="Nhập tin nhắn…" value={noiDungMoi}
                onChange={e => setNoiDungMoi(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guiGhiChu() }} />
              <button type="button" className="btn btn-primary text-nowrap" onClick={guiGhiChu} disabled={dangGuiGhiChu}>
                {dangGuiGhiChu ? 'Đang gửi…' : 'Gửi'}
              </button>
            </div>
          </div>
        )}

        {tabXem === 'lich_su' && (
          <Bang
            dong={lichSu}
            trong="Chưa có lịch sử thay đổi nào"
            cot={[
              { ten: 'Thời gian', render: r => ngayGio(r.thoi_gian) },
              { ten: 'Hành động', render: r => r.hanh_dong },
              { ten: 'Người thực hiện', render: r => r.nguoi_dung_email || '—' }
            ]}
          />
        )}
      </Modal>

      <Modal mo={moTao} rong tieuDe="Tạo đơn hàng" onDong={() => setMoTao(false)}
        onLuu={taoDonThuCong} dangLuu={dangTao} nhanLuu="Tạo đơn">
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">Nhà cung cấp *</label>
            <select className="form-select" value={nccTaoId} onChange={e => chonNccTao(e.target.value)}>
              <option value="">— Chọn NCC —</option>
              {nccs.map(n => <option key={n.id} value={n.id}>{n.ten_ncc}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Giao dự kiến</label>
            <input type="date" className="form-control" value={ngayGiaoTao}
              onChange={e => setNgayGiaoTao(e.target.value)} />
          </div>
        </div>

        <div className="table-responsive mb-2">
          <table className="table table-sm align-middle">
            <thead>
              <tr>
                <th>Vật tư</th><th style={{ width: 130 }}>SL (ĐV mua)</th>
                <th style={{ width: 110 }}>Quy đổi</th><th style={{ width: 150 }}>Đơn giá</th>
                <th className="text-end" style={{ width: 120 }}>Thành tiền</th><th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {dsDongTao.map((d, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-select form-select-sm" value={d.vat_tu_id}
                      onChange={e => suaDongTao(i, 'vat_tu_id', e.target.value)}>
                      <option value="">— Chọn vật tư —</option>
                      {vatTus.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.ten_vat_tu}{giaTheoNcc[v.id] ? ' ★ đã có giá' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="number" min="0" step="0.001" className="form-control form-control-sm"
                      value={d.so_luong_mua} onChange={e => suaDongTao(i, 'so_luong_mua', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" min="0.001" step="0.001" className="form-control form-control-sm"
                      value={d.he_so_quy_doi} onChange={e => suaDongTao(i, 'he_so_quy_doi', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" min="0" className="form-control form-control-sm"
                      value={d.don_gia} onChange={e => suaDongTao(i, 'don_gia', e.target.value)} />
                  </td>
                  <td className="text-end">{tien((Number(d.so_luong_mua) || 0) * (Number(d.don_gia) || 0))}</td>
                  <td>
                    {dsDongTao.length > 1 && (
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => xoaDongTao(i)}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="table-light">
              <tr>
                <td colSpan={4} className="text-end fw-semibold">Tổng tiền</td>
                <td className="text-end fw-bold">{tien(tongTienTao)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={themDongTao}>+ Thêm dòng</button>
        <div className="form-text mt-2">
          Chọn NCC trước để tự điền đơn giá/hệ số quy đổi theo "Bảng giá NCC" (nếu có) — vẫn sửa tay được. Đơn tạo ở trạng thái Nháp, vào danh sách để Gửi NCC.
        </div>
      </Modal>
    </Trang>
  )
}
