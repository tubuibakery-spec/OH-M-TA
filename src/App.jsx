import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Layout from './components/Layout'
import DangNhap from './pages/DangNhap'
import TongQuan from './pages/TongQuan'
import TonKho from './pages/TonKho'
import NhapHang from './pages/NhapHang'
import XuatKho from './pages/XuatKho'
import KiemKe from './pages/KiemKe'
import DeXuatDonHang from './pages/DeXuatDonHang'
import DonDatHang from './pages/DonDatHang'
import VatTu from './pages/VatTu'
import NhaCungCap from './pages/NhaCungCap'
import BanLe from './pages/BanLe'
import SanXuat from './pages/SanXuat'
import KhachHangB2B from './pages/KhachHangB2B'
import DonHangB2B from './pages/DonHangB2B'
import CongNo from './pages/CongNo'
import BaoCao from './pages/BaoCao'
import NhanVien from './pages/NhanVien'
import PhuongTien from './pages/PhuongTien'
import ChuyenGiaoHang from './pages/ChuyenGiaoHang'
import CoHoiBanHang from './pages/CoHoiBanHang'
import KeToan from './pages/KeToan'
import DuBaoBan from './pages/DuBaoBan'
import KhuyenMai from './pages/KhuyenMai'
import ChamCong from './pages/ChamCong'
import NghiPhep from './pages/NghiPhep'
import BangLuong from './pages/BangLuong'
import { DangTai, Loi } from './components/Chung'

function Router() {
  const { session, dangTai, loi, dangXuat } = useApp()

  if (dangTai) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <DangTai text="Đang tải hệ thống…" />
      </div>
    )
  }

  if (!session) return <DangNhap />

  // Đăng nhập được nhưng chưa khai trong nguoi_dung_he_thong / chưa gán vai trò
  if (loi) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
        <div style={{ maxWidth: 560 }}>
          <div className="fw-bold fs-4 mb-3" style={{ color: '#c1121f' }}>OH! MÊ TA</div>
          <Loi loi={loi} />
          <button className="btn btn-outline-secondary" onClick={dangXuat}>Đăng xuất</button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TongQuan />} />
        <Route path="ton-kho" element={<TonKho />} />
        <Route path="nhap-hang" element={<NhapHang />} />
        <Route path="xuat-kho" element={<XuatKho />} />
        <Route path="kiem-ke" element={<KiemKe />} />
        <Route path="de-xuat-don-hang" element={<DeXuatDonHang />} />
        <Route path="don-dat-hang" element={<DonDatHang />} />
        <Route path="vat-tu" element={<VatTu />} />
        <Route path="nha-cung-cap" element={<NhaCungCap />} />
        <Route path="ban-le" element={<BanLe />} />
        <Route path="san-xuat" element={<SanXuat />} />
        <Route path="khach-hang-b2b" element={<KhachHangB2B />} />
        <Route path="don-hang-b2b" element={<DonHangB2B />} />
        <Route path="cong-no" element={<CongNo />} />
        <Route path="bao-cao" element={<BaoCao />} />
        <Route path="nhan-vien" element={<NhanVien />} />
        <Route path="phuong-tien" element={<PhuongTien />} />
        <Route path="chuyen-giao-hang" element={<ChuyenGiaoHang />} />
        <Route path="co-hoi-ban-hang" element={<CoHoiBanHang />} />
        <Route path="ke-toan" element={<KeToan />} />
        <Route path="du-bao-ban" element={<DuBaoBan />} />
        <Route path="khuyen-mai" element={<KhuyenMai />} />
        <Route path="cham-cong" element={<ChamCong />} />
        <Route path="nghi-phep" element={<NghiPhep />} />
        <Route path="bang-luong" element={<BangLuong />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Router />
      </AppProvider>
    </BrowserRouter>
  )
}
