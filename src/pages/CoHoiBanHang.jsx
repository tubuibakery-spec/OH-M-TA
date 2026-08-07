import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, Bang, DangTai, Loi, Modal, The } from '../components/Chung'
import { tien, so, ngay, ngayGio } from '../lib/dinhDang'

const GIAI_DOAN = {
  tiep_can: ['Tiếp cận', 'secondary'],
  danh_gia: ['Đánh giá', 'info'],
  bao_gia: ['Báo giá', 'primary'],
  dam_phan: ['Đàm phán', 'warning'],
  thanh_cong: ['Thành công', 'success'],
  that_bai: ['Thất bại', 'danger']
}
const THU_TU_GIAI_DOAN = ['tiep_can', 'danh_gia', 'bao_gia', 'dam_phan']

const LOAI_HD = { goi_dien: 'Gọi điện', gap_mat: 'Gặp mặt', email: 'Email', khac: 'Khác' }

const MOI = { khach_hang_b2b_id: '', ten_co_hoi: '', gia_tri_uoc_tinh: '', xac_suat_phan_tram: '20', ngay_du_kien_chot: '' }
const HD_TRONG = { loai_hoat_dong: 'goi_dien', noi_dung: '', ngay_hen_tiep_theo: '' }

export default function CoHoiBanHang() {
  const { coQuyenMoiNoi, chiNhanhs } = useApp()
  const [coHois, setCoHois] = useState([])
  const [pipeline, setPipeline] = useState([])
  const [lichHen, setLichHen] = useState([])
  const [khachHangs, setKhachHangs] = useState([])
  const [hienCaDaDong, setHienCaDaDong] = useState(false)
  const [dangTai, setDangTai] = useState(true)
  const [loi, setLoi] = useState(null)
  const [dangXuLy, setDangXuLy] = useState(false)

  const [moTao, setMoTao] = useState(false)
  const [form, setForm] = useState({ ...MOI })

  const [xem, setXem] = useState(null)
  const [hoatDongs, setHoatDongs] = useState([])
  const [hdMoi, setHdMoi] = useState({ ...HD_TRONG })

  const [moThanhCong, setMoThanhCong] = useState(false)
  const [chiNhanhChonTC, setChiNhanhChonTC] = useState('')

  const napDs = useCallback(async () => {
    setDangTai(true); setLoi(null)
    try {
      let q = supabase.from('co_hoi_ban_hang')
        .select('id, ma_co_hoi, ten_co_hoi, gia_tri_uoc_tinh, giai_doan, xac_suat_phan_tram, ngay_du_kien_chot, khach_hang_b2b_id, don_hang_id, khach_hang_b2b(ten_doanh_nghiep), nhan_vien(ho_ten), don_hang_b2b(so_don_hang, trang_thai)')
        .order('created_at', { ascending: false })
      if (!hienCaDaDong) q = q.not('giai_doan', 'in', '(thanh_cong,that_bai)')

      const [ch, pl, lh, kh] = await Promise.all([
        q,
        supabase.from('pipeline_ban_hang').select('*'),
        supabase.from('lich_hen_cham_soc_sap_toi').select('*').order('ngay_hen_tiep_theo').limit(20),
        supabase.from('khach_hang_b2b').select('id, ten_doanh_nghiep').eq('trang_thai', 'hoat_dong').order('ten_doanh_nghiep')
      ])
      if (ch.error) throw ch.error
      if (pl.error) throw pl.error
      if (lh.error) throw lh.error
      if (kh.error) throw kh.error
      setCoHois(ch.data || []); setPipeline(pl.data || []); setLichHen(lh.data || []); setKhachHangs(kh.data || [])
    } catch (e) { setLoi(e.message) } finally { setDangTai(false) }
  }, [hienCaDaDong])

  useEffect(() => { napDs() }, [napDs])

  async function taoCoHoi() {
    if (!form.khach_hang_b2b_id || !form.ten_co_hoi.trim()) {
      setLoi('Cần chọn khách hàng và điền tên cơ hội.'); return
    }
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('co_hoi_ban_hang').insert({
        khach_hang_b2b_id: form.khach_hang_b2b_id,
        ten_co_hoi: form.ten_co_hoi.trim(),
        gia_tri_uoc_tinh: Number(form.gia_tri_uoc_tinh || 0),
        xac_suat_phan_tram: Number(form.xac_suat_phan_tram || 20),
        ngay_du_kien_chot: form.ngay_du_kien_chot || null
      })
      if (error) throw error
      setMoTao(false); setForm({ ...MOI })
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const moXem = useCallback(async (ch) => {
    setXem(ch); setHoatDongs([]); setHdMoi({ ...HD_TRONG })
    const { data, error } = await supabase
      .from('hoat_dong_cham_soc')
      .select('id, loai_hoat_dong, noi_dung, ngay_thuc_hien, ket_qua, ngay_hen_tiep_theo, nhan_vien(ho_ten)')
      .eq('co_hoi_id', ch.id)
      .order('ngay_thuc_hien', { ascending: false })
    if (error) setLoi(error.message)
    setHoatDongs(data || [])
  }, [])

  async function doiGiaiDoan(gd) {
    if (gd === 'that_bai') {
      const lyDo = prompt('Lý do thất bại (không bắt buộc):') || null
      if (!confirm('Đánh dấu cơ hội này là THẤT BẠI? Không thể đổi giai đoạn sau khi lưu.')) return
      setDangXuLy(true); setLoi(null)
      const { error } = await supabase.from('co_hoi_ban_hang')
        .update({ giai_doan: 'that_bai', ly_do_that_bai: lyDo }).eq('id', xem.id)
      if (error) setLoi(error.message)
      setXem(null); await napDs(); setDangXuLy(false)
      return
    }
    if (gd === 'thanh_cong') {
      setChiNhanhChonTC(''); setMoThanhCong(true)
      return
    }
    setDangXuLy(true); setLoi(null)
    const { error } = await supabase.from('co_hoi_ban_hang').update({ giai_doan: gd }).eq('id', xem.id)
    if (error) setLoi(error.message)
    setXem(null); await napDs(); setDangXuLy(false)
  }

  async function xacNhanThanhCong() {
    if (!chiNhanhChonTC) { setLoi('Chọn chi nhánh giao hàng.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { data: don, error: e1 } = await supabase.from('don_hang_b2b').insert({
        khach_hang_b2b_id: xem.khach_hang_b2b_id,
        chi_nhanh_giao_id: chiNhanhChonTC
      }).select('id, so_don_hang').single()
      if (e1) throw e1

      const { error: e2 } = await supabase.from('co_hoi_ban_hang')
        .update({ giai_doan: 'thanh_cong', don_hang_id: don.id }).eq('id', xem.id)
      if (e2) throw e2

      setMoThanhCong(false); setXem(null)
      await napDs()
      alert(`Đã tạo đơn hàng ${don.so_don_hang} — vào Đơn hàng B2B để thêm sản phẩm.`)
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  async function themHoatDong() {
    if (!hdMoi.noi_dung.trim()) { setLoi('Chưa điền nội dung.'); return }
    setDangXuLy(true); setLoi(null)
    try {
      const { error } = await supabase.from('hoat_dong_cham_soc').insert({
        khach_hang_b2b_id: xem.khach_hang_b2b_id,
        co_hoi_id: xem.id,
        loai_hoat_dong: hdMoi.loai_hoat_dong,
        noi_dung: hdMoi.noi_dung.trim(),
        ngay_hen_tiep_theo: hdMoi.ngay_hen_tiep_theo || null
      })
      if (error) throw error
      setHdMoi({ ...HD_TRONG })
      await moXem(xem)
      await napDs()
    } catch (e) { setLoi(e.message) } finally { setDangXuLy(false) }
  }

  const duocTao = coQuyenMoiNoi('b2b', 'tao')
  const dangMo = xem && !['thanh_cong', 'that_bai'].includes(xem.giai_doan)

  return (
    <Trang
      tieuDe="Cơ hội bán hàng"
      mota="Pipeline B2B — theo dõi từ tiếp cận tới chốt đơn"
      hanhDong={duocTao && (
        <button className="btn btn-primary" onClick={() => setMoTao(true)}>+ Tạo cơ hội</button>
      )}
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />

      <div className="row g-3 mb-4">
        {THU_TU_GIAI_DOAN.map(gd => {
          const p = pipeline.find(x => x.giai_doan === gd)
          return (
            <The key={gd} nhan={GIAI_DOAN[gd][0]}
              gt={p ? tien(p.tong_gia_tri) : tien(0)}
              phu={p ? `${p.so_co_hoi} cơ hội · trọng số ${tien(p.gia_tri_co_trong_so)}` : '0 cơ hội'}
              mau={GIAI_DOAN[gd][1]} />
          )
        })}
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Danh sách cơ hội</span>
              <div className="form-check form-switch mb-0">
                <input className="form-check-input" type="checkbox" id="hienDaDong"
                  checked={hienCaDaDong} onChange={e => setHienCaDaDong(e.target.checked)} />
                <label className="form-check-label small" htmlFor="hienDaDong">Hiện cả đã đóng</label>
              </div>
            </div>
            <div className="card-body p-0">
              {dangTai ? <DangTai /> : (
                <Bang
                  dong={coHois}
                  trong="Chưa có cơ hội nào"
                  cot={[
                    { ten: 'Mã', render: r => (
                      <button className="btn btn-link p-0 text-decoration-none" onClick={() => moXem(r)}>
                        {r.ma_co_hoi}
                      </button>
                    ) },
                    { ten: 'Tên cơ hội', render: r => (
                      <>
                        {r.ten_co_hoi}
                        <div className="small text-secondary">{r.khach_hang_b2b?.ten_doanh_nghiep}</div>
                      </>
                    ) },
                    { ten: 'Giá trị', lop: 'text-end', render: r => tien(r.gia_tri_uoc_tinh) },
                    { ten: 'Xác suất', lop: 'text-end', render: r => `${r.xac_suat_phan_tram}%` },
                    { ten: 'Dự kiến chốt', render: r => ngay(r.ngay_du_kien_chot) },
                    { ten: 'Giai đoạn', render: r => {
                        const [nhan, mau] = GIAI_DOAN[r.giai_doan] || [r.giai_doan, 'secondary']
                        return <span className={`badge text-bg-${mau}`}>{nhan}</span>
                    } }
                  ]}
                />
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">Lịch hẹn sắp tới</div>
            <div className="card-body p-0">
              <Bang
                khoa="id"
                trong="Không có lịch hẹn nào sắp tới"
                dong={lichHen}
                cot={[
                  { ten: 'Ngày', render: r => ngay(r.ngay_hen_tiep_theo) },
                  { ten: 'Khách hàng', render: r => (
                    <>
                      {r.ten_doanh_nghiep}
                      <div className="small text-secondary">{r.noi_dung}</div>
                    </>
                  ) }
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <Modal
        mo={moTao} tieuDe="Tạo cơ hội bán hàng"
        onDong={() => setMoTao(false)} onLuu={taoCoHoi} dangLuu={dangXuLy}
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label">Khách hàng</label>
            <select className="form-select" value={form.khach_hang_b2b_id}
              onChange={e => setForm({ ...form, khach_hang_b2b_id: e.target.value })}>
              <option value="">— Chọn —</option>
              {khachHangs.map(k => <option key={k.id} value={k.id}>{k.ten_doanh_nghiep}</option>)}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">Tên cơ hội</label>
            <input className="form-control" value={form.ten_co_hoi}
              onChange={e => setForm({ ...form, ten_co_hoi: e.target.value })}
              placeholder="vd Đơn bánh Trung Thu 2026" />
          </div>
          <div className="col-md-6">
            <label className="form-label">Giá trị ước tính (₫)</label>
            <input type="number" min="0" className="form-control" value={form.gia_tri_uoc_tinh}
              onChange={e => setForm({ ...form, gia_tri_uoc_tinh: e.target.value })} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Xác suất thành công (%)</label>
            <input type="number" min="0" max="100" className="form-control" value={form.xac_suat_phan_tram}
              onChange={e => setForm({ ...form, xac_suat_phan_tram: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label">Ngày dự kiến chốt</label>
            <input type="date" className="form-control" value={form.ngay_du_kien_chot}
              onChange={e => setForm({ ...form, ngay_du_kien_chot: e.target.value })} />
          </div>
        </div>
      </Modal>

      <Modal mo={!!xem} rong tieuDe={`${xem?.ma_co_hoi || ''} — ${xem?.ten_co_hoi || ''}`} onDong={() => setXem(null)}>
        {xem && (
          <>
            <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
              <span>Giai đoạn hiện tại:</span>
              <span className={`badge text-bg-${GIAI_DOAN[xem.giai_doan]?.[1] || 'secondary'}`}>
                {GIAI_DOAN[xem.giai_doan]?.[0] || xem.giai_doan}
              </span>
              {xem.don_hang_id && (
                <span className="badge text-bg-light border text-dark">
                  → Đơn hàng {xem.don_hang_b2b?.so_don_hang}
                </span>
              )}
              {dangMo && (
                <div className="ms-auto d-flex gap-2">
                  {THU_TU_GIAI_DOAN.filter(g => g !== xem.giai_doan).map(g => (
                    <button key={g} className="btn btn-sm btn-outline-secondary"
                      onClick={() => doiGiaiDoan(g)} disabled={dangXuLy}>
                      → {GIAI_DOAN[g][0]}
                    </button>
                  ))}
                  <button className="btn btn-sm btn-success" onClick={() => doiGiaiDoan('thanh_cong')} disabled={dangXuLy}>
                    Thành công
                  </button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => doiGiaiDoan('that_bai')} disabled={dangXuLy}>
                    Thất bại
                  </button>
                </div>
              )}
            </div>

            <h6 className="mb-2">Lịch sử chăm sóc</h6>
            <Bang
              dong={hoatDongs}
              trong="Chưa có hoạt động chăm sóc nào"
              cot={[
                { ten: 'Thời gian', render: r => ngayGio(r.ngay_thuc_hien) },
                { ten: 'Loại', render: r => LOAI_HD[r.loai_hoat_dong] || r.loai_hoat_dong },
                { ten: 'Nội dung', render: r => r.noi_dung },
                { ten: 'Người thực hiện', render: r => r.nhan_vien?.ho_ten || '—' },
                { ten: 'Hẹn tiếp theo', render: r => ngay(r.ngay_hen_tiep_theo) }
              ]}
            />

            {dangMo && (
              <div className="border-top pt-3 mt-3">
                <h6 className="mb-2">Thêm hoạt động</h6>
                <div className="row g-2">
                  <div className="col-md-3">
                    <select className="form-select form-select-sm" value={hdMoi.loai_hoat_dong}
                      onChange={e => setHdMoi({ ...hdMoi, loai_hoat_dong: e.target.value })}>
                      {Object.entries(LOAI_HD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="col-md-5">
                    <input className="form-control form-control-sm" placeholder="Nội dung trao đổi"
                      value={hdMoi.noi_dung} onChange={e => setHdMoi({ ...hdMoi, noi_dung: e.target.value })} />
                  </div>
                  <div className="col-md-3">
                    <input type="date" className="form-control form-control-sm" placeholder="Hẹn tiếp theo"
                      value={hdMoi.ngay_hen_tiep_theo} onChange={e => setHdMoi({ ...hdMoi, ngay_hen_tiep_theo: e.target.value })} />
                  </div>
                  <div className="col-md-1">
                    <button className="btn btn-sm btn-primary w-100" onClick={themHoatDong} disabled={dangXuLy}>+</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        mo={moThanhCong} tieuDe="Xác nhận thành công — tạo đơn hàng"
        onDong={() => setMoThanhCong(false)} onLuu={xacNhanThanhCong} dangLuu={dangXuLy}
        nhanLuu="Xác nhận & tạo đơn hàng"
      >
        <div className="mb-3 small text-secondary">
          Cơ hội sẽ chuyển sang "Thành công" và tự tạo 1 đơn hàng B2B (chưa có sản phẩm) cho khách hàng này — vào Đơn hàng B2B để bổ sung chi tiết sau.
        </div>
        <label className="form-label">Chi nhánh giao hàng *</label>
        <select className="form-select" value={chiNhanhChonTC} onChange={e => setChiNhanhChonTC(e.target.value)}>
          <option value="">— Chọn chi nhánh —</option>
          {chiNhanhs.map(c => <option key={c.id} value={c.id}>{c.ten_chi_nhanh}</option>)}
        </select>
      </Modal>
    </Trang>
  )
}
