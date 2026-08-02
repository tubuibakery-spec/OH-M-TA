import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Trang, DangTai, Loi, Trong } from '../components/Chung'
import { tien, so, homNay } from '../lib/dinhDang'

export default function DeXuatDonHang() {
  const { chiNhanhId, coQuyen } = useApp()
  const [tuNgay, setTuNgay] = useState(homNay())
  const [denNgay, setDenNgay] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 6)
    return d.toISOString().slice(0, 10)
  })
  const [dong, setDong] = useState(null)
  const [chon, setChon] = useState({})
  const [dangTai, setDangTai] = useState(false)
  const [dangTao, setDangTao] = useState(false)
  const [loi, setLoi] = useState(null)
  const [ok, setOk] = useState(null)

  async function tinh() {
    setDangTai(true); setLoi(null); setOk(null); setDong(null)
    const { data, error } = await supabase.rpc('rpc_de_xuat_dat_hang', {
      p_chi_nhanh_id: chiNhanhId,
      p_tu_ngay: tuNgay,
      p_den_ngay: denNgay
    })
    if (error) setLoi(error.message)
    setDong(data || [])
    setChon(Object.fromEntries((data || []).map((r, i) => [i, !!r.ra_nha_cung_cap_id])))
    setDangTai(false)
  }

  async function taoDon() {
    const daChon = (dong || []).filter((r, i) => chon[i] && r.ra_nha_cung_cap_id)
    if (!daChon.length) { setLoi('Chưa chọn dòng nào có nhà cung cấp.'); return }

    setDangTao(true); setLoi(null); setOk(null)
    try {
      // Gom theo nhà cung cấp — mỗi NCC một đơn đặt
      const theoNcc = {}
      for (const r of daChon) (theoNcc[r.ra_nha_cung_cap_id] ||= []).push(r)

      const daTao = []
      for (const [nccId, dsDong] of Object.entries(theoNcc)) {
        const { data: don, error: e1 } = await supabase
          .from('don_dat_hang_ncc')
          .insert({ nha_cung_cap_id: nccId, chi_nhanh_id: chiNhanhId })
          .select('id, so_don').single()
        if (e1) throw e1

        const { error: e2 } = await supabase.from('chi_tiet_don_dat_hang_ncc').insert(
          dsDong.map(r => ({
            don_dat_hang_id: don.id,
            vat_tu_id: r.ra_vat_tu_id,
            so_luong_mua: Number(r.ra_so_luong_mua),
            he_so_quy_doi: Number(r.ra_he_so_quy_doi) || 1,
            don_gia: Number(r.ra_don_gia || 0)
          }))
        )
        if (e2) throw e2
        daTao.push(don.so_don)
      }
      setOk(`Đã tạo ${daTao.length} đơn đặt hàng: ${daTao.join(', ')}. Vào mục “Đơn đặt NCC” để kiểm tra và gửi.`)
      setDong(null)
    } catch (e) { setLoi(e.message) } finally { setDangTao(false) }
  }

  const duocTao = coQuyen('mua_hang', 'tao')
  const tongTien = (dong || []).reduce((s, r, i) => chon[i] ? s + Number(r.ra_thanh_tien || 0) : s, 0)

  return (
    <Trang
      tieuDe="Đề xuất đặt hàng"
      mota="Thiếu = nhu cầu dự báo − (tồn − giữ chỗ − tồn tối thiểu) − hàng đang về"
    >
      <Loi loi={loi} onDong={() => setLoi(null)} />
      {ok && <div className="alert alert-success">{ok}</div>}

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-auto">
              <label className="form-label">Từ ngày</label>
              <input type="date" className="form-control" value={tuNgay}
                onChange={e => setTuNgay(e.target.value)} />
            </div>
            <div className="col-auto">
              <label className="form-label">Đến ngày</label>
              <input type="date" className="form-control" value={denNgay}
                onChange={e => setDenNgay(e.target.value)} />
            </div>
            <div className="col-auto">
              <button className="btn btn-primary" onClick={tinh} disabled={dangTai || !chiNhanhId}>
                {dangTai ? 'Đang tính…' : 'Tính đề xuất'}
              </button>
            </div>
          </div>
          <div className="form-text mt-2">
            Cần có số liệu trong bảng <code>du_bao_ban</code> cho khoảng ngày này.
            Bếp Trung Tâm sẽ được nổ công thức ra nguyên vật liệu; cửa hàng thì đề xuất thẳng thành phẩm.
          </div>
        </div>
      </div>

      {dangTai && <DangTai text="Đang nổ công thức và đối chiếu tồn kho…" />}

      {dong && dong.length === 0 && (
        <Trong text="Không có mặt hàng nào thiếu trong khoảng ngày này." />
      )}

      {dong && dong.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Vật tư</th>
                  <th className="text-end">Nhu cầu</th>
                  <th className="text-end">Khả dụng</th>
                  <th className="text-end">Đang về</th>
                  <th className="text-end">Thiếu</th>
                  <th>Nhà cung cấp</th>
                  <th className="text-end">Đặt</th>
                  <th className="text-end">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {dong.map((r, i) => (
                  <tr key={i} className={!r.ra_nha_cung_cap_id ? 'table-warning' : ''}>
                    <td>
                      <input type="checkbox" className="form-check-input"
                        checked={!!chon[i]} disabled={!r.ra_nha_cung_cap_id}
                        onChange={e => setChon({ ...chon, [i]: e.target.checked })} />
                    </td>
                    <td>{r.ra_ten_vat_tu}</td>
                    <td className="text-end">{so(r.ra_nhu_cau)}</td>
                    <td className="text-end">{so(r.ra_ton_kha_dung)}</td>
                    <td className="text-end">{so(r.ra_dang_ve)}</td>
                    <td className="text-end fw-semibold text-danger">{so(r.ra_thieu)}</td>
                    <td>
                      {r.ra_ten_ncc || (
                        <span className="small text-danger">Chưa khai bảng giá NCC</span>
                      )}
                    </td>
                    <td className="text-end">
                      {r.ra_so_luong_mua ? `${so(r.ra_so_luong_mua)} ${r.ra_don_vi_mua || ''}` : '—'}
                    </td>
                    <td className="text-end">{tien(r.ra_thanh_tien)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="table-light">
                <tr>
                  <td colSpan={8} className="text-end fw-semibold">Tổng đã chọn</td>
                  <td className="text-end fw-bold">{tien(tongTien)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {duocTao && (
            <div className="card-body border-top">
              <button className="btn btn-success" onClick={taoDon} disabled={dangTao}>
                {dangTao ? 'Đang tạo…' : 'Tạo đơn đặt hàng từ các dòng đã chọn'}
              </button>
              <div className="form-text">
                Mỗi nhà cung cấp sẽ thành một đơn riêng, ở trạng thái nháp.
              </div>
            </div>
          )}
        </div>
      )}
    </Trang>
  )
}
