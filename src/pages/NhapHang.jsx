import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, so, ngayGio, ngay } from '../lib/dinhDang'

const DONG_TRONG = { vat_tu_id: '', so_luong: '', don_gia: '', han_su_dung: '', so_luong_dat: null, so_luong_da_nhan: null }

export default function NhapHang() {
  const { chiNhanhId, coQuyen } = useApp()
  const [phieu, setPhieu] = useState([])
  const [nccs, setNccs] = useState([])
  const [vatTus, setVatTus] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [moTao, setMoTao] = useState(false)
  const [dangLuu, setDangLuu] = useState(false)
  const [nccId, setNccId] = useState('')
  const [soHdNcc, setSoHdNcc] = useState('')
  const [thueSuat, setThueSuat] = useState('0')
  const [donDatHangId, setDonDatHangId] = useState('')
  const [donDatHangs, setDonDatHangs] = useState([])
  const [dongCt, setDongCt] = useState([{ ...DONG_TRONG }])

  const [xem, setXem] = useState(null)
  const [ctXem, setCtXem] = useState([])

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    try {
      const [p, n, v, dd] = await Promise.all([
        supabase.from('phieu_nhap_kho')
          .select('id, so_phieu, ngay_nhap, tong_tien, thue_suat, tien_thue, tong_thanh_toan, trang_thai, so_hoa_don_ncc, don_dat_hang:don_dat_hang_ncc(so_don), nha_cung_cap(ten_ncc)')
          .eq('chi_nhanh_id', chiNhanhId)
          .order('ngay_nhap', { ascending: false }).limit(100),
        supabase.from('nha_cung_cap').select('id, ten_ncc')
          .eq('trang_thai', 'hoat_dong').order('ten_ncc'),
        supabase.from('vat_tu').select('id, ma_vat_tu, ten_vat_tu, don_vi_tinh(ma_dvt)')
          .eq('trang_thai', 'hoat_dong').order('ten_vat_tu'),
        supabase.from('don_dat_hang_ncc')
          .select('id, so_don, nha_cung_cap_id, ngay_dat, ngay_giao_du_kien, tong_tien, trang_thai, nha_cung_cap(ten_ncc)')
          .eq('chi_nhanh_id', chiNhanhId)
          .in('trang_thai', ['da_gui', 'da_xac_nhan', 'nhan_mot_phan'])
          .order('ngay_dat', { ascending: false })
      ])
      for (const r of [p, n, v, dd]) if (r.error) throw r.error
      setPhieu(p.data || []); setNccs(n.data || []); setVatTus(v.data || [])
      setDonDatHangs(dd.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  function suaDong(i, truong, gt) {
    setDongCt(d => d.map((r, j) => j === i ? { ...r, [truong]: gt } : r))
  }

  async function chonDonDatHang(id) {
    setDonDatHangId(id)
    if (!id) return
    setLoi(null)
    try {
      const don = donDatHangs.find(d => d.id === id)
      if (don) setNccId(don.nha_cung_cap_id)

      const { data, error } = await supabase
        .from('chi_tiet_don_dat_hang_ncc')
        .select('vat_tu_id, so_luong_dat, so_luong_da_nhan, don_gia, he_so_quy_doi')
        .eq('don_dat_hang_id', id)
      if (error) throw error

      const conLai = (data || [])
        .map(r => ({
          vat_tu_id: r.vat_tu_id,
          so_luong: String(Number(r.so_luong_dat) - Number(r.so_luong_da_nhan)),
          don_gia: String(Math.round(Number(r.don_gia) / (Number(r.he_so_quy_doi) || 1))),
          han_su_dung: '',
          so_luong_dat: Number(r.so_luong_dat),
          so_luong_da_nhan: Number(r.so_luong_da_nhan)
        }))
        .filter(r => Number(r.so_luong) > 0)

      setDongCt(conLai.length ? conLai : [{ ...DONG_TRONG }])
    } catch (e) { setLoi(e.message) }
  }

  function moNhanHang(donDatHang) {
    setMoTao(true)
    chonDonDatHang(donDatHang.id)
  }

  async function luuPhieu() {
    const hopLe = dongCt.filter(d => d.vat_tu_id && Number(d.so_luong) > 0)
    if (!hopLe.length) { setLoi('Cần ít nhất một dòng có vật tư và số lượng > 0.'); return }
    setDangLuu(true); setLoi(null)
    try {
      const { data: p, error: e1 } = await supabase
        .from('phieu_nhap_kho')
        .insert({
          chi_nhanh_id: chiNhanhId,
          nha_cung_cap_id: nccId || null,
          so_hoa_don_ncc: soHdNcc || null,
          thue_suat: Number(thueSuat) || 0,
          don_dat_hang_id: donDatHangId || null
        })
        .select('id').single()
      if (e1) throw e1

      const { error: e2 } = await supabase.from('chi_tiet_phieu_nhap').insert(
        hopLe.map(d => ({
          phieu_nhap_id: p.id,
          vat_tu_id: d.vat_tu_id,
          so_luong: Number(d.so_luong),
          don_gia: Number(d.don_gia || 0),
          han_su_dung: d.han_su_dung || null
        }))
      )
      if (e2) throw e2

      setMoTao(false); setNccId(''); setSoHdNcc(''); setThueSuat('0'); setDonDatHangId(''); setDongCt([{ ...DONG_TRONG }])
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function duyet(p) {
    if (!confirm(`Duyệt phiếu ${p.so_phieu}? Kho sẽ được cộng ngay và không hoàn tác được.`)) return
    setLoi(null)
    const { error } = await supabase
      .from('phieu_nhap_kho').update({ trang_thai: 'da_duyet' }).eq('id', p.id)
    if (error) setLoi(error.message)
    await napDs()
  }

  async function huy(p) {
    if (!confirm(`Hủy phiếu ${p.so_phieu}? Phiếu chưa duyệt nên chưa cộng kho, hủy an toàn.`)) return
    setLoi(null)
    const { error } = await supabase
      .from('phieu_nhap_kho').update({ trang_thai: 'da_huy' }).eq('id', p.id)
    if (error) setLoi(error.message)
    await napDs()
  }

  async function moXem(p) {
    setXem(p); setCtXem([])
    const { data, error } = await supabase
      .from('chi_tiet_phieu_nhap')
      .select('id, so_luong, don_gia, thanh_tien, han_su_dung, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt)), lo_hang(ma_lo)')
      .eq('phieu_nhap_id', p.id)
    if (error) setLoi(error.message)
    setCtXem(data || [])
  }

  const duocTao = coQuyen('mua_hang', 'tao')
  const duocDuyet = coQuyen('mua_hang', 'duyet')
  const duocSua = coQuyen('mua_hang', 'sua')

  return (
    <Trang
      tieuDe="Nhập hàng"
      mota="Phiếu nhập chỉ cộng kho khi được duyệt"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Tạo phiếu nhập</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {!dangTai && donDatHangs.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Đơn hàng đang chờ nhận</span>
            <span className="badge text-bg-warning">{donDatHangs.length}</span>
          </div>
          <div className="card-body p-0">
            <Bang
              dong={donDatHangs}
              trong="Không có đơn hàng nào đang chờ nhận"
              cot={[
                { ten: 'Số đơn', render: r => <code className="small">{r.so_don}</code> },
                { ten: 'Nhà cung cấp', render: r => r.nha_cung_cap?.ten_ncc || '—' },
                { ten: 'Ngày đặt', render: r => ngay(r.ngay_dat) },
                { ten: 'Giao dự kiến', render: r => r.ngay_giao_du_kien ? ngay(r.ngay_giao_du_kien) : '—' },
                { ten: 'Tổng tiền', lop: 'text-end', render: r => tien(r.tong_tien) },
                { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
                { ten: '', lop: 'text-end', render: r => duocTao && (
                  <button className="btn btn-sm btn-primary" onClick={() => moNhanHang(r)}>Nhận hàng</button>
                ) }
              ]}
            />
          </div>
        </div>
      )}

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={phieu}
            trong="Chưa có phiếu nhập nào"
            cot={[
              { ten: 'Số phiếu', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>
                  {r.so_phieu}
                </button>
              ) },
              { ten: 'Ngày', render: r => ngayGio(r.ngay_nhap) },
              { ten: 'Nhà cung cấp', render: r => r.nha_cung_cap?.ten_ncc || '—' },
              { ten: 'HĐ NCC', render: r => r.so_hoa_don_ncc || '—' },
              { ten: 'Đơn đặt hàng', render: r => r.don_dat_hang?.so_don
                  ? <code className="small">{r.don_dat_hang.so_don}</code> : '—' },
              { ten: 'Tiền hàng', lop: 'text-end', render: r => tien(r.tong_tien) },
              { ten: 'Thuế VAT', lop: 'text-end', render: r => `${r.thue_suat > 0 ? tien(r.tien_thue) : '—'}` },
              { ten: 'Tổng thanh toán', lop: 'text-end', render: r => (
                <span className="fw-semibold">{tien(r.tong_thanh_toan)}</span>
              ) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> },
              { ten: '', lop: 'text-end', render: r => r.trang_thai === 'nhap' && (
                <div className="d-flex gap-1 justify-content-end">
                  {duocDuyet && <button className="btn btn-sm btn-success" onClick={() => duyet(r)}>Duyệt</button>}
                  {duocSua && <button className="btn btn-sm btn-outline-danger" onClick={() => huy(r)}>Hủy</button>}
                </div>
              ) }
            ]}
          />
        </div>
      )}

      {/* Tạo phiếu */}
      <Modal
        mo={moTao} rong
        tieuDe="Tạo phiếu nhập"
        onDong={() => setMoTao(false)}
        onLuu={luuPhieu} dangLuu={dangLuu} nhanLuu="Lưu phiếu nháp"
      >
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label">Đơn đặt hàng NCC (không bắt buộc)</label>
            <select className="form-select" value={donDatHangId} onChange={e => chonDonDatHang(e.target.value)}>
              <option value="">— Nhập hàng không qua đơn đặt —</option>
              {donDatHangs.map(d => (
                <option key={d.id} value={d.id}>{d.so_don} — {d.nha_cung_cap?.ten_ncc}</option>
              ))}
            </select>
            {donDatHangId && (
              <div className="form-text">Đã nạp các dòng còn thiếu từ đơn đặt hàng — có thể sửa lại số lượng/giá.</div>
            )}
          </div>
          <div className="col-md-3">
            <label className="form-label">Nhà cung cấp</label>
            <select className="form-select" value={nccId} onChange={e => setNccId(e.target.value)}
              disabled={!!donDatHangId}>
              <option value="">— Chọn —</option>
              {nccs.map(n => <option key={n.id} value={n.id}>{n.ten_ncc}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Số hóa đơn NCC</label>
            <input className="form-control" value={soHdNcc} onChange={e => setSoHdNcc(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Thuế suất VAT (%)</label>
            <input type="number" min="0" max="100" step="1" className="form-control"
              value={thueSuat} onChange={e => setThueSuat(e.target.value)} />
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead className="table-light">
              <tr>
                <th style={{ minWidth: 220 }}>Vật tư</th>
                <th style={{ width: 150 }}>{donDatHangId ? 'Nhận lần này' : 'Số lượng'}</th>
                <th style={{ width: 140 }}>Đơn giá</th>
                <th style={{ width: 160 }}>Hạn sử dụng</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {dongCt.map((d, i) => (
                <tr key={i}>
                  <td>
                    <select className="form-select form-select-sm"
                      value={d.vat_tu_id} onChange={e => suaDong(i, 'vat_tu_id', e.target.value)}>
                      <option value="">— Chọn vật tư —</option>
                      {vatTus.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.ten_vat_tu} ({v.don_vi_tinh?.ma_dvt})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="number" step="0.001" min="0" className="form-control form-control-sm"
                      value={d.so_luong} onChange={e => suaDong(i, 'so_luong', e.target.value)} />
                    {d.so_luong_dat != null && (
                      <div className="form-text mb-0">Đặt {so(d.so_luong_dat)} — đã nhận {so(d.so_luong_da_nhan)}</div>
                    )}
                  </td>
                  <td><input type="number" step="1" min="0" className="form-control form-control-sm"
                    value={d.don_gia} onChange={e => suaDong(i, 'don_gia', e.target.value)} /></td>
                  <td><input type="date" className="form-control form-control-sm"
                    value={d.han_su_dung} onChange={e => suaDong(i, 'han_su_dung', e.target.value)} /></td>
                  <td>
                    <button className="btn btn-sm btn-outline-danger"
                      onClick={() => setDongCt(dongCt.filter((_, j) => j !== i))}
                      disabled={dongCt.length === 1}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="d-flex justify-content-between align-items-center">
          <button className="btn btn-sm btn-outline-secondary"
            onClick={() => setDongCt([...dongCt, { ...DONG_TRONG }])}>+ Thêm dòng</button>
          <div className="text-end">
            {(() => {
              const tienHang = dongCt.reduce((s, d) => s + (Number(d.so_luong) || 0) * (Number(d.don_gia) || 0), 0)
              const tienThue = Math.round(tienHang * (Number(thueSuat) || 0) / 100)
              return (
                <>
                  <div className="small text-secondary">
                    Tiền hàng {tien(tienHang)}{Number(thueSuat) > 0 && <> — Thuế VAT {tien(tienThue)}</>}
                  </div>
                  <span className="text-secondary small me-2">Tổng thanh toán dự kiến</span>
                  <span className="fs-5 fw-bold">{tien(tienHang + tienThue)}</span>
                </>
              )
            })()}
          </div>
        </div>

        <div className="alert alert-info small mt-3 mb-0">
          Điền <strong>hạn sử dụng</strong> để hệ thống tự tạo lô — xuất kho sau này sẽ theo
          FEFO (lô hết hạn trước đi trước).
        </div>
      </Modal>

      {/* Xem chi tiết */}
      <Modal mo={!!xem} tieuDe={`Phiếu ${xem?.so_phieu || ''}`} onDong={() => setXem(null)} rong>
        <Bang
          dong={ctXem}
          trong="Phiếu chưa có dòng nào"
          cot={[
            { ten: 'Vật tư', render: r => r.vat_tu?.ten_vat_tu },
            { ten: 'ĐVT', render: r => r.vat_tu?.don_vi_tinh?.ma_dvt },
            { ten: 'SL', lop: 'text-end', render: r => so(r.so_luong) },
            { ten: 'Đơn giá', lop: 'text-end', render: r => tien(r.don_gia) },
            { ten: 'Thành tiền', lop: 'text-end', render: r => tien(r.thanh_tien) },
            { ten: 'HSD', render: r => ngay(r.han_su_dung) },
            { ten: 'Lô', render: r => r.lo_hang?.ma_lo ? <code className="small">{r.lo_hang.ma_lo}</code> : '—' }
          ]}
        />
      </Modal>
    </Trang>
  )
}
