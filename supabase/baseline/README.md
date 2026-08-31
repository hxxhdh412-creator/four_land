# Supabase baseline review

Các file trong thư mục này chỉ dùng đối chiếu schema hiện tại. Chúng không phải migration và không được chạy trên production.

Snapshot `20260829_public_schema.sql` được dựng từ OpenAPI Supabase production ở chế độ chỉ-đọc. OpenAPI xác nhận column, kiểu dữ liệu, nullability, default, primary key và foreign key được mô tả; không đủ để xác nhận index ngoài PK, trigger, RLS, policy hoặc hành vi `ON DELETE`.

Trước khi chuyển snapshot thành migration baseline:

1. Xuất schema bằng công cụ PostgreSQL/Supabase có quyền đọc catalog.
2. So sánh constraint, index, trigger, function, RLS và storage policy.
3. Xác nhận backup và diễn tập restore.
4. Baseline migration phải được đánh dấu đã áp dụng hoặc thiết kế no-op phù hợp; không chạy `CREATE TABLE` lên production đang có bảng.
