# Supabase Agent Notes

- Mọi thay đổi schema phải nằm trong `supabase/migrations/` và có thể review trước khi chạy.
- Migration đã áp dụng không được sửa lại; tạo file migration mới theo thứ tự thời gian.
- Dùng snake_case, khóa chính rõ ràng, foreign key và index theo `docs/DATA_MODEL.md`.
- Secret/service key chỉ ở server environment.
- Storage bucket ảnh là `property-images`; public URL chỉ dùng cho ảnh cần hiển thị công khai.
- Không bật policy ghi công khai cho `properties`, `property_images` hoặc `property_inquiries`.
- Trước migration production: backup, kiểm tra số hàng và chuẩn bị rollback.

