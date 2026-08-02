import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const thieuCauHinh = !url || !anonKey

if (thieuCauHinh) {
  console.error(
    'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY. ' +
    'Sao chép .env.example thành .env rồi điền giá trị từ Supabase Dashboard.'
  )
}

// Dùng giá trị giả khi thiếu cấu hình để app vẫn render được màn hình hướng dẫn
// thay vì trắng bóc.
export const supabase = createClient(
  url || 'https://chua-cau-hinh.supabase.co',
  anonKey || 'chua-cau-hinh',
  { auth: { persistSession: true, autoRefreshToken: true } }
)
