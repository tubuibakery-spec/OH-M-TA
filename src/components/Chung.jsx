import { nhanTrangThai } from '../lib/dinhDang'

export function DangTai({ text = 'Đang tải…' }) {
  return (
    <div className="d-flex align-items-center gap-2 text-secondary py-4">
      <div className="spinner-border spinner-border-sm" role="status" />
      <span>{text}</span>
    </div>
  )
}

export function Loi({ loi, onDong }) {
  if (!loi) return null
  return (
    <div className="alert alert-danger alert-dismissible d-flex gap-2" role="alert">
      <div className="flex-grow-1" style={{ whiteSpace: 'pre-wrap' }}>{String(loi)}</div>
      {onDong && <button type="button" className="btn-close" onClick={onDong} />}
    </div>
  )
}

export function TrangThai({ gt }) {
  const { nhan, mau } = nhanTrangThai(gt)
  return <span className={`badge text-bg-${mau}`}>{nhan}</span>
}

export function Trong({ text = 'Chưa có dữ liệu' }) {
  return <div className="text-center text-secondary py-5">{text}</div>
}

/**
 * Bảng dữ liệu tối giản.
 * cot: [{ ten, render(row), lop? }]
 */
export function Bang({ cot, dong, khoa = 'id', trong }) {
  if (!dong?.length) return <Trong text={trong} />
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>{cot.map((c, i) => <th key={i} className={c.lop}>{c.ten}</th>)}</tr>
        </thead>
        <tbody>
          {dong.map((r, i) => (
            <tr key={r[khoa] ?? i}>
              {cot.map((c, j) => <td key={j} className={c.lop}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Trang({ tieuDe, mota, hanhDong, children }) {
  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h4 mb-0">{tieuDe}</h1>
          {mota && <div className="text-secondary small mt-1">{mota}</div>}
        </div>
        {hanhDong && <div className="d-flex gap-2">{hanhDong}</div>}
      </div>
      {children}
    </div>
  )
}

/** Modal thuần React — không phụ thuộc JS của Bootstrap. */
export function Modal({ tieuDe, mo, onDong, onLuu, nhanLuu = 'Lưu', dangLuu, rong, children }) {
  if (!mo) return null
  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1} role="dialog">
        <div className={`modal-dialog modal-dialog-scrollable ${rong ? 'modal-xl' : 'modal-lg'}`}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{tieuDe}</h5>
              <button type="button" className="btn-close" onClick={onDong} />
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onDong}>Đóng</button>
              {onLuu && (
                <button type="button" className="btn btn-primary" onClick={onLuu} disabled={dangLuu}>
                  {dangLuu ? 'Đang lưu…' : nhanLuu}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onDong} />
    </>
  )
}

export function The({ nhan, gt, mau = 'primary', phu }) {
  return (
    <div className="col-6 col-lg-3">
      <div className="card h-100 border-0 shadow-sm">
        <div className="card-body">
          <div className="text-secondary small text-uppercase">{nhan}</div>
          <div className={`fs-3 fw-semibold text-${mau}`}>{gt}</div>
          {phu && <div className="small text-secondary">{phu}</div>}
        </div>
      </div>
    </div>
  )
}
