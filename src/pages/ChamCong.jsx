import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi } from '../components/Chung'
import { homNay } from '../lib/dinhDang'

const TRANG_THAI = {
  di_lam: ['Đi làm', 'success'],
  nua_ngay: ['Nửa ngày', 'info'],
  nghi_phep: ['Nghỉ phép', 'primary'],
  nghi_le: ['Nghỉ lễ', 'secondary'],
  nghi_khong_phep: ['Nghỉ không phép', 'danger']
}

export default function ChamCong() {
  const { coQuyenMoiNoi, nguoiDung } = useApp()
  const [ngayChon, setNgayChon] = useState(homNay())
  const [nhanViens, setNhanViens] = useState([])
  const [chamCongs, setChamCongs] = useState({})   // nhan_vien_id -> row
  const [dangTai, setDangTai] = useState(true)
  const [dangLuu, setDangLuu] = useState(null)
  const [loi, setLoi] = useState(null)

  const napDs = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [nv, cc] = await Promise.all([
        supabase.from('nhan_vien').select('id, ma_nv, ho_ten, chi_nhanh(ten_chi_nhanh)')
          .eq('trang_thai', 'dang_lam_viec').order('ho_ten'),
        supabase.from('cham_cong').select('id, nhan_vien_id, trang_thai, ghi_chu').eq('ngay', ngayChon)
      ])
      if (nv.error) throw nv.error
      if (cc.error) throw cc.error
      setNhanViens(nv.data || [])
      setChamCongs(Object.fromEntries((cc.data || []).map(r => [r.nhan_vien_id, r])))
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [ngayChon])

  useEffect(() => { napDs() }, [napDs])

  async function ghiCong(nhanVienId, trangThai) {
    setDangLuu(nhanVienId); setLoi(null)
    try {
      const { error } = await supabase.from('cham_cong').upsert(
        {
          nhan_vien_id: nhanVienId,
          ngay: ngayChon,
          trang_thai: trangThai,
          nguoi_ghi_id: nguoiDung?.nhan_vien_id || null
        },
        { onConflict: 'nhan_vien_id,ngay' }
      )
      if (error) throw error
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(null) }
  }

  const duocSua = coQuyenMoiNoi('nhan_su', 'sua') || coQuyenMoiNoi('nhan_su', 'tao')
  const daChamHet = nhanViens.length > 0 && nhanViens.every(nv => chamCongs[nv.id])

  return (
    <Trang
      tieuDe="Chấm công"
      mota="Nghỉ phép đã duyệt tự động ghi vào đây — không cần chấm tay lại"
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body d-flex align-items-center gap-3">
          <label className="form-label mb-0 fw-semibold">Ngày</label>
          <input type="date" className="form-control w-auto" value={ngayChon}
            onChange={e => setNgayChon(e.target.value)} />
          {daChamHet && <span className="badge text-bg-success">Đã chấm đủ toàn bộ nhân viên</span>}
        </div>
      </div>

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={nhanViens}
            trong="Chưa có nhân viên đang làm việc nào"
            cot={[
              { ten: 'Mã NV', render: r => <code>{r.ma_nv}</code> },
              { ten: 'Họ tên', render: r => r.ho_ten },
              { ten: 'Chi nhánh', render: r => r.chi_nhanh?.ten_chi_nhanh || '—' },
              { ten: 'Trạng thái hôm nay', render: r => {
                  const cc = chamCongs[r.id]
                  if (!cc) return <span className="text-secondary small">Chưa chấm</span>
                  const [nhan, mau] = TRANG_THAI[cc.trang_thai] || [cc.trang_thai, 'secondary']
                  return <span className={`badge text-bg-${mau}`}>{nhan}</span>
              } },
              { ten: 'Ghi công', lop: 'text-end', render: r => duocSua && (
                <select className="form-select form-select-sm w-auto ms-auto" style={{ minWidth: 150 }}
                  value={chamCongs[r.id]?.trang_thai || ''}
                  disabled={dangLuu === r.id}
                  onChange={e => e.target.value && ghiCong(r.id, e.target.value)}>
                  <option value="" disabled>— Chọn —</option>
                  {Object.entries(TRANG_THAI).map(([k, [nhan]]) => (
                    <option key={k} value={k}>{nhan}</option>
                  ))}
                </select>
              ) }
            ]}
          />
        </div>
      )}
    </Trang>
  )
}
