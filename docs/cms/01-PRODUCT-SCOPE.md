# 01 — Phạm vi sản phẩm CMS

Trạng thái: Draft

## Mục tiêu

CMS giúp Fourland quản lý vòng đời bất động sản từ lúc nhận tin Zalo đến khi xuất bản, chăm sóc khách và đóng giao dịch; đồng thời cho người quản lý quan sát chất lượng dữ liệu và hiệu quả vận hành.

## Người dùng

| Vai trò nghiệp vụ | Nhu cầu chính |
|---|---|
| Chủ hệ thống | Xem toàn cảnh, quản lý người dùng và cấu hình |
| Quản lý | Duyệt nội dung, phân công, theo dõi KPI |
| Biên tập viên | Chuẩn hóa hồ sơ, ảnh và xuất bản |
| Nhân viên kinh doanh | Tìm căn, quản lý lead, lịch chăm sóc |
| Người chỉ xem | Xem dashboard/báo cáo được cấp quyền |

## Phạm vi MVP

### Bắt buộc

- Đăng nhập từng người dùng, vai trò và phiên an toàn.
- Dashboard: tổng kho, mới, chờ duyệt, thiếu dữ liệu, trống/đã thuê/ẩn.
- Bảng bất động sản có tìm kiếm, lọc, phân trang và thao tác hàng loạt.
- Trang sửa hồ sơ với so sánh nội dung nguồn và nội dung xuất bản.
- Workflow `draft → pending_review → published → archived`.
- Trạng thái khả dụng độc lập: còn hàng, giữ chỗ, đã thuê/bán, không còn giao dịch.
- Quản lý ảnh: đại diện, thứ tự, thêm, ẩn; giữ tombstone.
- Phân công người phụ trách.
- Audit log cho đăng nhập và mọi thao tác ghi.
- Màn hình theo dõi sức khỏe dữ liệu và lần đồng bộ gần nhất.

### Nên có sau MVP

- CRM lead, lịch gọi lại và ghép căn phù hợp.
- Saved views và export CSV/XLSX.
- Quản lý chủ nhà/nguồn tin.
- Media Center: ảnh hỏng, ảnh trùng, watermark, tối ưu WebP.
- Báo cáo hiệu suất nhân viên và nguồn lead.
- Thông báo Telegram/Zalo cho tác vụ cần xử lý.

### Ngoài phạm vi MVP

- Thay thế listener Zalo hoặc viết lại public web.
- ERP/kế toán, hợp đồng điện tử và thanh toán.
- Mobile app native.
- AI tự xuất bản mà không có quy tắc kiểm soát.
- Xóa vĩnh viễn hồ sơ từ giao diện nghiệp vụ.

## Chỉ số thành công MVP

- 100% thay đổi CMS có người thực hiện và lịch sử trước/sau.
- Nhân viên tìm được hồ sơ cần xử lý trong tối đa 3 thao tác chính.
- Không có hồ sơ `archived` hoặc chưa publish xuất hiện trên public web.
- Danh sách 10.000+ hồ sơ vẫn phân trang tại database, không tải toàn bộ vào function.
- Dashboard nhận diện được hồ sơ thiếu ảnh/giá/địa chỉ và dữ liệu quá hạn xác minh.
- Rollback được migration và bản phát hành trong quy trình diễn tập staging.

## Câu hỏi cần chủ hệ thống phê duyệt

- MVP có bao gồm CRM lead hay tách sang giai đoạn 2?
- Có bao nhiêu người dùng và vai trò thực tế trong 6 tháng tới?
- “Đã thuê” có được giữ công khai để làm bằng chứng năng lực hay ẩn khỏi web?
- Bao lâu phải xác minh lại một căn: 7, 14 hay 30 ngày?
- Trường nào bắt buộc trước khi publish?
