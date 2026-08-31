# 06 — Kiến trúc thông tin và UX

Trạng thái: Draft

Tiến độ triển khai: shell `/admin`, auth gate, navigation responsive và empty states đã được dựng theo brand system. Dashboard/list/editor hiện là khung có nhãn rõ, chưa nối API nghiệp vụ.

## Điều hướng CMS

```text
Tổng quan
Kho bất động sản
  ├─ Tất cả
  ├─ Chờ duyệt
  ├─ Cần bổ sung
  ├─ Đã xuất bản
  └─ Đã lưu trữ
Khách hàng (giai đoạn 2)
Công việc (giai đoạn 2)
Hình ảnh
Đồng bộ & chất lượng dữ liệu
Báo cáo
Cài đặt
  ├─ Người dùng & vai trò
  └─ Quy tắc hệ thống
```

## Màn hình MVP

### Dashboard

- KPI theo trạng thái và khoảng thời gian.
- Danh sách việc cần xử lý: chờ duyệt, thiếu dữ liệu, quá hạn xác minh, sync lỗi.
- Tình trạng Supabase, Storage, Zalo/Sheet sync hiển thị riêng.
- KPI có link dẫn tới danh sách đã lọc, không chỉ là số trang trí.

### Danh sách kho

- Desktop ưu tiên bảng; mobile chuyển sang card/action sheet.
- Column tùy chọn: ảnh, mã, địa chỉ, giá, tình trạng, chất lượng, người phụ trách, cập nhật.
- Search và filter phản ánh trên URL để chia sẻ/lưu view.
- Bulk action chỉ hiện sau khi chọn; phải tóm tắt tác động trước xác nhận.
- Có loading, empty, error, partial failure và retry.

### Biên tập hồ sơ

- Header cố định: mã, trạng thái, người phụ trách, lưu/submit/publish.
- Hai cột desktop: form chuẩn hóa và panel nguồn Zalo/Sheet.
- Nhóm field: vị trí, đặc điểm, giá, liên hệ, nội dung, ảnh, SEO, nội bộ.
- Hiển thị field nào đang override sync và cho phép bỏ override có chủ đích.
- Cảnh báo xung đột version trước khi ghi đè.

### Audit timeline

- Ai, lúc nào, hành động gì và field nào đổi.
- So sánh trước/sau dễ đọc; dữ liệu nhạy cảm được mask theo quyền.
- Lọc theo actor, action và thời gian.

## Quy tắc tương tác

- Save draft không đồng nghĩa publish.
- Publish/reject/archive là action rõ ràng, có lý do khi cần.
- Không dùng màu làm tín hiệu duy nhất.
- Không dùng confirm browser cho workflow quan trọng; dùng dialog có mô tả tác động.
- Toast chỉ thông báo; lỗi cần xử lý phải ở gần nội dung và tồn tại đủ lâu.
- Bàn phím, focus, label và screen reader phải dùng được.

## Responsive và thương hiệu

- Font duy nhất `Be Vietnam Pro`.
- Không cuộn ngang toàn trang ở 360–430 px; bảng có chế độ card hoặc vùng cuộn riêng.
- Giữ token màu/spacing hiện có; component mới phải được ghi vào `docs/BRAND_SYSTEM.md` khi triển khai.
- Kiểm tra tối thiểu desktop 1440 px và mobile 393 × 852.

## Prototype cần duyệt trước code

- Dashboard desktop/mobile.
- Danh sách kho với filter và bulk action.
- Trang biên tập và so sánh nguồn.
- Publish/reject dialog.
- Quản lý ảnh.
- Empty/error/version-conflict states.
