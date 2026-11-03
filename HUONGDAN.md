# Đạo Sư LIVE — Hướng dẫn nhanh

Công cụ hiện hiệu ứng trên sóng TikTok khi người xem bình luận, thả tim, tặng quà. **Không** phát vật phẩm / mã quà / tiền thật trong game nào. Mọi dữ liệu chỉ chạy trên máy bạn.

**Lưu ý:** Công cụ **không tự bắt đầu phiên live**. Bạn phải lên live bằng app TikTok hoặc LIVE Studio trước.

## Cài lần đầu

1. Cài [Node.js LTS](https://nodejs.org) (bấm Next tới hết).
2. Mở thư mục `dao-su-live`, **nháy đúp** `chay.bat`.
3. Lần đầu sẽ tự `npm install`, rồi mở trình duyệt tới trang cài đặt.
4. Nếu Windows hỏi tường lửa: bấm **Cho phép** (mạng riêng / private).

## Dùng mỗi lần live

1. Nháy đúp `chay.bat`.
2. Trên trang cài đặt: nhập tên TikTok → **NỐI** (chỉ nối được khi bạn **đang** live).
3. Bấm **Mở trang /song**.
4. Trong **LIVE Studio** hoặc **OBS**, thêm nguồn trình duyệt:
   - URL: `http://localhost:3000/song`
   - Kích thước: **1080 × 1920** (dọc)
5. (Tuỳ chọn) Bấm **Thử không cần live** để xem trước hiệu ứng.

## Sửa bảng quà / máu / chữ tụng

Trên trang cài đặt:

- Máu Zuzai, chữ khoá tụng (mặc định `tung`), bật/tắt âm thanh.
- Bảng quà theo số kim cương → `chuong` / `chuongLon` / `doanTroTran`.
- Bấm **Lưu cài đặt**.

Nếu nối TikTok báo lỗi ký: dán **Khoá ký** (API key Euler Stream) rồi NỐI lại.

## Đổi ảnh

Thả file vào `public/hinh/`:

- `zuzai.png` — Ma Zuzai  
- `daosu.png` — đạo sư nhỏ  

Thiếu ảnh thì game tự vẽ. Sửa danh sách từ tục trong `tucngu.json` nếu cần.

## Tắt

Đóng cửa sổ đen của `chay.bat` (hoặc Ctrl+C).
