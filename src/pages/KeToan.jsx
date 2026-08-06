import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, The, Modal } from '../components/Chung'
import { tien, ngay, homNay } from '../lib/dinhDang'

const LOAI_TK = {
  tai_san: 'Tài sản', no_phai_tra: 'Nợ phải trả', von_chu_so_huu: 'Vốn chủ sở hữu',
  doanh_thu: 'Doanh thu', chi_phi: 'Chi phí'
}

const DONG_TRONG = { so_hieu: '', no: '', co: '' }

export default function KeToan() {
  const { chiNhanhs, coQuyen } = useApp()
  const [canDoiThu, setCanDoiThu] = useState([])
  const [laiLo, setLaiLo] = useState([])
  const [canDoiKeToan, setCanDoiKeToan] = useState([])
  const [taiKhoans, setTaiKhoans] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [xemSoCai, setXemSoCai] = useState(null)
  const [soCai, setSoCai] = useState([])

  const [moNhap, setMoNhap] = useState(false)
  const [dangLuu, setDangLuu] = useState(false)
  const [ngayHachToan, setNgayHachToan] = useState(homNay())
  const [dienGiai, setDienGiai] = useState('')
  const [chiNhanhChon, setChiNhanhChon] = useState('')
  const [dong, setDong] = useState([{ ...DONG_TRONG }, { ...DONG_TRONG }])

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [cdt, ll, cdkt, tk] = await Promise.all([
        supabase.from('bang_can_doi_thu_nghiem').select('*').order('so_hieu'),
        supabase.from('bao_cao_lai_lo').select('*').order('thang', { ascending: false }),
        supabase.from('bang_can_doi_ke_toan').select('*'),
        supabase.from('he_thong_tai_khoan').select('so_hieu, ten_tai_khoan, loai').eq('dang_su_dung', true).order('so_hieu')
      ])
      if (cdt.error) throw cdt.error
      if (ll.error) throw ll.error
      if (cdkt.error) throw cdkt.error
      if (tk.error) throw tk.error
      setCanDoiThu(cdt.data || []); setLaiLo(ll.data || []); setCanDoiKeToan(cdkt.data || [])
      setTaiKhoans(tk.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { nap() }, [nap])

  function moModalNhap() {
    setNgayHachToan(homNay()); setDienGiai(''); setChiNhanhChon('')
    setDong([{ ...DONG_TRONG }, { ...DONG_TRONG }])
    setMoNhap(true)
  }

  function suaDong(i, truong, gt) {
    setDong(d => d.map((r, j) => j === i ? { ...r, [truong]: gt } : r))
  }

  const tongNo = dong.reduce((s, r) => s + (Number(r.no) || 0), 0)
  const tongCo = dong.reduce((s, r) => s + (Number(r.co) || 0), 0)
  const canDoi = Math.abs(tongNo - tongCo) < 1 && tongNo > 0
  const dongHopLe = dong.length >= 2 && dong.every(r =>
    r.so_hieu && !(Number(r.no) > 0 && Number(r.co) > 0) && (Number(r.no) > 0 || Number(r.co) > 0)
  )

  async function luuButToan() {
    setDangLuu(true); setLoi(null)
    try {
      const p_dong = dong.map(r => ({ so_hieu: r.so_hieu, no: Number(r.no || 0), co: Number(r.co || 0) }))
      const { error } = await supabase.rpc('rpc_tao_but_toan_thu_cong', {
        p_ngay: ngayHachToan,
        p_dien_giai: dienGiai || null,
        p_chi_nhanh_id: chiNhanhChon || null,
        p_dong
      })
      if (error) throw error
      setMoNhap(false)
      await nap()
    } catch (e) { setLoi(e.message) } finally { setDangLuu(false) }
  }

  async function moSoCai(tk) {
    setXemSoCai(tk); setSoCai([])
    const { data, error } = await supabase
      .from('so_cai')
      .select('*')
      .eq('tai_khoan_id', tk.tai_khoan_id)
      .order('ngay_hach_toan', { ascending: false })
      .limit(200)
    if (error) setLoi(error.message)
    setSoCai(data || [])
  }

  if (dangTai) return <DangTai />
  if (loi) return <Loi loi={loi} />

  const tongTaiSan = canDoiKeToan.find(r => r.loai === 'tai_san')?.tong_so_du || 0
  const tongNoPhaiTra = canDoiKeToan.find(r => r.loai === 'no_phai_tra')?.tong_so_du || 0
  const tongVon = canDoiKeToan.find(r => r.loai === 'von_chu_so_huu')?.tong_so_du || 0
  const lechCanDoi = Number(tongTaiSan) - Number(tongNoPhaiTra) - Number(tongVon)

  // Gom lãi lỗ theo tháng
  const cacThang = [...new Set(laiLo.map(r => r.thang))]
  const laiLoTheoThang = cacThang.map(t => {
    const dong = laiLo.filter(r => r.thang === t)
    const doanhThu = dong.filter(r => r.loai === 'doanh_thu').reduce((s, r) => s + Number(r.so_tien), 0)
    const chiPhi = dong.filter(r => r.loai === 'chi_phi').reduce((s, r) => s + Number(r.so_tien), 0)
    return { thang: t, doanhThu, chiPhi, laiLo: doanhThu - chiPhi }
  })

  const duocNhap = coQuyen('tai_chinh', 'tao')

  return (
    <Trang tieuDe="Kế toán" mota="Sổ cái kép — bút toán tự động từ nhập hàng, bán hàng, thu/chi công nợ và chi phí"
      hanhDong={duocNhap && (
        <button className="btn btn-primary" onClick={moModalNhap}>+ Nhập bút toán</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="row g-3 mb-4">
        <The nhan="Tổng tài sản" gt={tien(tongTaiSan)} mau="dark" />
        <The nhan="Nợ phải trả" gt={tien(tongNoPhaiTra)} mau="danger" />
        <The nhan="Vốn chủ sở hữu" gt={tien(tongVon)} mau="primary" />
        <The nhan="Chênh lệch cân đối" gt={tien(lechCanDoi)}
          mau={Math.abs(lechCanDoi) < 1 ? 'success' : 'danger'}
          phu={Math.abs(lechCanDoi) < 1 ? 'Cân đối đúng' : 'CẢNH BÁO: mất cân đối'} />
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">Bảng cân đối thử</div>
            <div className="card-body p-0">
              <Bang
                khoa="tai_khoan_id"
                trong="Chưa có bút toán nào"
                dong={canDoiThu}
                cot={[
                  { ten: 'Số hiệu', render: r => <code>{r.so_hieu}</code> },
                  { ten: 'Tài khoản', render: r => (
                    <button className="btn btn-link p-0 text-decoration-none text-start"
                      onClick={() => moSoCai(r)}>
                      {r.ten_tai_khoan}
                    </button>
                  ) },
                  { ten: 'Loại', render: r => <span className="small text-secondary">{LOAI_TK[r.loai]}</span> },
                  { ten: 'Tổng Nợ', lop: 'text-end', render: r => tien(r.tong_no) },
                  { ten: 'Tổng Có', lop: 'text-end', render: r => tien(r.tong_co) },
                  { ten: 'Số dư', lop: 'text-end', render: r => (
                    <span className={Number(r.so_du) < 0 ? 'text-danger fw-semibold' : 'fw-semibold'}>
                      {tien(r.so_du)}
                    </span>
                  ) }
                ]}
              />
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">Lãi lỗ theo tháng</div>
            <div className="card-body p-0">
              <Bang
                khoa="thang"
                trong="Chưa có số liệu"
                dong={laiLoTheoThang}
                cot={[
                  { ten: 'Tháng', render: r => new Date(r.thang).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' }) },
                  { ten: 'Doanh thu', lop: 'text-end', render: r => tien(r.doanhThu) },
                  { ten: 'Chi phí', lop: 'text-end', render: r => tien(r.chiPhi) },
                  { ten: 'Lãi/Lỗ', lop: 'text-end', render: r => (
                    <span className={r.laiLo < 0 ? 'text-danger fw-semibold' : 'text-success fw-semibold'}>
                      {tien(r.laiLo)}
                    </span>
                  ) }
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <Modal mo={!!xemSoCai} rong tieuDe={`Sổ cái — ${xemSoCai?.ten_tai_khoan || ''}`} onDong={() => setXemSoCai(null)}>
        <Bang
          khoa="but_toan_id"
          trong="Tài khoản chưa có bút toán nào"
          dong={soCai}
          cot={[
            { ten: 'Số BT', render: r => r.so_but_toan },
            { ten: 'Ngày', render: r => ngay(r.ngay_hach_toan) },
            { ten: 'Diễn giải', render: r => r.dien_giai },
            { ten: 'Chi nhánh', render: r => r.ten_chi_nhanh || '—' },
            { ten: 'Nợ', lop: 'text-end', render: r => r.no > 0 ? tien(r.no) : '—' },
            { ten: 'Có', lop: 'text-end', render: r => r.co > 0 ? tien(r.co) : '—' }
          ]}
        />
      </Modal>

      <Modal
        mo={moNhap} rong tieuDe="Nhập bút toán thủ công"
        onDong={() => setMoNhap(false)}
        onLuu={dongHopLe && canDoi ? luuButToan : null}
        nhanLuu="Lưu bút toán" dangLuu={dangLuu}
      >
        <div className="row g-3 mb-3">
          <div className="col-md-3">
            <label className="form-label">Ngày hạch toán</label>
            <input type="date" className="form-control" value={ngayHachToan}
              onChange={e => setNgayHachToan(e.target.value)} />
          </div>
          <div className="col-md-5">
            <label className="form-label">Diễn giải</label>
            <input className="form-control" value={dienGiai}
              onChange={e => setDienGiai(e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Chi nhánh</label>
            <select className="form-select" value={chiNhanhChon} onChange={e => setChiNhanhChon(e.target.value)}>
              <option value="">— Toàn công ty (không gắn chi nhánh) —</option>
              {chiNhanhs.map(c => <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>)}
            </select>
          </div>
        </div>

        <table className="table table-sm align-middle">
          <thead className="table-light">
            <tr>
              <th style={{ minWidth: 220 }}>Tài khoản</th>
              <th style={{ width: 140 }} className="text-end">Nợ</th>
              <th style={{ width: 140 }} className="text-end">Có</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {dong.map((r, i) => (
              <tr key={i}>
                <td>
                  <select className="form-select form-select-sm" value={r.so_hieu}
                    onChange={e => suaDong(i, 'so_hieu', e.target.value)}>
                    <option value="">— Chọn tài khoản —</option>
                    {taiKhoans.map(tk => (
                      <option key={tk.so_hieu} value={tk.so_hieu}>{tk.so_hieu} — {tk.ten_tai_khoan}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="number" min="0" className="form-control form-control-sm text-end"
                    value={r.no} onChange={e => suaDong(i, 'no', e.target.value)} />
                </td>
                <td>
                  <input type="number" min="0" className="form-control form-control-sm text-end"
                    value={r.co} onChange={e => suaDong(i, 'co', e.target.value)} />
                </td>
                <td>
                  <button className="btn btn-sm btn-outline-danger"
                    onClick={() => setDong(dong.filter((_, j) => j !== i))}
                    disabled={dong.length <= 2}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={canDoi ? '' : 'table-danger'}>
              <td className="fw-semibold text-end">Tổng cộng</td>
              <td className="text-end fw-semibold">{tien(tongNo)}</td>
              <td className="text-end fw-semibold">{tien(tongCo)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <button className="btn btn-sm btn-outline-secondary mb-2"
          onClick={() => setDong([...dong, { ...DONG_TRONG }])}>+ Thêm dòng</button>

        {!canDoi && (
          <div className="alert alert-warning small mb-0">
            Tổng Nợ và Tổng Có phải bằng nhau (và lớn hơn 0) mới lưu được.
          </div>
        )}
      </Modal>
    </Trang>
  )
}
