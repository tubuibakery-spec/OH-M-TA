import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, TrangThai, Modal } from '../components/Chung'
import { tien, ngay } from '../lib/dinhDang'

const LOAI_TAI_SAN = {
  may_moc_bep: 'Máy móc bếp', tu_lanh: 'Tủ lạnh', xe_van_chuyen: 'Xe vận chuyển',
  thiet_bi_van_phong: 'Thiết bị văn phòng', khac: 'Khác'
}
const PHAN_LOAI_KE_TOAN = { tscd: 'TSCĐ', ccdc: 'CCDC', khong_von_hoa: 'Không vốn hóa' }

const MOI = {
  ma_tai_san: '', ten_tai_san: '', loai_tai_san: 'khac', phan_loai_ke_toan: 'khong_von_hoa',
  chi_nhanh_id: '', nguyen_gia: '', ngay_dua_vao_su_dung: '', so_thang_khau_hao: ''
}

function thangHomNay() {
  return new Date().toISOString().slice(0, 7)
}

export default function TaiSanCoDinh() {
  const { chiNhanhs, coQuyenMoiNoi, coQuyen } = useApp()
  const [taiSans, setTaiSans] = useState([])
  const [daPhanBoMap, setDaPhanBoMap] = useState({})
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [moTao, setMoTao] = useState(false)
  const [form, setForm] = useState({ ...MOI })
  const [dangXuLy, setDangXuLy] = useState(false)

  const [kyChon, setKyChon] = useState(thangHomNay())
  const [dangChayPhanBo, setDangChayPhanBo] = useState(false)

  const [xemLichSu, setXemLichSu] = useState(null)
  const [lichSu, setLichSu] = useState([])

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [ts, kh] = await Promise.all([
        supabase.from('tai_san')
          .select('id, ma_tai_san, ten_tai_san, loai_tai_san, phan_loai_ke_toan, nguyen_gia, ngay_dua_vao_su_dung, so_thang_khau_hao, trang_thai, chi_nhanh(ten_chi_nhanh)')
          .order('ma_tai_san'),
        supabase.from('khau_hao_thang').select('tai_san_id, so_tien')
      ])
      if (ts.error) throw ts.error
      if (kh.error) throw kh.error
      const map = {}
      for (const r of (kh.data || [])) map[r.tai_san_id] = (map[r.tai_san_id] || 0) + Number(r.so_tien)
      setTaiSans(ts.data || []); setDaPhanBoMap(map)
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { nap() }, [nap])

  async function taoTaiSan() {
    if (!form.ma_tai_san.trim() || !form.ten_tai_san.trim()) { setLoi('Cần điền mã và tên tài sản.'); return }
    const canKeToan = form.phan_loai_ke_toan !== 'khong_von_hoa'
    if (canKeToan && (!(Number(form.nguyen_gia) > 0) || !form.ngay_dua_vao_su_dung || !(Number(form.so_thang_khau_hao) > 0))) {
      setLoi('TSCĐ/CCDC cần đủ Nguyên giá, Ngày đưa vào sử dụng và Số tháng khấu hao.'); return
    }
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('tai_san').insert({
        ma_tai_san: form.ma_tai_san.trim(),
        ten_tai_san: form.ten_tai_san.trim(),
        loai_tai_san: form.loai_tai_san || null,
        phan_loai_ke_toan: form.phan_loai_ke_toan,
        chi_nhanh_id: form.chi_nhanh_id || null,
        nguyen_gia: canKeToan ? Number(form.nguyen_gia) : null,
        ngay_dua_vao_su_dung: canKeToan ? form.ngay_dua_vao_su_dung : null,
        so_thang_khau_hao: canKeToan ? Number(form.so_thang_khau_hao) : null
      })
      if (error) throw error
      setMoTao(false); setForm({ ...MOI })
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function chayPhanBo() {
    if (!confirm(`Chạy phân bổ khấu hao/CCDC cho kỳ ${kyChon}? Có thể chạy lại an toàn (không nhân đôi).`)) return
    setDangChayPhanBo(true); setLoi(null)
    try {
      const { data, error } = await supabase.rpc('rpc_tinh_phan_bo_thang', { p_ky: `${kyChon}-01` })
      if (error) throw error
      alert(`Đã phân bổ cho ${data} tài sản trong kỳ ${kyChon}.`)
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangChayPhanBo(false) }
  }

  async function moXemLichSu(ts) {
    setXemLichSu(ts); setLichSu([])
    const { data, error } = await supabase
      .from('khau_hao_thang').select('ky, so_tien, loai')
      .eq('tai_san_id', ts.id).order('ky')
    if (error) setLoi(error.message)
    setLichSu(data || [])
  }

  const duocTao = coQuyen('tai_san', 'tao')
  const duocChayPhanBo = coQuyen('tai_chinh', 'tao')
  const canKeToanForm = form.phan_loai_ke_toan !== 'khong_von_hoa'

  if (!coQuyenMoiNoi('tai_san', 'xem')) return null

  return (
    <Trang
      tieuDe="Tài sản cố định & Công cụ dụng cụ"
      mota="Phân bổ đường thẳng theo tháng — TSCĐ đối ứng 214, CCDC đối ứng 242"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Đăng ký tài sản</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      {duocChayPhanBo && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body d-flex flex-wrap align-items-center gap-3">
            <label className="form-label mb-0 small">Kỳ phân bổ</label>
            <input type="month" className="form-control form-control-sm w-auto" value={kyChon}
              onChange={e => setKyChon(e.target.value)} />
            <button className="btn btn-sm btn-warning" onClick={chayPhanBo} disabled={dangChayPhanBo}>
              {dangChayPhanBo ? 'Đang chạy…' : 'Chạy phân bổ tháng này'}
            </button>
          </div>
        </div>
      )}

      {dangTai ? <DangTai /> : (
        <div className="card border-0 shadow-sm">
          <Bang
            dong={taiSans}
            trong="Chưa có tài sản nào"
            cot={[
              { ten: 'Mã', render: r => <code className="small">{r.ma_tai_san}</code> },
              { ten: 'Tên tài sản', render: r => (
                <button className="btn btn-link p-0 text-decoration-none text-start" onClick={() => moXemLichSu(r)}>
                  {r.ten_tai_san}
                </button>
              ) },
              { ten: 'Loại', render: r => LOAI_TAI_SAN[r.loai_tai_san] || r.loai_tai_san },
              { ten: 'Phân loại KT', render: r => (
                <span className={`badge text-bg-${r.phan_loai_ke_toan === 'khong_von_hoa' ? 'secondary' : 'info'}`}>
                  {PHAN_LOAI_KE_TOAN[r.phan_loai_ke_toan]}
                </span>
              ) },
              { ten: 'Chi nhánh', render: r => r.chi_nhanh?.ten_chi_nhanh || 'Toàn công ty' },
              { ten: 'Nguyên giá', lop: 'text-end', render: r => r.nguyen_gia ? tien(r.nguyen_gia) : '—' },
              { ten: 'Đã phân bổ', lop: 'text-end', render: r => daPhanBoMap[r.id] ? tien(daPhanBoMap[r.id]) : '—' },
              { ten: 'Còn lại', lop: 'text-end', render: r => r.nguyen_gia
                  ? <span className="fw-semibold">{tien(Number(r.nguyen_gia) - (daPhanBoMap[r.id] || 0))}</span>
                  : '—' },
              { ten: 'Trạng thái', render: r => <TrangThai gt={r.trang_thai === 'dang_su_dung' ? 'hieu_luc' : 'da_huy'} /> }
            ]}
          />
        </div>
      )}

      <Modal
        mo={moTao} rong tieuDe="Đăng ký tài sản"
        onDong={() => setMoTao(false)} onLuu={taoTaiSan} dangLuu={dangXuLy}
      >
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Mã tài sản *</label>
            <input className="form-control" value={form.ma_tai_san}
              onChange={e => setForm({ ...form, ma_tai_san: e.target.value })} />
          </div>
          <div className="col-md-8">
            <label className="form-label">Tên tài sản *</label>
            <input className="form-control" value={form.ten_tai_san}
              onChange={e => setForm({ ...form, ten_tai_san: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Loại tài sản</label>
            <select className="form-select" value={form.loai_tai_san}
              onChange={e => setForm({ ...form, loai_tai_san: e.target.value })}>
              {Object.entries(LOAI_TAI_SAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Phân loại kế toán</label>
            <select className="form-select" value={form.phan_loai_ke_toan}
              onChange={e => setForm({ ...form, phan_loai_ke_toan: e.target.value })}>
              {Object.entries(PHAN_LOAI_KE_TOAN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Chi nhánh</label>
            <select className="form-select" value={form.chi_nhanh_id}
              onChange={e => setForm({ ...form, chi_nhanh_id: e.target.value })}>
              <option value="">— Toàn công ty —</option>
              {chiNhanhs.map(c => <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>)}
            </select>
          </div>

          {canKeToanForm && (
            <>
              <div className="col-12"><hr className="my-1" /></div>
              <div className="col-md-4">
                <label className="form-label">Nguyên giá (₫) *</label>
                <input type="number" min="0" className="form-control" value={form.nguyen_gia}
                  onChange={e => setForm({ ...form, nguyen_gia: e.target.value })} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Ngày đưa vào sử dụng *</label>
                <input type="date" className="form-control" value={form.ngay_dua_vao_su_dung}
                  onChange={e => setForm({ ...form, ngay_dua_vao_su_dung: e.target.value })} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Số tháng khấu hao *</label>
                <input type="number" min="1" className="form-control" value={form.so_thang_khau_hao}
                  onChange={e => setForm({ ...form, so_thang_khau_hao: e.target.value })} />
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal mo={!!xemLichSu} tieuDe={`Lịch sử phân bổ — ${xemLichSu?.ten_tai_san || ''}`} onDong={() => setXemLichSu(null)}>
        <Bang
          khoa="ky"
          trong="Chưa có kỳ nào được phân bổ"
          dong={lichSu}
          cot={[
            { ten: 'Kỳ', render: r => ngay(r.ky) },
            { ten: 'Loại', render: r => r.loai === 'khau_hao_tscd' ? 'Khấu hao TSCĐ' : 'Phân bổ CCDC' },
            { ten: 'Số tiền', lop: 'text-end', render: r => tien(r.so_tien) }
          ]}
        />
      </Modal>
    </Trang>
  )
}
