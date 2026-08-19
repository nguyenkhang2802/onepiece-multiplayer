# One Piece 3D Multiplayer

Game One Piece 3D hỗ trợ chơi chung nhiều người trên cùng 1 server.

## Tính năng mới

- **Multiplayer real-time** qua Socket.io
- Khi bật **Haki (phím E)**: người chơi khác hiện **màu đỏ**, dân/xe vẫn xanh
- **PvP**: Đấm / Laser / Chiêu trái trúng người chơi khác → mỗi lần trừ **0.2 máu**
- **Chết** → tự động **hồi sinh gần NPC** (vị trí 0,0,0)
- Danh sách người chơi + HP hiển thị góc phải

## Cách chạy (local)

### 1. Cài đặt
```bash
cd server
npm install
```

### 2. Chạy server
```bash
npm start
```

Server chạy tại: `http://localhost:3000`

### 3. Chơi
- Mở trình duyệt → `http://localhost:3000`
- Nhập tên nhân vật
- Mở thêm tab / máy khác cùng mạng (hoặc dùng ngrok / deploy) để chơi chung

## Deploy miễn phí (để gửi link cho bạn bè)

### Render.com (khuyến nghị)
1. Tạo tài khoản Render
2. New → Web Service
3. Kết nối GitHub repo chứa folder này (hoặc upload)
4. Build Command: `cd server && npm install`
5. Start Command: `cd server && node server.js`
6. Environment: Node
7. Sau khi deploy xong bạn sẽ có link dạng `https://your-app.onrender.com`
8. Gửi link đó cho bạn bè → vào chơi chung

### Railway / Glitch / Replit
Tương tự: trỏ root vào thư mục `server`, chạy `npm start`.

## Lưu ý kỹ thuật

- Thế giới (nhà, xe, dân) vẫn local trên mỗi client (chưa đồng bộ phá hủy).
- Chỉ **người chơi** được đồng bộ vị trí, form, máu, Haki, trái.
- Server xác nhận damage để tránh cheat đơn giản.
- Nếu mất kết nối server → game vẫn chơi được offline (single player).

## Điều khiển chính

| Phím | Chức năng |
|------|-----------|
| WASD | Di chuyển |
| Space | Nhảy / Giữ 2s = Bay |
| Chuột trái | Laser |
| F / Chuột phải | Đấm (PvP) |
| E | Haki Quan Sát (người chơi = đỏ) |
| Z X C V | Chiêu trái ác quỷ |
| G | Nói chuyện NPC |
| 1 | Ăn trái |

Chúc bạn chơi vui!
