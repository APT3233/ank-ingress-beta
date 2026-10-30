# @ank-ingress v1.0.0

Bản phân phối của bộ khung server `@ank-ingress/*` cho Node.js, chạy trên uWebSockets.js. Framework không sở hữu database của sản phẩm: bảng, migration và câu SQL thuộc về ứng dụng.

Mỗi gói gồm thư mục `dist/`: JavaScript do TypeScript biên dịch (giữ nguyên cấu trúc file và comment) cùng file khai báo kiểu `.d.ts`.

## Yêu cầu

- Node.js `^24.22.1`. Dự án dùng ESM: `package.json` có `"type": "module"`.
- Có mạng tới GitHub khi cài: `uWebSockets.js` được cài từ GitHub.
- Dùng TypeScript thì cài `@types/node` cùng đời với Node (`npm install -D @types/node@^24`). Bản `@types/node` mới hơn thiếu một số kiểu mà framework dùng.
- Gói `messaging` dùng `@confluentinc/kafka-javascript`, có phần native; npm tải bản dựng sẵn cho đúng phiên bản Node ở trên.

## Cài đặt

Các gói **không** có trên npm registry, nên phải cài từ file trong repo này, và phải cài **trong cùng một lệnh** gói cần dùng cùng mọi gói nó phụ thuộc (xem bảng bên dưới).

### Cài thẳng từ GitHub

Cách nhanh nhất. npm tải file `.tgz` từ repo này và giải nén vào `node_modules/@ank-ingress/*`; `package.json` của dự án lưu lại URL nên lần sau chỉ cần `npm install`.

Chỉ cần HTTP (không Kafka, MinIO, Redis) thì cài 7 gói:

```bash
npm install https://raw.githubusercontent.com/APT3233/ank-ingress-beta/main/tarballs/ank-ingress-{app,kernel,config,contracts,observability,runtime,http}-1.0.0.tgz
```

Cài toàn bộ:

```bash
npm install https://raw.githubusercontent.com/APT3233/ank-ingress-beta/main/tarballs/ank-ingress-{kernel,config,contracts,observability,runtime,postgres,workers,http,security,cache,messaging,storage,realtime,app,testing}-1.0.0.tgz
```

Lệnh dùng `{a,b}` của bash/zsh để viết gọn; trên shell khác thì liệt kê từng URL.

### Cài từ thư mục `vendor/`

Dùng khi máy cài không truy cập được GitHub. Chép file vào dự án rồi commit thư mục `vendor/`.

```bash
git clone https://github.com/APT3233/ank-ingress-beta.git /tmp/ank-ingress-dist
mkdir -p vendor/ank-ingress
cp -r /tmp/ank-ingress-dist/tarballs/*.tgz vendor/ank-ingress/

# Cài toàn bộ
npm install ./vendor/ank-ingress/*.tgz

# Hoặc chỉ HTTP (7 gói)
npm install ./vendor/ank-ingress/ank-ingress-app-1.0.0.tgz \
  ./vendor/ank-ingress/ank-ingress-kernel-1.0.0.tgz \
  ./vendor/ank-ingress/ank-ingress-config-1.0.0.tgz \
  ./vendor/ank-ingress/ank-ingress-contracts-1.0.0.tgz \
  ./vendor/ank-ingress/ank-ingress-observability-1.0.0.tgz \
  ./vendor/ank-ingress/ank-ingress-runtime-1.0.0.tgz \
  ./vendor/ank-ingress/ank-ingress-http-1.0.0.tgz
```

| Gói | Dùng cho | Cần cài kèm | Thư viện ngoài |
| --- | --- | --- | --- |
| `@ank-ingress/kernel` | Lỗi (`AppError`), ID, số thập phân, thời gian | — | — |
| `@ank-ingress/config` | Đọc và kiểm tra biến môi trường, bí mật | — | — |
| `@ank-ingress/contracts` | Route, `Reply`, catalog, sự kiện, job, các port ứng dụng cài đặt | `kernel` | `@sinclair/typebox` |
| `@ank-ingress/observability` | Logger, metrics, trace, health server | — | `pino` |
| `@ank-ingress/runtime` | `runApp`, vòng đời tiến trình, module | `kernel`, `config`, `contracts`, `observability` | — |
| `@ank-ingress/postgres` | Pool PostgreSQL, transaction theo request | `kernel`, `config`, `contracts`, `observability` | `pg` |
| `@ank-ingress/workers` | Worker thread cho việc nặng CPU, job runner | `kernel`, `config`, `contracts`, `observability`, `runtime` | — |
| `@ank-ingress/http` | Server HTTP trên uWebSockets.js | `kernel`, `config`, `contracts`, `observability`, `runtime` | `@sinclair/typebox`, `fast-json-stringify`, `uWebSockets.js` |
| `@ank-ingress/security` | JWT, xác thực Bearer, thu hồi token, RBAC, băm mật khẩu | `kernel`, `config`, `contracts`, `observability`, `runtime`, `workers` | `bcryptjs` |
| `@ank-ingress/cache` | Redis, khóa phân tán, pub/sub, rate limit | `kernel`, `config`, `contracts`, `observability`, `runtime` | `redis` |
| `@ank-ingress/messaging` | Kafka, outbox, consumer, DLQ | `kernel`, `config`, `contracts`, `observability`, `runtime` | `@sinclair/typebox`, `@confluentinc/kafka-javascript` |
| `@ank-ingress/storage` | Lưu object MinIO/S3 | `kernel`, `config`, `contracts`, `observability`, `runtime` | `minio` |
| `@ank-ingress/realtime` | WebSocket, SSE | `kernel`, `config`, `contracts`, `observability`, `runtime`, `http` | `uWebSockets.js` |
| `@ank-ingress/app` | `createApp`, `createRouter`, `createTestClient` | `kernel`, `config`, `contracts`, `observability`, `runtime`, `http` | `@sinclair/typebox` |
| `@ank-ingress/testing` | Bản giả trong bộ nhớ và contract suite cho store | `kernel`, `contracts` | — |

## Bắt đầu nhanh

```js
import { createApp } from '@ank-ingress/app';
import { Reply } from '@ank-ingress/contracts';

const app = createApp();
app.get('/hello', { access: 'public' }, () => Reply.json({ message: 'Xin chào' }));
app.listen(3000, (server) => console.log(`http://localhost:${server.port}/api/v1/hello`));
```

## Tài liệu

- [docs/usage.md](docs/usage.md): hướng dẫn sử dụng từng bước.
- [docs/api-reference.md](docs/api-reference.md): tham chiếu đầy đủ API của các gói.
- [docs/critical-rules.md](docs/critical-rules.md): quy tắc bắt buộc để không sập hay treo server, không hỏng kết nối database, không lộ dữ liệu. Đọc trước khi đưa code lên production.

Các đường dẫn `packages/…`, `examples/…`, `tools/…` và lệnh `npm run …` trong tài liệu thuộc repo mã nguồn của framework, không có trong bản phân phối này.

## Cập nhật phiên bản

Phiên bản nằm trong tên file. Khi có bản mới: chạy lại lệnh cài ở trên với số phiên bản mới (cài từ GitHub), hoặc thay file trong `vendor/ank-ingress/` rồi `npm install` lại (cài từ `vendor/`).
