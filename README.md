# Realtime Chat App

Một ứng dụng chat thời gian thực giữa nhiều người dùng, hỗ trợ cả trò chuyện 1-1 và trò chuyện nhóm, 
với đầy đủ các chức năng gửi tin nhắn, file, hình ảnh và thông báo realtime.

## 🚀 Công nghệ sử dụng

- **Node.js + Express**: Backend xử lý socket và API
- **Socket.IO**: Giao tiếp realtime
- **MongoDB + Mongoose**: Lưu trữ người dùng, tin nhắn, ảnh và file
- **HTML + CSS**: Giao diện người dùng
- **MongoDB Compass**: Giao diện trực quan để xem dữ liệu

## 🔧 Tính năng chính

### 👤 Chat cá nhân
- Hiển thị danh sách người dùng online
- Chat realtime giữa người A ↔ người B
- Hiển thị lịch sử tin nhắn khi mở cuộc trò chuyện
- Gửi tin nhắn dạng văn bản, icon, ảnh, file
- Xem ảnh ở kích thước lớn, tải ảnh/file về máy
- Hiển thị thời gian gửi tin nhắn
- Thông báo khi có tin nhắn mới từ người không cùng cuộc trò chuyện
- Đánh dấu tin nhắn chưa đọc trong danh sách người online

### 👨‍👩‍👧‍👦 Chat nhóm
- Tạo nhóm mới
- Thêm thành viên vào nhóm
- Rời khỏi nhóm bất kỳ lúc nào
- Chat realtime giữa nhiều thành viên trong nhóm
- Lưu và hiển thị lịch sử tin nhắn nhóm
- Giao diện giống trò chuyện cá nhân, nhưng hiển thị tên nhóm và thành viên

### Cách chạy web.
- node server.js
