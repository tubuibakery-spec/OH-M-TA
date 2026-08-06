import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, ngayGio } from '../lib/dinhDang'

const CA = { sang: 'Sáng', chieu: 'Chiều', toi: 'Tối', ca_ngay: 'Cả ngày' }

export default function CaBanHang() {
  const { chiNhanhId, coQuyen, coQuyenMoiNoi, nguoiDung } = useApp()
  const [ds, setDs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [dangXuLy, setDangXuLy] = useState(false)

  const [moMo, setMoMo] = useState(false)
  const [caChon, setCaChon] = useState('ca_ngay')
  const [tienDauCa, setTienDauCa] = useState('0')

  const [moDong, setMoDong] = useState(false)
  const [tienThucTe, setTienThucTe] = useState('')

  const nap = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    const { data, error } = await supabase
      .from('ca_ban_hang')
      .select('id, ngay, ca, gio_mo, gio_dong, tien_dau_ca, tien_mat_he_thong, tien_mat_thuc_te, chenh_lech, trang_thai, ghi_chu, nguoi_mo:nguoi_mo_id(ho_ten), nguoi_dong:nguoi_dong_id(ho_ten)')
      .eq('chi_nhanh_id', chiNhanhId)
      .order('gio_mo', { ascending: false })
      .limit(20)
    if (error) setLoi(error.message)
    setDs(data || []); setDangTai(false)
  }, [chiNhanhId])

  useEffect(() => { nap() }, [nap])

  const caDangMo = ds.find(c => c.trang_thai === 'dang_mo')

  async function moCa() {
    if (caDangMo) { setLoi('Đã có ca đang mở — phải đóng ca hiện tại trước.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('ca_ban_hang').insert({
        chi_nhanh_id: chiNhanhId,
        ca: caChon,
        tien_dau_ca: Number(tienDauCa || 0),
        nguoi_mo_id: nguoiDung?.nhan_vien_id || null
      })
      if (error) throw error
      setMoMo(false); setCaChon('ca_ngay'); setTienDauCa('0')
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function dongCa() {
    if (tienThucTe === '' || Number(tienThucTe) < 0) { setLoi('Nhập tiền mặt thực tế đếm được.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('ca_ban_hang').update({
        trang_thai: 'da_dong',
        tien_mat_thuc_te: Number(tienThucTe),
        nguoi_dong_id: nguoiDung?.nhan_vien_id || null
      }).eq('id', caDangMo.id)
      if (error) throw error
      setMoDong(false); setTienThucTe('')
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function xacNhanDoiSoat(ca) {
    if (!confirm(`Xác nhận đã đối soát ca ${CA[ca.ca]} ngày ${ca.ngay}?`)) return
    setLoi(null)
    const { error } = await supabase.from('ca_ban_hang').update({ trang_thai: 'da_doi_soat' }).eq('id', ca.id)
    if (error) setLoi(error.message)
    await nap()
  }

  const duocMo = coQuyen('ban_le', 'tao')
  const duocSua = coQuyen('ban_le', 'sua')

  return (
    <Trang
      tieuDe="Ca bán hàng"
      mota="Mở ca đầu ngày, đóng ca cuối ngày để đối soát tiền mặt tại quầy"
      hanhDong={!caDangMo && duocMo && (
        <button className="btn btn-primary" onClick={() => setMoMo(true)}>+ Mở ca mới</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {caDangMo && (
        <div className="card border-0 shadow-sm mb-3 border-start border-4 border-success">
          <div className="card-body d-flex flex-wrap align-items-center gap-3">
            <div>
              <div className="text-secondary small text-uppercase">Ca đang mở</div>
              <div className="fw-semibold">{CA[caDangMo.ca]} — mở lúc {ngayGio(caDangMo.gio_mo)}</div>
              <div className="small text-secondary">
                Tiền đầu ca: {tien(caDangMo.tien_dau_ca)} — Người mở: {caDangMo.nguoi_mo?.ho_ten || '—'}
              </div>
            </div>
            {duocSua && (
              <button className="btn btn-warning ms-auto" onClick={() => setMoDong(true)}>Đóng ca</button>
            )}
          </div>
        </div>
      )}

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={ds}
            trong="Chưa có ca bán hàng nào"
            cot={[
              { ten: 'Ngày', render: r => r.ngay },
              { ten: 'Ca', render: r => CA[r.ca] || r.ca },
              { ten: 'Giờ mở–đóng', render: r => (
                <span className="small">{ngayGio(r.gio_mo)}{r.gio_dong ? ` → ${ngayGio(r.gio_dong)}` : ''}</span>
              ) },
              { ten: 'Đầu ca', lop: 'text-end', render: r => tien(r.tien_dau_ca) },
              { ten: 'Tiền mặt hệ thống', lop: 'text-end', render: r => tien(r.tien_mat_he_thong) },
              { ten: 'Tiền mặt thực tế', lop: 'text-end', render: r => tien(r.tien_mat_thuc_te) },
              { ten: 'Chênh lệch', lop: 'text-end', render: r => (
                <span className={r.trang_thai !== 'dang_mo' && Number(r.chenh_lech) !== 0 ? 'text-danger fw-semibold' : ''}>
                  {tien(r.chenh_lech)}
                </span>
              ) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai === 'dang_mo' ? 'cho_duyet' : r.trang_thai === 'da_dong' ? 'hoan_thanh' : 'da_xac_nhan'} /> },
              { ten: '', lop: 'text-end', render: r => duocSua && r.trang_thai === 'da_dong' && (
                <button className="btn btn-sm btn-outline-secondary" onClick={() => xacNhanDoiSoat(r)}>Xác nhận đối soát</button>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moMo} tieuDe="Mở ca bán hàng"
        onDong={() => setMoMo(false)} onLuu={moCa} dangLuu={dangXuLy}
      >
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Ca</label>
            <select className="form-select" value={caChon} onChange={e => setCaChon(e.target.value)}>
              {Object.entries(CA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Tiền đầu ca (₫)</label>
            <input type="number" min="0" className="form-control" value={tienDauCa}
              onChange={e => setTienDauCa(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Modal
        mo={moDong} tieuDe="Đóng ca — đối soát tiền mặt"
        onDong={() => setMoDong(false)} onLuu={dongCa} dangLuu={dangXuLy} nhanLuu="Đóng ca"
      >
        <div className="row g-3">
          <div className="col-12 text-secondary small">
            Tiền mặt hệ thống sẽ tự tính từ tổng hóa đơn tiền mặt trong ca (đã cộng dồn từ lúc mở ca).
          </div>
          <div className="col-12">
            <label className="form-label">Tiền mặt thực tế đếm được (₫)</label>
            <input type="number" min="0" className="form-control" value={tienThucTe}
              onChange={e => setTienThucTe(e.target.value)} />
            <div className="form-text">Bao gồm cả tiền đầu ca — đếm toàn bộ tiền mặt trong két.</div>
          </div>
        </div>
      </Modal>
    </Trang>
  )
}
