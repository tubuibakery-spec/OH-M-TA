import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp phải nằm trong <AppProvider>')
  return ctx
}

const KHOA_CHI_NHANH = 'ohmeta.chi_nhanh_id'

export function AppProvider({ children }) {
  const [session, setSession] = useState(null)
  const [dangTai, setDangTai] = useState(true)
  const [nguoiDung, setNguoiDung] = useState(null)
  const [vaiTro, setVaiTro] = useState([])       // [{ ma_vai_tro, ten_vai_tro, chi_nhanh_id }]
  const [quyen, setQuyen] = useState([])         // [{ module, hanh_dong, chi_nhanh_id }]
  const [chiNhanhs, setChiNhanhs] = useState([])
  const [chiNhanhId, setChiNhanhIdState] = useState(null)
  const [loi, setLoi] = useState(null)

  const setChiNhanhId = useCallback((id) => {
    setChiNhanhIdState(id)
    if (id) localStorage.setItem(KHOA_CHI_NHANH, id)
    else localStorage.removeItem(KHOA_CHI_NHANH)
  }, [])

  // --- Phiên đăng nhập ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // --- Nạp hồ sơ + phân quyền + chi nhánh ---
  const napHoSo = useCallback(async () => {
    if (!session?.user) {
      setNguoiDung(null); setVaiTro([]); setQuyen([]); setChiNhanhs([])
      setDangTai(false)
      return
    }
    setDangTai(true)
    setLoi(null)
    try {
      const { data: nd, error: e1 } = await supabase
        .from('nguoi_dung_he_thong')
        .select('id, email, nhan_vien_id, trang_thai')
        .eq('email', session.user.email)
        .maybeSingle()
      if (e1) throw e1

      if (!nd) {
        throw new Error(
          `Tài khoản ${session.user.email} chưa được khai trong bảng nguoi_dung_he_thong. ` +
          'Nhờ quản trị viên thêm người dùng và gán vai trò.'
        )
      }
      setNguoiDung(nd)

      // Vai trò của chính mình (RLS chỉ trả về dòng của mình)
      const { data: ndvt, error: e2 } = await supabase
        .from('nguoi_dung_vai_tro')
        .select('vai_tro_id, chi_nhanh_id, vai_tro_he_thong(ma_vai_tro, ten_vai_tro)')
      if (e2) throw e2

      const dsVaiTro = (ndvt || []).map(r => ({
        vai_tro_id: r.vai_tro_id,
        chi_nhanh_id: r.chi_nhanh_id,
        ma_vai_tro: r.vai_tro_he_thong?.ma_vai_tro,
        ten_vai_tro: r.vai_tro_he_thong?.ten_vai_tro
      }))
      setVaiTro(dsVaiTro)

      // Quyền của các vai trò đó
      const ids = [...new Set(dsVaiTro.map(v => v.vai_tro_id))]
      let dsQuyen = []
      if (ids.length) {
        const { data: vq, error: e3 } = await supabase
          .from('vai_tro_quyen')
          .select('vai_tro_id, quyen_he_thong(module, hanh_dong)')
          .in('vai_tro_id', ids)
        if (e3) throw e3

        // Nhân với phạm vi chi nhánh của từng lần gán vai trò
        dsQuyen = dsVaiTro.flatMap(v =>
          (vq || [])
            .filter(q => q.vai_tro_id === v.vai_tro_id && q.quyen_he_thong)
            .map(q => ({
              module: q.quyen_he_thong.module,
              hanh_dong: q.quyen_he_thong.hanh_dong,
              chi_nhanh_id: v.chi_nhanh_id
            }))
        )
      }
      setQuyen(dsQuyen)

      // Chi nhánh — RLS đã lọc sẵn theo quyền
      const { data: cn, error: e4 } = await supabase
        .from('chi_nhanh')
        .select('id, ma_chi_nhanh, ten_chi_nhanh, loai_chi_nhanh, trang_thai')
        .order('ten_chi_nhanh')
      if (e4) throw e4
      setChiNhanhs(cn || [])

      const luu = localStorage.getItem(KHOA_CHI_NHANH)
      const hopLe = (cn || []).some(c => c.id === luu)
      setChiNhanhIdState(hopLe ? luu : (cn?.[0]?.id ?? null))
    } catch (err) {
      setLoi(err.message || String(err))
    } finally {
      setDangTai(false)
    }
  }, [session])

  useEffect(() => { napHoSo() }, [napHoSo])

  // --- Phân quyền phía giao diện ---
  // Chỉ để ẩn/hiện menu và nút. Bảo mật THẬT nằm ở RLS trong database.
  const laQuanTri = vaiTro.some(
    v => v.chi_nhanh_id === null && ['admin', 'giam_doc'].includes(v.ma_vai_tro)
  )

  const coQuyen = useCallback((module, hanhDong, cnId = chiNhanhId) => {
    if (laQuanTri) return true
    return quyen.some(q =>
      q.module === module &&
      q.hanh_dong === hanhDong &&
      (q.chi_nhanh_id === null || q.chi_nhanh_id === cnId)
    )
  }, [quyen, laQuanTri, chiNhanhId])

  const coQuyenMoiNoi = useCallback((module, hanhDong) => {
    if (laQuanTri) return true
    return quyen.some(q => q.module === module && q.hanh_dong === hanhDong)
  }, [quyen, laQuanTri])

  const chiNhanh = chiNhanhs.find(c => c.id === chiNhanhId) || null

  const dangXuat = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(KHOA_CHI_NHANH)
  }, [])

  return (
    <AppContext.Provider value={{
      session, dangTai, loi, nguoiDung, vaiTro, quyen,
      chiNhanhs, chiNhanh, chiNhanhId, setChiNhanhId,
      laQuanTri, coQuyen, coQuyenMoiNoi, dangXuat, napLai: napHoSo
    }}>
      {children}
    </AppContext.Provider>
  )
}
