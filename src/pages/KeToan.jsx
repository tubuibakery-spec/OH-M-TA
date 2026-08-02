import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Trang, Bang, DangTai, Loi, The, Modal } from '../components/Chung'
import { tien, ngay } from '../lib/dinhDang'

const LOAI_TK = {
  tai_san: 'Tài sản', no_phai_tra: 'Nợ phải trả', von_chu_so_huu: 'Vốn chủ sở hữu',
  doanh_thu: 'Doanh thu', chi_phi: 'Chi phí'
}

export default function KeToan() {
  const [canDoiThu, setCanDoiThu] = useState([])
  const [laiLo, setLaiLo] = useState([])
  const [canDoiKeToan, setCanDoiKeToan] = useState([])
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)

  const [xemSoCai, setXemSoCai] = useState(null)
  const [soCai, setSoCai] = useState([])

  const nap = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      const [cdt, ll, cdkt] = await Promise.all([
        supabase.from('bang_can_doi_thu_nghiem').select('*').order('so_hieu'),
        supabase.from('bao_cao_lai_lo').select('*').order('thang', { ascending: false }),
        supabase.from('bang_can_doi_ke_toan').select('*')
      ])
      if (cdt.error) throw cdt.error
      if (ll.error) throw ll.error
      if (cdkt.error) throw cdkt.error
      setCanDoiThu(cdt.data || []); setLaiLo(ll.data || []); setCanDoiKeToan(cdkt.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [])

  useEffect(() => { nap() }, [nap])

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

  return (
    <Trang tieuDe="Kế toán" mota="Sổ cái kép — bút toán tự động từ nhập hàng, bán hàng, thu/chi công nợ và chi phí">
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
    </Trang>
  )
}
