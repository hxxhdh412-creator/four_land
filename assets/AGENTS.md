# Frontend Agent Notes

- Đọc `../docs/BRAND_SYSTEM.md` trước mọi chỉnh sửa UI.
- `index.html` giữ semantic structure và các mount point.
- `app.js` quản lý state/render/API; không chứa secret hoặc Supabase SDK server key.
- `app.css` hiện còn các lớp override lịch sử. Không thêm selector trùng ở cuối file nếu có thể sửa đúng rule đang hiệu lực.
- Khi refactor CSS, tách tokens/base/layout/components/responsive nhưng phải giữ visual regression nhỏ.
- Dùng Be Vietnam Pro duy nhất; không thêm font khác.
- Mọi nút chỉ có icon phải có `aria-label`, focus visible và vùng chạm ≥42 px.
- Mỗi thay đổi phải thử ở 393 × 852 và desktop ≥1280 px.
- Khi thay `app.css` hoặc `app.js`, đổi cache-busting query trong `index.html`.

