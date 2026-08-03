export function tien(v) {
  if (v === null || v === undefined || v === '') return '—'
  return Number(v).toLocaleString('vi-VN') + ' ₫'
}

export function so(v, chuSoThapPhan = 3) {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return n.toLocaleString('vi-VN', { maximumFractionDigits: chuSoThapPhan })
}

export function ngay(v) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('vi-VN')
}

export function ngayGio(v) {
  if (!v) return '—'
  return new Date(v).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function homNay() {
  return new Date().toISOString().slice(0, 10)
}

const NHAN_TRANG_THAI = {
  nhap: ['Nháp', 'secondary'],
  cho_duyet: ['Chờ duyệt', 'warning'],
  da_duyet: ['Đã duyệt', 'success'],
  da_gui: ['Đã gửi', 'info'],
  da_nhan: ['Đã nhận', 'success'],
  da_huy: ['Đã hủy', 'danger'],
  hoan_thanh: ['Hoàn thành', 'success'],
  dang_san_xuat: ['Đang sản xuất', 'info'],
  moi: ['Mới', 'secondary'],
  da_xac_nhan: ['Đã xác nhận', 'info'],
  dang_giao: ['Đang giao', 'primary'],
  da_giao: ['Đã giao', 'success'],
  nhan_mot_phan: ['Nhận một phần', 'warning'],
  hieu_luc: ['Hiệu lực', 'success'],
  tu_choi: ['Từ chối', 'danger'],
  da_chi_tra: ['Đã chi trả', 'success']
}

export function nhanTrangThai(tt) {
  const [nhan, mau] = NHAN_TRANG_THAI[tt] || [tt, 'secondary']
  return { nhan, mau }
}
