# Fourland Brand & UI System

Tài liệu này là nguồn chuẩn duy nhất khi thiết kế giao diện. Agent không tự chọn thêm màu hoặc font nếu chưa cập nhật tài liệu.

## 1. Tinh thần thương hiệu

Fourland mang cảm giác: tin cậy, chọn lọc, vững vàng, cao cấp vừa phải và thực dụng. Giao diện cần sạch, nhiều khoảng thở, ít trang trí, ảnh bất động sản là trọng tâm.

Tránh: gradient sặc sỡ, neon, bo góc quá lớn, shadow nặng, icon hoạt hình, quá nhiều màu hoặc hiệu ứng chuyển động.

## 2. Logo

- File chuẩn: `assets/brand/fourland-logo.png`.
- Không kéo méo, đổi màu, thêm shadow hoặc đặt trên nền thiếu tương phản.
- Giữ khoảng trống tối thiểu quanh logo bằng khoảng 20% chiều rộng logo.
- Desktop đề xuất 78 × 70 px; mobile 54 × 50 px.

## 3. Bảng màu

| Token | Hex | Vai trò |
|---|---:|---|
| `--color-ink` / `--ink` | `#1D2925` | Chữ chính, tiêu đề |
| `--color-forest` / `--forest` | `#283D34` | Nút chính, avatar, icon quản trị |
| `--color-forest-deep` / `--forest-2` | `#182B24` | Hover/độ tương phản cao |
| `--color-orange` / `--orange` | `#EF6509` | Điểm nhấn, trạng thái active, CTA phụ |
| `--color-olive` / `--olive` | `#7CA31F` | Trạng thái online, điểm nhấn thứ hai |
| `--color-brown` / `--brown` | `#755C42` | Chỉ dùng rất hạn chế |
| `--color-sage` / `--sage` | `#EDF0E8` | Nền control, nền nhẹ |
| `--color-bg` / `--bg` | `#F3F4F0` | Nền trang |
| `--color-surface` / `--card` | `#FFFFFF` | Card, popup, form |
| `--color-line` / `--line` | `#DDE2DA` | Viền |
| `--color-muted` / `--muted` | `#6B746E` | Chữ phụ |
| Danger | `#B8322A` | Xóa ảnh/cảnh báo |

Tỷ lệ sử dụng khuyến nghị: 70% nền trắng/xám ấm, 20% xanh rừng/chữ, tối đa 10% cam + olive.

## 4. Typography

Font duy nhất: **Be Vietnam Pro** (`400, 500, 600, 700, 800`). Font này hỗ trợ tiếng Việt đầy đủ và được import ở đầu `assets/app.css`.

Fallback: `"Segoe UI", Arial, sans-serif`.

Không dùng `DM Sans`, `Manrope`, font serif hoặc font không có đủ dấu tiếng Việt.

| Kiểu | Desktop | Mobile | Weight | Line-height |
|---|---:|---:|---:|---:|
| Hero H1 | 46–82 px | 33–42 px | 700 | 0.97–1.05 |
| Tiêu đề popup | 23 px | 20–22 px | 700 | 1.2 |
| Tiêu đề card | 17 px | 12–14 px | 700 | 1.28–1.35 |
| Giá | 21 px | 15–18 px | 800 | 1.2–1.3 |
| Body | 15–16 px | 13–14 px | 400–500 | 1.5–1.7 |
| Label | 9–11 px | 8–10 px | 700 | 1.3 |

Chỉ viết hoa toàn bộ cho eyebrow/label ngắn. Không viết hoa đoạn văn dài.

## 5. Spacing, radius, shadow

- Spacing scale: `4, 8, 12, 16, 20, 24, 32, 48, 64` px.
- Control mobile phải có vùng chạm tối thiểu 42 × 42 px; CTA chính 48 px.
- Radius cơ bản: 4–5 px cho card; 10–14 px cho search/filter surface; 50% cho avatar/nút tròn.
- Shadow nhẹ, màu xanh đen với opacity 5–12%; không dùng shadow đen đặc.

## 6. Icon

- SVG nét mảnh 1.7–2 px, linecap/linejoin tròn.
- Kích thước icon control: 20–24 px; vùng chạm 42–48 px.
- Căn icon bằng `display:grid; place-items:center`; không căn bằng margin thủ công.
- Icon xóa dùng danger; icon active dùng nền forest với chi tiết trắng/cam.

## 7. Card bất động sản

- Desktop: 4 cột, giảm xuống 3/2 theo breakpoint.
- Mobile ≤480 px: 2 cột, card cao đồng nhất 278 px; ảnh 154 px, nội dung 124 px.
- Ảnh dùng `object-fit: cover` ở card và `contain` trong gallery chi tiết.
- Text dài phải clamp; không để một card phá chiều cao lưới.

## 8. Popup mobile

- Full `100vw × 100dvh`.
- Header cố định trong popup; phần body tự cuộn dọc.
- Trên desktop, popup chi tiết rộng tối đa `1180px`, dùng hai cột `minmax(0, ...)`, chỉ cuộn dọc bên trong và tuyệt đối không tạo thanh cuộn ngang.
- Breakpoint desktop bắt đầu từ `761px`; mọi sửa đổi desktop phải nằm trong `@media (min-width: 761px)` để không làm thay đổi trải nghiệm điện thoại đã ổn định.
- Không được có thanh cuộn ngang.
- Nút đóng tròn, ít nhất 46 × 46 px.

## 9. Accessibility

- Tương phản chữ thường tối thiểu 4.5:1.
- Mọi icon button phải có `aria-label` và focus visible.
- Không dùng màu làm tín hiệu duy nhất; luôn có text/icon bổ trợ.
- Tôn trọng `prefers-reduced-motion` khi thêm animation mới.

## 10. Checklist thiết kế

- Dùng đúng token màu và Be Vietnam Pro?
- Mobile 360, 393, 430 px không tràn ngang?
- Nút chạm đủ lớn, icon căn giữa?
- Card cùng chiều cao, text đã clamp?
- Loading/empty/error rõ ràng?
- Popup cuộn được và nút đóng luôn dễ thấy?
