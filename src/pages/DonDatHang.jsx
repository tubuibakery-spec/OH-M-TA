import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, so, ngay, ngayGio } from '../lib/dinhDang'

export default function DonDatHang() {
  const { chiNhanhId, coQuyen, nguoiDung } = useApp()
  const [don, setDon] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [xem, setXem] = useState(null)
  const [ct, setCt] = useState([])
  const [hanMucDuyet, setHanMucDuyet] = useState(null)
  const [tabXem, setTabXem] = useState('chi_tiet')
  const [ghiChuList, setGhiChuList] = useState([])
  const [noiDungMoi, setNoiDungMoi] = useState('')
  const [dangGuiGhiChu, setDangGuiGhiChu] = useState(false)
  const [lichSu, setLichSu] = useState([])

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    const [d, ch] = await Promise.all([
      supabase.from('don_dat_hang_ncc')
        .select('id, so_don, ngay_dat, ngay_giao_du_kien, tong_tien, trang_thai, ghi_chu, nguoi_duyet_id, ngay_duyet, nha_cung_cap(ten_ncc)')
        .eq('chi_nhanh_id', chiNhanhId)
        .order('ngay_dat', { ascending: false }).limit(100),
      supabase.from('cau_hinh_cong_ty').select('han_muc_duyet_don_mua').eq('id', 1).maybeSingle()
    ])
    if (d.error) setLoi(d.error.message)
    setDon(d.data || [])
    setHanMucDuyet(ch.data?.han_muc_duyet_don_mua ?? null)
    setDangTai(false)
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

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
  const duocDuyet = coQuyen('mua_hang', 'duyet')

  return (
    <Trang tieuDe="Đơn đặt nhà cung cấp" mota="Đơn ở trạng thái Đã gửi / Đã xác nhận mới được tính là “hàng đang về”">
      <Loi loi={loi} onDong={() => setLoi(null)} />

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
    </Trang>
  )
}
