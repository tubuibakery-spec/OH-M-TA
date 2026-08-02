import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, so, ngayGio } from '../lib/dinhDang'

export default function SanXuat() {
  const { chiNhanhId, coQuyen } = useApp()
  const [phieu, setPhieu] = useState([])
  const [congThucs, setCongThucs] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [moTao, setMoTao] = useState(false)
  const [dangXuLy, setDangXuLy] = useState(false)
  const [congThucId, setCongThucId] = useState('')
  const [soMe, setSoMe] = useState('1')

  const [xem, setXem] = useState(null)
  const [ct, setCt] = useState([])
  const [soLuongThucTe, setSoLuongThucTe] = useState('')

  const napDs = useCallback(async () => {
    if (!chiNhanhId) { setDangTai(false); return }
    setDangTai(true); setLoi(null)
    try {
      const [p, c] = await Promise.all([
        supabase.from('phieu_san_xuat')
          .select('id, so_phieu, ngay_san_xuat, so_me, so_luong_thuc_te, tong_chi_phi_thuc_te, trang_thai, cong_thuc_san_xuat(ten_cong_thuc, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt)))')
          .eq('chi_nhanh_id', chiNhanhId)
          .order('ngay_san_xuat', { ascending: false }).limit(100),
        supabase.from('cong_thuc_san_xuat')
          .select('id, ten_cong_thuc, so_luong_dau_ra, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))')
          .eq('dang_ap_dung', true).order('ten_cong_thuc')
      ])
      if (p.error) throw p.error
      if (c.error) throw c.error
      setPhieu(p.data || []); setCongThucs(c.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [chiNhanhId])

  useEffect(() => { napDs() }, [napDs])

  async function taoPhieu() {
    if (!congThucId) { setLoi('Chưa chọn công thức.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('phieu_san_xuat').insert({
        chi_nhanh_id: chiNhanhId,
        cong_thuc_id: congThucId,
        so_me: Number(soMe || 1)
      })
      if (error) throw error
      setMoTao(false); setCongThucId(''); setSoMe('1')
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const moXem = useCallback(async (p) => {
    setXem(p); setCt([]); setSoLuongThucTe(p.so_luong_thuc_te ?? '')
    const { data, error } = await supabase
      .from('chi_tiet_san_xuat_dau_vao')
      .select('id, so_luong_dinh_muc, so_luong_thuc_te, vat_tu(ten_vat_tu, don_vi_tinh(ma_dvt))')
      .eq('phieu_san_xuat_id', p.id)
    if (error) setLoi(error.message)
    setCt(data || [])
  }, [])

  function suaThucTeDauVao(id, gt) {
    setCt(c => c.map(r => r.id === id ? { ...r, so_luong_thuc_te: gt } : r))
  }

  async function luuDinhMuc() {
    setDangXuLy(true); setLoi(null)
    try {
      for (const r of ct) {
        const { error } = await supabase
          .from('chi_tiet_san_xuat_dau_vao')
          .update({ so_luong_thuc_te: Number(r.so_luong_thuc_te) })
          .eq('id', r.id)
        if (error) throw error
      }
      await moXem(xem)
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function hoanThanh() {
    if (!confirm(`Hoàn thành phiếu ${xem.so_phieu}? Nguyên liệu sẽ bị trừ (FEFO) và tạo lô thành phẩm mới.`)) return
    setDangXuLy(true); setLoi(null)
    try {
      const patch = { trang_thai: 'hoan_thanh' }
      if (soLuongThucTe !== '') patch.so_luong_thuc_te = Number(soLuongThucTe)
      const { error } = await supabase.from('phieu_san_xuat').update(patch).eq('id', xem.id)
      if (error) throw error
      setXem(null)
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const duocTao = coQuyen('san_xuat', 'tao')
  const duocSua = coQuyen('san_xuat', 'sua')
  const dangSanXuat = xem?.trang_thai === 'dang_san_xuat'

  return (
    <Trang
      tieuDe="Sản xuất"
      mota="Tạo phiếu là tự nạp định mức nguyên liệu theo công thức × số mẻ"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Tạo lệnh sản xuất</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={phieu}
            trong="Chưa có lệnh sản xuất nào"
            cot={[
              { ten: 'Số phiếu', render: r => (
                <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>
                  {r.so_phieu}
                </button>
              ) },
              { ten: 'Ngày', render: r => ngayGio(r.ngay_san_xuat) },
              { ten: 'Công thức', render: r => (
                <>
                  {r.cong_thuc_san_xuat?.ten_cong_thuc}
                  <div className="small text-secondary">→ {r.cong_thuc_san_xuat?.vat_tu?.ten_vat_tu}</div>
                </>
              ) },
              { ten: 'Số mẻ', lop: 'text-end', render: r => so(r.so_me) },
              { ten: 'Sản lượng', lop: 'text-end', render: r => so(r.so_luong_thuc_te) },
              { ten: 'Chi phí', lop: 'text-end', render: r => tien(r.tong_chi_phi_thuc_te) },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai} /> }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moTao} tieuDe="Tạo lệnh sản xuất"
        onDong={() => setMoTao(false)} onLuu={taoPhieu} dangLuu={dangXuLy}
      >
        <div className="mb-3">
          <label className="form-label">Công thức</label>
          <select className="form-select" value={congThucId} onChange={e => setCongThucId(e.target.value)}>
            <option value="">— Chọn công thức —</option>
            {congThucs.map(c => (
              <option key={c.id} value={c.id}>
                {c.ten_cong_thuc} → {c.vat_tu?.ten_vat_tu} ({so(c.so_luong_dau_ra)} {c.vat_tu?.don_vi_tinh?.ma_dvt}/mẻ)
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <label className="form-label">Số mẻ</label>
          <input type="number" step="0.001" min="0.001" className="form-control"
            value={soMe} onChange={e => setSoMe(e.target.value)} />
        </div>
      </Modal>

      <Modal
        mo={!!xem} rong
        tieuDe={`Lệnh sản xuất ${xem?.so_phieu || ''}`}
        onDong={() => setXem(null)}
        onLuu={dangSanXuat ? luuDinhMuc : null}
        nhanLuu="Lưu định mức thực tế"
        dangLuu={dangXuLy}
      >
        {dangSanXuat && (
          <div className="alert alert-info small">
            Sửa <strong>số lượng thực tế</strong> nếu tiêu hao khác định mức, rồi bấm "Lưu định mức thực tế"
            trước khi bấm Hoàn thành.
          </div>
        )}
        <table className="table table-sm align-middle">
          <thead className="table-light">
            <tr>
              <th>Nguyên liệu</th>
              <th className="text-end">Định mức</th>
              <th className="text-end" style={{ width: 130 }}>Thực tế</th>
            </tr>
          </thead>
          <tbody>
            {ct.length === 0 && (
              <tr><td colSpan={3} className="text-center text-secondary py-4">Không có dòng nào</td></tr>
            )}
            {ct.map(r => (
              <tr key={r.id}>
                <td>{r.vat_tu?.ten_vat_tu} <span className="text-secondary small">({r.vat_tu?.don_vi_tinh?.ma_dvt})</span></td>
                <td className="text-end">{so(r.so_luong_dinh_muc)}</td>
                <td>
                  {dangSanXuat ? (
                    <input type="number" step="0.001" min="0" className="form-control form-control-sm text-end"
                      value={r.so_luong_thuc_te ?? ''}
                      onChange={e => suaThucTeDauVao(r.id, e.target.value)} />
                  ) : (
                    <div className="text-end">{so(r.so_luong_thuc_te)}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {dangSanXuat && (
          <div className="row g-3 align-items-end border-top pt-3">
            <div className="col-md-6">
              <label className="form-label">Sản lượng đầu ra thực tế</label>
              <input type="number" step="0.001" min="0" className="form-control"
                value={soLuongThucTe} onChange={e => setSoLuongThucTe(e.target.value)}
                placeholder="Để trống = lấy theo công thức × số mẻ" />
            </div>
            <div className="col-md-6">
              {duocSua && (
                <button className="btn btn-success w-100" onClick={hoanThanh} disabled={dangXuLy}>
                  Hoàn thành sản xuất
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Trang>
  )
}
