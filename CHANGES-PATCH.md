# Bản vá: bong bóng + model nền + theo dõi dùng key

Giải nén ĐÈ lên thư mục LunAV (cùng đường dẫn). Sao lưu main.js, renderer.js trước nếu muốn.

## 1. Bong bóng (renderer.js, index.html)
- Bong bóng tự ẩn sau ~6 giây + 60ms/ký tự (tối đa 30 giây); đang đọc thành tiếng thì giữ thêm. Bấm vào vẫn tắt ngay.
- Bạn chủ động tương tác mà model im lặng/trả rỗng: hiện "...", "um...", "hm...", "ừm..." ~2,6 giây rồi ẩn.
- Lượt tự quan sát nền mà im lặng: không hiện gì.
- Im rất lâu (>5 phút): thỉnh thoảng (xác suất 30% mỗi phút kiểm tra, tối đa 1 lần/8 phút) hiện "..." thoáng qua.

## 2. Model nền (main.js, cai-dat.json)
- Mục đích `watch` (theo dõi màn hình) và `learning` (học hỏi/tiến bộ) dùng danh sách `modelsNen`
  (mặc định gemini-3.1-flash-lite -> gemini-3.5-flash-lite). Chat, voice, Discord, nhắc việc, lời chủ động giữ chuỗi `models` cũ.
- Model #1 bị 429/503 -> tự chuyển sang #2 (dùng chung cơ chế cooldown cũ).
- Các lượt nền không còn đổi nhãn "Working model" của chat.
- Thiếu `modelsNen` trong cai-dat.json -> dùng mặc định; ghi sai/trống -> rơi về chuỗi `models`.

## 3. Key Usage (developer-console.html, usage-tracker.js)
- Mục "Key Usage" mới, mặc định thu gọn, nằm cạnh "Key & Token".
- Liệt kê 8 chức năng dùng key: Chat, Voice, Chat Discord, Theo dõi màn hình, Học hỏi & tiến bộ, Chủ động lên tiếng, Nhắc việc, Giọng Gemini TTS.
- Mỗi chức năng: số lần gọi hôm nay, số lần/giờ, token vào/ra, số lỗi (429), model đã dùng, lần gọi gần nhất.
- Số liệu lưu theo ngày vào usage-today.json; nút Reset today để xoá.

## 4. Repetition Guard (services/repetition-guard.js)
- Trước khi gọi model: chèn lời nhắc "đừng mở đầu giống các câu vừa nói".
- Sau khi model trả lời: lượt TỰ ĐỘNG (theo dõi) mà giống câu cũ >= 0.78 thì coi như im lặng; lượt bạn chat chỉ ghi log [REPEAT].

## Kiểm tra
- `npm test`: 26/26 đạt (có thêm tools/test-repetition-usage.js). integrity-manifest.json đã tạo lại.
- Chưa chạy được app Electron thật trong môi trường này: bong bóng và định tuyến model đã thử bằng harness giả lập.
