import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'

const NGUOI_DUNG_MOI = { email: '', nhan_vien_id: '' }

export default function QuanTriNguoiDung() {
  const { coQuyen } = useApp()
  const [nguoiDungs, setNguoiDungs] = useState([])
  const [vaiTroCuaAi, setVaiTroCuaAi] = useState([])   // toàn bộ nguoi_dung_vai_tro
  const [vaiTros, setVaiTros] = useState([])
  const [chiNhanhs, setChiNhanhs] = useState([])
  const [nhanViens, setNhanViens] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [form, setForm] = useState(null)          // thêm/sửa nguoi_dung_he_thong
  const [dangLuu, setDangLuu] = useState(false)

  const [ganVaiTroCho, setGanVaiTroCho] = useState(null)  // nguoi_dung đang mở modal gán vai trò
  const [vaiTroChon, setVaiTroChon] = useState('')
  const [chiNhanhChon, setChiNhanhChon] = useState('')
  const [dangGan, setDangGan] = useState(false)

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [nd, ndvt, vt, cn, nv] = await Promise.all([
        supabase.from('nguoi_dung_he_thong')
          .select('id, email, trang_thai, nhan_vien_id, nhan_vien(ho_ten, ma_nv)')
          .order('email'),
        supabase.from('nguoi_dung_vai_tro')
          .select('id, nguoi_dung_id, vai_tro_id, chi_nhanh_id, vai_tro_he_thong(ma_vai_tro, ten_vai_tro), chi_nhanh(ten_chi_nhanh)'),
        supabase.from('vai_tro_he_thong').select('id, ma_vai_tro, ten_vai_tro').order('ten_vai_tro'),
        supabase.from('chi_nhanh').select('id, ten_chi_nhanh').order('ten_chi_nhanh'),
        supabase.from('nhan_vien').select('id, ho_ten, ma_nv').eq('trang_thai', 'dang_lam_viec').order('ho_ten')
      ])
      if (nd.error) throw nd.error
      if (ndvt.error) throw ndvt.error
      if (vt.error) throw vt.error
      if (cn.error) throw cn.error
      if (nv.error) throw nv.error
      setNguoiDungs(nd.data || [])
      setVaiTroCuaAi(ndvt.data || [])
      setVaiTros(vt.data || [])
      setChiNhanhs(cn.data || [])
      setNhanViens(nv.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { nap() }, [nap])

  async function luuNguoiDung() {
    setDangLuu(true); setLoi(null)
    try {
      const ban = {
        email: form.email.trim(),
        nhan_vien_id: form.nhan_vien_id || null
      }
      if (!ban.email) throw new Error('Cần điền email.')
      const { error } = form.id
        ? await supabase.from('nguoi_dung_he_thong').update(ban).eq('id', form.id)
        : await supabase.from('nguoi_dung_he_thong').insert(ban)
      if (error) throw error
      setForm(null); await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function doiTrangThai(nd) {
    const moi = nd.trang_thai === 'khoa' ? 'hoat_dong' : 'khoa'
    if (!confirm(`${moi === 'khoa' ? 'Khóa' : 'Mở khóa'} tài khoản ${nd.email}?`)) return
    setLoi(null)
    const { error } = await supabase.from('nguoi_dung_he_thong').update({ trang_thai: moi }).eq('id', nd.id)
    if (error) setLoi(error.message)
    await nap()
  }

  function moGanVaiTro(nd) {
    setGanVaiTroCho(nd); setVaiTroChon(''); setChiNhanhChon('')
  }

  async function ganVaiTro() {
    if (!vaiTroChon) { setLoi('Chưa chọn vai trò.'); return }
    setDangGan(true); setLoi(null)
    try {
      const { error } = await supabase.from('nguoi_dung_vai_tro').insert({
        nguoi_dung_id: ganVaiTroCho.id,
        vai_tro_id: vaiTroChon,
        chi_nhanh_id: chiNhanhChon || null
      })
      if (error) throw error
      setVaiTroChon(''); setChiNhanhChon('')
      await nap()
      setGanVaiTroCho(nguoiDungs.find(n => n.id === ganVaiTroCho.id) || ganVaiTroCho)
    } catch (e) { setLoi(e.message) } finally { setDangGan(false) }
  }

  async function thuHoiVaiTro(v) {
    const laToanQuyen = v.chi_nhanh_id === null && ['admin', 'giam_doc'].includes(v.vai_tro_he_thong?.ma_vai_tro)
    const canhBao = laToanQuyen
      ? `⚠️ Đây là vai trò TOÀN QUYỀN (${v.vai_tro_he_thong?.ma_vai_tro}) — thu hồi có thể khiến người dùng mất quyền quản trị. `
      : ''
    if (!confirm(`${canhBao}Thu hồi vai trò "${v.vai_tro_he_thong?.ten_vai_tro}"${v.chi_nhanh?.ten_chi_nhanh ? ' @ ' + v.chi_nhanh.ten_chi_nhanh : ' (toàn hệ thống)'}?`)) return
    setLoi(null)
    const { error } = await supabase.from('nguoi_dung_vai_tro').delete().eq('id', v.id)
    if (error) setLoi(error.message)
    await nap()
  }

  const vaiTroTheoNguoiDung = (ndId) => vaiTroCuaAi.filter(v => v.nguoi_dung_id === ndId)

  const duocTao = coQuyen('he_thong', 'tao', null)
  const duocSua = coQuyen('he_thong', 'sua', null)
  const duocXoa = coQuyen('he_thong', 'xoa', null)

  return (
    <Trang
      tieuDe="Quản trị người dùng & phân quyền"
      mota="Gán/thu hồi vai trò cho tài khoản đã có sẵn. Tài khoản đăng nhập (Supabase Auth) vẫn phải tạo trước trong Dashboard."
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setForm({ ...NGUOI_DUNG_MOI })}>+ Thêm người dùng</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={nguoiDungs}
            trong="Chưa có người dùng nào"
            cot={[
              { ten: 'Email', render: r => r.email },
              { ten: 'Nhân viên', render: r => r.nhan_vien ? `${r.nhan_vien.ho_ten} (${r.nhan_vien.ma_nv})` : '—' },
              { ten: 'Vai trò', render: r => {
                  const ds = vaiTroTheoNguoiDung(r.id)
                  if (!ds.length) return <span className="text-secondary small">Chưa gán</span>
                  return (
                    <div className="d-flex flex-wrap gap-1">
                      {ds.map(v => (
                        <span key={v.id} className="badge text-bg-secondary">
                          {v.vai_tro_he_thong?.ma_vai_tro}
                          {v.chi_nhanh?.ten_chi_nhanh ? ` @ ${v.chi_nhanh.ten_chi_nhanh}` : ' @ Toàn hệ thống'}
                        </span>
                      ))}
                    </div>
                  )
                } },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai === 'khoa' ? 'da_huy' : 'hoan_thanh'} /> },
              { ten: '', lop: 'text-end', render: r => (
                <div className="d-flex gap-1 justify-content-end">
                  {duocSua && <button className="btn btn-sm btn-outline-secondary" onClick={() => moGanVaiTro(r)}>Gán vai trò</button>}
                  {duocSua && (
                    <button className="btn btn-sm btn-outline-danger" onClick={() => doiTrangThai(r)}>
                      {r.trang_thai === 'khoa' ? 'Mở khóa' : 'Khóa'}
                    </button>
                  )}
                </div>
              ) }
            ]}
          />
        </div>
      )}

      <Modal
        mo={!!form}
        tieuDe={form?.id ? 'Sửa người dùng' : 'Thêm người dùng'}
        onDong={() => setForm(null)} onLuu={luuNguoiDung} dangLuu={dangLuu}
      >
        {form && (
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label">Email *</label>
              <input className="form-control" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} />
              <div className="form-text">
                Phải trùng với tài khoản đã tạo sẵn trong Supabase Auth Dashboard — trang này chỉ khai báo và gán vai trò, không tạo tài khoản đăng nhập mới.
              </div>
            </div>
            <div className="col-12">
              <label className="form-label">Nhân viên liên kết</label>
              <select className="form-select" value={form.nhan_vien_id || ''}
                onChange={e => setForm({ ...form, nhan_vien_id: e.target.value })}>
                <option value="">— Không liên kết —</option>
                {nhanViens.map(nv => (
                  <option key={nv.id} value={nv.id}>{nv.ho_ten} ({nv.ma_nv})</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        mo={!!ganVaiTroCho} rong
        tieuDe={`Vai trò của ${ganVaiTroCho?.email || ''}`}
        onDong={() => setGanVaiTroCho(null)}
        onLuu={duocSua ? ganVaiTro : null}
        nhanLuu="Gán vai trò"
        dangLuu={dangGan}
      >
        {ganVaiTroCho && (
          <>
            <table className="table table-sm align-middle mb-4">
              <thead className="table-light">
                <tr><th>Vai trò</th><th>Phạm vi</th><th /></tr>
              </thead>
              <tbody>
                {vaiTroTheoNguoiDung(ganVaiTroCho.id).length === 0 && (
                  <tr><td colSpan={3} className="text-center text-secondary py-3">Chưa gán vai trò nào</td></tr>
                )}
                {vaiTroTheoNguoiDung(ganVaiTroCho.id).map(v => (
                  <tr key={v.id}>
                    <td>{v.vai_tro_he_thong?.ten_vai_tro} <code className="small">{v.vai_tro_he_thong?.ma_vai_tro}</code></td>
                    <td>{v.chi_nhanh?.ten_chi_nhanh || 'Toàn hệ thống'}</td>
                    <td className="text-end">
                      {duocXoa && (
                        <button className="btn btn-sm btn-outline-danger" onClick={() => thuHoiVaiTro(v)}>Thu hồi</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {duocSua && (
              <div className="row g-3 align-items-end border-top pt-3">
                <div className="col-md-5">
                  <label className="form-label">Vai trò mới</label>
                  <select className="form-select" value={vaiTroChon} onChange={e => setVaiTroChon(e.target.value)}>
                    <option value="">— Chọn vai trò —</option>
                    {vaiTros.map(v => (
                      <option key={v.id} value={v.id}>{v.ten_vai_tro} ({v.ma_vai_tro})</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-5">
                  <label className="form-label">Phạm vi</label>
                  <select className="form-select" value={chiNhanhChon} onChange={e => setChiNhanhChon(e.target.value)}>
                    <option value="">Toàn hệ thống</option>
                    {chiNhanhs.map(c => (
                      <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </Trang>
  )
}
