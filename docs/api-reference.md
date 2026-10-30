# Tham chiếu API `@ank-ingress/*`

Tài liệu này liệt kê toàn bộ API công khai của 15 package, dành cho lập trình viên xây tầng ứng dụng bên trên framework: module nghiệp vụ, repository, các store cài đặt port, adapter, tiến trình worker và consumer. Mỗi export trong `tools/export-surface/baseline.json` đều xuất hiện ít nhất một lần ở đây.

- Mới bắt đầu thì đọc [usage.md](usage.md) trước. Tài liệu đó hướng dẫn từng bước, còn tài liệu này tra cứu chi tiết.
- Trước khi đưa code lên production, đọc [critical-rules.md](critical-rules.md): các quy tắc bắt buộc để không làm sập hay treo server, không làm hỏng kết nối database và không lộ dữ liệu.
- Bề mặt API đã được duyệt. Kiểm tra thay đổi bằng `node tools/export-surface.mjs check`.

## Cách đọc

- **Chữ ký** viết theo TypeScript. Ví dụ là JavaScript hợp lệ, nên dùng được trong cả file `.js` và `.ts`.
- **Kiểu dữ liệu** mà ứng dụng phải *cài đặt* (port, store) được mô tả đầy đủ từng trường, kèm các cam kết framework mong đợi.
- **Nội bộ**: export dành cho các package khác trong framework. Tầng ứng dụng không nên gọi trực tiếp vì chúng có thể đổi mà không báo trước.
- **Hai loại lỗi:**
  - `CompositionError` là lỗi cấu hình của lập trình viên, ném ra lúc khởi động (mã thoát `78`).
  - `AppError` là lỗi nghiệp vụ lúc chạy, có mã dạng `NHÓM-HTTP-LÝ_DO` và được chuyển thành HTTP response.
- **Generic `Tx` và `Access`:**
  - `Tx` là kiểu transaction mà stage `scope` đưa vào handler (với PostgreSQL là `Tx` của `@ank-ingress/postgres`).
  - `Access` là ngữ cảnh phân quyền do `ContextInitializer.open` trả về.
- **Framework không sở hữu database sản phẩm.** Bảng, migration, SQL và việc lưu idempotency, outbox, inbox, job đều do ứng dụng cài đặt qua các port trong `@ank-ingress/contracts`. Kiểm tra bản cài đặt bằng các contract suite trong `@ank-ingress/testing`.

## Bản đồ package

| Package | Lớp | Phụ thuộc nội bộ | Dùng khi |
| --- | --- | --- | --- |
| [`kernel`](#ank-ingresskernel) | 1 | — | Lỗi (`AppError`), ID, số thập phân, thời gian |
| [`config`](#ank-ingressconfig) | 2 | — | Đọc và kiểm tra biến môi trường, bí mật |
| [`contracts`](#ank-ingresscontracts) | 2 | kernel | Route, `Reply`, catalog, envelope sự kiện, job, **các port ứng dụng cài đặt** |
| [`observability`](#ank-ingressobservability) | 3 | — | Logger, metrics, trace, health server |
| [`runtime`](#ank-ingressruntime) | 4 | kernel, config, contracts, observability | `runApp`, vòng đời tiến trình, module theo role |
| [`postgres`](#ank-ingresspostgres) | 5 | kernel, config, contracts, observability | Pool, transaction theo request, `withTx`, phân loại lỗi DB |
| [`workers`](#ank-ingressworkers) | 5 | kernel, contracts, observability, runtime | Worker thread cho việc nặng CPU, job runner |
| [`http`](#ank-ingresshttp) | 6 | kernel, contracts, observability, runtime | Server HTTP trên uWebSockets.js, pipeline request, các stage |
| [`security`](#ank-ingresssecurity) | 6 | kernel, contracts, runtime, workers | JWT, xác thực Bearer, thu hồi token, RBAC, băm mật khẩu |
| [`cache`](#ank-ingresscache) | 6 | config, contracts, runtime | Redis, khóa phân tán, pub/sub, rate limit, LRU |
| [`messaging`](#ank-ingressmessaging) | 6 | kernel, contracts, observability, runtime | Kafka, outbox publisher, consumer runner, DLQ |
| [`storage`](#ank-ingressstorage) | 6 | kernel, config, contracts, runtime | Lưu object MinIO/S3 dạng stream, URL ký sẵn |
| [`realtime`](#ank-ingressrealtime) | 7 | kernel, contracts, observability, http | WebSocket, phát tin theo topic, SSE |
| [`app`](#ank-ingressapp) | 7 | kernel, contracts, observability, http | `createApp`, `createRouter`, `createTestClient` |
| [`testing`](#ank-ingresstesting) | 8 | contracts | Bản giả trong bộ nhớ và contract suite cho store |

Package lớp dưới không được import package lớp trên. Quy tắc này được kiểm tra tự động bởi `tests/architecture`.

## Ứng dụng thường gồm những gì

| Phần của ứng dụng | API dùng tới |
| --- | --- |
| Tiến trình HTTP | `runApp` → `setupInfra` (`createPgDatabase`, `createRedis`…) → `boot` (`createApp`, `app.add(...modules.routes)`, `app.inbound(...)`) |
| Module nghiệp vụ | `defineModule`, `contribution`, `defineRoute`, catalog (`permissions`, `errorCodes`, `events`, `dbErrorRules`) |
| Xác thực, phân quyền | `bearerAuth`, `JwtVerifier`, `createRevocationCache`, `createRequestScope` với `ContextInitializer` và `AccessPolicy` |
| Ghi DB kèm phát sự kiện | `OutboxStore` (ứng dụng cài đặt) → `createOutboxPublisher` |
| Tiêu thụ sự kiện | `ConsumerSpec`, `InboxStore`, `ConsumerReceiptStore` → `createConsumerRunner` |
| Job nền | `defineJob`, `JobStore` (ứng dụng cài đặt) → `createJobRunner` |
| Việc nặng CPU | `WorkerPool`, `WorkerTaskSpec` |
| File | `createObjectStore`, `objectReply`, `Reply.file` |
| Realtime | `mountSocket`, `createRealtimeHub`, `createSseChannel` |

## Mục lục

1. [`@ank-ingress/kernel`](#ank-ingresskernel)
   — Lỗi · Định danh · Số thập phân · Thời gian
2. [`@ank-ingress/config`](#ank-ingressconfig)
   — Khai báo trường · Parser · Nạp cấu hình
3. [`@ank-ingress/contracts`](#ank-ingresscontracts)
   — Route · Reply · Cookie · Catalog · Sự kiện · Job · Port ứng dụng phải cài đặt
4. [`@ank-ingress/observability`](#ank-ingressobservability)
   — Logger · Phạm vi log · Metrics · Health server · Traceparent
5. [`@ank-ingress/runtime`](#ank-ingressruntime)
   — Vòng đời tiến trình · Cấu hình runtime · Ngữ cảnh khởi động (`BootContext`) · Hệ module theo role · Inbound và theo dõi công việc đang chạy
6. [`@ank-ingress/postgres`](#ank-ingresspostgres)
   — Kết nối và pool · Transaction cho request · Transaction tự quản · Phân loại lỗi database
7. [`@ank-ingress/workers`](#ank-ingressworkers)
   — Worker pool cho việc nặng CPU · Job runner
8. [`@ank-ingress/http`](#ank-ingresshttp)
   — Tạo server HTTP · Vòng đời một request · Stage: xác thực, phân quyền, transaction, audit · Rate limit · CORS và header bảo mật · Phản hồi và lỗi · OpenAPI · Tiện ích thuần
9. [`@ank-ingress/security`](#ank-ingresssecurity)
   — Khóa JWT · Ký và kiểm tra JWT · Xác thực Bearer · Thu hồi token · Phân quyền · Mật khẩu
10. [`@ank-ingress/cache`](#ank-ingresscache)
   — Kết nối Redis · Script Lua · Khóa phân tán · Rate limit · Pub/Sub · Bộ nhớ đệm trong tiến trình
11. [`@ank-ingress/messaging`](#ank-ingressmessaging)
   — Kết nối Kafka · Phát sự kiện qua outbox · Tiêu thụ sự kiện · Vận hành consumer · Codec envelope · Client Kafka cấp thấp
12. [`@ank-ingress/storage`](#ank-ingressstorage)
   — Tạo kho lưu trữ · Đọc ghi object · URL ký sẵn · Checksum khi stream
13. [`@ank-ingress/realtime`](#ank-ingressrealtime)
   — WebSocket · Phát tin theo topic · Server-Sent Events
14. [`@ank-ingress/app`](#ank-ingressapp)
   — Tạo app · Router · Tùy chọn route · Kiểm thử
15. [`@ank-ingress/testing`](#ank-ingresstesting)
   — Quy ước transaction giả · Bản giả trong bộ nhớ · Contract suite cho store của ứng dụng

---

## `@ank-ingress/kernel`

Lớp lõi không I/O và không phụ thuộc gói nào khác của framework. Gói cung cấp lỗi chuẩn (`AppError`, `CompositionError`) và các kiểu có "nhãn" (branded) cho id, số thập phân, thời gian. Mọi tầng (handler, use case, repository, adapter) đều import trực tiếp; các hàm `parse*` dùng để kiểm tra dữ liệu ở biên trước khi đưa vào SQL.

### Lỗi

#### `new AppError(code: string, options?: AppErrorOptions)`

Lỗi nghiệp vụ có mã dạng `NHÓM-HTTP-LÝ_DO` (regex `^[A-Z][A-Z0-9]*-(\d{3})-[A-Z0-9_]+$`). Ba số ở giữa là HTTP status, và status đó phải nằm trong bảng dưới. Cách client nhận lỗi xem [usage.md, mục 7](usage.md#7-xử-lý-lỗi).

| Status | `category` |
| --- | --- |
| 400, 405, 422 | `VALIDATION` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413, 415 | `PAYLOAD` |
| 423 | `LOCKED` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL` |
| 503 | `UNAVAILABLE` |

Thuộc tính: `code`, `httpStatus`, `category`, `details` (mảng đã đóng băng, từng phần tử và `params` của nó cũng đóng băng), `params` (đóng băng), `message` (mặc định bằng `code`), `cause`, `name = 'AppError'`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `message` | `string` | `code` | Thông điệp nội bộ. Pipeline HTTP không gửi nó cho client; với lỗi ≥ 500 nó được ghi vào log (trường `detail`) |
| `details` | `readonly ErrorDetail[]` | `[]` | Gửi nguyên văn cho client trong trường `details` |
| `params` | `ErrorParams` | `{}` | Gửi nguyên văn cho client trong trường `params`. `retryAfterSeconds` thành header `Retry-After` cho 429/503 |
| `cause` | `unknown` | — | Truyền vào `Error.cause` |

Lỗi ném ra: `TypeError('Invalid error code format (expected <GROUP>-<HTTP>-<REASON>): …')` khi mã sai định dạng hoặc status không có trong bảng.

Thông điệp công khai do pipeline HTTP chọn: thông điệp đăng ký trong catalog nếu có. Nếu không có, khung dùng câu chung theo status cho 401, 403, 404, 409, 413, 415, 422, 429, 503. Các status còn lại (400, 405, 423, 500) dùng thông điệp của `COMMON-500-INTERNAL`. Vì vậy hãy đăng ký mã 400/405/423 của bạn trong catalog.

```js
import { AppError } from '@ank-ingress/kernel';

throw new AppError('ORDERS-409-ALREADY_PAID', {
  message: 'Order 42 already paid',          // chỉ vào log
  params: { orderId: 42 },                     // client thấy
});
```

#### `isAppError(value: unknown): value is AppError`

Kiểm tra bằng `instanceof AppError`.

#### `validationError(details: readonly ErrorDetail[], message?: string): AppError`

Tạo `AppError('COMMON-422-VALIDATION')` với `details` cho trước. `message` mặc định là `'Validation failed'`. Mọi hàm `parse*` của gói này ném lỗi qua hàm này.

#### `isValidErrorCodeFormat(code: string): boolean`

Trả `true` khi `code` đúng định dạng và status nằm trong bảng trên. `buildCatalogs` dùng hàm này để kiểm tra mã lỗi khai báo trong catalog.

#### `new CompositionError(message: string)`

Lỗi cấu hình phát hiện lúc khởi động/lắp ráp (route, catalog, module xung đột). Thuộc tính `exitCode = 78` (EX_CONFIG) để supervisor không khởi động lại liên tục; `name = 'CompositionError'`. Các hàm `define*`, `buildCatalogs`, `validateRoutePath` của `@ank-ingress/contracts` ném lỗi này.

### Định danh

Cả ba hàm `parse*` dưới đây ném `validationError([{ field?, code: 'COMMON-422-INVALID_ID' }])` khi dữ liệu không hợp lệ. `field` chỉ xuất hiện khi bạn truyền tham số `field`.

#### `parseIntId(input: unknown, field?: string): IntId`

Nhận chuỗi hoặc số. Chuỗi phải khớp `^[1-9]\d*$` (không có số 0 đứng đầu, không có dấu, không chấp nhận `0`) và giá trị ≤ `2147483647`. Trả về `number` mang nhãn `IntId`.

#### `parseBigIntId(input: unknown, field?: string): BigIntId`

Nhận chuỗi, hoặc số nếu là safe integer. Chuỗi phải khớp `^[1-9]\d*$`, dài tối đa 19 ký tự và ≤ `9223372036854775807`. Trả về **chuỗi** mang nhãn `BigIntId` để không mất chính xác khi vượt `Number.MAX_SAFE_INTEGER`.

#### `parseUuid(input: unknown, field?: string): Uuid`

Nhận chuỗi, chuyển về chữ thường, rồi kiểm tra dạng `8-4-4-4-12` hex. Hàm không kiểm tra version.

#### `newUuid(): Uuid`

`crypto.randomUUID()` (UUID version 4).

```js
import { parseBigIntId, parseUuid } from '@ank-ingress/kernel';

const orderId = parseBigIntId(req.params.id, 'id');      // '9007199254740993' vẫn đúng
const requestId = parseUuid(req.body.requestId, 'requestId');
```

### Số thập phân

Số thập phân được giữ ở dạng **chuỗi** đã chuẩn hóa (`DecimalString`) để đưa thẳng vào cột `numeric` mà không qua `number`.

#### `parseDecimal(input: unknown, kind: DecimalKind, options?: ParseDecimalOptions): DecimalString`

- `input` phải là chuỗi khớp `^-?(0|[1-9]\d*)(\.\d+)?$`: không có số 0 đứng đầu, không có `+`, không có số mũ, không viết `.5`. Số JSON (`1.5`) bị từ chối.
- Chuẩn hóa: bỏ các số 0 thừa ở phần thập phân (`'1.500'` → `'1.5'`, `'2.0'` → `'2'`) và đổi `-0` thành `'0'`.
- Sau khi bỏ số 0 thừa, phần thập phân phải ≤ `kind.maxScale` chữ số và phần nguyên ≤ `kind.maxIntegerDigits` chữ số.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `field` | `string` | — | Tên trường gắn vào `details[0].field` |
| `allowNegative` | `boolean` | `false` | Cho phép số âm (`-0` luôn được chấp nhận) |

Lỗi ném ra: `validationError` với `details[0].code = 'COMMON-422-INVALID_NUMBER'` và `params = { reason, maxScale, maxIntegerDigits }`. `reason` là một trong `NOT_A_STRING`, `FORMAT`, `SCALE`, `MAGNITUDE`, `NEGATIVE`.

#### `QUANTITY: DecimalKind`

`{ name: 'quantity', maxScale: 6, maxIntegerDigits: 14 }`, đã đóng băng.

#### `COEFFICIENT: DecimalKind`

`{ name: 'coefficient', maxScale: 15, maxIntegerDigits: 15 }`, đã đóng băng.

#### `parseQuantity(input: unknown, options?: ParseDecimalOptions): DecimalString`

Bằng `parseDecimal(input, QUANTITY, options)`.

#### `parseCoefficient(input: unknown, options?: ParseDecimalOptions): DecimalString`

Bằng `parseDecimal(input, COEFFICIENT, options)`.

```js
import { parseQuantity } from '@ank-ingress/kernel';

const qty = parseQuantity(req.body.quantity, { field: 'quantity' }); // '12.5'
await tx.query('UPDATE stock SET qty = qty - $1::numeric WHERE id = $2', [qty, id]);
```

### Thời gian

#### `toIsoTimestamp(date: Date): IsoTimestamp`

Trả về `date.toISOString()` (UTC, luôn có phần mili giây). Ném `RangeError('Timestamp requires a valid Date in calendar years 0001..9999')` khi `Date` không hợp lệ hoặc năm nằm ngoài 0001..9999. Đây là `RangeError`, không phải `AppError`, nên nếu lọt ra handler thì client nhận 500.

#### `parseIsoTimestamp(input: unknown, field?: string): IsoTimestamp`

Nhận chuỗi RFC 3339 đầy đủ: `YYYY-MM-DDTHH:mm:ss`, tùy chọn tối đa 3 chữ số phần giây, bắt buộc có `Z` hoặc độ lệch `±HH:MM`. Hàm kiểm tra ngày có thật trên lịch và giờ ≤ 23, phút/giây ≤ 59. Kết quả được chuẩn hóa về UTC qua `toIsoTimestamp`. Ném `validationError` với `code: 'COMMON-422-INVALID_TIMESTAMP'`.

#### `parseBusinessDate(input: unknown, field?: string): BusinessDate`

Nhận chuỗi `YYYY-MM-DD` là ngày có thật, năm 0001..9999. Trả lại đúng chuỗi đầu vào. Ném `validationError` với `code: 'COMMON-422-INVALID_DATE'`.

#### `isTimeZone(timeZone: string): boolean`

`true` nếu `Intl.DateTimeFormat` chấp nhận tên múi giờ (ví dụ `'Asia/Ho_Chi_Minh'`).

#### `businessDateInZone(instant: Date, timeZone: string): BusinessDate`

Ngày lịch Gregory (`YYYY-MM-DD`) của thời điểm `instant` tại múi giờ `timeZone`. Ném `RangeError` khi múi giờ không hợp lệ hoặc năm ngoài 0001..9999.

```js
import { businessDateInZone } from '@ank-ingress/kernel';

const today = businessDateInZone(new Date(), 'Asia/Ho_Chi_Minh'); // '2026-10-30'
```

### Kiểu dữ liệu

Các kiểu tầng trên tự tạo giá trị:

**`AppErrorOptions`**: xem bảng tùy chọn của `new AppError` ở trên.

**`ErrorDetail`**

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `field` | `string` (tùy chọn) | Tên trường bị lỗi |
| `code` | `string` | Mã lỗi chi tiết (ví dụ `'COMMON-422-INVALID_ID'`, không bắt buộc đúng định dạng `AppError`) |
| `params` | `ErrorParams` (tùy chọn) | Tham số hiển thị |

**`DecimalKind`**: tự tạo được để có loại số riêng.

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `name` | `string` | Tên gợi nhớ |
| `maxScale` | `number` | Số chữ số thập phân tối đa |
| `maxIntegerDigits` | `number` | Số chữ số phần nguyên tối đa |

**`ParseDecimalOptions`**: xem bảng tùy chọn của `parseDecimal`.

| Kiểu | Mô tả |
| --- | --- |
| `ErrorCategory` | `'VALIDATION' \| 'UNAUTHENTICATED' \| 'FORBIDDEN' \| 'NOT_FOUND' \| 'CONFLICT' \| 'PAYLOAD' \| 'LOCKED' \| 'RATE_LIMITED' \| 'UNAVAILABLE' \| 'INTERNAL'` |
| `ErrorParams` | `Readonly<Record<string, string \| number>>` |
| `IntId` | `number` mang nhãn, chỉ tạo qua `parseIntId` |
| `BigIntId` | `string` mang nhãn, chỉ tạo qua `parseBigIntId` |
| `Uuid` | `string` mang nhãn (chữ thường), tạo qua `parseUuid` / `newUuid` |
| `DecimalString` | `string` mang nhãn, đã chuẩn hóa, tạo qua `parseDecimal` |
| `IsoTimestamp` | `string` mang nhãn, ISO 8601 UTC |
| `BusinessDate` | `string` mang nhãn, `YYYY-MM-DD` |

### Nội bộ

Gói này không có export nội bộ: mọi export đều dành cho tầng trên.

---

## `@ank-ingress/config`

Đọc và kiểm tra biến môi trường theo một schema, **một lần lúc khởi động**, rồi tách giá trị bí mật khỏi bản dùng để ghi log. `runApp({ schema })` tự gọi `loadConfig` và in bản đã che (`redacted`) vào log `boot.config` (xem [usage.md, mục 12.2](usage.md#122-đầy-đủ-runapp)). Gọi trực tiếp khi tự quản lý vòng đời hoặc khi viết test.

### Khai báo trường

Một trường (`Field<T>`) gồm tên biến môi trường, cờ `secret` và hàm `read`. Với mọi hàm dưới đây, chuỗi rỗng được coi như không đặt biến.

#### `required<T>(env: string, parse: (raw: string) => T): Field<T>`

Bắt buộc có giá trị. Thiếu thì báo `missing`. Giá trị không phải secret nên **được in nguyên văn** trong `redacted`.

#### `optional<T>(env: string, parse: (raw: string) => T, fallback: T): Field<T>`

Thiếu thì dùng `fallback` (hàm `parse` không chạy với `fallback`).

#### `secret(env: string): Field<string>`

Trường bí mật dạng chuỗi. Thiếu thì báo `missing`. Giá trị đúng bằng `change-me` bị từ chối (`must not be placeholder change-me`). Có thể nạp từ file qua biến `<ENV>_FILE` (xem `loadConfig`).

#### `secretFile(env: string): Field<SecretHolder>`

Giống `secret` nhưng trả về `SecretHolder` để xoay vòng (rotate) khóa khi file thay đổi. Chỉ đọc lại được khi giá trị đến từ `<ENV>_FILE`. Nếu giá trị lấy từ chính biến `<ENV>`, `reload()` trả giá trị hiện tại còn `watch()` không làm gì.

- `current()`: giá trị hợp lệ mới nhất.
- `reload(): Promise<string>`: đọc lại file (bỏ một ký tự xuống dòng cuối). Nội dung rỗng hoặc `change-me` thì giữ giá trị cũ. **Lỗi đọc file làm Promise bị reject**, nên phải `await`/`catch`.
- `watch(): () => void`: theo dõi file bằng `fs.watch` (`persistent: false`, không giữ tiến trình sống). Mỗi lần file đổi thì đọc lại; lỗi đọc bị bỏ qua và giá trị cũ được giữ. Hàm trả về dùng để đóng watcher.

#### `optionalSecretFile(env: string): Field<SecretHolder | null>`

Như `secretFile`, nhưng trả `null` khi cả `<ENV>` lẫn `<ENV>_FILE` đều không đặt.

### Parser

Parser là hàm `(raw: string) => T`; muốn báo lỗi thì ném `Error`. Thông điệp lỗi trở thành một dòng trong `ConfigError.problems` (dạng `ENV: thông điệp`) và được `runApp` ghi vào log. **Đừng đưa giá trị thô vào thông điệp lỗi của parser tự viết.**

| Export | Kiểu | Hành vi |
| --- | --- | --- |
| `text` | `Parser<string>` | Trả nguyên chuỗi |
| `integer(min: number, max: number)` | `Parser<number>` | Khớp `^-?\d+$` và nằm trong `[min, max]`; lỗi `not an integer` / `out of range min..max` |
| `port` | `Parser<number>` | `integer(1, 65535)` |
| `boolean` | `Parser<boolean>` | `true`/`on`/`1` → `true`; `false`/`off`/`0` → `false`; khác thì lỗi `expected true/false or on/off` |
| `oneOf(values: readonly V[])` | `Parser<V>` | Giá trị phải thuộc danh sách; TypeScript suy ra kiểu hợp (`'a' \| 'b'`) |
| `absolutePath` | `Parser<string>` | Phải bắt đầu bằng `/` |
| `list(item: Parser<T>)` | `Parser<readonly T[]>` | Tách theo `,`, `trim`, bỏ phần tử rỗng, rồi áp `item` cho từng phần tử |

### Nạp cấu hình

#### `loadConfig<S extends Schema>(schema: S, options?: LoadOptions): LoadedConfig<S>`

Với từng khóa trong `schema`:

1. Đọc `raw = env[field.env]`.
2. Riêng trường `secret: true`: nếu `<ENV>_FILE` có giá trị thì đọc file đó (bỏ một ký tự xuống dòng cuối) làm `raw`. Đặt cả `<ENV>` lẫn `<ENV>_FILE` là lỗi `cannot set both …`. Không đọc được file thì báo `<ENV>_FILE: failed to read file`; thông báo không chứa đường dẫn. Trường không phải secret bỏ qua `<ENV>_FILE`.
3. Gọi `field.read(raw, { filePath })`. Lỗi được **gom lại** chứ không dừng ở lỗi đầu tiên.

Có lỗi thì ném `ConfigError` chứa toàn bộ danh sách. Không có lỗi thì trả về:

- `values`: giá trị đã parse, `Object.freeze` nông (secret ở dạng **rõ**, đừng log đối tượng này).
- `redacted`: khóa là **tên biến môi trường**. Secret thành `'[REDACTED]'`, mảng nối bằng `,`, giá trị khác qua `String(value)`.
- `hash`: SHA-256 (hex) của các cặp `[env, value]` không phải secret, sắp theo tên. Đổi secret không làm đổi `hash`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `env` | `Readonly<Record<string, string \| undefined>>` | `process.env` | Nguồn biến môi trường (truyền object khi test) |
| `readFile` | `(path: string) => string` | `readFileSync(path, 'utf8')` | Đọc file cho `<ENV>_FILE` |

```js
import { loadConfig, optional, required, secret, secretFile, port, text, list } from '@ank-ingress/config';

const { values, redacted, hash } = loadConfig({
  port: optional('PORT', port, 3000),
  dbHost: required('POSTGRES_HOST', text),
  dbPassword: secret('POSTGRES_PASSWORD'),           // hoặc POSTGRES_PASSWORD_FILE=/run/secrets/pg
  jwtKey: secretFile('JWT_PRIVATE_KEY'),
  origins: optional('CORS_ORIGINS', list(text), []),
});
// redacted: { PORT: '3000', POSTGRES_HOST: 'db', POSTGRES_PASSWORD: '[REDACTED]', … }
```

#### `new ConfigError(problems: readonly string[])`

`message = 'Invalid configuration: ' + problems.join('; ')`, `problems` (đã đóng băng), `exitCode = 78`, `name = 'ConfigError'`. `runApp` bắt lỗi này, ghi `boot.config_invalid` kèm `problems` rồi thoát với mã 78.

### Kiểu dữ liệu

**`Field<T>`**: tự tạo khi cần một kiểu trường riêng.

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `env` | `string` | Tên biến môi trường |
| `secret` | `boolean` | `true` thì giá trị bị che trong `redacted`, không tính vào `hash`, và được phép nạp từ `<ENV>_FILE` |
| `read` | `(raw: string \| undefined, ctx?: FieldReadContext) => T` | Ném `Error` để báo lỗi; `raw` là `undefined` khi biến không đặt |

**`SecretHolder`**: do `secretFile` tạo; tự cài đặt nếu muốn nguồn khác.

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `current` | `() => string` | Giá trị hiện tại, không chặn |
| `reload` | `() => Promise<string>` | Đọc lại nguồn, trả giá trị sau khi đọc |
| `watch` | `() => () => void` | Bắt đầu theo dõi; trả hàm hủy |

| Kiểu | Mô tả |
| --- | --- |
| `FieldReadContext` | `{ filePath?: string }`, có khi giá trị đọc từ `<ENV>_FILE` |
| `Schema` | `Readonly<Record<string, Field<unknown>>>` |
| `ConfigOf<S>` | Kiểu object giá trị suy ra từ schema |
| `LoadedConfig<S>` | `{ values: ConfigOf<S>; redacted: Readonly<Record<string, string>>; hash: string }` |
| `LoadOptions` | Tùy chọn của `loadConfig` |

### Nội bộ

Gói này không có export nội bộ.

---

## `@ank-ingress/contracts`

Hợp đồng chung giữa module của ứng dụng và adapter của framework: khai báo route và `Reply`, catalog (mã lỗi, quyền, sự kiện, quy tắc lỗi DB), phong bì sự kiện, job, và **các port**, tức interface mà ứng dụng tự cài đặt bằng SQL và hạ tầng của mình. Gói chỉ phụ thuộc `@ank-ingress/kernel` và `@sinclair/typebox`; ngoài `Reply.file` thì không có I/O. Module, repository và adapter của ứng dụng đều import từ đây.

### Route

Cách khai báo route, đọc `req` và dùng `scope` xem [usage.md, mục 4.4](usage.md#44-route-viết-sẵn-bằng-defineroute), [mục 5](usage.md#5-đọc-request) và [mục 10](usage.md#10-dùng-postgresql). Phần dưới chỉ liệt kê chữ ký và ràng buộc.

#### `defineRoute(spec: RouteSpec): RouteSpec`

Kiểm tra spec rồi trả bản đóng băng, điền sẵn `tx` và `responseKind` mặc định. Ném `CompositionError` khi:

- `path` sai quy tắc (xem `validateRoutePath` trong mục Nội bộ);
- `access.kind === 'permission'` nhưng `code` không khớp `PERMISSION_CODE_FORMAT` (`a:b(:c)*`);
- `etag` trên method khác `GET`;
- `rateLimit.limit` hoặc `rateLimit.windowMs` không phải số nguyên ≥ 1; `rateLimit.key: 'identity'` trên route `public`;
- `bodyFormat: 'multipart'` mà có `body`, method khác POST/PUT/PATCH, hoặc `tx` khác `'none'`;
- có `multipart` mà không có `bodyFormat: 'multipart'`; có `bodyFormat` (khác multipart) mà không có `body`;
- `idempotent` trên route `public`, khi `tx` khác `'write'`, hoặc đi cùng `responseKind: 'stream'`;
- `audit` trên route `public`.

Khi đăng ký vào app, khung kiểm tra thêm (cũng ném `CompositionError`): quyền phải có trong catalog, phải có stage `auth`/`scope`/`authorize`/`rateLimit` tương ứng, và `audit` cần hook `onAudit`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `method` | `HttpMethod` | — | `GET \| POST \| PUT \| PATCH \| DELETE` |
| `path` | `string` | — | Đường dẫn đầy đủ, bắt đầu bằng `/api/v{n}` |
| `access` | `Access` | — | `{ kind: 'public' }`, `{ kind: 'authenticated' }`, `{ kind: 'permission', code, scopeParam? }` |
| `params`, `query`, `body` | `TSchema` | — | Schema TypeBox; xem [usage.md, mục 5.1](usage.md#51-params-query-body-có-kiểm-tra-dữ-liệu) |
| `bodyFormat` | `BodyFormat` | `'json'` | `json \| urlencoded \| text \| multipart` |
| `multipart` | `MultipartLimits` | `maxParts` 100, `maxFieldBytes` 65 536, `maxHeaderBytes` 8 192 | Giới hạn upload |
| `cookies` | `boolean` | `false` | Điền `req.cookies` |
| `hostInfo` | `boolean` | `false` | Điền `req.protocol`, `req.secure`, `req.hostname` |
| `etag` | `boolean` | `false` | Chỉ GET; ETag yếu và trả 304 |
| `rateLimit` | `RouteRateLimit` | — | Cần `RateLimitStore` trên app |
| `response` | `TSchema` | — | Với reply JSON, body được ghi bằng serializer biên dịch từ schema: **chỉ các trường khai báo trong schema được gửi đi** |
| `responseKind` | `ResponseKind` | `'json'` | `json \| empty \| stream` |
| `headers` | `readonly string[]` | `[]` | Header cần đọc thêm (khung đổi về chữ thường) |
| `tx` | `'none' \| 'read' \| 'write'` | `public` → `none`; `GET` → `read`; còn lại → `write` | Chế độ transaction |
| `idempotent` | `'required' \| 'optional'` | — | Dùng `IdempotencyStore` |
| `timeoutMs` | `number` | `limits.defaultTimeoutMs` của app (15 000) | Deadline của request |
| `maxBodyBytes` | `number` | `limits.defaultMaxBodyBytes` của app (1 048 576) | Giới hạn body |
| `audit` | `{ action, resourceType, objectIdParam? }` | — | Gọi `onAudit` trong cùng transaction |
| `handle` | `(req: RequestOf, scope: ScopeOf) => Reply \| Promise<Reply>` | — | Handler |

### Reply

Ví dụ và giải thích xem [usage.md, mục 6](usage.md#6-trả-response). `Reply` vừa là object hàm dựng (đã đóng băng) vừa là kiểu hợp `JsonReply | TextReply | StreamReply | EmptyReply`.

#### `Reply.json(data: unknown, options?: { status?: number; headers?: ReplyHeaders }): JsonReply`

Không có `status` thì khung gửi 200.

#### `Reply.text(body: string, options?: { status?: number; headers?: ReplyHeaders; contentType?: string }): TextReply`

`contentType` mặc định `'text/plain; charset=utf-8'`.

#### `Reply.html(body: string, options?: { status?: number; headers?: ReplyHeaders }): TextReply`

`contentType = 'text/html; charset=utf-8'`.

#### `Reply.stream(body: Readable, options: { contentType: string; size?: number; status?: number; headers?: ReplyHeaders }): StreamReply`

`contentType` là bắt buộc. `size` là độ dài nếu biết trước.

#### `Reply.file(path: string, options?: FileReplyOptions): Promise<StreamReply>`

Mở file thường rồi trả `StreamReply` kèm `size`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `root` | `string` | — | Ghép `path` vào thư mục này; từ chối đường dẫn thoát ra ngoài |
| `download` | `boolean \| string` | — | Thêm `Content-Disposition: attachment`; chuỗi thay tên file |
| `contentType` | `string` | Đoán theo đuôi file (`.csv .css .gif .htm(l) .jp(e)g .js .json .md .pdf .png .svg .txt .webp .xlsx .xml .zip`), còn lại `application/octet-stream` | |
| `status` | `number` | 200 | |
| `headers` | `ReplyHeaders` | — | |

Lỗi ném ra: `AppError('COMMON-403-FORBIDDEN')` khi `path` chứa `\0` hoặc thoát khỏi `root`. Phép kiểm tra này chỉ so chuỗi sau `path.resolve`; **symlink không được giải**. Ném `TypeError` khi không có `root` mà `path` không tuyệt đối. Ném `AppError('COMMON-404-NOT_FOUND')` khi file không tồn tại (`ENOENT`, `ENOTDIR`, `EISDIR`) hoặc không phải file thường. Lỗi hệ thống tệp khác (ví dụ `EACCES`) được ném lại nguyên trạng, nên client nhận 500.

#### `Reply.empty(status?: 204 | 202, headers?: ReplyHeaders): EmptyReply`

`status` mặc định 204.

#### `Reply.redirect(location: string, status?: RedirectStatus, headers?: ReplyHeaders): EmptyReply`

`status` mặc định 302; header `location` ghi đè header cùng tên trong `headers`. Ném `TypeError` khi `location` rỗng hoặc chứa CR, LF, NUL. Hàm không kiểm tra `location` có trỏ ra domain ngoài hay không.

#### `contentDisposition(filename: string): string`

Giá trị `attachment; filename="<ASCII>"; filename*=UTF-8''<mã hóa RFC 5987>`. Ký tự ngoài ASCII in được, `"` và `\` trong phần ASCII bị thay bằng `_`. Dùng khi tự trả `Reply.stream` để tải xuống.

### Cookie

#### `serializeCookie(name: string, value: string, options?: CookieOptions): string`

Tạo một giá trị `Set-Cookie`. `value` được `encodeURIComponent`. Ví dụ xem [usage.md, mục 6](usage.md#6-trả-response).

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `maxAgeSeconds` | `number` | — | `Max-Age` (làm tròn xuống) |
| `expires` | `Date` | — | `Expires` (`toUTCString()`) |
| `path` | `string` | `'/'` | |
| `domain` | `string` | — | |
| `secure` | `boolean` | `false` | |
| `httpOnly` | `boolean` | `true` | |
| `sameSite` | `'strict' \| 'lax' \| 'none'` | `'lax'` | `'none'` bắt buộc `secure` |
| `partitioned` | `boolean` | `false` | CHIPS; bắt buộc `secure` |

Lỗi ném ra: `TypeError` khi tên không phải token RFC 6265; khi `path`/`domain` chứa ký tự điều khiển hoặc `;`; khi `sameSite: 'none'` hay `partitioned` thiếu `secure`.

#### `clearCookie(name: string, options?: Omit<CookieOptions, 'maxAgeSeconds' | 'expires'>): string`

Cookie rỗng với `Max-Age=0` và `Expires` = epoch. Phải truyền đúng `path`/`domain` đã dùng khi đặt cookie.

### Catalog

#### `buildCatalogs(contribs: readonly OwnedContribution[]): Catalogs`

Gộp các `CatalogContribution` của nhiều module (`owner` là tên module, dùng trong thông báo lỗi) thành một catalog đã đóng băng. Ném `CompositionError` khi:

- mã lỗi sai định dạng (`isValidErrorCodeFormat`) hoặc bị hai owner cùng khai báo;
- mã quyền không khớp `PERMISSION_CODE_FORMAT` hoặc trùng;
- loại sự kiện không khớp `EVENT_TYPE_FORMAT` hoặc trùng;
- `DbErrorRule` không có cả `sqlstate` lẫn `constraint`, hoặc trùng cặp `(sqlstate, constraint)`.

`buildCatalogs` **không** kiểm tra định dạng `DbErrorRule.code`. Nếu mã sai, `new AppError(code)` sẽ ném `TypeError` đúng lúc ánh xạ lỗi DB.

Catalog trả về:

| Thành phần | Hành vi |
| --- | --- |
| `errors.message(code)` | Thông điệp công khai của mã. Không có thì trả thông điệp của `COMMON-500-INTERNAL`, hoặc `'Internal server error'` |
| `errors.has(code)`, `errors.entries()` | Tra cứu / liệt kê |
| `permissions.get(code)`, `permissions.entries()` | `PermissionSpec` đã đóng băng |
| `events.spec(type)`, `events.entries()` | `EventSpec` |
| `dbErrors.resolve(sqlstate, constraint)` | Thứ tự ưu tiên: luật có cả `sqlstate` và `constraint` → luật chỉ `constraint` → luật chỉ `sqlstate`. Adapter PostgreSQL dùng kết quả để đổi lỗi driver thành `AppError`; `retryable: true` cho phép `withTx` chạy lại cả transaction |
| `dbErrors.rules()` | Danh sách luật |

```js
import { buildCatalogs } from '@ank-ingress/contracts';

const catalogs = buildCatalogs([
  {
    owner: 'orders',
    c: {
      errorCodes: { 'ORDERS-409-DUPLICATE': { message: 'Đơn hàng đã tồn tại' } },
      permissions: { 'orders:write': { kind: 'write', roles: ['SALES'] } },
      dbErrorRules: [{ match: { sqlstate: '23505', constraint: 'orders_code_key' }, code: 'ORDERS-409-DUPLICATE' }],
    },
  },
]);
```

### Sự kiện

#### `createEnvelope<T>(input: CreateEnvelopeInput<T>): EventEnvelope<T>`

Tạo phong bì sự kiện đã đóng băng (nông). `id` mặc định `newUuid()`. `occurredAt` dạng chuỗi được giữ nguyên **không kiểm tra**; dạng `Date` thì qua `toIsoTimestamp` (có thể ném `RangeError`); không truyền thì lấy thời điểm hiện tại. `sequence`/`traceparent` chỉ có mặt khi được truyền.

#### `upcastEnvelope<T = unknown>(envelope: EventEnvelope, spec: EventSpec): EventEnvelope<T>`

Nâng payload từ `envelope.version` lên `spec.version` bằng cách gọi `spec.upcast(v, payload)` lần lượt cho từng version còn thiếu, rồi trả phong bì mới. Phong bì được trả nguyên trạng khi version bằng nhau, khi version của phong bì **mới hơn** spec, hoặc khi spec không có `upcast`. Lỗi từ `upcast` được ném ra ngoài.

### Job

#### `defineJob<P extends TSchema, R = unknown>(spec: JobSpec<P, R>): JobSpec<P, R>`

Kiểm tra `spec.name` khớp `^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$` (ví dụ `reports.export`), sai thì ném `CompositionError('Invalid job name …')`. Trả bản sao đóng băng.

```js
import { Type } from '@sinclair/typebox';
import { defineJob } from '@ank-ingress/contracts';

export const exportReport = defineJob({ name: 'reports.export', payload: Type.Object({ reportId: Type.String() }), timeoutMs: 60_000 });
```

### Port ứng dụng phải cài đặt

Framework không sở hữu database. Các interface dưới đây do ứng dụng cài đặt bằng SQL/hạ tầng của mình rồi truyền vào factory của framework. Tham số kiểu `Tx` là kiểu transaction của adapter; với `@ank-ingress/postgres` đó là `Tx` có `tx.query(...)`. **Port nào nhận `tx` thì phải chạy câu lệnh trên chính `tx` đó**, không được mượn connection khác.

| Port | Ai gọi | Nhận `tx` | Bản giả / cài đặt sẵn | Bộ contract test |
| --- | --- | --- | --- | --- |
| `ContextInitializer<Tx, Access>` | `createRequestScope` (`@ank-ingress/postgres`) | có | — | — |
| `AccessPolicy<Access>` | `createRequestScope`, `createClaimsAuthorizer` | không | `createClaimsPolicy`, `createRbacPolicy` (`@ank-ingress/security`) | — |
| `RevocationSource<Tx>` | `createRevocationCache` (`@ank-ingress/security`) | tùy lời gọi | — | — |
| `IdempotencyStore<Tx>` | `createRequestScope` cho route `idempotent` | có | `InMemoryIdempotencyStore` | `runIdempotencyStoreContractSuite` |
| `RateLimitStore` | Pipeline HTTP (route `rateLimit`) | không | `createMemoryRateLimitStore` (`@ank-ingress/http`), `createRedisRateLimitStore` (`@ank-ingress/cache`) | — |
| `OutboxStore` | `createOutboxPublisher` (`@ank-ingress/messaging`) | không | `InMemoryOutboxStore` | `runOutboxInboxContractSuite` |
| `InboxStore<Tx>` | `createConsumerRunner`, `createConsumerOperations` | có | `InMemoryInboxStore` | `runOutboxInboxContractSuite` |
| `ConsumerReceiptStore<Tx>` | `createConsumerRunner` (tùy chọn `receiptStore`), `createConsumerOperations` | một số method | `InMemoryConsumerReceiptStore` | — |
| `JobStore` | `createJobRunner` (`@ank-ingress/workers`) | không | — | — |
| `HousekeepingStore` | `createJobRunner` (tùy chọn `housekeeping`) | không | — | — |
| `PubSub` | `createRealtimeHub` (`@ank-ingress/realtime`); bus của `createRevocationCache` | không | `createPubSubBus` (`@ank-ingress/cache`) | — |

Các bản giả `InMemory*` và bộ contract test nằm trong `@ank-ingress/testing` (`packages/testing`). Bản giả `InMemoryInboxStore` và `InMemoryConsumerReceiptStore` mô phỏng rollback qua mảng `tx.onRollback`; `InMemoryInboxStore.withTx(fn)` tạo sẵn một `tx` như vậy.

#### `ContextInitializer<Tx, Access>`

Chạy ở đầu **mỗi** transaction của request có `tx: 'read' | 'write'` (và ở stage `authorize` của `createRequestScope`). Hàm biến `Identity` thành `Access`, giá trị mà `AccessPolicy` kiểm tra và handler nhận qua `scope.access`.

**`open(tx: Tx, identity: Identity, statementTimeoutMs: number, options?: ContextInitializerOptions): Promise<Access>`**

- `createRequestScope` mở transaction với `hasCustomInitTimeout: true`, nên **khung không tự đặt `statement_timeout`**. Câu lệnh đầu tiên mà `open` gửi lên `tx` phải là `SELECT set_config('statement_timeout', $1, true)` với `String(statementTimeoutMs)`. Gửi nó trước mọi `await` khác, vì trên route idempotent `open` chạy song song với `IdempotencyStore.claim` trên cùng `tx`.
- `statementTimeoutMs` là thời gian còn lại tới deadline trừ 25 ms (tối thiểu 10). Trên route idempotent, khung tự nâng `statement_timeout` trước khi chạy handler nếu thời gian ân hạn dài hơn.
- Mọi biến phiên phải đặt bằng `set_config(…, true)` (chỉ có hiệu lực trong transaction), vì connection quay lại pool sau request.
- `options.readOnly` là `true` với transaction chỉ đọc (`BEGIN … READ ONLY`).
- `identity.tenantId` có thể đến từ header `X-Tenant-Id` khi token không có `tid` (`claims.tid === null`); `bearerAuth` chỉ đối chiếu header với `tid` khi token có `tid`. Kiểm tra tư cách thành viên tenant thuộc về `open`.
- Khi `identity.revocationDeferred` là `true`, kiểm tra thu hồi token chạy trên cùng `tx` **trước** `open`.
- `withTx` có thể chạy lại cả transaction (tối đa 3 lần) khi gặp lỗi DB được xếp là `retryable` (ví dụ `40001`, `40P01`), nên `open` có thể chạy nhiều lần cho một request.
- Ném `AppError` (ví dụ 403) để từ chối; transaction bị rollback.

**`afterReadCommit?(tx: Tx, identity: Identity, access: Access, statementTimeoutMs: number): Promise<void>`**

Chỉ chạy cho scope chỉ đọc (stage `authorize` và route `tx: 'read'`), **sau** `COMMIT`, trên cùng connection, trước khi trả connection về pool. Lúc này không còn transaction, nên `set_config(…, true)` không có tác dụng. `statementTimeoutMs` là thời gian còn lại tới deadline (tối thiểu 1). Nếu hàm ném lỗi, connection bị hủy (không trả về pool) và request thất bại với `AggregateError('Post-commit action failed')`.

```js
import { AppError } from '@ank-ingress/kernel';

/** @type {import('@ank-ingress/contracts').ContextInitializer<import('@ank-ingress/postgres').Tx, { tenantId: number | null, roles: string[] }>} */
const initializer = {
  async open(tx, identity, statementTimeoutMs) {
    // Câu đầu tiên: timeout và biến phiên, đều LOCAL trong transaction.
    await tx.query("SELECT set_config('statement_timeout', $1, true), set_config('app.tenant_id', $2, true)", [
      String(statementTimeoutMs),
      identity.tenantId === null ? '' : String(identity.tenantId),
    ]);
    if (identity.tenantId === null) return { tenantId: null, roles: [] };
    // Bảng memberships là của ứng dụng; khung không biết tới nó.
    const { rows } = await tx.query('SELECT role FROM memberships WHERE account_id = $1 AND tenant_id = $2', [
      identity.accountId,
      identity.tenantId,
    ]);
    if (rows.length === 0) throw new AppError('COMMON-403-FORBIDDEN', { message: 'Not a member of tenant' });
    return { tenantId: identity.tenantId, roles: rows.map((r) => r.role) };
  },
};
```

#### `AccessPolicy<Access>`

**`authorize(access: Access, permission: PermissionSpec | null | undefined, scope: { readonly param?: string | number }): void`**

- **Đồng bộ.** Khung gọi hàm này mà không `await` và không đọc giá trị trả về. Muốn từ chối thì `throw` (thường là `AppError('COMMON-403-FORBIDDEN')`). Một hàm `async` trả Promise bị reject sẽ **không** chặn được request.
- `permission` là `null` với route `authenticated` (không cần quyền); khi đó nên cho qua.
- `scope.param` là giá trị của `access.scopeParam`, lấy theo thứ tự `params` → `body` → `query`, nên đây là dữ liệu từ client.
- Cài đặt sẵn: `createRbacPolicy(adapter)` (từ chối khi `permission` không phải object có `roles`; so role; `kind: 'write'` cần `adapter.writable`) và `createClaimsPolicy()` (đọc `claims.roles` của token).

#### `RevocationSource<Tx = unknown>`

**`load(claims: TokenClaims, signal: AbortSignal, tx?: Tx): Promise<RevocationState>`**

Trả trạng thái thu hồi của token. `createRevocationCache` gọi hàm này theo hai cách:

- Không có `tx` (stage `auth`): các request cùng `jti` dùng chung một lần tải. Lần tải bị hủy sau `loadTimeoutMs` (mặc định 2 000 ms); kết quả được cache trong `ttlMs` (mặc định 5 000 ms), tối đa `max` (mặc định 100 000) mục.
- Có `tx` (thu hồi hoãn vào transaction đọc của request): chạy trên `tx` của request, **trước** `ContextInitializer.open`, nên lúc đó `statement_timeout` của bạn chưa được đặt. `signal` gộp tín hiệu của request với `loadTimeoutMs`.

`signal` bị abort thì Promise của cache reject ngay, còn câu lệnh của bạn vẫn chạy; hãy truyền `signal` vào truy vấn nếu driver hỗ trợ. Lỗi từ `load` làm request thất bại (fail-closed). Cách khung diễn giải kết quả:

| Trạng thái | Lỗi |
| --- | --- |
| `accountDisabled` | `AUTH-403-ACCOUNT_DISABLED` |
| `tokenRevoked` hoặc `sessionRevoked` | `AUTH-401-SESSION_EXPIRED` |
| `tokensValidAfterSec !== null && claims.iat < tokensValidAfterSec` | `AUTH-401-SESSION_EXPIRED` |

#### `IdempotencyStore<Tx>`

Dùng cho route `idempotent` khi client gửi khóa idempotency. Khung tự dựng `IdempotencyKey`: `tenantId` và `accountId` lấy từ `Identity`; `operation` = `` `${METHOD} ${đường dẫn thực}` ``; `key` = giá trị header; `requestHash` = băm của method, đường dẫn, query thô và body thô. **Khung không đặt `ttlSeconds`**, nên store tự chọn mặc định (bản giả dùng 86 400 giây).

**`claim(tx: Tx, key: IdempotencyKey): Promise<IdempotencyClaimResult>`**

Chạy trong transaction ghi của request, song song với `ContextInitializer.open` trên cùng `tx`.

| Kết quả | Khi nào | Khung xử lý |
| --- | --- | --- |
| `{ kind: 'fresh' }` | Chưa có bản ghi còn hạn cho `(tenantId, accountId, operation, key)`; store ghi một bản ghi PENDING kèm `requestHash` | Chạy handler |
| `{ kind: 'replay', result }` | Đã hoàn tất với cùng `requestHash` | Trả lại kết quả đã lưu, thêm header `x-idempotent-replay: true` và `idempotent-replayed: true`; handler không chạy |
| `{ kind: 'mismatch' }` | Khóa còn hạn nhưng `requestHash` khác | `409 COMMON-409-IDEMPOTENCY_MISMATCH` |
| `{ kind: 'pending' }` | Cùng hash nhưng chưa có kết quả | `409 COMMON-409-IDEMPOTENCY_IN_PROGRESS` |

Bản ghi PENDING phải được ghi qua `tx`. Handler ném lỗi thì transaction rollback và bản ghi biến mất, nên lần thử lại nhận `fresh`. Bản ghi hết hạn được coi như không tồn tại.

**`save(tx: Tx, key: IdempotencyKey, result: StoredResult): Promise<void>`**

Gọi trên cùng `tx`, sau handler và trước `COMMIT`. Với reply JSON: `{ status: reply.status ?? 200, body, kind: 'json', headers? }`, trong đó `body` là `reply.data` sau một vòng `JSON.stringify`/`JSON.parse` (chưa lọc theo schema `response`). Với reply rỗng: `{ status: reply.status ?? 204, body: null, kind: 'empty', headers? }`. `headers` là header của reply, có thể gồm `set-cookie`. Reply `text` khiến khung ném `COMMON-500-INTERNAL` trước khi lưu.

Bộ contract test: `runIdempotencyStoreContractSuite(t, createFixture)` (gọi trong một `test`). Bộ test kiểm tra lần lượt: `fresh` → `pending` (sau khi transaction claim đã commit) → `replay` sau `save` → `mismatch`. Nếu fixture có `advanceTimeMs` thì kiểm tra thêm `fresh` sau khi hết `ttlSeconds`. Kết quả `replay` được so bằng `deepStrictEqual` với `{ status, body }`, nên **đừng trả thêm khóa có giá trị `undefined`**.

```js
import { test } from 'node:test';
import { withTx } from '@ank-ingress/postgres';
import { runIdempotencyStoreContractSuite } from '@ank-ingress/testing';
import { db, createPgIdempotencyStore } from '../src/adapters/postgres/idempotency.js';

test('IdempotencyStore PostgreSQL', async (t) => {
  await runIdempotencyStoreContractSuite(t, async () => ({
    store: createPgIdempotencyStore(),
    withTx: (fn) => withTx(db, { deadlineAt: Date.now() + 5_000, signal: AbortSignal.timeout(5_000) }, (tx) => fn(tx)),
  }));
});
```

#### `RateLimitStore`

**`consume(request: RateLimitRequest): Promise<RateLimitDecision>`**

Tăng bộ đếm cửa sổ cố định cho khóa `(bucket, windowMs, subject)` rồi trả quyết định. Khung gọi hàm này với:

- `bucket = route.rateLimit.bucket ?? 'METHOD path'`;
- `subject` = IP client (`'unknown'` khi không xác định được), kiểm tra **trước** xác thực, hoặc `` `${tenantId ?? ''}:${accountId}` `` khi `key: 'identity'`, kiểm tra sau xác thực.

`allowed: false` thành `429 COMMON-429-RATE_LIMITED` với `Retry-After = max(1, ceil(retryAfterMs / 1000))`. Khung `await` lời gọi mà không đặt timeout riêng; lỗi từ `consume` làm request thất bại (không có fail-open). Chạy nhiều instance thì bộ đếm phải dùng chung và tăng nguyên tử (bản Redis dùng một script `INCR` + `PEXPIRE`).

#### `OutboxStore`

Port này **không có hàm ghi**. Ứng dụng tự `INSERT` bản ghi outbox trong cùng transaction với thay đổi nghiệp vụ; `InMemoryOutboxStore.enqueue` chỉ là tiện ích cho test. `createOutboxPublisher` đọc, gửi lên broker, rồi đánh dấu. Giao hàng **ít nhất một lần**: nếu đánh dấu thất bại sau khi broker đã nhận, bản ghi sẽ được gửi lại, và phía consumer khử trùng bằng `InboxStore`.

Mặc định của publisher: `maxShards` 64, `leaseTtlMs` 15 000, `batchSize` 1 000, `pollIntervalMs` 100, `maxBackoffMs` 5 000, `deliveryTimeoutMs` 10 000, `maxAttempts` 10.

| Method | Ngữ nghĩa khung mong đợi |
| --- | --- |
| `lease(owner, maxShards, ttlMs): Promise<ShardLease[]>` | Giành tối đa `maxShards` shard chưa ai giữ, đã hết hạn, hoặc đang do chính `owner` giữ. Mỗi lease có `fencingToken` **tăng đơn điệu** (bộ contract test so sánh token của hai lần lease) và `expiresAt = now + ttlMs`. Bản giả ưu tiên shard có việc |
| `fetch(lease, limit): Promise<OutboxRecord[]>` | Bản ghi đang chờ của shard, chỉ khi lease còn hiệu lực (token khớp, chưa hết hạn). Bản giả chỉ trả **phần tử đầu** (sequence nhỏ nhất chưa publish) của mỗi aggregate, theo thứ tự chèn, nên thứ tự trong một aggregate được giữ |
| `fetchBatch?(leases, limit)` | Như `fetch` cho nhiều lease trong một lần gọi; có thì publisher dùng thay `fetch` |
| `markPublished(lease, recordIds): Promise<boolean>` | Gọi sau khi broker xác nhận. Trả `false` khi fencing token đã cũ hoặc lease hết hạn (bộ contract test kiểm tra điều này); publisher chỉ ghi log cảnh báo |
| `markPublishedBatch?(entries): Promise<number>` | Như trên cho nhiều shard; trả số bản ghi đã đánh dấu |
| `markFailed(lease, recordId, error, dead): Promise<boolean>` | Tăng `attempts`, lưu `error` (chuỗi `message` của lỗi broker). `dead = attempts + 1 >= maxAttempts`: bản ghi chuyển sang trạng thái cuối. Trong bản giả, bản ghi DEAD vẫn đứng đầu aggregate nên **chặn** các sự kiện sau của cùng aggregate |
| `renew?(lease, ttlMs)`, `renewBatch?(leases, ttlMs)` | Gọi mỗi `max(25, ttlMs/3)` ms trong lúc xử lý một lượt; lỗi chỉ được ghi log |
| `release?(lease)`, `releaseBatch?(leases)` | Trả shard khi hết việc hoặc khi dừng; lỗi bị bỏ qua |

Các trường của `OutboxRecord` ở mục Kiểu dữ liệu. Publisher dùng `recordId` cho mọi lời gọi `mark*` và dùng `eventId` làm `id` của phong bì.

#### `InboxStore<Tx>`

**`record(tx: Tx, consumer: string, eventId: string): Promise<boolean>`**

Ghi cặp `(consumer, eventId)` **trong transaction của handler**. Trả `true` nếu vừa ghi mới (khung chạy handler), `false` nếu đã có (khung bỏ qua). `consumer` là `ConsumerSpec.name`. Ghi qua `tx` là điều kiện bắt buộc: handler lỗi thì rollback xóa dấu, nên lần thử lại vẫn xử lý sự kiện.

**`recordBatch?(tx: Tx, entries: readonly { consumer: string; eventId: string }[]): Promise<readonly boolean[]>`**

Mảng kết quả phải cùng độ dài và thứ tự với `entries`. Đường xử lý theo lô chỉ bật khi có cả `recordBatch` lẫn `prepareBatchInTx`/`markProcessedBatchInTx` của `ConsumerReceiptStore`.

Thời gian giữ inbox phải lớn hơn cửa sổ replay (cả `createJobRunner` khi bật housekeeping lẫn `createConsumerOperations` đều kiểm tra) và lớn hơn thời gian giữ outbox (`createJobRunner` kiểm tra). Vi phạm thì ném `CompositionError`. Mặc định: inbox 14 ngày, replay 7 ngày, outbox 7 ngày.

Bộ contract test: `runOutboxInboxContractSuite({ name, withTx, createInbox, createOutbox })` đăng ký hai `test` ở cấp module. Bài thứ nhất kiểm tra inbox khử trùng theo `(consumer, eventId)`. Bài thứ hai kiểm tra fencing của `markPublished`: lease 10 ms, chờ 25 ms, `owner` khác giành lại với token lớn hơn.

```js
import { runOutboxInboxContractSuite } from '@ank-ingress/testing';
import { withTestTx, createPgInbox, createPgOutbox, seedOutbox } from './pg-fixtures.js';

runOutboxInboxContractSuite({
  name: 'PostgreSQL outbox/inbox',
  withTx: withTestTx,
  createInbox: () => createPgInbox(),
  createOutbox: () => ({ store: createPgOutbox(), seed: seedOutbox }),
});
```

#### `ConsumerReceiptStore<Tx = unknown>`

Sổ biên nhận theo từng tọa độ Kafka `(consumerGroup, topic, partition, offset)`. Sổ cho phép chặn theo aggregate: một sự kiện lỗi vĩnh viễn chặn các sự kiện sau cùng aggregate cho tới khi người vận hành `retry`/`skip`/`resume` qua `createConsumerOperations`. Nhóm method **trong transaction** dùng `tx` của handler. Nhóm **ngoài transaction** tự quản lý connection, và một số được khung thử lại khi lỗi tạm thời, nên phải là upsert idempotent theo tọa độ.

| Method | Trong `tx` | Ngữ nghĩa (theo bản giả `InMemoryConsumerReceiptStore`) |
| --- | --- | --- |
| `prepareInTx(tx, input)` | có | Khóa theo tọa độ và theo aggregate cho tới hết transaction. Trả `already_resolved` (kèm `status`) nếu tọa độ, hoặc cùng `eventId` trong group, đã ở trạng thái cuối (`PROCESSED`, `IGNORED`, `PARKED`, `BLOCKED`, `QUARANTINED`, `SKIPPED`). Trả `parked` (và ghi `PARKED`) nếu aggregate đang bị chặn hoặc còn biên nhận `BLOCKED`/`PARKED` khác. Còn lại trả `process` với `attempts + 1` (ghi `PENDING`) |
| `prepareBatchInTx?(tx, inputs)` | có | Mảng quyết định cùng độ dài với `inputs`, hoặc `null` để quay về xử lý từng message. **Đường lô không đọc `action`**: mọi phần tử đều chạy handler và bị đánh dấu `PROCESSED`, nên chỉ trả mảng khi tất cả là `process` |
| `markProcessedInTx(tx, receiptId)` | có | `PROCESSED`, xóa trường lỗi |
| `markProcessedBatchInTx?(tx, receiptIds)` | có | Như trên cho cả lô |
| `recordIgnored(input)` | không | Không có handler khớp: `IGNORED` |
| `recordQuarantined(input, { errorCode, errorMessage })` | không | Message không giải mã được: `QUARANTINED`, `errorCategory: 'QUARANTINE'` |
| `recordTransientAttempt(input, { attempts, errorCode, errorMessage })` | không | Vẫn `PENDING`, `errorCategory: 'TRANSIENT'`. Lỗi của chính hàm này bị khung bỏ qua |
| `recordPermanentFailure(input, { attempts, errorCode, errorMessage })` | không | `BLOCKED`, `errorCategory: 'PERMANENT'`. Nếu có aggregate thì tạo hoặc giữ khối chặn (`blockedReceiptId` giữ biên nhận đầu tiên) |
| `inspect(filter?)` | không | Lọc theo `consumerGroup`, `status` (một hoặc nhiều), `tenantId` (`undefined` = mọi tenant; `null` khớp `null`), aggregate, `limit`. Trả `receipts` và `blockedAggregates` |
| `getReceiptById(receiptId)` | không | `null` nếu không có |
| `markRetriedInTx(tx, receiptId, actor, reason?)` | có | Sau khi chạy lại handler (`retry` cho `BLOCKED`/`QUARANTINED`, `resume` cho `PARKED`): `PROCESSED`, `resolvedBy = actor` |
| `markSkippedInTx(tx, receiptId, actor, reason)` | có | `SKIPPED`, `resolvedBy`, `skipReason`; gỡ khối chặn nếu đã hết vướng |
| `markSkipped(receiptId, actor, reason)` | không | Như trên, không có transaction của caller |
| `listParkedForAggregate(filter)` | không | Các biên nhận `PARKED` của aggregate, sắp theo `sequence` rồi `offset` (thứ tự replay) |
| `clearAggregateBlockIfResolved(filter)` | không | Xóa khối chặn khi aggregate không còn biên nhận `BLOCKED`/`PARKED`; trả `true` nếu đã gỡ |

`retry` và `resume` giải mã lại message từ `rawKey`/`rawValue`/`rawHeaders` đã lưu, nên store phải giữ nguyên ba trường này. Không có `receiptStore` thì consumer runner gửi message lỗi sang DLQ thay vì chặn aggregate.

#### `JobStore`

`createJobRunner` lấy job, chạy handler ngoài transaction, rồi báo kết quả. Bước báo kết quả không nằm chung transaction với công việc của handler, nên một job có thể chạy **nhiều hơn một lần**. Mặc định của runner: `concurrency` 4, `batchSize` 10, `pollIntervalMs` 250, `leaseMs` 30 000, `jobTimeoutMs` 300 000, `retryBackoffBaseMs` 5 000.

| Method | Ngữ nghĩa khung mong đợi |
| --- | --- |
| `claim(worker, types, limit, leaseMs): Promise<JobRecord[]>` | Giành nguyên tử tối đa `limit` job có `type` thuộc `types`, gán lease cho `worker` trong `leaseMs`. Hai worker không được nhận cùng một job. Lỗi được ghi log rồi thử lại sau `pollIntervalMs` |
| `heartbeat?(id, worker, leaseMs, leaseGeneration?, progress?): Promise<boolean>` | Gia hạn lease, gọi mỗi `max(25, floor(leaseMs/3))` ms. Trả `false` nghĩa là mất lease: runner abort `signal` của handler và **không** gọi `complete`/`fail`. Nếu ném lỗi liên tục quá `leaseMs` kể từ lần gia hạn thành công cuối thì runner cũng coi là mất lease. Runner hiện không truyền `progress` |
| `complete(id, result, options?): Promise<boolean>` | `options = { worker, leaseGeneration }`. Phải kiểm tra fencing (đúng `worker` và `leaseGeneration`); trả `false` khi bị fence |
| `fail(id, code, retryAt, options?): Promise<boolean>` | `retryAt` là `null` khi `job.attempts >= job.maxAttempts` (lỗi cuối cùng); còn lại là `now + retryBackoffBaseMs * 2^max(0, attempts-1)`. `code` là `AppError.code`, `'JOB_TIMEOUT'`, hoặc **`err.message`** của lỗi thường. `options.errorDetail = err.message`. Trả `false` khi bị fence |
| `release?(worker, jobIds?, leaseGeneration?): Promise<number>` | Trả job về hàng đợi khi runner dừng giữa chừng: sau `claim` lúc đang dừng (không có `leaseGeneration`), hoặc khi hết ngân sách drain |

Runner chỉ đọc `timeoutMs` từ `JobSpec`. Runner **không** kiểm tra `payload` theo `spec.payload`; `maxAttempts` được đọc từ `JobRecord` mà store trả về.

#### `HousekeepingStore`

| Method | Ngữ nghĩa khung mong đợi |
| --- | --- |
| `reapExpiredLeases(limit?): Promise<HousekeepingReapResult>` | Thu hồi lease đã hết hạn (job, lượt tính toán, giữ chỗ). Mặc định runner gọi mỗi 30 000 ms với `limit` 500 |
| `purgeExpiredEvents(options?): Promise<HousekeepingPurgeResult>` | Xóa outbox cũ hơn `outboxOlderThanMs`, inbox cũ hơn `inboxOlderThanMs`, và tùy chọn biên nhận consumer, khóa idempotency, bản ghi thu hồi. Mỗi lần gọi xóa **tối đa `batchSize`** dòng mỗi loại. Runner gọi lặp tối đa 50 lần mỗi lượt (mỗi giờ), dừng khi mọi bộ đếm `< batchSize` (mặc định 10 000) |

Lỗi của hai hàm này chỉ được ghi log (`worker.housekeeping_*_failed`).

#### `PubSub`

| Method | Ngữ nghĩa khung mong đợi |
| --- | --- |
| `publish(channel, payload): Promise<void>` | Gửi chuỗi tới mọi instance đang subscribe (best-effort) |
| `subscribe(channel, handler): Promise<() => Promise<void>>` | Đăng ký handler đồng bộ; trả hàm hủy. Lỗi do handler ném nên được cô lập (bản Redis bọc mỗi handler trong `try/catch`) |
| `isHealthy(): boolean` | Đồng bộ; dùng cho readiness |

`createRealtimeHub` dùng kênh mặc định `ank:realtime:fanout` và bỏ qua message do chính instance gửi. Revocation cache dùng kênh `ank:auth:revoke`; payload là JSON có `jti`/`sid`/`sub` hoặc một chuỗi thô.

### Kiểu dữ liệu

Các interface tầng trên **tự tạo** giá trị hoặc **trả về từ store**:

**`Identity`**: tạo trong stage `auth` tự viết ([usage.md, mục 9.3](usage.md#93-tự-viết-auth-và-authorize)).

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `accountId` | `string` | Tài khoản (`claims.sub` với `bearerAuth`) |
| `tenantId` | `number \| null` | Tenant đang thao tác; với `bearerAuth` là `claims.tid` hoặc `X-Tenant-Id` |
| `sessionId` | `string \| null` | |
| `tokenId` | `string` | `jti`, hoặc id tự đặt |
| `correlationId` | `string` | Lấy từ input của `auth` |
| `ip`, `userAgent` | `string \| null` | |
| `claims` | `TokenClaims` (tùy chọn) | Claim đã xác minh |
| `revocationDeferred` | `boolean` (tùy chọn) | `bearerAuth` đặt `true` khi kiểm tra thu hồi được hoãn vào transaction |

**`TokenClaims`**: `sub: string`, `jti: string`, `sid: string | null`, `tid: number | null`, `iat: number`, `exp: number` (giây), `roles?: readonly string[]`.

**`RevocationState`** (trả từ `RevocationSource.load`): `tokenRevoked: boolean`, `sessionRevoked: boolean`, `accountDisabled: boolean`, `tokensValidAfterSec: number | null`.

**`ContextInitializerOptions`**: `readOnly?: boolean`.

**`IdempotencyKey`** (khung tạo, store đọc): `tenantId: number | null`, `accountId: string`, `operation: string`, `key: string`, `requestHash: string`, `ttlSeconds?: number`.

**`StoredResult`** (khung tạo ở `save`, store trả lại ở `replay`): `status: number`, `body: unknown`, `kind?: 'json' | 'empty'`, `headers?: ReplyHeaders`.

**`RateLimitRequest`**: `bucket: string`, `subject: string`, `limit: number`, `windowMs: number`. **`RateLimitDecision`**: `allowed: boolean`, `remaining: number`, `retryAfterMs: number` (dùng khi `allowed: false`).

**`ShardLease`** (store tạo): `shardId: number`, `owner: string`, `fencingToken: bigint`, `expiresAt: Date`.

**`OutboxRecord`** (store trả từ `fetch`)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `recordId` | `string` | Khóa dòng trong store; dùng cho `mark*` |
| `eventId` | `string` | `id` của phong bì; consumer khử trùng theo trường này |
| `id` | `string` (tùy chọn) | Bí danh cũ cho fixture |
| `shardId` | `number` | Shard chứa bản ghi |
| `topic` | `string` | Topic đích |
| `aggregateType`, `aggregateId` | `string` | Aggregate (khóa thứ tự) |
| `sequence` | `number` (tùy chọn) | Thứ tự trong aggregate |
| `tenantId` | `number \| null` | |
| `eventType`, `eventVersion` | `string`, `number` | |
| `correlationId` | `string` | |
| `traceparent` | `string \| null` | |
| `payload` | `unknown` | |
| `occurredAt` | `string` | ISO; được đưa thẳng vào phong bì |
| `attempts` | `number` | Số lần gửi đã thử; quyết định `dead` |

**`ConsumerReceiptInput`** (khung tạo): `consumerGroup`, `topic`, `partition: number`, `offset: string`, `rawKey: string | null`, `rawValue: string | null`, `rawHeaders: Readonly<Record<string, string>>`, và metadata giải mã được hoặc `null`: `eventId`, `eventType`, `eventVersion`, `tenantId`, `aggregateType`, `aggregateId`, `sequence`, `correlationId`, `traceparent`.

**`ConsumerReceiptRecord`** (store trả về) = `ConsumerReceiptInput` + `receiptId: string`, `status: ConsumerReceiptStatus`, `attempts: number`, `errorCategory: ConsumerErrorCategory | null`, `errorCode: string | null`, `lastError: string | null`, `skipReason: string | null`, `resolvedBy: string | null`, `createdAt: string`, `updatedAt: string`.

**`ConsumerAggregateBlock`** (store trả về): `consumerGroup`, `tenantId`, `aggregateType`, `aggregateId`, `blockedReceiptId`, `blockedEventId: string | null`, `blockedSequence: number | null`, `errorCode`, `reason`, `createdAt`, `updatedAt`.

**`ConsumerInspectFilter`**: `consumerGroup?`, `status?` (một giá trị hoặc mảng), `tenantId?: number | null`, `aggregateType?`, `aggregateId?`, `limit?`. **`ConsumerInspectResult`**: `receipts`, `blockedAggregates`.

**`ConsumerPrepareDecision`**: `{ action: 'process', receiptId, attempts }`, `{ action: 'parked', receiptId }`, hoặc `{ action: 'already_resolved', receiptId, status }`.

**`JobRecord<P>`** (store trả từ `claim`): `id: string`, `type: string`, `tenantId: number | null`, `payload: P`, `attempts: number`, `maxAttempts: number`, `correlationId: string | null`, `leaseOwner?: string | null`, `leaseGeneration?: number` (fencing; được truyền lại vào `heartbeat`/`complete`/`fail`/`release`).

**`JobFinishOptions`**: `worker?: string`, `leaseGeneration?: number`, `errorDetail?: string`.

**`HousekeepingReapResult`**: `reapedJobs`, `reapedCalculations`, `expiredReservations` (đều là `number`). **`HousekeepingPurgeResult`**: `purgedOutbox`, `purgedInbox`, và tùy chọn `purgedReceipts`, `purgedIdempotencyKeys`, `purgedRevocations`.

**`CatalogContribution`**: `errorCodes?: Record<code, ErrorCodeSpec>`, `permissions?: Record<code, PermissionSpec>`, `events?: EventSpec[]`, `dbErrorRules?: DbErrorRule[]`. **`OwnedContribution`**: `{ owner: string; c: CatalogContribution }`.

**`ErrorCodeSpec`**: `message: string`, thông điệp công khai gửi cho client.

**`PermissionSpec`**: `kind: 'read' | 'write'`, `roles: readonly string[]`, `attrs?: Readonly<Record<string, unknown>>` (được `createRbacPolicy` chuyển cho `adapter.checkAttrs`).

**`EventSpec`**: `type: string` (khớp `EVENT_TYPE_FORMAT`), `version: number` (version hiện hành), `topic?: string`, `schema: TSchema` (schema của payload), `upcast?(fromVersion: number, payload: unknown): unknown` (nâng payload lên đúng một version).

**`DbErrorRule`**: `match: { sqlstate?: string; constraint?: string }` (cần ít nhất một), `code: string` (mã `AppError`), `retryable?: boolean`.

**`CreateEnvelopeInput<T>`**: như `EventEnvelope<T>` nhưng `id?` và `occurredAt?: Date | string` là tùy chọn.

**`ConsumerSpec<Tx>`**: `name` (khóa consumer trong inbox; đổi tên thì sự kiện cũ bị xử lý lại), `topic`, `eventType`, `handle(event: EventEnvelope, tx: Tx, signal: AbortSignal): Promise<void>`. Handler chạy trong transaction do `openTx` mở, cùng với `InboxStore.record`.

**`JobSpec<P, R>`**: `name`, `payload: TSchema`, `maxAttempts?`, `leaseMs?`, `timeoutMs?`. **`JobHandlerSpec<P, R>`**: `spec`, `handle(job: JobRecord<Static<P>>, signal: AbortSignal): Promise<R>`; kết quả được truyền vào `JobStore.complete`.

**`WorkerTaskSpec`**: `name`, `moduleUrl`. Worker thread `import(moduleUrl)` rồi lấy export tên `name`, hoặc `default[name]`, hoặc `default` nếu là hàm.

**`SocketSpec`**

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `path` | `string` | — | Đường dẫn WebSocket |
| `maxPayloadLength` | `number` | 65 536 | Byte tối đa mỗi message |
| `idleTimeoutSec` | `number` | 60 | |
| `maxBackpressureBytes` | `number` | 262 144 | Vượt ngưỡng khi gửi không `lossy` thì đóng kết nối với mã 1013 |
| `maxPendingMessages` | `number` | 32 | Message chờ `onMessage` vượt ngưỡng thì đóng với mã 1008 |
| `onOpen`, `onMessage`, `onDrain`, `onClose` | hook | — | `onMessage` chạy tuần tự trong một kết nối. Hook ném lỗi thì khung ghi log `ws.handler_error` và đóng với mã 1011 |

**`SocketClient`** (khung cung cấp cho hook): `identity`, `closed?`, `send(topic, data, { lossy? }): boolean` (`false` khi bị bỏ), `sendWithStatus?(…): SocketSendStatus`, `subscribe(topic)`/`unsubscribe(topic)` (khung tự thêm tiền tố tenant `t:<tenantId|global>:`), `close(code = 1000, reason = 'Normal closure')`, `getBufferedAmount()`. Bản uWS hiện không dùng tham số `topic` của `send`.

**`CookieOptions`**, **`FileReplyOptions`**, **`MultipartLimits`**: xem bảng tùy chọn ở trên. **`RouteRateLimit`**: `limit`, `windowMs`, `key?: 'ip' | 'identity'` (mặc định `ip`), `bucket?` (mặc định `METHOD path`).

Các kiểu còn lại:

| Kiểu | Mô tả |
| --- | --- |
| `Access` | `{ kind: 'public' } \| { kind: 'authenticated' } \| { kind: 'permission'; code; scopeParam? }` |
| `HttpMethod` | `'GET' \| 'POST' \| 'PUT' \| 'PATCH' \| 'DELETE'` |
| `BodyFormat` | `'json' \| 'urlencoded' \| 'text' \| 'multipart'` |
| `ResponseKind` | `'json' \| 'empty' \| 'stream'` |
| `RouteSpec<A, P, Q, B, Tx, AccessCtx, Path, M, TxMode>` | Spec route đầy đủ (bảng tùy chọn ở `defineRoute`) |
| `AnyRoute` | `RouteSpec` với mọi tham số kiểu là `any`; dùng cho danh sách route hỗn hợp |
| `RouteFor<Tx, AccessCtx>` | `RouteSpec` cố định `Tx` và `AccessCtx`; kiểu phần tử của `routes` trong module |
| `RequestOf<A, P, Q, B, Path>` | Kiểu `req` của handler; thuộc tính xem [usage.md, mục 5.3](usage.md#53-header-cookie-ip-host) |
| `ScopeOf<A, Tx, AccessCtx, M, TxMode>` | Kiểu tham số thứ hai `{ tx, access, signal, deadlineAt }` |
| `ScopeTxOf`, `ScopeAccessOf` | `scope.tx` là `null` khi `tx: 'none'`; `scope.access` là `null` với route `public` |
| `EffectiveTxMode<A, M, TxMode>` | Chế độ `tx` thực tế theo quy tắc mặc định |
| `IdentityOf<A>` | `null` khi `public`, ngược lại `Identity` |
| `ParamsOut<Path, P>`, `ExtractRouteParamNames<Path>` | Kiểu `req.params` suy ra từ schema hoặc từ `:ten` trong path |
| `SchemaOut<S>` | `Static<S>`, hoặc object rỗng khi không có schema |
| `MultipartPart` | `{ name, filename: string \| null, contentType, stream: Readable, text(): Promise<string> }`; phải đọc hết phần trước khi lấy phần sau |
| `Reply` (kiểu) | `JsonReply \| TextReply \| StreamReply \| EmptyReply` |
| `JsonReply`, `TextReply`, `StreamReply`, `EmptyReply` | Các nhánh của `Reply` (`kind: 'json' \| 'text' \| 'stream' \| 'empty'`) |
| `ReplyHeaders` | `Readonly<Record<string, string \| readonly string[]>>`; mảng ghi thành nhiều dòng header |
| `RedirectStatus` | `301 \| 302 \| 303 \| 307 \| 308` |
| `Catalogs` | Catalog đã gộp (bảng ở `buildCatalogs`) |
| `EventEnvelope<T>` | `{ id, type, version, occurredAt, aggregateType, aggregateId, sequence?, tenantId, correlationId, traceparent?, payload }` |
| `IdempotencyClaimResult` | `fresh \| replay \| mismatch \| pending` (bảng ở `IdempotencyStore`) |
| `ConsumerReceiptStatus` | `'PENDING' \| 'PROCESSED' \| 'IGNORED' \| 'PARKED' \| 'BLOCKED' \| 'QUARANTINED' \| 'SKIPPED'` |
| `ConsumerErrorCategory` | `'TRANSIENT' \| 'PERMANENT' \| 'QUARANTINE'` |
| `SocketSendStatus` | `'sent' \| 'backpressure' \| 'dropped'` |

### Nội bộ

Các export dưới đây là phần ống nối giữa các gói framework; **tầng trên không nên gọi trực tiếp**.

| Export | Mô tả |
| --- | --- |
| `validateRoutePath(path: string): void` | Được `defineRoute` và bộ biên dịch route gọi. Ném `CompositionError` khi path không bắt đầu bằng `/api/v{n}` (n ≥ 1), có `/` ở cuối, có đoạn tĩnh không khớp `^[a-z0-9][a-z0-9_-]*$`, có tham số không khớp `^:[a-zA-Z][a-zA-Z0-9_]*$`, hoặc trùng tên tham số |
| `isEmptyReplyStatus(status: number): boolean` | `true` với 202, 204, 301, 302, 303, 307, 308; dùng khi phát lại kết quả idempotent |
| `PERMISSION_CODE_FORMAT` | `/^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)+$/` (ví dụ `orders:write`) |
| `EVENT_TYPE_FORMAT` | `/^(?:[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+\|[A-Z][A-Za-z0-9]{2,80})$/` (ví dụ `orders.order.created` hoặc `OrderCreated`) |

---

## `@ank-ingress/observability`

Log có cấu trúc (pino), metrics dạng Prometheus, health server và traceparent W3C. Dưới `runApp`, logger, registry và health server đã được tạo sẵn (`ctx.logger`, `ctx.metrics`). Tầng trên chủ yếu dùng `Logger`, `MetricsRegistry`, `runInScope` và các hàm traceparent; chỉ tự tạo khi không chạy dưới `runApp`.

### Logger

#### `createLogger(options: LoggerOptions): Logger`

Tạo logger JSON với khóa thông điệp `event` và trường nền `service`, `instanceId`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `service` | `string` | — | Bắt buộc |
| `instanceId` | `string` | — | Thêm vào mọi dòng log nếu có |
| `level` | `LogLevel` | `'info'` | |
| `destination` | `Writable \| pino.DestinationStream` | `pino.destination({ fd: 1, sync: false, minLength: 4096 })` | Ghi bất đồng bộ, có bộ đệm |
| `redactPaths` | `readonly string[]` | — | Đường dẫn redact của pino (thay bằng `'[REDACTED]'`) |
| `flushIntervalMs` | `number` | 1 000 | Chu kỳ flush (timer `unref`); `0` thì tắt |

Hành vi của `Logger`:

- `debug/info/warn/error/fatal(event: string, fields?)`: bỏ qua ngay nếu level bị tắt. `fields` đi qua bộ lọc khóa nhạy cảm, rồi được gộp với scope hiện tại (`correlationId`, `traceId`, `spanId`, `traceparent`, `tenantId`, `accountId`, `operation`). `error`/`fatal` kích hoạt flush.
- Bộ lọc thay giá trị bằng `'[REDACTED]'` khi **tên khóa** (không phân biệt hoa thường, so khớp nguyên tên) thuộc danh sách: `password, pass, secret, token, accesstoken, access_token, refreshtoken, refresh_token, idtoken, id_token, authorization, cookie, set-cookie, apikey, api_key, privatekey, private_key, signingkey, signing_key, clientsecret, client_secret, credential, credentials, connectionstring, connection_string, sqlparams, sql_params, rawparams, raw_params, queryparams, query_params`. Giới hạn của bộ lọc: khóa ngắn hơn 4 ký tự không bao giờ bị che; đối tượng `Error` và mọi thứ sâu hơn 6 cấp được để nguyên; **giá trị chuỗi và tên `event` không được kiểm tra**.
- `child(bindings)`: logger con; `bindings` cũng qua bộ lọc.
- `flush(): Promise<void>`: chờ destination ghi xong bộ đệm.

```js
ctx.logger.info('orders.created', { orderId, tenantId });          // đúng
ctx.logger.info(`orders.created ${apiKey}`);                         // sai: chuỗi event không được lọc
```

### Phạm vi log

#### `runInScope<T>(scope: LogScope, fn: () => T): T`

Chạy `fn` trong một `AsyncLocalStorage` scope. Nếu đang có scope cha, scope mới **kế thừa** các trường của cha (qua prototype) và ghi đè các trường truyền vào. Consumer runner và job runner dùng hàm này để gắn `correlationId`/`tenantId` vào log.

#### `currentScope(): LogScope | undefined`

Scope đồng bộ đang hoạt động (nếu có), nếu không thì scope của `AsyncLocalStorage`.

### Metrics

#### `createMetricsRegistry(): MetricsRegistry`

Registry trong tiến trình, xuất ra định dạng văn bản Prometheus.

- `counter(name, help, labelNames?)`, `gauge(name, help, labelNames?)`, `histogram(name, help, labelNames?, buckets?)`: tên phải khớp `^[a-zA-Z_:][a-zA-Z0-9_:]*$`. Tên trùng ném `TypeError('Duplicate metric registration: …')`, tên sai ném `TypeError('Invalid metric name: …')`.
- Mỗi tổ hợp nhãn mới tạo một series **giữ mãi trong bộ nhớ**, không bao giờ bị xóa.
- Thiếu nhãn khai báo thì ném `TypeError('Missing metric label: …')`; nhãn thừa bị bỏ qua.
- `Counter.inc(labels?, delta = 1)`: ném `RangeError` khi `delta` âm hoặc không hữu hạn.
- `Gauge.set(value)` / `Gauge.set(labels, value)`: ném `RangeError` khi giá trị không hữu hạn; thiếu `value` thì ghi 0. `inc`/`dec` không kiểm tra.
- `Histogram.observe(value)` / `observe(labels, value)`: giá trị không hữu hạn bị bỏ qua. `buckets` được sắp tăng dần; mặc định `DEFAULT_LATENCY_BUCKETS`.
- `bind(labels?)` trả handle (`BoundCounter`/`BoundGauge`/`BoundHistogram`) đã định dạng nhãn sẵn; dùng trên hot path.
- `seriesCount()`: số series hiện có.
- `onCollect(fn)`: `fn` chạy **đồng bộ** mỗi lần `render()`.
- `render()`: chạy mọi collector rồi trả văn bản Prometheus. Counter/gauge không nhãn và chưa có series thì in `0`.

```js
const orders = ctx.metrics.counter('app_orders_created_total', 'Orders created', ['channel']);
const web = orders.bind({ channel: 'web' });   // giới hạn nhãn trong tập giá trị cố định
web.inc();
```

#### `DEFAULT_LATENCY_BUCKETS: readonly number[]`

`[0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]` (giây), đã đóng băng.

#### `registerProcessMetrics(registry: MetricsRegistry): ProcessMetricsHandle`

Đăng ký các metric của tiến trình: `ank_process_resident_memory_bytes`, `ank_process_heap_used_bytes`, `ank_process_heap_total_bytes`, `ank_process_external_memory_bytes`, `ank_process_array_buffers_bytes`, `ank_process_eventloop_delay_seconds{quantile=0.5|0.9|0.99|max|mean}`, `ank_process_eventloop_utilization`, `ank_process_gc_duration_seconds{kind}`. Số liệu được lấy mẫu qua `onCollect`. `close()` tắt bộ đo event loop và GC observer. `runApp` đã gọi hàm này; gọi lần nữa trên `ctx.metrics` sẽ ném `TypeError` vì trùng tên.

### Health server

#### `startHealthServer(options: HealthServerOptions): Promise<HealthServer>`

Mở một HTTP server riêng (`node:http`), không có xác thực:

| Đường dẫn | Phản hồi |
| --- | --- |
| `GET /healthz` | 200 `{"status":"OK"}`; 503 `{"status":"STOPPED"}` khi trạng thái `STOPPED` |
| `GET /readyz` | 200 khi `READY` hoặc `DEGRADED`, ngược lại 503. Body là toàn bộ `HealthSnapshot` (gồm tên và trạng thái các dependency) |
| `GET /metrics` | `options.metrics.render()` |
| Khác | 404; method khác GET/HEAD thì 405 |

Mỗi request gọi `options.status()` và cập nhật gauge `ank_readiness_state` (1 = READY, 2 = DEGRADED, 0 = còn lại). Gauge này được đăng ký trên `options.metrics`, nên gọi hai lần với cùng registry sẽ ném `TypeError`. Promise bị reject khi `listen` lỗi (ví dụ cổng đã dùng). `port: 0` chọn cổng ngẫu nhiên; `HealthServer.port` cho biết cổng thực. `runApp` đọc `HEALTH_BIND_ADDRESS` (mặc định `127.0.0.1`) và `<APP>_HEALTH_PORT`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `host` | `string` | — | Địa chỉ bind |
| `port` | `number` | — | `0` = ngẫu nhiên |
| `status` | `() => HealthSnapshot` | — | Gọi đồng bộ cho mỗi request; **không được ném lỗi** |
| `metrics` | `MetricsRegistry` | — | Nguồn cho `/metrics` |

### Traceparent

#### `parseTraceparent(header: string | null | undefined): TraceContext | null`

Phân tích header W3C `traceparent` (sau khi `trim` và chuyển chữ thường). Trả `null` khi rỗng, sai dạng, version khác `00`, hoặc `traceId`/`parentId` toàn số 0. `sampled` = bit 0 của `flags`.

#### `formatTraceparent(ctx: { traceId: string; parentId: string; flags?: string; sampled?: boolean }): string`

`00-<traceId>-<parentId>-<flags>`. `flags` mặc định `'01'`, hoặc `'00'` khi `sampled === false`. Hàm không kiểm tra đầu vào.

#### `childSpan(parent?: TraceContext | null): TraceContext`

Span con: giữ `traceId` và `flags` của cha, tạo `parentId` (span id) mới. Không có cha thì tạo trace mới với `flags: '01'`, `sampled: true`.

```js
import { childSpan, formatTraceparent, parseTraceparent } from '@ank-ingress/observability';

const span = childSpan(parseTraceparent(req.traceparent));
await fetch(url, { headers: { traceparent: formatTraceparent(span) }, signal: req.signal });
```

### Kiểu dữ liệu

**`LoggerOptions`**, **`HealthServerOptions`**: xem bảng tùy chọn ở trên.

**`LogScope`**: tạo khi gọi `runInScope`.

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `correlationId` | `string` (tùy chọn) | |
| `traceId`, `spanId`, `traceparent` | `string` (tùy chọn) | |
| `tenantId` | `number \| null` (tùy chọn) | |
| `accountId` | `string \| null` (tùy chọn) | |
| `operation` | `string` (tùy chọn) | |

**`HealthSnapshot`**: giá trị `status()` phải trả. Gồm `state: ReadinessState`, `acceptingTraffic: boolean`, `dependencies: Readonly<Record<string, DependencyHealth>>`.

**`DependencyHealth`**: `state: 'UP' | 'DEGRADED' | 'DOWN'`, `latencyMs?: number`.

| Kiểu | Mô tả |
| --- | --- |
| `Logger` | `debug/info/warn/error/fatal(event, fields?)`, `child(bindings)`, `flush()` |
| `LogLevel` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` |
| `MetricsRegistry` | `counter`, `gauge`, `histogram`, `onCollect?`, `render` |
| `Counter`, `Gauge`, `Histogram` | Metric có nhãn; `bind`, `seriesCount` |
| `BoundCounter`, `BoundGauge`, `BoundHistogram` | Handle đã gắn nhãn (`inc/get`, `set/inc/dec/get`, `observe`) |
| `Labels` | `Readonly<Record<string, string \| number>>` |
| `ProcessMetricsHandle` | `{ close(): void }` |
| `HealthServer` | `{ host, port, close(): Promise<void> }` |
| `ReadinessState` | `'STARTING' \| 'READY' \| 'DEGRADED' \| 'NOT_READY' \| 'DRAINING' \| 'STOPPED'` |
| `TraceContext` | `{ version: '00', traceId, parentId, flags, sampled }` |

### Nội bộ

Các export dưới đây phục vụ hot path của pipeline HTTP và runtime; **tầng trên không nên gọi trực tiếp**.

| Export | Mô tả |
| --- | --- |
| `requestScope` | `AsyncLocalStorage<LogScope>` mà `runInScope` dùng |
| `enterSyncScope(scope: LogScope): LogScope \| undefined` | Đặt scope đồng bộ toàn cục (ưu tiên hơn `AsyncLocalStorage`) và trả scope trước đó. Phải luôn đi cặp với `exitSyncScope` |
| `exitSyncScope(prev: LogScope \| undefined): void` | Khôi phục scope đồng bộ trước đó |
| `runWithSyncScope<T>(scope: LogScope, fn: () => T): T` | Đặt scope đồng bộ trong lúc `fn` chạy đồng bộ, khôi phục trong `finally`. Không theo được qua `await` |
| `randomHex16(): string`, `randomHex32(): string` | 16/32 ký tự hex lấy từ một vùng đệm `crypto.randomBytes` 8 KiB, không bao giờ toàn số 0. Dùng làm id trace/span |

---

## `@ank-ingress/runtime`

Gói layer 4, quản lý vòng đời một tiến trình server: đọc cấu hình từ biến môi trường, khởi tạo hạ tầng, dựng module theo role, theo dõi readiness, bắt tín hiệu tắt máy, drain rồi đóng tài nguyên theo đúng thứ tự và chọn mã thoát. Tầng ứng dụng dùng gói này ở `main` của mỗi tiến trình (`runApp`), khi khai báo module (`defineModule`, `contribution`) và khi tự viết `Inbound` hoặc `Resource` cho adapter của mình.

### Vòng đời tiến trình

#### `runApp(spec: RunAppSpec<S, Services, Mods, Roles>): RuntimeHandle`

Điểm vào chuẩn cho mọi tiến trình. `runApp` làm các việc sau theo thứ tự:

1. **Gộp schema cấu hình (đồng bộ, ngay khi gọi).** Schema của từng module (`module:<name>`) được gộp trước, schema của ứng dụng (`app:<name>`) gộp sau. Trùng khóa hoặc trùng tên biến môi trường thì ném `CompositionError` **ngay tại chỗ gọi `runApp`**, trước khi tiến trình được quản lý (lỗi này không đi qua cơ chế chọn mã thoát của runtime).
2. Gọi `startProcess` với host mặc định `nodeHost()` (hoặc `spec.host`). Từ đây là vòng đời mô tả ở mục [Các pha khởi động](#các-pha-khởi-động).
3. Trong pha `boot` của tiến trình:
   - `buildModuleCatalogs(spec.modules, spec.presetCatalogs)`: gộp catalog của **mọi** module (kể cả module không có role nào đang bật).
   - Pha `infra`: gọi `spec.setupInfra(ctx, config, catalogs)` nếu có; giá trị trả về là `services`. Không có `setupInfra` thì `services = {}`.
   - Pha `modules`: `bootModules(...)` dựng các contribution thuộc `spec.roles`, rồi gọi `start` của các module đã dựng.
   - Đăng ký việc dừng module qua `ctx.onStopModules`, để module được dừng **sau** khi inbound drain xong và **trước** khi tài nguyên bị đóng.
   - Gọi `spec.boot(ctx, config, modules, services)`; giá trị trả về là `Inbound` của tiến trình.

Trước mỗi bước, `ctx.signal.throwIfAborted()` được gọi, nên nhận `SIGTERM` giữa lúc khởi động sẽ dừng khởi động ở bước kế tiếp.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `name` | `string` | bắt buộc | Tên ứng dụng. Dùng làm `service` trong log, nhãn `app` của metric và tiền tố biến `<NAME>_HEALTH_PORT`. |
| `schema` | `Schema` | bắt buộc | Schema cấu hình của ứng dụng (`required`, `optional`, `secret` của `@ank-ingress/config`). Truyền `{}` nếu không có. |
| `roles` | `readonly ProcessRole[]` | bắt buộc | Các role được dựng trong tiến trình này. Module không có contribution nào thuộc các role này chỉ góp catalog. |
| `modules` | `readonly ModuleDefinition[]` | `[]` | Danh sách module. Được dựng **đúng theo thứ tự mảng**; `runApp` không tự sắp xếp phụ thuộc (xem `topoSortModules`). |
| `presetCatalogs` | `readonly OwnedContribution[]` | không có | Catalog dựng sẵn (mã lỗi, quyền, event, `dbErrorRules`) được gộp **trước** catalog của module. |
| `host` | `RuntimeHost` | `nodeHost()` | Môi trường chạy. Thay bằng host giả trong test. |
| `setupInfra` | `(ctx, config, catalogs) => Services \| Promise<Services>` | không có | Tạo pool DB, client Redis, `WorkerPool`… Đăng ký từng tài nguyên bằng `ctx.use(resource)`. Giá trị trả về là `services` cho contribution và cho `boot`. |
| `boot` | `(ctx, config, modules, services) => Inbound \| Promise<Inbound>` | bắt buộc | Lắp ráp inbound (HTTP, job runner, consumer…) từ `modules.routes`, `modules.jobs`… |

Kiểm tra kiểu: nếu một contribution của role đang bật khai báo service `'required'` mà kiểu trả về của `setupInfra` không có service đó (hoặc kiểu không khớp), TypeScript báo lỗi tại lời gọi `runApp` kèm tên service thiếu (`MissingServicesError<'db'>`). Ở runtime, `bootModules` kiểm tra lại và ném `CompositionError`.

Lỗi:

| Lỗi | Khi nào | Mã thoát |
| --- | --- | --- |
| `CompositionError: Duplicate config schema key "…" declared by "…" and "…"` | Hai schema (module/app) cùng khóa | Ném đồng bộ tại chỗ gọi `runApp` |
| `CompositionError: Duplicate config env variable "…" …` | Hai schema cùng tên biến môi trường | Ném đồng bộ tại chỗ gọi `runApp` |
| `ConfigError` | Biến môi trường thiếu hoặc sai | `78` |
| `CompositionError` từ catalog, `bootModules`, `createJobRunner`… | Lỗi lắp ráp khi khởi động | `78` |
| `StartupError` | Ứng dụng tự ném khi không thể khởi động | `78` |
| Lỗi khác ném ra từ `setupInfra`/`boot`/`Inbound.start` | | `exitCode` của lỗi nếu là số nguyên, nếu không thì `1` |

Lưu ý: `runApp` không kiểm tra trùng với khóa và biến môi trường của `runtimeSchema` (`logLevel`, `LOG_LEVEL`…). Schema ứng dụng được trải sau schema runtime, nên khóa trùng tên sẽ ghi đè định nghĩa của runtime. Đừng đặt khóa hay biến trùng với bảng ở mục [Cấu hình runtime](#cấu-hình-runtime).

Ví dụ (tiến trình HTTP có PostgreSQL, rút gọn từ `examples/module-items`):

```js
import { createApp } from '@ank-ingress/app';
import { createPgDatabase } from '@ank-ingress/postgres';
import { runApp } from '@ank-ingress/runtime';
import { createItemsModule } from './items.module.js';
import { createItemsPostgresRepository } from './adapters/postgres/items.postgres-repository.js';

const env = process.env;

runApp({
  name: 'items-api',
  schema: {},
  roles: ['http'],
  modules: [createItemsModule({ itemsRepo: createItemsPostgresRepository })],
  setupInfra(ctx) {
    const db = createPgDatabase({
      name: 'items',
      applicationName: 'items-api',
      logger: ctx.logger,
      config: {
        host: env.POSTGRES_HOST ?? '127.0.0.1',
        port: Number(env.POSTGRES_PORT ?? 5432),
        database: env.POSTGRES_DB ?? 'postgres',
        user: env.POSTGRES_USER ?? 'postgres',
        password: env.POSTGRES_PASSWORD ?? '',
      },
    });
    ctx.use(db.resource); // runApp kiểm tra readiness và đóng pool khi tắt
    return { db };
  },
  boot(ctx, _config, modules) {
    const app = createApp({ logger: ctx.logger, catalogs: modules.catalogs });
    app.add(...modules.routes);
    return app.inbound({ kind: 'tcp', host: '0.0.0.0', port: Number(env.PORT ?? 3000) });
  },
});
```

#### `runProcess(def: ProcessDefinition<S>): RuntimeHandle`

Bằng `startProcess(def, nodeHost())`. Dùng khi tiến trình không cần hệ module (không có `roles`, `modules`, `setupInfra`): `def.boot(ctx, config)` tự tạo tài nguyên và trả về `Inbound`. Vòng đời, readiness, tắt máy và mã thoát giống hệt `runApp`.

#### `nodeHost(lingerMs = 2_000): RuntimeHost`

Host thật trên Node.js:

- `env = process.env`, `hostname = os.hostname()`, `pid = process.pid`, `nodeVersion = process.version`.
- `onSignal(sig, h)` gắn `process.on(sig, h)`.
- `onFatal(h)` gắn **cả** `process.on('uncaughtException', h)` và `process.on('unhandledRejection', h)`.
- `exit(code)` đặt `process.exitCode = code` rồi hẹn `process.exit(code)` sau `lingerMs` ms (timer `unref`, nên nếu event loop đã rỗng thì tiến trình thoát sớm hơn).

#### Các pha khởi động

Trình tự trong `startProcess` (dùng chung cho `runApp` và `runProcess`):

1. Tạo registry metric, đăng ký metric tiến trình, gắn handler cho `SIGTERM`, `SIGINT` và lỗi fatal. Trạng thái `STARTING`.
2. `loadConfig({ ...runtimeSchema(app), ...schema })`. Sai cấu hình thì log `boot.config_invalid` (danh sách `problems`) và thoát `78`.
3. Tạo logger với `instanceId` và `logLevel`; log `boot.config` gồm `configHash`, bản cấu hình đã che (`config`) và phiên bản Node. Chỉ trường khai báo bằng `secret()`/`secretFile()` mới hiện là `[REDACTED]`; mọi trường khác được log nguyên giá trị.
4. Mở health server tại `HEALTH_BIND_ADDRESS:<APP>_HEALTH_PORT`, log `health.listening`. Từ lúc này `/healthz`, `/readyz`, `/metrics` đã trả lời.
5. Ngủ ngẫu nhiên trong `[0, STARTUP_JITTER_MS)` nếu biến này > 0.
6. Gọi `boot(ctx, config)` (với `runApp`: các pha `infra`, `modules` rồi `spec.boot`).
7. Kiểm tra mọi tài nguyên đã `ctx.use`. Nếu có tài nguyên `required` lỗi, chờ bằng `ctx.waitFor('required dependencies', …)` (thử lại có backoff, **không giới hạn số lần**, chỉ dừng khi tắt máy). Trong lúc chờ, trạng thái vẫn là `STARTING`.
8. Pha `inbound`: `inbound.start()`.
9. Đặt trạng thái theo kết quả kiểm tra (`READY` hoặc `DEGRADED`), bật vòng kiểm tra định kỳ mỗi `HEALTH_CHECK_INTERVAL_MS`, log `boot.ready`.

Mỗi pha `ctx.phase(name, fn)` ghi metric `ank_startup_phase_seconds{app,phase}` và log `boot.phase`. `runApp` thêm pha `infra` (chỉ khi có `setupInfra`) và pha `modules`; pha `inbound` luôn có.

Nếu khởi động lỗi (không phải do đang tắt máy): log `boot.failed` (kèm `detail` là message lỗi và `exitCode`) rồi tắt máy với `SHUTDOWN_FATAL_TIMEOUT_MS` và mã thoát chọn theo bảng ở mục `runApp`. Nếu inbound đã được tạo, runtime vẫn gọi `stop()`, `drain(signal đã abort)`, `release()` trên nó.

#### Readiness

| Trạng thái | Khi nào | `/readyz` |
| --- | --- | --- |
| `STARTING` | Từ lúc chạy tới khi inbound start xong | `503` |
| `READY` | Mọi tài nguyên kiểm tra thành công | `200` |
| `DEGRADED` | Chỉ tài nguyên `required: false` lỗi | `200` |
| `NOT_READY` | Có tài nguyên `required: true` lỗi | `503` |
| `DRAINING` | Đang tắt máy | `503` |
| `STOPPED` | Đã tắt xong | `503` (`/healthz` cũng `503`) |

- Mỗi lượt kiểm tra gọi `check(signal)` của mọi tài nguyên song song; mỗi lời gọi có hạn **2 000 ms** (`CHECK_TIMEOUT_MS`), quá hạn thì signal bị abort và tài nguyên bị tính là lỗi.
- Lời gọi `check` của lượt trước chưa xong thì lượt sau bỏ qua tài nguyên đó (giữ kết quả cũ).
- Chuyển sang `NOT_READY` thì runtime gọi `inbound.pause?.()`; thoát khỏi `NOT_READY` thì gọi `inbound.resume?.()`.
- Đổi trạng thái của tài nguyên được log `dependency.down` / `dependency.up`; metric `ank_dependency_up{app,dependency}` và `ank_lifecycle_state{app,state}` luôn được cập nhật.
- `/healthz` trả `200` với mọi trạng thái trừ `STOPPED`. `/readyz` trả JSON `HealthSnapshot`. `/metrics` trả định dạng Prometheus.
- Sau lỗi fatal, `report().acceptingTraffic` là `false` dù trạng thái là gì.

#### Tắt máy và drain

Ba nguồn kích hoạt tắt máy:

| Nguồn | Thời hạn tổng | Mã thoát dự kiến |
| --- | --- | --- |
| `SIGTERM`/`SIGINT` lần đầu, hoặc `handle.shutdown(reason)` | `SHUTDOWN_TIMEOUT_MS` (mặc định `25 000`) | `0` |
| Lỗi fatal (`uncaughtException`, `unhandledRejection`) | `SHUTDOWN_FATAL_TIMEOUT_MS` (mặc định `5 000`) | `1` |
| Khởi động thất bại | `SHUTDOWN_FATAL_TIMEOUT_MS` | theo lỗi (`78`/`1`/`exitCode`) |

Nếu tín hiệu đến trước khi cấu hình được đọc, runtime dùng giá trị mặc định `25 000` / `5 000`.

Thứ tự các bước (mỗi bước được log tên; bước nào ném lỗi thì log `shutdown.step_failed`, đặt mã thoát `1` rồi **vẫn chạy tiếp** các bước sau):

1. Log `shutdown.begin`, trạng thái `DRAINING`, dừng vòng kiểm tra readiness.
2. Abort `ctx.signal` và mọi `check` đang chạy.
3. Nếu khởi động chưa xong: chờ tối đa `max(100, min(2 000, floor(timeout / 5)))` ms. Hết thời gian mà khởi động vẫn chưa xong thì log `shutdown.boot_detached` và mã thoát thành `1`.
4. Nếu inbound đã start:
   - `delay`: chờ `SHUTDOWN_DELAY_MS` (chỉ khi mã thoát dự kiến là `0`), để load balancer kịp gỡ instance sau khi `/readyz` trả `503`.
   - `stop`: `inbound.stop()`, ngừng nhận việc mới.
   - `drain`: `inbound.drain(signal)`. Signal bị abort tại `hạn tổng − min(5 000, floor(timeout / 5))`, tức chừa lại tối đa 5 giây cho các bước sau. Drain bị cắt bởi hạn này thì mã thoát thành `1`.
   - `release`: `inbound.release?.()`.
5. `close:modules`: dừng module theo thứ tự ngược với lúc khởi động; signal truyền vào `stop` bị abort đúng lúc hết hạn tổng.
6. `close:<name>`: gọi `close()` của từng tài nguyên đã `ctx.use`, **ngược thứ tự đăng ký**. Không có thời hạn riêng cho từng tài nguyên.
7. Đóng health server, đặt trạng thái `STOPPED`, log `shutdown.done` (kèm `durationMs`, `exitCode`), flush logger.
8. `host.exit(code)`; `handle.done` resolve với `code`.

Bảo vệ:

- Hết hạn tổng mà chưa xong: log `shutdown.timeout` (kèm tên bước đang chạy) và thoát `1` ngay, bỏ qua các bước còn lại.
- Nhận `SIGTERM`/`SIGINT` lần hai trong lúc đang tắt: log `shutdown.forced`, thoát `1` ngay.
- Gọi tắt máy nhiều lần chỉ chạy một lần; các lần sau nhận cùng promise.

#### Mã thoát

| Mã | Hằng | Khi nào |
| --- | --- | --- |
| `0` | `EXIT.OK` | Tắt bằng tín hiệu hoặc `shutdown()`, mọi bước thành công, drain không bị cắt, khởi động đã kết thúc kịp. |
| `1` | `EXIT.FAILURE` | Lỗi fatal; tín hiệu lần hai; hết hạn tổng; một bước tắt máy ném lỗi; drain bị cắt; khởi động không kết thúc kịp khi tắt; khởi động lỗi với lỗi không mang `exitCode` số nguyên. |
| `78` | `EXIT.CONFIG` | `ConfigError`, `CompositionError`, `StartupError` (cả ba có `exitCode = 78`) ném ra trong lúc khởi động. |
| khác | | Khởi động lỗi với lỗi mang `exitCode` là số nguyên khác: dùng đúng số đó. |

#### `EXIT`

`Object.freeze({ OK: 0, FAILURE: 1, CONFIG: 78 })`.

#### `new StartupError(message: string, options?: { cause?: unknown })`

Lớp lỗi có `name = 'StartupError'` và `exitCode = 78`. Ném trong `setupInfra`, `boot` hoặc `start` của module khi tiến trình không thể chạy vì lý do cấu hình/môi trường (ví dụ thiếu bảng, sai khóa). Vì có `exitCode` số, ném `StartupError` bên trong `ctx.waitFor` sẽ **dừng việc thử lại** ngay.

```js
import { StartupError } from '@ank-ingress/runtime';

function assertKeys(keys) {
  if (keys.size === 0) throw new StartupError('JWT_PUBLIC_KEYS is empty');
}
```

#### `exitCodeOf(error: unknown): number`

Trả `error.exitCode` nếu là số nguyên, ngược lại trả `1`.

#### `startProcess(def: ProcessDefinition<S>, host: RuntimeHost): RuntimeHandle`

Lõi vòng đời mà `runApp` và `runProcess` dùng. Xem mục [Nội bộ](#nội-bộ).

### Cấu hình runtime

#### `runtimeSchema(app: string)`

Trả schema các biến môi trường mà runtime luôn đọc thêm, cạnh schema của ứng dụng. `<APP>` là `app` viết hoa, mọi ký tự ngoài `A-Z0-9` đổi thành `_` (ví dụ `items-api` → `ITEMS_API`).

| Khóa | Biến môi trường | Kiểu / giới hạn | Mặc định | Ý nghĩa |
| --- | --- | --- | --- | --- |
| `logLevel` | `LOG_LEVEL` | `debug \| info \| warn \| error \| fatal` | `info` | Mức log. |
| `healthPort` | `<APP>_HEALTH_PORT` | số nguyên `0..65535` | `0` | Cổng health server; `0` để hệ điều hành chọn cổng trống (cổng thật nằm trong log `health.listening`). |
| `healthHost` | `HEALTH_BIND_ADDRESS` | chuỗi | `127.0.0.1` | Địa chỉ bind của health server. |
| `instanceId` | `ANK_INSTANCE_ID` | `^[a-z0-9][a-z0-9.-]{0,62}$` | `''` | Rỗng thì tự sinh `<hostname>-<pid>-<4 hex>` (tối đa 63 ký tự). |
| `shutdownDelayMs` | `SHUTDOWN_DELAY_MS` | `0..120 000` | `0` | Chờ trước khi `inbound.stop()` (chỉ khi tắt bình thường). |
| `shutdownTimeoutMs` | `SHUTDOWN_TIMEOUT_MS` | `1 000..600 000` | `25 000` | Hạn tổng khi tắt bằng tín hiệu / `shutdown()`. |
| `shutdownFatalTimeoutMs` | `SHUTDOWN_FATAL_TIMEOUT_MS` | `500..60 000` | `5 000` | Hạn tổng khi fatal hoặc khởi động lỗi. |
| `startupJitterMs` | `STARTUP_JITTER_MS` | `0..120 000` | `0` | Trễ ngẫu nhiên trước `boot`, tránh nhiều instance cùng lúc dồn vào DB. |
| `checkIntervalMs` | `HEALTH_CHECK_INTERVAL_MS` | `50..300 000` | `5 000` | Chu kỳ kiểm tra readiness. |

### Ngữ cảnh khởi động (`BootContext`)

`ctx` được truyền cho `setupInfra`, `boot` của `runApp` và `boot` của `ProcessDefinition`.

| Thành viên | Hành vi |
| --- | --- |
| `app` | Tên ứng dụng. |
| `instanceId` | Định danh instance (dùng làm `workerId` cho job runner là hợp lý). |
| `logger` | Logger của tiến trình (getter, luôn trả logger hiện hành). |
| `metrics` | `MetricsRegistry` chung, được xuất ở `/metrics`. |
| `signal` | Bị abort ngay khi tắt máy bắt đầu (kể cả khi đang khởi động). Truyền vào mọi việc chờ lâu trong `setupInfra`/`boot`. |
| `status()` | Trạng thái readiness hiện tại. |
| `use(resource)` | Đăng ký tài nguyên để kiểm tra readiness và đóng khi tắt (ngược thứ tự đăng ký). Đăng ký cùng một object hai lần chỉ tính một lần. Gọi sau khi tắt máy đã bắt đầu: runtime gọi ngay `resource.close()` rồi ném lý do abort. Trả lại chính `resource`. |
| `onStopModules?(fn)` | Đăng ký hàm dừng module (`runApp` dùng nội bộ). Gọi sau khi tắt máy bắt đầu: `fn` chạy ngay với hạn 5 000 ms rồi ném lý do abort. |
| `waitFor(what, attempt)` | Gọi `attempt()` tới khi thành công. Lỗi không mang `exitCode` số thì thử lại với backoff ngẫu nhiên `max(25, random × min(10 000, 100 × 2^min(n, 7)))` ms và log `dependency.waiting`. Lỗi mang `exitCode` số (ví dụ `StartupError`) thì ném ra ngay. Dừng khi `ctx.signal` bị abort. |
| `phase(name, fn)` | Chạy `fn`, ghi `ank_startup_phase_seconds{phase}` và log `boot.phase`. |

### Hệ module theo role

Module gom route, job, consumer, task, socket cùng catalog (mã lỗi, quyền, event, `dbErrorRules`) của một nghiệp vụ. Mỗi module góp **một contribution cho mỗi role**; tiến trình chỉ dựng contribution của các role nó khai báo trong `roles`. Nhờ vậy cùng một bộ module chạy được ở tiến trình HTTP (`roles: ['http']`) và tiến trình worker (`roles: ['jobs']`) mà không tạo hạ tầng thừa.

| Role (`ProcessRole`) | `build` phải trả về | Tầng trên nhận ở | Khóa phát hiện trùng |
| --- | --- | --- | --- |
| `http` | `readonly RouteFor<Tx, Access>[]` | `modules.routes` | `` `${method} ${path}` `` |
| `sockets` | `readonly SocketSpec[]` | `modules.sockets` | `path` |
| `tasks` | `readonly WorkerTaskSpec[]` | `modules.workerTasks` | `name` |
| `jobs` | `readonly JobHandlerSpec[]` | `modules.jobs` | `spec.name` |
| `consumers` | `readonly ConsumerSpec<Tx>[]` | `modules.consumers` | `name` |

#### `defineModule<Tx = unknown, Access = unknown>(): (def: ModuleDefinition) => ModuleDefinition`

Hàm hai bước: bước đầu cố định kiểu transaction `Tx` và kiểu định danh `Access` của tiến trình, bước sau nhận định nghĩa module. Kết quả là object đã `Object.freeze` (cả `contributes`). Trong TypeScript, mỗi contribution giữ nguyên kiểu `needs` và kiểu đầu ra của riêng nó, để `runApp` kiểm tra service và kiểu route.

Các trường của định nghĩa (xem `ModuleDefinition` ở mục Kiểu dữ liệu): `name`, `schema?`, `contributes`, `start?`, `stop?`, `errorCodes?`, `permissions?`, `events?`, `dbErrorRules?`.

```js
import { contribution, defineModule } from '@ank-ingress/runtime';
import { createItemsHttpRoutes } from './adapters/http/items.http-routes.js';

export function createItemsModule(deps) {
  return defineModule()({
    name: 'items',
    permissions: {
      'items:read': { kind: 'read', roles: ['MEMBER'] },
      'items:write': { kind: 'write', roles: ['MEMBER'] },
    },
    errorCodes: { 'ITEMS-404-NOT_FOUND': { message: 'Item not found' } },
    contributes: {
      http: contribution()({ needs: {}, build: () => createItemsHttpRoutes(deps) }),
    },
  });
}
```

Phụ thuộc như repository được tiêm qua tham số của hàm tạo module (`deps`), giống `examples/module-items` và khung do `npm run scaffold -- module <name>` sinh ra.

#### `contribution<Needs, Config = Readonly<Record<string, unknown>>>(): (def: { needs, build }) => Contribution`

Cách **duy nhất** để tạo contribution (kiểu `Contribution` mang brand chỉ ở mức kiểu, nên object literal tự viết không được chấp nhận trong `contributes`). Hàm hai bước: bước đầu cố định kiểu các service mà contribution dùng (`Needs`) và kiểu cấu hình của module (`Config`); bước sau nhận:

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `needs` | `NeedSpec<Needs>` | Mỗi khóa của `Needs` phải có mặt, giá trị `'required'` hoặc `'optional'`. |
| `build` | `(ctx: ContributionContext) => Out \| Promise<Out>` | Dựng mảng route/job/… của role. Chạy một lần khi khởi động. |

Kiểu service bên trong `build`: khóa `'required'` có kiểu `T` (không `undefined`), khóa `'optional'` có kiểu `T | undefined`. Trong TypeScript viết `contribution<{ db: PgDatabase; cache: Cache }>()({ needs: { db: 'required', cache: 'optional' }, build: ({ services }) => … })`.

Hành vi runtime (trong `bootModules`):

- Service `'required'` không có trong `services` hoặc bằng `undefined` → `CompositionError: Module "<m>" contribution "<role>" requires service "<key>"`.
- `build` ném lỗi khác `CompositionError` → được bọc thành `CompositionError: Module "<m>" contribution "<role>" build failed: <message>`.

#### Catalog và cấu hình của module

- Catalog của mọi module được gộp bằng `buildModuleCatalogs` (dùng `buildCatalogs` của `@ank-ingress/contracts`), `presetCatalogs` đứng trước. Kiểm tra định dạng mã lỗi, mã quyền (`a:b(:c)*`), kiểu event; trùng mã lỗi, quyền, kiểu event hoặc `dbErrorRules` cùng cặp `sqlstate::constraint` → `CompositionError` nêu tên cả hai module. `DbErrorRule` thiếu cả `sqlstate` lẫn `constraint` cũng bị từ chối.
- Module có `schema` thì `ctx.config` trong `build` chỉ chứa đúng các khóa của schema đó (object đã đóng băng). Module không có `schema` nhận toàn bộ cấu hình của tiến trình.
- `ctx.logger` trong `build` là logger con có trường `module: <name>`.

#### Khởi động và dừng module

- Module được xử lý theo thứ tự mảng `modules`. Với từng module, các role đang bật được dựng theo thứ tự `http`, `sockets`, `tasks`, `jobs`, `consumers`.
- Module không có contribution nào thuộc role đang bật bị bỏ qua hoàn toàn: không dựng, không `start`, không `stop` (nhưng vẫn góp catalog).
- Sau khi dựng xong **mọi** module, `start(signal)` của các module đã dựng được gọi theo thứ tự. Lỗi `start` (khác `CompositionError`) được bọc thành `CompositionError: Module "<m>" start failed: <message>` (mã thoát `78`).
- Bất kỳ lỗi nào khi dựng/start: các module đã dựng được `stop` theo thứ tự ngược với signal hết hạn sau **5 000 ms**; lỗi của `stop` lúc này chỉ được log (`module.rollback_stop_failed`).
- Khi tắt máy: `stop(signal)` theo thứ tự ngược, sau bước drain inbound; lỗi được log `module.stop_failed`, một lỗi thì ném lại nguyên lỗi, nhiều lỗi thì ném `AggregateError`.

#### `topoSortModules<T extends NamedNode>(defs: readonly T[]): T[]`

Sắp xếp topo theo `requires` (phụ thuộc đứng trước). `runApp` **không** gọi hàm này; dùng khi muốn sắp thứ tự module theo phụ thuộc rồi truyền kết quả vào `modules`.

Lỗi (`CompositionError`): `Duplicate module name "<n>"`; `Module "<a>" requires unknown module "<b>"`; `Circular module dependency detected: a -> b -> a`.

```js
import { topoSortModules } from '@ank-ingress/runtime';

const ordered = topoSortModules([
  { name: 'orders', requires: ['items'], mod: ordersModule },
  { name: 'items', requires: [], mod: itemsModule },
]).map((node) => node.mod); // [itemsModule, ordersModule]
```

#### `bootModules(defs, options: BootModulesOptions): Promise<BootedModules>`

Phần dựng module mà `runApp` gọi trong pha `modules`. Ngoài các lỗi đã nêu, ném `CompositionError: Duplicate module name "<n>"` và `Duplicate <route|socket|workerTask|job|consumer> "<key>" registered by "<a>" and "<b>"`. Xem mục [Nội bộ](#nội-bộ).

#### `buildModuleCatalogs(defs, presetCatalogs?): Catalogs`

Gộp catalog như mô tả ở trên. Xem mục [Nội bộ](#nội-bộ).

### Inbound và theo dõi công việc đang chạy

#### `compositeInbound(parts: readonly Inbound[]): Inbound`

Gộp nhiều inbound (ví dụ HTTP + job runner) thành một để trả về từ `boot`.

| Phương thức | Cách gọi các phần |
| --- | --- |
| `start()` | Lần lượt theo thứ tự mảng |
| `pause()` / `resume()` | Song song, bỏ qua phần không cài |
| `stop()` | Song song |
| `drain(signal)` | Song song, cùng một signal |
| `release()` | Lần lượt theo thứ tự mảng, bỏ qua phần không cài |

```js
import { compositeInbound } from '@ank-ingress/runtime';

// trong boot(ctx, config, modules, services)
return compositeInbound([httpInbound, jobRunner]);
```

#### `createWorkTracker(): WorkTracker`

Bộ đếm công việc đang chạy, dùng để cài `drain` cho inbound tự viết (job runner và consumer runner của framework dùng nó).

| Thành viên | Hành vi |
| --- | --- |
| `enter()` | Tăng bộ đếm, trả hàm `leave` chỉ có tác dụng lần gọi đầu. |
| `inc()` / `dec()` | Tăng / giảm trực tiếp; `dec` không làm bộ đếm âm. |
| `count` | Số việc đang chạy. |
| `idle(signal)` | Resolve khi bộ đếm về `0` **hoặc** khi `signal` bị abort (không reject). Gọi khi đã rỗng hoặc signal đã abort thì resolve ngay. |

```js
import { createWorkTracker } from '@ank-ingress/runtime';

const tracker = createWorkTracker();

async function handle(message) {
  const leave = tracker.enter();
  try {
    await processMessage(message);
  } finally {
    leave();
  }
}

const inbound = {
  async start() { /* bắt đầu nhận message */ },
  async stop() { /* ngừng nhận message mới */ },
  drain: (signal) => tracker.idle(signal),
};
```

### Kiểu dữ liệu

#### `Resource` (ứng dụng cài đặt)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `name` | `string` | Tên phụ thuộc trong `/readyz`, metric `ank_dependency_up` và bước tắt máy `close:<name>`. |
| `required` | `boolean` | `true`: lỗi làm tiến trình `NOT_READY` (inbound bị `pause`, khởi động phải chờ). `false`: chỉ `DEGRADED`. |
| `check(signal)` | `(signal: AbortSignal) => Promise<void>` | Resolve = khỏe, reject = lỗi. Bị abort sau 2 000 ms; phải tôn trọng `signal` và luôn kết thúc, vì lời gọi chưa xong sẽ chặn các lượt kiểm tra sau của chính tài nguyên này. |
| `close()` | `() => Promise<void>` | Giải phóng tài nguyên. Gọi đúng một lần khi tắt, ngược thứ tự `ctx.use`. Không có hạn riêng; chỉ bị hạn tổng tắt máy chặn. |

#### `Inbound` (ứng dụng cài đặt hoặc lấy từ adapter)

| Trường | Kiểu | Runtime gọi khi |
| --- | --- | --- |
| `start()` | `() => Promise<void>` | Một lần, sau khi mọi tài nguyên `required` đã khỏe. Ném lỗi = khởi động thất bại. |
| `pause?()` | `() => Promise<void> \| void` | Tiến trình chuyển sang `NOT_READY`. |
| `resume?()` | `() => Promise<void> \| void` | Tiến trình rời `NOT_READY`. |
| `stop()` | `() => Promise<void>` | Bước đầu khi tắt máy: ngừng nhận việc mới. |
| `drain(signal)` | `(signal: AbortSignal) => Promise<void>` | Chờ việc đang chạy xong. `signal` abort tại hạn drain; phải trả về ngay khi đó. |
| `release?()` | `() => Promise<void>` | Sau `drain`: đóng nốt kết nối/socket còn lại. |

#### `RuntimeHost` (ứng dụng tự tạo trong test)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `env` | `Readonly<Record<string, string \| undefined>>` | Nguồn biến môi trường. |
| `hostname` | `string` | Dùng sinh `instanceId`. |
| `pid` | `number` | Dùng sinh `instanceId`. |
| `nodeVersion` | `string` | Ghi vào log `boot.config` và metric `ank_build_info`. |
| `onSignal(signal, handler)` | `('SIGTERM' \| 'SIGINT', () => void) => void` | Gắn handler tín hiệu. |
| `onFatal(handler)` | `((error: unknown) => void) => void` | Gắn handler lỗi fatal. |
| `exit(code)` | `(code: number) => void` | Kết thúc tiến trình với mã thoát. |
| `random?` | `() => number` | Nguồn ngẫu nhiên cho `instanceId` và jitter; mặc định `Math.random`. |

Trong test, host giả với `env: { MYAPP_HEALTH_PORT: '0' }`, `onSignal() {}`, `onFatal() {}`, `exit() {}` cho phép chạy cả vòng đời rồi gọi `handle.shutdown()` mà không thoát tiến trình test.

#### `ProcessDefinition<S>` (ứng dụng tạo khi dùng `runProcess`)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `app` | `string` | Tên ứng dụng. |
| `schema` | `S extends Schema` | Schema cấu hình của ứng dụng. |
| `boot(ctx, config)` | `(ctx: BootContext, config: ConfigOf<S>) => Promise<Inbound>` | Tạo tài nguyên (`ctx.use`) và trả về inbound. |

#### `RunAppSpec` (ứng dụng tạo khi gọi `runApp`)

Các trường đã mô tả trong bảng tùy chọn của `runApp`.

#### `ModuleDefinition<Tx, Access, Contribs, S>` (ứng dụng tạo qua `defineModule`)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `name` | `string` | Tên duy nhất trong tiến trình; dùng làm chủ sở hữu catalog và trong thông báo lỗi. |
| `schema?` | `S extends Schema` | Cấu hình riêng của module; gộp vào cấu hình tiến trình, khóa và tên biến không được trùng. |
| `contributes` | `ModuleContributions<Tx, Access>` | Một contribution cho mỗi role: `http?`, `sockets?`, `tasks?`, `jobs?`, `consumers?`. |
| `start?(signal)` | `(signal: AbortSignal) => Promise<void>` | Chỉ chạy khi ít nhất một contribution của module đang bật. |
| `stop?(signal)` | `(signal: AbortSignal) => Promise<void>` | Chạy khi tắt máy hoặc khi khởi động lỗi (rollback). |
| `errorCodes?` | `Record<string, ErrorCodeSpec>` | Mã lỗi của module. |
| `permissions?` | `Record<string, PermissionSpec>` | Quyền của module. |
| `events?` | `readonly EventSpec[]` | Event của module. |
| `dbErrorRules?` | `readonly DbErrorRule[]` | Ánh xạ lỗi DB sang mã lỗi. |

#### `Contribution<Needs, Out, Spec, Config>` (ứng dụng tạo qua `contribution`)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `needs` | `Spec extends NeedSpec<Needs>` | Service nào bắt buộc, service nào tùy chọn. |
| `build(ctx)` | `(ctx: ContributionContext) => Out \| Promise<Out>` | Dựng đầu ra của role. |

#### `NamedNode` (ứng dụng tạo khi gọi `topoSortModules`)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `name` | `string` | Tên nút. |
| `requires` | `readonly string[]` | Tên các nút phải đứng trước. |

#### Kiểu khác

| Kiểu | Mô tả |
| --- | --- |
| `RuntimeHandle` | Kết quả của `runApp`/`runProcess`/`startProcess`: `report(): HealthSnapshot`, `shutdown(reason = 'manual'): Promise<void>` (tắt như nhận `SIGTERM`), `done: Promise<number>` (resolve với mã thoát). |
| `BootContext` | Ngữ cảnh khởi động; xem bảng ở mục [Ngữ cảnh khởi động](#ngữ-cảnh-khởi-động-bootcontext). |
| `ContributionContext<Needs, Config>` | Tham số của `build`: `logger` (logger con có `module`), `metrics`, `config`, `catalogs` (catalog đã gộp của cả tiến trình), `services`. |
| `ProcessRole` | `'http' \| 'sockets' \| 'tasks' \| 'jobs' \| 'consumers'`. |
| `NeedSpec<Needs>` | `{ [K in keyof Needs]-?: 'required' \| 'optional' }`. |
| `BootedModules<Route, Consumer>` | Tham số `modules` của `boot`: `catalogs`, `routes`, `sockets`, `workerTasks`, `jobs`, `consumers` (mảng đã đóng băng, giữ kiểu riêng của từng module) và `stop(signal)`. |
| `WorkTracker` | Kiểu trả về của `createWorkTracker`. |
| `StartupError` | Lớp lỗi khởi động, `exitCode = 78`. |

### Nội bộ

Các export dưới đây là phần ruột mà `runApp` dùng; **tầng trên không nên gọi trực tiếp**, trừ khi tự viết một bộ điều phối tiến trình riêng hoặc test vòng đời.

| Export | Mô tả |
| --- | --- |
| `startProcess(def, host)` | Lõi vòng đời (cấu hình, health server, readiness, tắt máy). `runApp` và `runProcess` gọi nó. Test vòng đời gọi trực tiếp với `RuntimeHost` giả. |
| `bootModules(defs, options)` | Dựng contribution theo role, kiểm tra trùng và service, gọi `start`/`stop` module. |
| `BootModulesOptions` | Tham số của `bootModules`: `logger`, `metrics`, `config`, `services`, `roles`, `catalogs?` (bỏ qua việc tự gộp), `presetCatalogs?`, `signal?` (mặc định một signal không bao giờ abort). |
| `buildModuleCatalogs(defs, presetCatalogs?)` | Gộp catalog của module và preset. |
| `ModuleContributions<Tx, Access>` | Các ô role trong `contributes`, kiểu đã xóa để giữ `Needs` riêng của từng contribution. |
| `NeedsFor<Mods, Roles>` | Giao của các service `'required'` mà các role đang bật của `Mods` đòi hỏi; `runApp` dùng để kiểm tra kiểu `services`. |

---

---

## `@ank-ingress/postgres`

Gói hạ tầng PostgreSQL (driver `pg` 8.23.0): tạo pool, giới hạn số người chờ connection bằng `PoolGate`, mở transaction có deadline cho mỗi request (`createRequestScope`) hoặc cho tác vụ nền (`withTx`), rồi đổi lỗi database thành `AppError`. Gói không chứa câu SQL nghiệp vụ, schema hay chính sách RLS nào: bảng, migration, câu lệnh "đóng dấu" tenant và chính sách RLS đều do ứng dụng viết. Tầng trên dùng gói này khi dựng hạ tầng (`setupInfra`), khi viết `ContextInitializer`, và khi viết repository nhận `tx`.

### Kết nối và pool

#### `createPgDatabase(options: CreatePgDatabaseOptions): PgDatabase`

Tạo một `pg.Pool` cùng một `PoolGate` bọc quanh nó, rồi trả về `{ pool, gate, resource, close }`.

Cấu hình pool thật sự được dùng:

| Thiết lập của `pg.Pool` | Giá trị |
| --- | --- |
| `max` | `config.maxConnections ?? 20` |
| `idleTimeoutMillis` | `config.idleTimeoutMs ?? 30_000` |
| `connectionTimeoutMillis` | `config.connectionTimeoutMs ?? 5_000` |
| `application_name` | `options.applicationName` |
| `password` | Một hàm, được gọi mỗi lần mở connection mới. Nếu `password` là `SecretHolder` thì đọc `current()`; khung gọi `watch()` lúc tạo và ngừng theo dõi khi `close()`. Mật khẩu xoay vòng nhờ vậy được áp dụng cho các connection mở sau đó. |
| `pipeline` | `true`: các câu lệnh gửi liên tiếp trên một client được pipeline, không đợi nhau từng vòng. |

`PoolGate` được tạo với `maxConnections` bằng đúng `config.maxConnections ?? 20` và `maxWaiting = config.maxWaiting ?? 64`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `config` | `PgConfig` | (bắt buộc) | Thông tin kết nối và giới hạn pool (xem [Kiểu dữ liệu](#kiểu-dữ-liệu)). |
| `applicationName` | `string` | (bắt buộc) | Gửi lên server làm `application_name`, hiện trong `pg_stat_activity`. |
| `logger` | `Logger` | (bắt buộc) | Sự kiện `error` của pool (connection rảnh bị lỗi) được ghi thành `postgres.pool_error` với `{ pool, detail }`. |
| `metrics` | `MetricsRegistry` | không có | Có thì xuất gauge `ank_db_pool_total`, `ank_db_pool_idle` (cập nhật khi connect/acquire/release/remove) và `ank_db_pool_waiting` (độ dài hàng đợi của gate), đều có nhãn `pool`. |
| `name` | `string` | `'postgres'` | Tên pool trên nhãn metric, trong log và là `resource.name`. |

`resource` (`PgResource`) có `required: true`. `check(signal?)` mượn một connection **qua gate** (tức là tranh slot với request, và cũng bị từ chối khi hàng chờ đầy), chạy `SELECT 1`, rồi trả connection; nếu `SELECT 1` lỗi thì connection bị hủy (`release(true)`). `close()` chỉ chạy một lần: ngừng theo dõi mật khẩu rồi `pool.end()`.

Hàm không tự kết nối thử khi khởi tạo; lỗi kết nối lộ ra ở lần mượn connection đầu tiên hoặc ở `resource.check`.

```js
import { createPgDatabase } from '@ank-ingress/postgres';
import { createLogger } from '@ank-ingress/observability';

const db = createPgDatabase({
  name: 'main',
  applicationName: 'orders-api',
  logger: createLogger({ service: 'orders-api' }),
  config: {
    host: '127.0.0.1',
    port: 5432,
    database: 'orders',
    user: 'orders',
    password: process.env.POSTGRES_PASSWORD ?? '',
    maxConnections: 20,
    maxWaiting: 64,
  },
});
// Dưới runApp: ctx.use(db.resource) trong setupInfra để readiness kiểm tra và tự đóng khi tắt.
```

### Transaction cho request

#### `createRequestScope<Access>(options: RequestScopeOptions<Access>): RequestScopeRunner<Access>`

Tạo bộ chạy transaction cho request. `runner.run` truyền vào `createApp({ scope: scope.run })`; `runner.authorize` có cùng dạng đầu vào với stage `authorize` nên có thể dùng làm `createApp({ authorize: scope.authorize })` cho các route `tx: 'none'` có mã quyền.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `db` | `Pick<PgDatabase, 'gate'>` | (bắt buộc) | Nguồn connection. Chỉ cần `gate`. |
| `initializer` | `ContextInitializer<Tx, Access>` | (bắt buộc) | Do ứng dụng viết; chạy đầu mỗi transaction để đặt `statement_timeout`, đóng dấu tenant… và trả về `Access`. |
| `policy` | `AccessPolicy<Access>` | (bắt buộc) | Kiểm tra quyền trên `Access` (ví dụ `createClaimsPolicy()` hoặc `createRbacPolicy(...)` của `@ank-ingress/security`). |
| `idempotency` | `IdempotencyStore<Tx>` | không có | Kho idempotency của ứng dụng. Thiếu thì request có `Idempotency-Key` chạy như request ghi thường. |
| `revocation` | `{ check(claims, signal, tx?): Promise<void> }` | không có | Kiểm tra thu hồi token **bên trong transaction** cho các request mà `bearerAuth` đã hoãn kiểm tra (`identity.revocationDeferred`). Thiếu tùy chọn này thì phần kiểm tra bị hoãn **bị bỏ qua**. Truyền chính `RevocationCache` đã dùng cho `bearerAuth`. |
| `catalogs` | `Catalogs` | không có | Dùng `dbErrorRules` trong catalog khi phân loại lỗi database. |
| `idempotencyGraceMs` | `number` | `5_000` | Thời gian ân hạn cho request ghi idempotent sau khi handler đã bắt đầu (xem dưới). |

**`ContextInitializer<Tx, Access>`** (từ `@ank-ingress/contracts`, ứng dụng phải viết):

| Thành viên | Ý nghĩa |
| --- | --- |
| `open(tx, identity, statementTimeoutMs, options?): Promise<Access>` | Bắt buộc. Gọi ngay sau `BEGIN`, trên cùng connection. `createRequestScope` luôn mở transaction với `hasCustomInitTimeout: true`, nghĩa là khung **không** tự đặt `statement_timeout`: `open` phải tự chạy `SELECT set_config('statement_timeout', $1, true)` với `String(statementTimeoutMs)`. Gộp luôn việc đóng dấu tenant vào cùng câu lệnh để tiết kiệm một vòng gửi nhận. `options.readOnly` cho biết transaction có chỉ đọc hay không. Giá trị trả về là `Access` đưa cho `policy.authorize` và cho handler. |
| `afterReadCommit?(tx, identity, access, statementTimeoutMs): Promise<void>` | Tùy chọn. Chỉ chạy với transaction **chỉ đọc** (cả `run` lẫn `authorize`), sau khi `COMMIT` thành công, trên cùng connection, trước khi connection được trả về pool. Ném lỗi ở đây làm connection bị hủy và request nhận lỗi dù dữ liệu đã commit. |

**`runner.run(params, handler): Promise<Reply>`** thực hiện, theo thứ tự:

1. Nếu `params.readOnly !== true` **và** có cả `params.idempotencyKey` lẫn `options.idempotency` thì chuyển sang luồng ghi idempotent (xem dưới). Ngược lại:
2. Gọi `withTx` với `deadlineAt = params.deadlineAt`, `readOnly`, `signal`, `catalogs`, `hasCustomInitTimeout: true`, số lần thử mặc định 3.
3. Trong transaction: nếu có `options.revocation`, `identity.claims` và `identity.revocationDeferred` thì gọi `revocation.check(claims, params.signal, tx)`.
4. Gọi `initializer.open(tx, identity, statementTimeoutMs, { readOnly })`.
5. Gọi `policy.authorize(access, params.permission ?? null, scopeParam ? { param } : {})`.
6. Nếu tín hiệu đã hủy hoặc đã quá `deadlineAt`, ném `AppError('COMMON-503-UNAVAILABLE')` ("Request cancelled before handler execution"), handler không chạy.
7. Gọi `handler(tx, access, execSignal, params.deadlineAt)` với `execSignal = tx.signal`. Handler trả về bình thường thì `COMMIT`; ném lỗi thì `ROLLBACK`.

Vì `withTx` có thể chạy lại cả hàm (xem "Thử lại" ở `withTx`), các bước 3–7, kể cả handler, có thể chạy hơn một lần cho một request.

**Luồng ghi idempotent** (`run` với `idempotencyKey` và `options.idempotency`):

- Transaction có deadline `params.deadlineAt + graceMs` (`graceMs = params.idempotencyGraceMs ?? options.idempotencyGraceMs ?? 5_000`) và chạy theo một tín hiệu riêng. Nếu client hủy **trước** khi handler bắt đầu, tín hiệu riêng hủy ngay. Nếu client hủy **sau** khi handler bắt đầu, handler được chạy tiếp tối đa `graceMs` rồi mới bị hủy với "Idempotent execution grace budget exceeded".
- `initializer.open(tx, identity, preHandlerRemainingMs, { readOnly: false })` và `idempotency.claim(tx, key)` được **gửi đồng thời** trên cùng connection (pipeline): câu lệnh mà `open` gửi trước lần `await` đầu tiên sẽ đi trước câu lệnh của `claim`.
- Kết quả `claim`: `replay` → trả lại kết quả đã lưu, thêm header `x-idempotent-replay: true` và `idempotent-replayed: true` (kết quả `empty` có status không hợp lệ thì dùng 204); `mismatch` → `AppError('COMMON-409-IDEMPOTENCY_MISMATCH')`; `pending` → `AppError('COMMON-409-IDEMPOTENCY_IN_PROGRESS')`; `fresh` → chạy handler.
- Trước khi chạy handler, nếu thời gian còn lại cho phần thực thi lớn hơn timeout đã đặt quá 250 ms, khung chạy thêm `SELECT set_config('statement_timeout', $1, true)` để nâng timeout lên.
- Reply `json`: thân được tuần tự hóa bằng `JSON.stringify` rồi `JSON.parse` lại; lỗi thì ném `COMMON-500-INTERNAL` ("Failed to serialize response payload before idempotent save") trước khi lưu. Reply `empty`: lưu `body: null`. Reply `text`: ném `COMMON-500-INTERNAL` ("Idempotent routes must reply with json or empty"), transaction rollback. Sau đó `idempotency.save(tx, key, result)` chạy trong cùng transaction rồi mới `COMMIT`.
- `afterReadCommit` không chạy trong luồng này.

**`runner.authorize(params): Promise<Access>`** mở transaction **chỉ đọc**, kiểm tra thu hồi bị hoãn (như bước 3), gọi `initializer.open(..., { readOnly: true })`, gọi `policy.authorize`, `COMMIT`, chạy `afterReadCommit` nếu có, rồi trả về `Access`. Không có handler.

Lỗi ném ra: mọi lỗi của `withTx` (mục dưới), lỗi `AppError` do `initializer`, `policy` hay `revocation` ném (giữ nguyên mã), các mã idempotency nêu trên.

```js
import { createPgDatabase, createRequestScope } from '@ank-ingress/postgres';
import { createClaimsPolicy, createRevocationCache } from '@ank-ingress/security';
import { createLogger } from '@ank-ingress/observability';

const db = createPgDatabase({
  applicationName: 'orders-api',
  logger: createLogger({ service: 'orders-api' }),
  config: { host: '127.0.0.1', port: 5432, database: 'orders', user: 'orders', password: process.env.POSTGRES_PASSWORD ?? '' },
});

// Nguồn thu hồi do ứng dụng viết (tra bảng session của ứng dụng).
const revocation = createRevocationCache({
  source: {
    async load() {
      return { tokenRevoked: false, sessionRevoked: false, accountDisabled: false, tokensValidAfterSec: null };
    },
  },
});

const scope = createRequestScope({
  db,
  policy: createClaimsPolicy(),
  revocation, // cùng cache đã truyền cho bearerAuth
  initializer: {
    async open(tx, identity, statementTimeoutMs) {
      // Tham số thứ ba `true` = chỉ có hiệu lực trong transaction này.
      await tx.query(
        "SELECT set_config('statement_timeout', $1, true), set_config('app.tenant_id', $2, true)",
        [String(statementTimeoutMs), identity.tenantId === null ? '' : String(identity.tenantId)],
      );
      return identity;
    },
  },
});
// createApp({ ..., auth: bearerAuth({ verifier, revocation }), scope: scope.run })
```

### Transaction tự quản

#### `withTx<T>(db: Pick<PgDatabase, 'gate'>, options: WithTxOptions, fn: (tx: Tx, statementTimeoutMs: number) => Promise<T>): Promise<T>`

Mượn một connection, mở transaction, chạy `fn`, rồi `COMMIT` hoặc `ROLLBACK`. Đây là lõi mà `createRequestScope` dùng; tầng trên gọi trực tiếp khi cần transaction **ngoài** request (job, consumer, script). Trong handler của một route đã có `tx` thì không gọi `withTx` (xem `rules-infra`).

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `deadlineAt` | `number` (epoch ms) | (bắt buộc) | Mốc tuyệt đối. Hết mốc thì transaction bị hủy và connection bị hủy. |
| `signal` | `AbortSignal` | (bắt buộc) | Hủy từ bên ngoài. Gộp với tín hiệu deadline bằng `AbortSignal.any`. |
| `isolation` | `'read committed' \| 'repeatable read'` | không ghi (mặc định của server) | Thêm `ISOLATION LEVEL ...` vào `BEGIN`. |
| `readOnly` | `boolean` | `false` | Thêm `READ ONLY` vào `BEGIN`. |
| `maxAttempts` | `number` | `3` | Số lần chạy tối đa khi gặp lỗi có thể thử lại. |
| `catalogs` | `Catalogs` | không có | Dùng `dbErrorRules` khi phân loại lỗi. |
| `hasCustomInitTimeout` | `boolean` | `false` | `true`: khung không đặt `statement_timeout`; `fn` phải tự đặt bằng `set_config('statement_timeout', $1, true)`. |
| `afterCommit` | `(tx: Tx, statementTimeoutMs: number) => Promise<void>` | không có | Chạy trên cùng connection ngay sau `COMMIT` thành công, trước khi trả connection. |

**Mở transaction.**

1. Một bộ hẹn giờ hủy tín hiệu nội bộ đúng lúc `deadlineAt` với `AppError('COMMON-503-UNAVAILABLE', 'Transaction deadline exceeded')`.
2. Mỗi lần thử: nếu đã hủy hoặc quá hạn, ném 503 ("Request deadline exceeded before opening transaction"). Mượn connection qua `gate.acquire(signal)`; nhận xong mà đã hủy/quá hạn thì trả connection và ném 503.
3. Tính `statementTimeoutMs = max(10, floor(deadlineAt - now - 25))`.
4. Gửi `BEGIN [ISOLATION LEVEL ...] [READ ONLY]`, rồi (nếu `hasCustomInitTimeout` không bật) `SELECT set_config('statement_timeout', $1, true)`. Khi client hỗ trợ pipeline (pool tạo bởi `createPgDatabase` luôn bật), hai câu này được gửi mà không chờ, và `fn` bắt đầu ngay; kết quả của chúng được chờ sau khi `fn` xong. Nếu không pipeline thì chờ tuần tự.
5. Nếu đã hủy/quá hạn, ném 503 ("Transaction deadline exceeded during initialization").
6. Gọi `fn(tx, statementTimeoutMs)`.

**Commit.** Sau khi `fn` trả về: chờ `BEGIN`/`set_config`; nếu đã hủy/quá hạn thì chờ các promise trong `queueBeforeCommit` rồi ném 503 ("Request cancelled before transaction commit"); chờ tất cả `queueBeforeCommit` (một promise bị reject làm transaction thất bại); kiểm tra hủy/quá hạn lần nữa; gửi `COMMIT`. Sau `COMMIT`: chạy `options.afterCommit` rồi lần lượt các callback đã đăng ký qua `tx.afterCommit`. Mọi callback đều chạy dù callback trước lỗi; nếu có lỗi thì connection **bị hủy** và hàm ném `AggregateError` ("Post-commit action failed"). Dữ liệu lúc này đã được commit.

**Rollback.** Khi `fn` hoặc bước commit ném lỗi: chờ các câu lệnh pipeline còn treo; nếu chưa commit và connection chưa bị hủy thì gửi `ROLLBACK` (lỗi của `ROLLBACK` bị bỏ qua); phân loại lỗi bằng `classifyDbError` (nếu tín hiệu đã hủy, lỗi được thay bằng 503 "Transaction cancelled" với `cause` là lỗi gốc).

**Thử lại.** Chạy lại toàn bộ `fn` trên một connection mới chỉ khi **tất cả** đúng: lỗi được phân loại `retryable`, `COMMIT` chưa được gửi, `tx.markSideEffect()` chưa được gọi, còn lượt thử, tín hiệu chưa hủy, và thời gian chờ `max(20, floor((25 + random·50) · 2^(attempt-1)))` ms vẫn kết thúc trước `deadlineAt`. Hết lượt mà vẫn vào vòng lặp thì ném 503 ("Transaction retries exhausted").

**Khi nào connection bị hủy thay vì trả về pool** (hủy = `discardPgClient`: đóng socket rồi `release(true)`, pool không dùng lại connection đó):

- Tín hiệu bị hủy (client ngắt, hết `deadlineAt`, hoặc `tx.cancel()`) khi connection đang được giữ. Việc hủy xảy ra ngay lúc tín hiệu bắn, kể cả khi câu lệnh còn đang chạy; câu lệnh đó nhận lỗi và không có `ROLLBACK` nào được gửi.
- Một hook sau commit (`options.afterCommit` hoặc `tx.afterCommit`) ném lỗi.

Các trường hợp còn lại (commit thành công, rollback thành công, kể cả khi `ROLLBACK` lỗi) connection được trả bằng `release()` thường; `pg-pool` tự loại connection không còn dùng được.

Lỗi ném ra: `AppError('COMMON-503-UNAVAILABLE')` cho mọi trường hợp hết hạn/hủy/hàng chờ đầy/không mượn được connection; `AppError` từ `classifyDbError` cho lỗi SQL; `AggregateError` khi hook sau commit lỗi.

```js
import { withTx } from '@ank-ingress/postgres';

// Trong một job; db là PgDatabase đã tạo ở setupInfra.
const expired = await withTx(db, { deadlineAt: Date.now() + 10_000, signal: AbortSignal.timeout(10_000) }, async (tx) => {
  const { rowCount } = await tx.query("UPDATE orders SET status = 'expired' WHERE expires_at < now() AND status = 'open'");
  return rowCount ?? 0;
});
```

### Phân loại lỗi database

#### `classifyDbError(err: unknown, catalogs?: Catalogs): MappedDbError`

Đổi một lỗi bất kỳ thành `{ appError, retryable }`, theo thứ tự ưu tiên:

1. `err` đã là `AppError` → giữ nguyên, `retryable: false`.
2. Có `catalogs` và `catalogs.dbErrors.resolve(sqlstate, constraint)` tìm được quy tắc → `new AppError(rule.code, { message: err.message ?? rule.code, cause: err })`, `retryable: rule.retryable ?? false`. `sqlstate` lấy từ `err.code`, `constraint` từ `err.constraint` (các trường của lỗi `pg`).
3. SQLSTATE có trong bảng mặc định dưới đây.
4. Còn lại → `COMMON-500-INTERNAL`, `retryable: false`, `message` là `err.message ?? 'Database error'`.

| SQLSTATE | Ý nghĩa PostgreSQL | Mã `AppError` | `retryable` |
| --- | --- | --- | --- |
| `57014` | query_canceled (gồm hết `statement_timeout`) | `COMMON-503-UNAVAILABLE` | `false` |
| `55P03` | lock_not_available | `COMMON-503-UNAVAILABLE` | `true` |
| `53300` | too_many_connections | `COMMON-503-UNAVAILABLE` | `true` |
| `40001` | serialization_failure | `COMMON-503-UNAVAILABLE` | `true` |
| `40P01` | deadlock_detected | `COMMON-503-UNAVAILABLE` | `true` |
| `08006` | connection_failure | `COMMON-503-UNAVAILABLE` | `true` |
| `08003` | connection_does_not_exist | `COMMON-503-UNAVAILABLE` | `true` |
| `23505` | unique_violation | `COMMON-409-CONFLICT` | `false` |
| `23503` | foreign_key_violation | `COMMON-409-CONFLICT` | `false` |
| `23514` | check_violation | `COMMON-422-VALIDATION` | `false` |
| `23502` | not_null_violation | `COMMON-422-VALIDATION` | `false` |
| `22P02` | invalid_text_representation | `COMMON-422-VALIDATION` | `false` |
| `42501` | insufficient_privilege (gồm vi phạm RLS) | `COMMON-403-FORBIDDEN` | `false` |

**`dbErrorRules` trong catalog.** Module khai báo trong `CatalogContribution.dbErrorRules`: mỗi quy tắc `{ match: { sqlstate?, constraint? }, code, retryable? }`. `buildCatalogs` ném `CompositionError` khi quy tắc không có cả `sqlstate` lẫn `constraint`, hoặc khi hai module khai báo trùng cặp `sqlstate::constraint`. Khi tra, `resolve` ưu tiên: (1) quy tắc khớp cả `sqlstate` và `constraint`; (2) quy tắc chỉ có `constraint`; (3) quy tắc chỉ có `sqlstate`. Quy tắc trong catalog thắng bảng mặc định.

```js
import { buildCatalogs } from '@ank-ingress/contracts';

const catalogs = buildCatalogs([
  {
    owner: 'orders',
    c: {
      errorCodes: { 'ORDERS-409-DUPLICATE_NUMBER': { message: 'Số đơn hàng đã tồn tại' } },
      dbErrorRules: [{ match: { sqlstate: '23505', constraint: 'orders_number_key' }, code: 'ORDERS-409-DUPLICATE_NUMBER' }],
    },
  },
]);
// Truyền catalogs vào createRequestScope({ catalogs, ... }) để withTx dùng.
```

#### `toAppError(err: unknown, catalogs?: Catalogs): AppError`

Rút gọn của `classifyDbError(err, catalogs).appError`. Dùng trong adapter tự bắt lỗi `pg` (ví dụ ngoài `withTx`) để có mã lỗi thống nhất.

### Kiểu dữ liệu

**`PgConfig`** (ứng dụng tạo):

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `host` | `string` | (bắt buộc) | Máy chủ PostgreSQL. |
| `port` | `number` | (bắt buộc) | Cổng. |
| `database` | `string` | (bắt buộc) | Tên database. |
| `user` | `string` | (bắt buộc) | Người dùng. |
| `password` | `string \| SecretHolder` | (bắt buộc) | Mật khẩu; `SecretHolder` được đọc lại mỗi lần mở connection mới. |
| `maxConnections` | `number` | `20` | `max` của pool **và** số slot của `PoolGate`. |
| `maxWaiting` | `number` | `64` | Số người được xếp hàng chờ ở gate; vượt thì bị từ chối ngay. |
| `idleTimeoutMs` | `number` | `30_000` | Connection rảnh quá thời gian này thì pool đóng. |
| `connectionTimeoutMs` | `number` | `5_000` | Thời gian tối đa để `pg.Pool` mở/cấp một connection. |

**`CreatePgDatabaseOptions`** (ứng dụng tạo): `config`, `applicationName`, `logger`, `metrics?`, `name?`, xem bảng ở `createPgDatabase`.

**`RequestScopeOptions<Access>`** (ứng dụng tạo): `db`, `initializer`, `policy`, `idempotency?`, `revocation?`, `catalogs?`, `idempotencyGraceMs?`, xem bảng ở `createRequestScope`.

**`WithTxOptions`** (ứng dụng tạo khi gọi `withTx`): xem bảng ở `withTx`.

**`Tx`** (khung tạo, repository và handler dùng):

| Thành viên | Ý nghĩa |
| --- | --- |
| `client: PoolClient` | Connection `pg` thô. Gọi thẳng `client.query` sẽ bỏ qua kiểm tra hạn của `tx.query`. Không gọi `client.release()`. |
| `query<R>(text, values?): Promise<QueryResult<R>>` | Chạy câu lệnh có tham số `$1, $2…`. Nếu tín hiệu đã hủy hoặc quá `deadlineAt`, reject ngay với `COMMON-503-UNAVAILABLE` ("Transaction execution budget exhausted") mà không gửi gì. Lỗi SQL được trả nguyên dạng lỗi `pg` (chỉ được đổi sang `AppError` khi lan ra khỏi `withTx`). |
| `signal?: AbortSignal` | Tín hiệu đã gộp (request + deadline + `cancel`). Truyền vào lời gọi chậm bên ngoài. Trong `withTx` luôn có. |
| `cancel?(reason?: Error): void` | Hủy transaction ngay: connection bị hủy, `fn` nhận lỗi ở câu lệnh tiếp theo. Mặc định lý do là 503 "Transaction cancelled". |
| `afterCommit?(callback): void` | Đăng ký việc chạy **sau khi COMMIT thành công** (không chạy khi rollback). Callback được `await` tuần tự, vẫn giữ connection, và lỗi của nó làm request lỗi (xem `withTx`). |
| `markSideEffect?(): void` | Báo rằng transaction đã gây hiệu ứng không lặp lại được; từ đó `withTx` không thử lại lần nữa. |
| `queueBeforeCommit?(promise): void` | Chỉ có khi connection hỗ trợ pipeline. Đăng ký một promise (thường là `tx.query(...)` không `await`) mà `COMMIT` phải chờ; promise reject thì transaction rollback. |

Các thành viên có dấu `?` là tùy chọn trong kiểu vì `Tx` cũng được dùng cho bản giả lập trong test; `Tx` do `withTx` tạo luôn có `signal`, `cancel`, `afterCommit`, `markSideEffect`, và có `queueBeforeCommit` khi pipeline bật.

**`RunRequestScopeParams`** (stage `scope` của tầng HTTP tạo; chỉ tự tạo khi gọi `scope.run` trực tiếp, ví dụ trong test):

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `identity` | `Identity` | Kết quả của stage `auth`. |
| `permission?` | `PermissionSpec \| null` | Quyền route yêu cầu; `null`/thiếu là không kiểm tra role. |
| `scopeParam?` | `string \| number` | Giá trị tham số path dùng khi phân quyền. |
| `idempotencyKey?` | `IdempotencyKey \| null` | Có (và có `options.idempotency`, và không chỉ đọc) thì đi luồng idempotent. |
| `readOnly?` | `boolean` | `true` → `BEGIN READ ONLY`. |
| `deadlineAt` | `number` | Mốc tuyệt đối (epoch ms). |
| `signal` | `AbortSignal` | Hủy khi client ngắt kết nối. |
| `idempotencyGraceMs?` | `number` | Ghi đè thời gian ân hạn cho request này. |

**`AuthorizeRequestScopeParams`** (stage `authorize` tạo): `identity`, `permission: PermissionSpec | null`, `scopeParam?`, `deadlineAt`, `signal`, cùng nghĩa như trên.

| Kiểu | Mô tả |
| --- | --- |
| `PgDatabase` | `{ pool: Pool; gate: PoolGate; resource: PgResource; close(): Promise<void> }` do `createPgDatabase` trả về. |
| `PgResource` | `{ name; required; check(signal?); close() }`, tương thích `Resource` của `runApp` (`ctx.use(db.resource)`). |
| `RequestScopeRunner<Access>` | `{ authorize(params): Promise<Access>; run(params, handler): Promise<Reply> }`. |
| `MappedDbError` | `{ appError: AppError; retryable: boolean }`, kết quả của `classifyDbError`. |

### Nội bộ

Các export dưới đây là phần ống nước mà `createPgDatabase`/`withTx` đã dùng sẵn; **tầng trên không nên gọi trực tiếp**.

| Export | Mô tả |
| --- | --- |
| `createPoolGate(pool, options): PoolGate` | Bọc `pool.connect()` bằng bộ đếm slot. Còn slot (`activeSlots < maxConnections`) và không ai chờ thì cấp ngay; hết slot thì xếp hàng FIFO; hàng chờ đã có `maxWaiting` người thì reject ngay với `COMMON-503-UNAVAILABLE` ("Database connection waiting queue full"). Người chờ không có timeout riêng: chỉ rời hàng khi `signal` bị hủy (503 "Aborted while waiting for DB connection"). Hủy trong lúc đang mở connection thì reject ngay, connection mở xong được trả lại pool. `pool.connect()` lỗi → 503 "Failed to acquire database connection" (`cause` là lỗi gốc). `release` của client được bọc để chỉ chạy một lần và trả slot cho người chờ kế tiếp. Không truyền `maxConnections` thì lấy `pool.options.max`, nếu không có thì `1`. |
| `PoolGate` | `{ acquire(signal?): Promise<PoolClient>; readonly waiting: number }`. |
| `PoolGateOptions` | `{ maxWaiting; maxConnections?; metrics?; poolName? }` (nhãn metric mặc định `'default'`). |
| `discardPgClient(client): void` | Đóng socket của connection (kể cả đang có pipeline dở) rồi `release(true)`. |

---

## `@ank-ingress/workers`

Gói layer 5, cung cấp hai cách chạy việc ngoài đường xử lý request: `WorkerPool` đẩy việc nặng CPU sang worker thread để event loop chính không bị chặn, và `createJobRunner` là một `Inbound` lấy job nền từ job store của ứng dụng rồi chạy có lease, heartbeat, deadline và retry. Framework không có bảng job: ứng dụng tự cài `JobStore` (và `HousekeepingStore` nếu cần) theo port trong `@ank-ingress/contracts`.

### Worker pool cho việc nặng CPU

#### `new WorkerPool(options: WorkerPoolOptions)`

Tạo ngay `size` worker thread. Mỗi worker nạp các module trong `tasks` (bằng `import(moduleUrl)`) rồi báo sẵn sàng. Hàm xử lý cho task `name` được tìm theo thứ tự: export tên `name` của module → thuộc tính `name` của `export default` (khi default là object) → `export default` (khi là hàm). Không tìm thấy thì worker ném `Worker task "<name>" not found in "<url>"` lúc nạp, worker chết và được tạo lại (lặp lại với backoff).

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `size` | `number` | bắt buộc | Số worker thread; nhỏ hơn 1 thì dùng 1. |
| `maxQueue` | `number` | bắt buộc | Số task tối đa được xếp hàng khi không có worker rảnh; nhỏ hơn 0 thì dùng 0. |
| `tasks` | `readonly WorkerTaskSpec[]` | bắt buộc | `{ name, moduleUrl }`; `moduleUrl` là URL tuyệt đối (thường `new URL('./x.task.js', import.meta.url).href`). |
| `maxOldGenerationSizeMb` | `number` | không giới hạn riêng | Giới hạn heap của mỗi worker (`resourceLimits`). Vượt giới hạn thì chỉ worker đó chết, task đang chạy bị reject và worker được tạo lại. |
| `defaultTimeoutMs` | `number` | `30 000` | Thời hạn mặc định của một task, tính từ lúc task được giao cho worker. |
| `respawnBackoff.baseMs` | `number` | `100` | Nền backoff khi tạo lại worker liên tiếp. |
| `respawnBackoff.capMs` | `number` | `5 000` | Trần backoff; không vượt quá `5 000` dù đặt lớn hơn. |
| `metrics` | `MetricsRegistry` | không có | Bật metric `ank_worker_queue_depth`, `ank_worker_restarts_total`, `ank_worker_task_seconds{task}`. |

Tạo lại worker: lần chết đầu tạo lại ngay; các lần liên tiếp sau chờ `min(capMs, baseMs × 2^(n−2))` nhân hệ số ngẫu nhiên `0.75..1`. Bộ đếm lần chết được đặt lại khi có task trả kết quả.

#### `pool.run<R = unknown>(task: string, payload: unknown, options?: RunWorkerTaskOptions): Promise<R>`

Đưa task vào hàng đợi và giao cho worker rảnh. Kết quả của hàm trong worker được trả về (qua structured clone; `ArrayBuffer` và typed array kết quả được chuyển quyền sở hữu thay vì sao chép).

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `transfer` | `readonly TransferListItem[]` | không có | Chuyển quyền sở hữu buffer sang worker (không sao chép; buffer gốc bị tách). `Buffer` của Node và view chỉ phủ một phần buffer được sao chép sang buffer riêng trước khi chuyển, để không làm hỏng vùng nhớ dùng chung. Chuyển thất bại thì tự quay về structured clone. |
| `timeoutMs` | `number` | `defaultTimeoutMs` | Hạn của task này. Quá hạn thì worker bị `terminate`, tạo lại worker mới. |
| `signal` | `AbortSignal` | không có | Hủy task **khi task còn trong hàng đợi**. Task đã được giao cho worker thì không bị hủy theo signal (chỉ dừng theo `timeoutMs`). |

Lỗi (đều là `AppError`):

| Mã | Message | Khi nào |
| --- | --- | --- |
| `COMMON-503-UNAVAILABLE` | `Worker pool is draining or closed` | Gọi sau `drain()` hoặc `close()` |
| `COMMON-503-UNAVAILABLE` | `Worker task aborted before queueing` | `signal` đã abort lúc gọi |
| `COMMON-503-UNAVAILABLE` | `Worker pool queue full` | Không có worker rảnh và hàng đợi đã đủ `maxQueue` |
| `COMMON-503-UNAVAILABLE` | `Worker task aborted in queue` / `…while queued` | `signal` abort khi task còn chờ |
| `COMMON-503-UNAVAILABLE` | `Worker task "<task>" timed out after <n>ms` | Quá `timeoutMs` |
| `COMMON-503-UNAVAILABLE` | `Worker pool closed` | Pool bị `close()` khi task đang chờ hoặc đang chạy |
| `COMMON-500-INTERNAL` | message của lỗi ném trong worker | Hàm task ném lỗi (mã `code` của lỗi gốc không được giữ) |
| `COMMON-500-INTERNAL` | message lỗi hoặc `Worker exited (<code>)` | Worker chết khi đang chạy task |

Lưu ý: hạn `timeoutMs` chỉ bắt đầu khi task được giao cho worker. Task còn trong hàng đợi không tự hết hạn; muốn giới hạn thời gian chờ thì truyền `signal`.

```js
// src/reports/render-pdf.task.js (.ts nếu dự án viết bằng TypeScript)
export default {
  async 'reports.render-pdf'(payload) {
    return renderPdf(payload); // chạy trong worker thread
  },
};
```

```js
// trong một handler hoặc use case
const pdf = await services.pool.run('reports.render-pdf', { orderId }, {
  timeoutMs: 10_000,
  signal: AbortSignal.timeout(2_000), // tối đa 2 giây chờ trong hàng đợi
});
```

#### `pool.drain(signal: AbortSignal): Promise<void>`

Chuyển pool sang trạng thái draining (mọi `run()` sau đó bị từ chối) rồi chờ tới khi hàng đợi rỗng và không còn worker bận, hoặc tới khi `signal` abort (resolve, không reject).

#### `pool.close(): Promise<void>`

Đóng pool (gọi lại nhiều lần không sao): hủy các lần tạo lại đang hẹn, reject mọi task đang chờ và đang chạy với `Worker pool closed`, rồi `terminate` mọi worker.

#### Thuộc tính chỉ đọc

| Thuộc tính | Ý nghĩa |
| --- | --- |
| `activeWorkers` | Số worker đang tồn tại (kể cả chưa sẵn sàng). |
| `replacingWorkers` | Số worker đang chờ tạo lại theo backoff. |
| `queueDepth` | Số task đang chờ. |

#### `workerPoolResource(pool: WorkerPool, name = 'worker-pool'): Resource & Pick<Inbound, 'drain'>`

Bọc pool thành `Resource` để `ctx.use`: `required: true`; `check()` ném `No active workers in pool` khi `activeWorkers + replacingWorkers <= 0`; `close()` gọi `pool.close()`; `drain(signal)` gọi `pool.drain(signal)`. Runtime chỉ gọi `check` và `close` của tài nguyên; `drain` có sẵn để ứng dụng tự gọi nếu muốn chờ task của pool trong bước drain.

```js
import { WorkerPool, workerPoolResource } from '@ank-ingress/workers';

const reportTasks = [
  { name: 'reports.render-pdf', moduleUrl: new URL('./reports/render-pdf.task.js', import.meta.url).href },
];

// trong setupInfra(ctx), sau khi đã ctx.use(db.resource)
const pool = new WorkerPool({ size: 2, maxQueue: 100, tasks: reportTasks, metrics: ctx.metrics });
ctx.use(workerPoolResource(pool));
```

Task do module góp qua role `tasks` chỉ có trong `modules.workerTasks`, tức là ở `boot`; pool dựng từ danh sách này phải được tạo và `ctx.use` trong `boot`.

### Job runner

#### `createJobRunner(options: JobRunnerOptions): JobRunner`

Tạo một `Inbound` lấy job từ `jobStore` và chạy bằng handler tương ứng (`modules.jobs` khi dùng module). Trả về từ `boot` (hoặc gộp bằng `compositeInbound`) để runtime start, stop và drain đúng lúc.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `jobStore` | `JobStore` | bắt buộc | Store do ứng dụng cài (xem bên dưới). |
| `handlers` | `readonly JobHandlerSpec[]` | bắt buộc | Handler theo `spec.name`. |
| `workerId` | `string` | bắt buộc | Định danh worker gửi cho store; nên dùng `ctx.instanceId`. |
| `concurrency` | `number` | `4` | Số job chạy đồng thời tối đa (số nguyên ≥ 1). |
| `batchSize` | `number` | `10` | Số job tối đa mỗi lần `claim` (số nguyên ≥ 1). |
| `pollIntervalMs` | `number` | `250` | Thời gian nghỉ khi không có job, khi đầy slot hoặc sau lỗi `claim`. |
| `leaseMs` | `number` | `30 000` | Thời hạn lease khi `claim` và mỗi lần heartbeat (≥ 100). |
| `jobTimeoutMs` | `number` | `300 000` | Hạn mặc định của một job; `spec.timeoutMs` của handler ghi đè. |
| `retryBackoffBaseMs` | `number` | `5 000` | Nền backoff retry. |
| `housekeeping` | `JobRunnerHousekeepingOptions` | không có | Bật vòng thu hồi lease hết hạn và dọn dữ liệu cũ. |
| `logger` | `Logger` | không có | Không truyền thì runner không log gì. |
| `metrics` | `MetricsRegistry` | không có | Bật `ank_worker_jobs_total{job_type,status}`, `ank_worker_reaped_leases_total{kind}`, `ank_worker_purged_events_total{store}`. |

`JobRunnerHousekeepingOptions`:

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `store` | `HousekeepingStore` | bắt buộc | Store dọn dẹp do ứng dụng cài. |
| `reapIntervalMs` | `number` | `30 000` | Chu kỳ gọi `reapExpiredLeases`. |
| `reapBatchSize` | `number` | `500` | Tham số `limit` cho `reapExpiredLeases`. |
| `purgeIntervalMs` | `number` | `3 600 000` (1 giờ) | Chu kỳ gọi `purgeExpiredEvents`. |
| `purgeBatchSize` | `number` | `10 000` | `batchSize` mỗi lần purge. |
| `outboxRetentionMs` | `number` | 7 ngày | `outboxOlderThanMs`. |
| `inboxRetentionMs` | `number` | 14 ngày | `inboxOlderThanMs`; phải lớn hơn hẳn `replayWindowMs` và `outboxRetentionMs`. |
| `replayWindowMs` | `number` | 7 ngày | Chỉ dùng để kiểm tra ràng buộc trên. |
| `maxPurgeBatchesPerTick` | `number` | `50` | Số lần purge tối đa mỗi chu kỳ; dừng sớm khi mọi bộ đếm trả về đều nhỏ hơn `purgeBatchSize`. |

Lỗi khi tạo (`CompositionError`, mã thoát `78` nếu ném lúc khởi động): `Invalid worker concurrency`, `Invalid worker batchSize`, `Invalid worker leaseMs`, `Inbox retention (…) must be strictly greater than replay window (…) and outbox retention (…)`, `Duplicate job handler registered for "<name>"`.

Hành vi:

- **Poll.** Một vòng lặp tuần tự duy nhất: `claim(workerId, tênCácHandler, min(batchSize, slotTrống), leaseMs)`. Lỗi `claim` được log `worker.poll_claim_failed` rồi nghỉ `pollIntervalMs`. Job xong thì vòng lặp được đánh thức ngay.
- **Chạy job.** Mỗi job có `AbortController` riêng; handler được gọi `handle(job, signal)` trong scope log có `correlationId` và `tenantId` của job. Signal bị abort khi: quá hạn (`spec.timeoutMs ?? jobTimeoutMs`), mất lease, hoặc hết ngân sách drain.
- **Lease.** Lease mỗi job là `leaseMs` của runner (`spec.leaseMs` của job **không** được dùng). Nếu store có `heartbeat`, runner gia hạn mỗi `max(25, floor(leaseMs / 3))` ms; `heartbeat` trả `false`, hoặc lỗi liên tục trong `leaseMs`, thì job bị coi là mất lease: signal bị abort, kết quả bị bỏ, không gọi `complete`/`fail`.
- **Thành công.** `complete(id, output, { worker, leaseGeneration })`. Nếu handler trả về sau hạn, kết quả bị coi là lỗi. `complete` trả `false` thì log `worker.job_complete_fenced`.
- **Lỗi.** Nếu `job.attempts < job.maxAttempts` thì `retryAt = now + retryBackoffBaseMs × 2^max(0, attempts − 1)`, ngược lại `retryAt = null`. Mã lỗi gửi store: `code` của `AppError`; `'JOB_TIMEOUT'` khi quá hạn và lỗi không phải `AppError`; nếu không thì message của lỗi. `errorDetail` luôn là message. Gọi `fail(id, code, retryAt, { worker, leaseGeneration, errorDetail })`; trả `false` thì log `worker.job_fail_fenced`, ném lỗi thì log `worker.job_fail_store_error` (job giữ nguyên lease tới khi bị thu hồi).
- **Runner không tự tăng `attempts`.** Store phải tăng khi `claim`; nếu không, job lỗi được retry mãi.
- **Không có `pause`/`resume`.** Khi tiến trình `NOT_READY`, runner vẫn tiếp tục poll.

Tắt máy:

- `stop()`: ngừng poll và các vòng housekeeping, chờ chúng thoát. Job đang chạy vẫn chạy tiếp. Job đã `claim` đúng lúc đang dừng được trả lại bằng `release(workerId, ids)` nếu store có.
- `drain(signal)`: chờ mọi job đang chạy (và lời gọi `claim`/housekeeping đang dở) xong. Khi `signal` abort: abort signal của mọi job còn chạy, đánh dấu chúng để **trả lại** bằng `release(workerId, [id], leaseGeneration)` thay vì `complete`/`fail`, rồi chờ thêm tối đa **250 ms**. Job nào vẫn chưa xong sau đó tiếp tục chạy trong khi runtime sang bước đóng tài nguyên.

#### `runner.runReapOnce(): Promise<HousekeepingReapResult>` / `runner.runPurgeOnce(): Promise<HousekeepingPurgeResult>`

Chạy một lượt thu hồi / dọn dẹp ngay (kể cả khi runner chưa start), dùng cho test hoặc lệnh vận hành. Không cấu hình `housekeeping` thì trả toàn số 0.

```js
import { createPgDatabase } from '@ank-ingress/postgres';
import { runApp } from '@ank-ingress/runtime';
import { createJobRunner } from '@ank-ingress/workers';
import { billingModule } from './billing.module.js';
import { createPgJobStore } from './adapters/postgres/job-store.js'; // ứng dụng tự viết

const env = process.env;

runApp({
  name: 'billing-worker',
  schema: {},
  roles: ['jobs'],
  modules: [billingModule],
  setupInfra(ctx) {
    const db = createPgDatabase({
      name: 'billing',
      applicationName: 'billing-worker',
      logger: ctx.logger,
      config: {
        host: env.POSTGRES_HOST ?? '127.0.0.1',
        port: Number(env.POSTGRES_PORT ?? 5432),
        database: env.POSTGRES_DB ?? 'postgres',
        user: env.POSTGRES_USER ?? 'postgres',
        password: env.POSTGRES_PASSWORD ?? '',
      },
    });
    ctx.use(db.resource);
    return { db };
  },
  boot(ctx, _config, modules, services) {
    return createJobRunner({
      jobStore: createPgJobStore(services.db),
      handlers: modules.jobs,
      workerId: ctx.instanceId,
      logger: ctx.logger,
      metrics: ctx.metrics,
    });
  },
});
```

#### Ứng dụng phải cài gì: `JobStore`

Port trong `@ank-ingress/contracts`. Runner dựa vào các hợp đồng sau:

| Phương thức | Runner gọi khi | Store phải đảm bảo |
| --- | --- | --- |
| `claim(worker, types, limit, leaseMs)` | Mỗi vòng poll | Chỉ trả job có `type` thuộc `types` (job khác loại bị runner bỏ qua, nằm im tới khi lease hết); không quá `limit`; ghi lease `leaseMs` cho `worker`; **tăng `attempts`** và (nên) tăng `leaseGeneration`; trả `JobRecord` với `attempts`, `maxAttempts`, `tenantId`, `correlationId`, `leaseGeneration`. |
| `heartbeat?(id, worker, leaseMs, leaseGeneration)` | Mỗi `leaseMs / 3` | Gia hạn lease; trả `false` nếu job không còn thuộc `worker`/`leaseGeneration` này. Không cài thì lease không được gia hạn. |
| `complete(id, result, { worker, leaseGeneration })` | Job thành công | Lưu kết quả; trả `false` nếu lease đã đổi chủ/thế hệ (fencing). |
| `fail(id, code, retryAt, { worker, leaseGeneration, errorDetail })` | Job lỗi | `retryAt` khác `null` thì xếp lại job tới thời điểm đó, `null` thì đánh dấu thất bại cuối; trả `false` khi bị fencing. |
| `release?(worker, jobIds?, leaseGeneration?)` | Dừng/drain | Trả job về hàng đợi ngay; không cài thì job chờ tới khi lease hết và bị thu hồi. |

`HousekeepingStore` (khi bật `housekeeping`): `reapExpiredLeases(limit)` trả `{ reapedJobs, reapedCalculations, expiredReservations }`; `purgeExpiredEvents({ outboxOlderThanMs, inboxOlderThanMs, batchSize })` trả `{ purgedOutbox, purgedInbox, purgedReceipts?, purgedIdempotencyKeys?, purgedRevocations? }`. Ứng dụng không có loại dữ liệu nào thì trả `0` cho trường đó.

`@ank-ingress/testing` **không** có bản giả hay bộ contract cho `JobStore`; xem `packages/workers/tests/job-runner-and-housekeeping.test.ts` để thấy một store giả trong bộ nhớ đáp ứng đúng các hợp đồng trên.

### Kiểu dữ liệu

#### `WorkerPoolOptions` (ứng dụng tạo)

Mọi trường đã mô tả trong bảng tùy chọn của `new WorkerPool`: `size`, `maxQueue`, `tasks`, `maxOldGenerationSizeMb?`, `defaultTimeoutMs?`, `respawnBackoff?: { baseMs?, capMs? }`, `metrics?`.

#### `RunWorkerTaskOptions` (ứng dụng tạo)

Mọi trường đã mô tả ở `pool.run`: `transfer?`, `timeoutMs?`, `signal?`.

#### `JobRunnerOptions`, `JobRunnerHousekeepingOptions` (ứng dụng tạo)

Mọi trường đã mô tả trong hai bảng tùy chọn của `createJobRunner`.

#### Kiểu khác

| Kiểu | Mô tả |
| --- | --- |
| `WorkerPool` | Lớp worker pool (vừa là giá trị vừa là kiểu). |
| `JobRunner` | `Inbound` (`start`, `stop`, `drain`) cộng `runReapOnce()` và `runPurgeOnce()`. |

### Nội bộ

Gói này không có export nội bộ; mọi export ở trên đều dành cho tầng trên.

---

---

## `@ank-ingress/http`

Lớp inbound HTTP chạy trên uWebSockets.js: biên dịch các route spec (khai báo bằng `@ank-ingress/contracts`) thành handler uWS và chạy pipeline admission → rate limit → xác thực → đọc body → kiểm tra schema → transaction/phân quyền → handler → audit → gửi phản hồi, kèm deadline, CORS, header bảo mật và sinh OpenAPI. Gói này không đụng tới database: transaction, idempotency, audit đều đi qua các stage do tầng trên cung cấp. Phần lớn ứng dụng dùng gián tiếp qua `createApp` của `@ank-ingress/app` (`CreateAppOptions` chính là `CreateHttpAppOptions` bỏ `routes`, `catalogs`, `logger`); tầng trên import trực tiếp gói này khi viết stage `auth`/`authorize`/`scope`/`onAudit`, khi cần store rate limit, khi sinh OpenAPI, hoặc khi tự lắp composition root.

### Tạo server HTTP

#### `createHttpApp<Tx = unknown, Access = unknown>(options: CreateHttpAppOptions<Tx, Access>): HttpApp`

Biên dịch toàn bộ `options.routes` **ngay lúc gọi** (mọi lỗi cấu hình route ném ra tại đây, không phải lúc đang phục vụ), đăng ký chúng lên một `uWS.App()` và trả về `HttpApp`. Chưa mở cổng nào cho tới khi gọi `inbound(...).start()`.

Hành vi chính:

- Route được sắp để đoạn tĩnh đăng ký trước đoạn tham số trên cùng tiền tố (`/items/new` trước `/items/:id`).
- Mỗi route `GET` tự có thêm `HEAD`. `HEAD` chạy **cùng handler** (kể cả transaction), chỉ bỏ phần body và giữ `content-length`.
- Lần `listen` đầu tiên đăng ký thêm các fallback: trả lời preflight `OPTIONS` trên mọi path đã biết (khi bật `cors`), `405 COMMON-405-METHOD_NOT_ALLOWED` kèm header `allow` cho method sai trên path đã biết, và `404 COMMON-404-NOT_FOUND` (`"Route not found"`) cho mọi path khác. Body của 404/405 không có `correlationId` và không mang header bảo mật hay CORS.
- Khi truyền `metrics`: counter `ank_http_requests_total{method,route,status}`, histogram `ank_http_request_duration_seconds{method,route}`, counter `ank_http_shed_total` (request bị từ chối lúc admission), và nếu registry có `onCollect` thì gauge `HTTP_IN_FLIGHT_METRIC` (`ank_http_in_flight_work`, số việc HTTP + WebSocket đang chạy).
- `trustedProxies` được chuẩn hóa bằng `normalizeIp`; mục nào không phải IP hợp lệ bị **bỏ qua im lặng**.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `routes` | `readonly RouteFor<Tx, Access>[]` | bắt buộc | Danh sách route spec (thường tạo bằng `defineRoute`), path đầy đủ kể cả tiền tố |
| `catalogs` | `Catalogs` | bắt buộc | Tra mã quyền (`permissions`) lúc biên dịch và thông điệp lỗi công khai (`errors`) lúc trả lỗi |
| `logger` | `Logger` | bắt buộc | Ghi `http.error`, `http.serialize_failed`, `http.unhandled_pipeline_error` |
| `limits` | `HttpLimits` | xem bảng `HttpLimits` | Giới hạn admission, timeout, body |
| `trustedProxies` | `readonly string[]` | `[]` | IP proxy được tin `X-Forwarded-For/-Proto/-Host`; ưu tiên hơn `limits.trustedProxies` |
| `trustUnixSocket` | `boolean` | `false` | Tin `X-Forwarded-*` khi peer không có IP (kết nối qua Unix socket); ưu tiên hơn `limits.trustUnixSocket` |
| `auth` | `AuthStage` | — | Bắt buộc nếu có route không `public` |
| `authorize` | `AuthorizeStage` | — | Kiểm tra quyền cho route theo mã quyền có `tx: 'none'` |
| `scope` | `ScopeStage<Tx, Access>` | — | Bắt buộc nếu có route `tx` khác `'none'` |
| `onAudit` | `AuditHook<Tx, Access>` | — | Bắt buộc nếu có route khai báo `audit` |
| `rateLimit` | `RateLimitStore` | — | Bắt buộc nếu có route khai báo `rateLimit` |
| `correlationHeader` | `boolean` | `true` | `false`: bỏ qua `X-Correlation-Id` của request và không trả header này (vẫn sinh id cho log, body lỗi, store) |
| `traceparent` | `boolean` | `true` | `false`: không đọc W3C `traceparent`, mọi request bắt đầu trace mới |
| `cors` | `CorsOptions` | tắt | Thêm header CORS cho origin được phép và trả lời preflight |
| `securityHeaders` | `SecurityHeadersOption` | tắt | Header bảo mật cho mọi phản hồi route; header cùng tên trong `Reply` thắng |
| `metrics` | `MetricsRegistry` | — | Bật các metric nêu trên |

Lỗi ném ra (đều là `CompositionError`, lúc gọi `createHttpApp`):

| Thông báo | Khi nào |
| --- | --- |
| `Route "M /p" requires authentication, but no auth stage is configured` | Route không `public` mà thiếu `auth` |
| `Route "M /p" references unknown permission "x"` | Mã quyền không có trong `catalogs.permissions` |
| `... requires permission "x" with tx: "none", but no authorize or scope stage is configured` | Route theo mã quyền, `tx: 'none'`, thiếu cả `authorize` lẫn `scope` |
| `Route "M /p" declares rateLimit, but no rateLimit store is configured` | Thiếu `rateLimit` |
| `Route "M /p" has tx: "read"\|"write", but no scope stage is configured` | Route có transaction mà thiếu `scope` |
| `Route "M /p" cannot declare audit on a public route` / `declares audit metadata, but no onAudit hook is configured` | `audit` trên route `public` hoặc thiếu `onAudit` |
| `cannot declare idempotent on a public route` / `declares idempotent: "...", which requires tx: "write" (got "...")` / `cannot combine idempotent with responseKind: "stream"` | Cấu hình `idempotent` sai |
| `Invalid security header name "..."` / `Security header "..." must not contain CR, LF, or NUL` | `securityHeaders` sai |
| `CORS origin "*" cannot be combined with credentials: true` / `CORS origin "..." must not contain CR, LF, or NUL` / `Invalid CORS header name "..."` | `cors` sai |

`tx` mặc định của route: `'none'` cho `public`, `'read'` cho `GET` cần đăng nhập, `'write'` cho method còn lại cần đăng nhập. `timeoutMs` và `maxBodyBytes` của route mặc định lấy từ `limits`.

Ví dụ lắp tay (thông thường `createApp` làm việc này cho bạn):

```js
import { createHttpApp, createMemoryRateLimitStore } from '@ank-ingress/http';
import { Reply, buildCatalogs, defineRoute } from '@ank-ingress/contracts';
import { createLogger } from '@ank-ingress/observability';

const http = createHttpApp({
  routes: [
    defineRoute({
      method: 'GET',
      path: '/api/v1/health',
      access: { kind: 'public' },
      rateLimit: { limit: 60, windowMs: 60_000 },
      handle: () => Reply.json({ ok: true }),
    }),
  ],
  catalogs: buildCatalogs([]),
  logger: createLogger({ service: 'api' }),
  rateLimit: createMemoryRateLimitStore(),
  securityHeaders: true,
  limits: { maxInFlight: 512, defaultTimeoutMs: 10_000 },
});

const inbound = http.inbound({ kind: 'tcp', host: '0.0.0.0', port: 3000 });
await inbound.start();
// Khi tắt: ngừng nhận, rồi chờ việc đang chạy tối đa 25 giây.
await inbound.stop();
await inbound.drain(AbortSignal.timeout(25_000));
```

#### `HttpApp`

Đối tượng `createHttpApp` trả về.

| Thành viên | Mô tả |
| --- | --- |
| `inbound(listenConfig: ListenConfig): Inbound & { readonly port?: number }` | Tạo inbound theo vòng đời của `@ank-ingress/runtime` (`runApp` gọi các phương thức này). `start()`: tắt chế độ draining và lắng nghe; `port` là cổng thật sau khi lắng nghe TCP (truyền `port: 0` để lấy cổng ngẫu nhiên). `pause()`/`resume()`: bật/tắt draining (request mới nhận `503`). `stop()`: bật draining, chạy các callback `onStop`, đóng socket lắng nghe, hủy mọi stream reply đang gửi (lý do `Server shutting down`). `drain(signal)`: chờ tới khi không còn việc đang chạy hoặc `signal` bị hủy; không ném lỗi khi hết giờ mà gọi các callback `onDrainTimeout` |
| `publish(topic, message, isBinary?): boolean` | Gửi tới mọi WebSocket đã subscribe `topic` (dùng bởi `@ank-ingress/realtime`). Trả `false` khi app chưa lắng nghe hoặc không socket nào nhận |
| `tryEnterWork(): (() => void) \| null` | Xin một suất việc theo cùng luật admission của HTTP; `null` khi đang draining hoặc đã đủ `maxInFlight`. Gọi hàm trả về đúng một lần khi xong việc |
| `onStop(cb): () => void` / `onDrainTimeout(cb): () => void` | Đăng ký callback chạy khi `stop()` / khi `drain` hết giờ; trả về hàm hủy đăng ký |
| `draining: boolean` | Đang từ chối request mới hay không |
| `workTracker`, `transport`, `logger`, `trustedProxies`, `trustUnixSocket` | Trạng thái nội bộ cho các gói inbound khác (realtime) |

Lỗi khi `start()` (`StartupError` của `@ank-ingress/runtime`): `Failed to listen on TCP host:port`; `Failed to listen on Unix socket "path"`; `Unix socket path "..." is occupied by a non-socket file`; `Unix socket "..." is already in use by another process`. Socket Unix cũ không còn tiến trình nào nghe sẽ bị xóa trước khi lắng nghe; khi đóng, file socket chỉ bị xóa nếu vẫn đúng inode đã tạo.

#### `HTTP_IN_FLIGHT_METRIC: 'ank_http_in_flight_work'`

Tên gauge số việc HTTP và WebSocket đang được nhận, dùng khi dựng dashboard hoặc cảnh báo.

### Vòng đời một request

Thứ tự này quyết định status client nhận và stage nào được gọi.

1. **Admission.** Đang draining hoặc số việc đang chạy ≥ `maxInFlight` → `503` với body `{"code":"COMMON-503-UNAVAILABLE","message":"Server overloaded or draining","correlationId":""}` và `retry-after: 1`; handler không chạy.
2. **Correlation id.** Lấy `X-Correlation-Id` của client nếu dài 1–64 ký tự ASCII nhìn thấy được (`0x21`–`0x7E`), ngược lại sinh id mới dạng UUID. Id được trả lại qua header `x-correlation-id` (trừ khi `correlationHeader: false`).
3. **Header.** Chỉ những header route cần mới được đọc: `x-correlation-id`, `traceparent`; với route cần đăng nhập thêm `authorization`, `x-tenant-id`, `x-forwarded-for`, `user-agent`; route có body thêm `content-type`, `content-length`; `idempotency-key` khi có `idempotent`; `cookie` khi `cookies: true`; `host`, `x-forwarded-proto`, `x-forwarded-host` khi `hostInfo: true`; `if-none-match` khi `etag: true`; cộng các tên trong `headers`. Khi có `trustedProxies` hoặc `trustUnixSocket`, mọi route đọc thêm `x-forwarded-for`.
4. **Đường nhanh cho route `public`** không body, không rate limit, không audit, không multipart: kiểm tra `params`/`query` rồi gọi handler ngay trong callback của uWS. Handler đồng bộ chạy hết trước khi bất kỳ deadline nào có thể kích hoạt; handler async thì deadline được lên lịch khi nhận về promise.
5. **Các route còn lại:** lên lịch deadline (bánh xe deadline quét mỗi 25 ms) rồi lần lượt: rate limit theo IP → `auth` → rate limit theo identity → kiểm tra `Idempotency-Key` → đọc và parse body → kiểm tra `params`, `query`, `body` → nhánh transaction hoặc nhánh `tx: 'none'` (xem mục Stage) → gửi phản hồi.
6. **Deadline.** Hết `timeoutMs`: client nhận `503 COMMON-503-UNAVAILABLE` (`"Request deadline exceeded"`, `retry-after: 1`, thêm `connection: close` nếu body chưa đọc xong), rồi `signal` bị hủy. **Handler không bị dừng**: suất việc trong `maxInFlight` chỉ được trả khi promise của pipeline kết thúc.
7. **Lỗi** bất kỳ trong pipeline được chuyển thành phản hồi bằng `toReply`.
8. **Stream reply** (`Reply.stream`) không còn deadline sau khi handler trả về; chỉ kết thúc khi stream hết, stream lỗi, client ngắt, hoặc `stop()`.

Mã lỗi gói này tự sinh:

| Mã | Status | Khi nào |
| --- | --- | --- |
| `COMMON-503-UNAVAILABLE` | 503 | Quá tải/draining; hết deadline; client ngắt khi đang đọc body; `Authorization deadline exceeded`; request đã hủy trước khi vào handler trong `scope`; đọc multipart bị hủy hoặc dừng sớm |
| `COMMON-413-PAYLOAD_TOO_LARGE` | 413 | `Content-Length` hoặc số byte thật vượt `maxBodyBytes`; quá `multipart.maxParts`; một trường đọc bằng `part.text()` vượt `maxFieldBytes`. Luôn kèm `connection: close` |
| `COMMON-415-UNSUPPORTED_MEDIA_TYPE` | 415 | `Content-Type` không bắt đầu bằng media type của `bodyFormat`; multipart không có `boundary` |
| `COMMON-400-INVALID_JSON` | 400 | Body JSON rỗng hoặc sai cú pháp |
| `COMMON-400-INVALID_MULTIPART` | 400 | Multipart sai định dạng (dòng boundary, header phần quá `maxHeaderBytes`, thiếu `Content-Disposition: form-data` hoặc `name`, thiếu boundary đóng) |
| `COMMON-400-IDEMPOTENCY_KEY_REQUIRED` | 400 | Route `idempotent: 'required'` mà thiếu header `Idempotency-Key` |
| `COMMON-422-VALIDATION` | 422 | Sai schema (`details[].code = 'COMMON-422-INVALID_FIELD'`, `field` dạng `a.b`); `Idempotency-Key` dài ngoài 8–128 ký tự (`details[].code = 'COMMON-422-INVALID_IDEMPOTENCY_KEY'`) |
| `COMMON-429-RATE_LIMITED` | 429 | Vượt `rateLimit`; `params.retryAfterSeconds = max(1, ceil(retryAfterMs / 1000))`, header `retry-after` cùng giá trị |
| `COMMON-403-FORBIDDEN` | 403 | Route `authenticated` có `tx: 'none'` mà tenant chọn qua header chưa được token xác nhận (xem mục Stage) |
| `COMMON-405-METHOD_NOT_ALLOWED`, `COMMON-404-NOT_FOUND` | 405, 404 | Fallback định tuyến |
| `COMMON-500-INTERNAL` | 500 | Lỗi không phải `AppError`; serialize phản hồi thất bại; header phản hồi chứa ký tự cấm |

### Stage: xác thực, phân quyền, transaction, audit

Bốn hàm do tầng trên cung cấp qua `createHttpApp`/`createApp`. Http chỉ gọi chúng và truyền `signal`/`deadlineAt`; **không tự áp timeout** lên promise của chúng (trừ việc hủy `signal`). Định nghĩa trường đầy đủ ở mục Kiểu dữ liệu.

#### `AuthStage = (input: AuthStageInput) => Promise<Identity>`

Gọi cho mọi route không `public`, sau rate limit theo IP và **trước** khi đọc body. Trả về `Identity` hoặc ném `AppError` 401. `@ank-ingress/security` có sẵn `bearerAuth(...)`.

- `input.ip` đã được giải theo `trustedProxies`; `input.headers` chỉ chứa header đã đọc ở bước 3 (gồm cả `authorization`, nên đừng ghi log nguyên khối này).
- `deferRevocationToTx` là `true` khi route có transaction, không có body và app có `scope`: stage được phép hoãn kiểm tra thu hồi token sang bên trong transaction.

#### `AuthorizeStage = (input: AuthorizeStageInput) => Promise<unknown>`

Chỉ gọi cho route theo mã quyền có `tx: 'none'`. Trả về giá trị "access" (handler nhận ở `scope.access`) hoặc ném `AppError` 403.

- `deadlineAt = min(deadline request, now + min(timeoutMs của route, limits.authzTimeoutMs))` (`authzTimeoutMs` mặc định 2000).
- `signal` bị hủy khi client ngắt, hoặc tới `deadlineAt` với lý do `AppError('COMMON-503-UNAVAILABLE', 'Authorization deadline exceeded')`. Promise không bị cắt ngang: stage phải tự dừng theo `signal`.
- Không có `authorize` thì http dùng `scope` thay thế: gọi `scope({ ..., idempotencyKey: null, readOnly: true, deadlineAt/signal của bước phân quyền })` chỉ để lấy `access`. Với scope PostgreSQL, điều đó nghĩa là mượn một connection chỉ để phân quyền.

```js
import { createApp } from '@ank-ingress/app';
import { AppError } from '@ank-ingress/kernel';

const app = createApp({
  catalogs,
  auth: myAuth,
  authorize: async ({ identity, permission, scopeParam, signal }) => {
    const roles = await rolesOf(identity.accountId, scopeParam, signal);
    if (!permission.roles.some((role) => roles.includes(role))) {
      throw new AppError('COMMON-403-FORBIDDEN');
    }
    return { roles };
  },
});
```

#### `ScopeStage<Tx, Access> = (input: ScopeStageInput, handler: (tx, access, execSignal?, execDeadlineAt?) => Promise<Reply>) => Promise<Reply>`

Gọi cho mọi route có `tx: 'read' | 'write'`. Stage mở transaction (hoặc tài nguyên tương đương), tính `access`, gọi `handler(tx, access, execSignal?, execDeadlineAt?)` rồi trả về `Reply` sẽ được gửi. `@ank-ingress/postgres` có sẵn `createRequestScope(...).run`.

- `readOnly` là `true` khi `tx: 'read'`. `permission` là `null` với route `authenticated`.
- `idempotencyKey` khác `null` khi route có `idempotent` và client gửi khóa hợp lệ: `{ tenantId, accountId, operation: 'METHOD /đường/dẫn/thật', key, requestHash }` (`requestHash` tính bằng `computeIdempotencyRequestHash`; http không đặt `ttlSeconds`). Stage có thể trả lại `Reply` đã lưu mà không gọi `handler`.
- Truyền `execSignal`/`execDeadlineAt` cho `handler` thì `req.signal`, `req.deadlineAt`, `scope.signal`, `scope.deadlineAt` dùng các giá trị đó (ví dụ deadline chặt hơn của transaction).
- `handler` ném `AppError('COMMON-503-UNAVAILABLE')` nếu request đã hết hạn hoặc bị hủy trước khi chạy. `onAudit` chạy **bên trong** `handler`, tức là trong cùng transaction.
- Stream reply được gửi **sau khi** `scope` đã trả về.

#### `AuditHook<Tx, Access> = (input: AuditHookInput<Tx, Access>) => Promise<void>`

Chạy sau khi handler thành công trên route có `audit`. Route có transaction: chạy trong `scope`, trước khi stage commit; ném lỗi thì cả request thất bại. Route `tx: 'none'`: chạy sau handler, trước khi gửi; ném lỗi thì client nhận lỗi dù handler đã chạy xong. `input.body` là body đã kiểm tra, nguyên vẹn.

#### Giá trị `scopeParam` và kiểm tra tenant

- Với `access: { kind: 'permission', scopeParam }`, giá trị lấy theo thứ tự `params[scopeParam]` → `body[scopeParam]` → `query[scopeParam]` rồi đưa cho `authorize`/`scope`. Đây là dữ liệu client gửi lên; stage phải tự kiểm tra identity có quyền trên giá trị đó.
- Route `authenticated` có `tx: 'none'`: nếu `identity.claims.tid === null` nhưng `identity.tenantId !== null` (tenant chọn qua `X-Tenant-Id` mà token không xác nhận), request bị `403` vì không có transaction để kiểm tra thành viên tenant.

### Rate limit

#### `createMemoryRateLimitStore(options?: MemoryRateLimitStoreOptions): RateLimitStore`

Store cửa sổ cố định, đếm trong bộ nhớ của **một tiến trình**. Khóa đếm là `bucket`, `windowMs`, `subject`. Khi đã có `maxKeys` khóa mà gặp khóa mới: xóa các khóa đã hết cửa sổ, rồi xóa khóa cũ nhất (theo thứ tự thêm vào) tới khi còn dưới `maxKeys`. Vượt `limit` thì trả `{ allowed: false, remaining: 0, retryAfterMs: thời gian tới hết cửa sổ }`. Nhiều instance cần store dùng chung (Redis trong `@ank-ingress/cache`).

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `maxKeys` | `number` | `10_000` | Số bộ đếm tối đa giữ trong bộ nhớ |
| `now` | `() => number` | `Date.now` | Đồng hồ (dùng trong test) |

Cách pipeline dùng store: `bucket` = `rateLimit.bucket` hoặc `'METHOD /path'`; `subject` = IP client (`req.ip`, hoặc chuỗi `'unknown'` khi không xác định được IP) với `key: 'ip'` (mặc định, kiểm tra trước `auth`), hoặc `'${tenantId ?? ''}:${accountId}'` với `key: 'identity'` (sau `auth`). `consume` không nhận `signal`.

```js
import { createApp } from '@ank-ingress/app';
import { createMemoryRateLimitStore } from '@ank-ingress/http';

const app = createApp({ rateLimit: createMemoryRateLimitStore({ maxKeys: 50_000 }) });
```

### CORS và header bảo mật

#### `CorsOptions` (tùy chọn `cors`)

Origin của request được so khớp mỗi lần có header `Origin`:

- `'*'`: trả `access-control-allow-origin: *`.
- Chuỗi hoặc mảng: so khớp chính xác, trả lại đúng origin kèm `vary: Origin`.
- Hàm `(origin) => boolean`: trả lại origin nếu hàm trả `true` và origin không chứa CR/LF.

Phản hồi cho origin được phép có thêm `access-control-allow-credentials: true` (khi `credentials`), `access-control-expose-headers` (mặc định `x-correlation-id`). Origin không được phép vẫn nhận phản hồi bình thường, chỉ không có header CORS: CORS không thay thế phân quyền.

Preflight `OPTIONS` trên mọi path đã đăng ký luôn trả `204`. Origin được phép: `access-control-allow-origin`, `access-control-allow-methods` (các method của path, `GET` kèm `HEAD`), `access-control-allow-headers` (mặc định `authorization, content-type, idempotency-key, traceparent, x-correlation-id, x-tenant-id`), `access-control-allow-credentials`, `access-control-max-age` (khi đặt `maxAgeSeconds`), `vary`. Origin không được phép: chỉ có `vary`. Preflight không kiểm tra method/header mà trình duyệt xin.

#### `DEFAULT_SECURITY_HEADERS: Readonly<Record<string, string>>`

Bộ header khi `securityHeaders: true`:

| Header | Giá trị |
| --- | --- |
| `content-security-policy` | `default-src 'none'; frame-ancestors 'none'` |
| `cross-origin-opener-policy` | `same-origin` |
| `cross-origin-resource-policy` | `same-origin` |
| `referrer-policy` | `no-referrer` |
| `strict-transport-security` | `max-age=15552000; includeSubDomains` |
| `x-content-type-options` | `nosniff` |
| `x-frame-options` | `DENY` |

Header bảo mật được ghi trên mọi phản hồi của route (kể cả phản hồi lỗi và `503` do deadline), không ghi trên fallback 404/405 và phản hồi `503` lúc admission.

#### `compileSecurityHeaders(option: SecurityHeadersOption): Readonly<Record<string, string>> | null`

Hàm `createHttpApp` dùng để dựng bộ header: `false` → `null`; `true` → bản sao `DEFAULT_SECURITY_HEADERS`; đối tượng → mặc định cộng ghi đè, giá trị `false` bỏ header đó, tên được viết thường. Kết quả rỗng → `null`. Ném `CompositionError` khi tên không phải token header hợp lệ hoặc giá trị chứa CR, LF, NUL. Dùng được để kiểm tra cấu hình trước khi khởi động.

```js
import { compileSecurityHeaders } from '@ank-ingress/http';

compileSecurityHeaders({ 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': false });
```

### Phản hồi và lỗi

#### `toReply(err: unknown, catalogs: Catalogs, correlationId: string, logger?: Logger): JsonReply`

Biên lỗi của pipeline; mọi lỗi trong route đều đi qua hàm này.

- Lỗi không phải `AppError` thành `AppError('COMMON-500-INTERNAL')` với `message` = `err.message`.
- Status ≥ 500: ghi `logger.error('http.error', { code, status, detail: message })`.
- `message` gửi cho client **không** phải `err.message`: lấy từ `catalogs.errors` nếu mã đã đăng ký, nếu không thì thông điệp chung theo status (`Validation failed`, `Not found`, `Unauthenticated`, `Forbidden`, `Conflict`, `Payload too large`, `Unsupported media type`, `Too many requests`, `Service unavailable`, còn lại là thông điệp của `COMMON-500-INTERNAL`).
- Body: `{ code, message, correlationId, details?, params? }`. `details` và `params` của `AppError` được gửi **nguyên văn**.
- `429`/`503`: header `retry-after` = `params.retryAfterSeconds` (nếu là số) hoặc `'1'`. `413`: `connection: close`.

Tầng trên hiếm khi gọi trực tiếp; hữu ích khi viết inbound khác muốn trả lỗi cùng định dạng.

#### Những gì pipeline làm khi gửi `Reply`

- `json`: route có `response` schema và status 2xx thì serialize bằng serializer biên dịch từ schema, **chỉ các thuộc tính khai báo được gửi đi**; status khác hoặc không có schema dùng `JSON.stringify`. Serialize thất bại → `500 COMMON-500-INTERNAL`, header của reply bị bỏ, log `http.serialize_failed`.
- Tên header của reply phải là token hợp lệ, giá trị không chứa CR, LF, NUL; vi phạm thành `500` (kiểm tra trước khi ghi byte đầu tiên nên vẫn trả lỗi được).
- `etag: true` (chỉ `GET`): reply `json`/`text` status 200 có ETag yếu; `If-None-Match` khớp → `304` không body.
- `stream`: có `size` thì gửi với độ dài cố định, không có thì chunked; tôn trọng backpressure của socket (tạm dừng stream khi socket đầy). Stream lỗi → đóng kết nối. Client ngắt hoặc `stop()` → stream bị `destroy()`. `HEAD` → stream bị hủy ngay.
- Status không có trong bảng nội bộ được ghi dạng `"<code> Status"`.

### OpenAPI

#### `generateOpenApi(routes: readonly AnyRoute[], _catalogs: Catalogs, info?: OpenApiInfo): OpenApiDocument`

Sinh tài liệu OpenAPI `3.1.0` từ route spec. `info` mặc định `{ title: 'ANK Ingress API', version: '2.0.0' }`; `catalogs` hiện không được dùng.

- Path `:id` → `{id}`; `operationId` = `<method>_<path với ký tự không phải chữ/số thay bằng _>`.
- `parameters`: mỗi thuộc tính của schema `params` (`in: 'path'`, `required: true`) và `query` (`required` theo `required` của schema).
- `requestBody`: route multipart → `multipart/form-data` với schema `{ type: 'object' }`; route có `body` → schema `body` dưới media type của `bodyFormat`.
- `responses`: chỉ khai báo `200` (kèm schema `response` nếu có). Route không `public` có `security: [{ bearerAuth: [] }]`; `components.securitySchemes.bearerAuth` là HTTP bearer JWT.

```js
import { generateOpenApi } from '@ank-ingress/http';
import { Reply } from '@ank-ingress/contracts';

// `app` là kết quả createApp(...), `catalogs` là catalog đã truyền cho app.
const doc = generateOpenApi(app.routes, catalogs, { title: 'Notes API', version: '1.0.0' });
app.get('/openapi.json', { access: 'public' }, () => Reply.json(doc));
```

(`app.routes` của `createApp` đã có tiền tố. Route `/openapi.json` khai báo sau khi sinh tài liệu nên không có trong chính tài liệu đó.)

### Tiện ích thuần

Các hàm không I/O mà pipeline dùng, xuất ra để tầng trên và các gói khác dùng lại.

#### `parseCookieHeader(header: string | undefined): Readonly<Record<string, string>>`

Parse header `Cookie`: tách theo `;`, bỏ cặp không có `=` hoặc tên rỗng, tên xuất hiện đầu tiên thắng, bỏ cặp dấu nháy kép bao ngoài, `decodeURIComponent` khi có `%` (giải mã lỗi thì giữ nguyên). Đối tượng trả về không có prototype; header trống trả đối tượng rỗng đã đóng băng. Cookie không được ký hay xác minh.

#### `normalizeIp(raw: string | undefined): string | null`

Chuẩn hóa địa chỉ: cắt khoảng trắng; dạng IPv4-mapped hex của uWS và `::ffff:a.b.c.d` → IPv4; loopback IPv6 dạng đầy đủ → `::1`; IP hợp lệ khác → viết thường; không phải IP → `null`.

#### `resolveClientIp(remoteAddress: string, xffHeader: string | undefined, trustedProxies: ReadonlySet<string>, trustUnixSocket: boolean): string | null`

Tính IP client. Peer không được tin (IP không nằm trong `trustedProxies`, hoặc peer không có IP mà `trustUnixSocket` là `false`) hoặc không có `X-Forwarded-For` → trả IP peer (có thể `null`). Ngược lại duyệt `X-Forwarded-For` **từ phải sang trái**: gặp mục không phải IP → trả IP tin cậy cuối cùng; gặp IP không thuộc `trustedProxies` → trả IP đó; tất cả đều tin cậy → trả mục trái nhất.

#### `isTrustedPeer(remoteAddress: string, trustedProxies: ReadonlySet<string>, trustUnixSocket: boolean): boolean`

Peer có được tin `X-Forwarded-*` hay không (cùng luật với `resolveClientIp`). Quyết định `req.protocol`/`req.secure` (từ `X-Forwarded-Proto`, chỉ nhận `https`) và `req.hostname` (`X-Forwarded-Host` thắng `Host`; bỏ cổng; giữ ngoặc vuông của IPv6).

#### `weakEtag(payload: string): string` và `ifNoneMatchHits(header: string | undefined, etag: string): boolean`

`weakEtag` trả `W/"<độ dài chuỗi hex>-<băm cyrb53 base36>"` (băm không mật mã, độ dài tính theo đơn vị UTF-16). `ifNoneMatchHits` so sánh yếu theo RFC 9110: `*` hoặc bất kỳ thẻ nào trong danh sách bằng nhau sau khi bỏ `W/`.

#### `checkIdempotencyHeader(mode: 'required' | 'optional' | undefined, headerValue: string | undefined): string | null`

`mode` không đặt → `null`. Header trống/chỉ khoảng trắng → `null` với `'optional'`, ném `AppError('COMMON-400-IDEMPOTENCY_KEY_REQUIRED')` với `'required'`. Khóa sau khi trim dài ngoài 8–128 ký tự → `AppError('COMMON-422-VALIDATION')` với `details: [{ field: 'Idempotency-Key', code: 'COMMON-422-INVALID_IDEMPOTENCY_KEY' }]`. Hợp lệ → trả khóa đã trim.

#### `computeIdempotencyRequestHash(method: string, concretePath: string, rawQuery: string, rawBody: Buffer): string`

SHA-256 hex của `"<method> <concretePath>?<canonicalizeQuery(rawQuery)>\n"` nối với các byte body gốc. Store idempotency của ứng dụng so `requestHash` để phát hiện cùng khóa nhưng khác nội dung.

#### `canonicalizeQuery(rawQuery: string): string`

Parse bằng `URLSearchParams`, sắp xếp ổn định theo tên khóa rồi serialize lại; chuỗi rỗng → `''`. Thứ tự tham số không làm đổi `requestHash`.

#### `multipartBoundary(contentType: string | undefined): string | null`

Trả boundary (1–70 ký tự, có hoặc không có nháy kép) nếu header là `multipart/form-data`, ngược lại `null`.

#### `class MultipartParser`

Parser `multipart/form-data` (RFC 7578) tăng dần, không đệm cả body: phần dữ liệu được phát ra dưới dạng view của buffer đầu vào; chỉ phần delimiter dở dang ở mép chunk được giữ lại.

- `constructor(boundary: string, limits: MultipartParserLimits, events: MultipartEvents)`
- `write(chunk: Buffer): void`: đẩy thêm dữ liệu; bỏ qua sau khi gặp boundary đóng (epilogue).
- `finish(): void`: gọi khi body kết thúc; ném nếu chưa gặp boundary đóng.
- `done: boolean`: đã gặp boundary đóng.

Lỗi: `AppError('COMMON-413-PAYLOAD_TOO_LARGE', 'Too many multipart parts')` khi quá `maxParts`; `AppError('COMMON-400-INVALID_MULTIPART')` khi dòng boundary sai, header phần quá `maxHeaderBytes`, dòng header không có `:`, thiếu `Content-Disposition: form-data`, thiếu `name`, hoặc body kết thúc trước boundary đóng. Trong route, dùng `req.parts()` thay vì gọi trực tiếp lớp này.

### Kiểu dữ liệu

Các interface tầng trên **tự tạo hoặc tự cài đặt**:

#### `HttpLimits` (`limits`)

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `maxInFlight` | `number` | `1024` | Số việc HTTP + WebSocket tối đa đang chạy; vượt thì `503` |
| `defaultTimeoutMs` | `number` | `15_000` | Deadline mặc định của route |
| `defaultMaxBodyBytes` | `number` | `1_048_576` | Kích thước body mặc định của route |
| `authzTimeoutMs` | `number` | `2_000` | Trần thời gian cho bước phân quyền của route `tx: 'none'` |
| `trustedProxies` | `readonly string[]` | `[]` | Như tùy chọn cùng tên (tùy chọn cấp trên thắng) |
| `trustUnixSocket` | `boolean` | `false` | Như tùy chọn cùng tên (tùy chọn cấp trên thắng) |

#### `ListenConfig`

| Biến thể | Trường | Ý nghĩa |
| --- | --- | --- |
| `{ kind: 'tcp' }` | `host: string`, `port: number` | Lắng nghe TCP; `port: 0` để chọn cổng ngẫu nhiên |
| `{ kind: 'unix' }` | `path: string` | Đường dẫn socket |
| | `mode?: number` | Quyền file socket (`chmod`; lỗi `chmod` bị bỏ qua) |
| | `trustedIngress?: boolean` | Khi đặt, ghi đè `trustUnixSocket` |

#### `CorsOptions`

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `origin` | `string \| readonly string[] \| ((origin: string) => boolean)` | bắt buộc | `'*'`, một origin, danh sách origin chính xác, hoặc hàm kiểm tra |
| `credentials` | `boolean` | `false` | Thêm `access-control-allow-credentials: true`; cấm đi cùng `'*'` |
| `allowHeaders` | `readonly string[]` | danh sách mặc định ở mục CORS | Header cho phép trên preflight |
| `exposeHeaders` | `readonly string[]` | `['x-correlation-id']` | Header trình duyệt được đọc |
| `maxAgeSeconds` | `number` | không gửi | `access-control-max-age` của preflight |

#### `SecurityHeadersOption`

`boolean | Readonly<Record<string, string | false>>`: `true` dùng bộ mặc định, `false` tắt, đối tượng ghi đè từng header (`false` bỏ một header mặc định).

#### `AuthStageInput`

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `headers` | `Readonly<Record<string, string \| undefined>>` | Các header route đã đọc (tên viết thường) |
| `correlationId` | `string` | Id của request |
| `ip` | `string \| null` | IP client theo `resolveClientIp` |
| `userAgent` | `string \| null` | Header `user-agent` |
| `signal` | `AbortSignal` | Hủy khi client ngắt hoặc hết deadline |
| `deferRevocationToTx` | `boolean?` | Được phép hoãn kiểm tra thu hồi sang transaction |

#### `AuthorizeStageInput`

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `identity` | `Identity` | Kết quả của `auth` |
| `permission` | `PermissionSpec` | Mã quyền của route, lấy từ catalog |
| `scopeParam` | `string \| number` (tùy chọn) | Giá trị `scopeParam` (từ params, body hoặc query) |
| `deadlineAt` | `number` | Mốc epoch ms của bước phân quyền |
| `signal` | `AbortSignal` | Hủy khi client ngắt hoặc tới `deadlineAt` |

#### `ScopeStageInput`

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `identity` | `Identity` | Kết quả của `auth` |
| `permission` | `PermissionSpec \| null` | `null` với route `authenticated` |
| `scopeParam` | `string \| number` (tùy chọn) | Như trên |
| `idempotencyKey` | `IdempotencyKey \| null` | Khóa idempotency đã tính (`null` nếu route không `idempotent` hoặc client không gửi khóa với `'optional'`) |
| `readOnly` | `boolean` | `true` với `tx: 'read'` và khi dùng scope để phân quyền |
| `deadlineAt` | `number` | Deadline của request (hoặc của bước phân quyền) |
| `signal` | `AbortSignal` | Hủy khi client ngắt hoặc hết deadline |

Tham số thứ hai `handler(tx: Tx, access: Access, execSignal?: AbortSignal, execDeadlineAt?: number): Promise<Reply>`: gọi để chạy handler của route (và `onAudit`) trong transaction.

#### `AuditHookInput<Tx, Access>`

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `route` | `AnyRoute` | Route spec (đọc `route.audit.action`, `resourceType`, `objectIdParam`) |
| `identity` | `Identity` | Người thực hiện |
| `tx` | `Tx \| null` | Transaction hiện tại; `null` với route `tx: 'none'` |
| `access` | `Access \| null` | Giá trị access |
| `params` | `Record<string, unknown>` | Params đã kiểm tra |
| `body` | `unknown` | Body đã kiểm tra (nguyên vẹn, chưa che dữ liệu nhạy cảm) |
| `reply` | `Reply` | Phản hồi handler trả về |

#### `MemoryRateLimitStoreOptions`, `OpenApiInfo`, `MultipartParserLimits`, `MultipartEvents`

| Kiểu | Trường |
| --- | --- |
| `MemoryRateLimitStoreOptions` | `maxKeys?: number` (mặc định `10_000`), `now?: () => number` (mặc định `Date.now`) |
| `OpenApiInfo` | `title: string`, `version: string`, `description?: string` |
| `MultipartParserLimits` | `maxParts: number` (số phần tối đa), `maxHeaderBytes: number` (byte tối đa của khối header một phần) |
| `MultipartEvents` | `partBegin(info: MultipartPartInfo): void`; `partData(chunk: Buffer): void` (chunk có thể là view của buffer lớn hơn, không bị ghi đè sau đó); `partEnd(): void` |

Các kiểu khác:

| Kiểu | Mô tả |
| --- | --- |
| `CreateHttpAppOptions<Tx, Access>` | Tùy chọn của `createHttpApp` (bảng ở mục Tạo server HTTP) |
| `HttpApp` | Đối tượng `createHttpApp` trả về |
| `AuthStage`, `AuthorizeStage`, `ScopeStage<Tx, Access>`, `AuditHook<Tx, Access>` | Chữ ký các stage (mục Stage) |
| `OpenApiDocument` | `{ openapi: '3.1.0', info, components: { securitySchemes }, paths }` |
| `OpenApiOperation` | `{ operationId, parameters?, requestBody?, responses, security? }` |
| `MultipartPartInfo` | `{ name, filename: string \| null, contentType }`; `filename*` (UTF-8) được ưu tiên hơn `filename`; `contentType` mặc định `text/plain` cho trường thường, `application/octet-stream` cho file. Mọi giá trị đều do client gửi |
| `RouteRequest` | Lớp của tham số `req` trong handler: `method`, `path`, `params`, `query`, `body`, `headers`, `identity`, `correlationId`, `idempotencyKey`, `deadlineAt`, `signal`, `traceparent`, `ip`, `cookies`, `protocol`, `secure`, `hostname`, `parts()`. `parts()` ném `TypeError` trên route không phải multipart, và khi gọi lần thứ hai |
| `RouteScope<Tx, Access>` | Lớp của tham số thứ hai trong handler: `tx`, `access`, `deadlineAt`, `signal` |

Trên đường nhanh của route `public` (bước 4 ở trên), handler nhận trực tiếp `RequestCtx` cho cả hai tham số: có cùng các thuộc tính của `req` (`identity` là `null`, `body` là `undefined`) cộng `tx`/`access` là `null`.

### Nội bộ

Các export dưới đây là plumbing cho `createHttpApp`, `@ank-ingress/app`, `@ank-ingress/realtime` và test; **tầng trên không nên gọi trực tiếp**.

| Export | Mô tả |
| --- | --- |
| `compileRoute(spec, deps)` | Biên dịch một route spec thành `CompiledRoute` (header cần đọc, `tx`, validator, serializer); ném các `CompositionError` liệt kê ở trên |
| `CompiledRoute` | Kết quả của `compileRoute` |
| `CompileDependencies` | Stage và mặc định truyền cho `compileRoute` |
| `createUwsTransport(routes, rt)` | Tạo `uWS.App`, đăng ký route và fallback, trả `UwsTransport` |
| `UwsTransport` | `{ app, deadlineWheel, listening, listen(config) }` |
| `createUwsRouteHandler(compiled, rt, isHead?)` | Handler uWS cho một route: admission, snapshot header, khởi động bộ đọc body, chạy pipeline |
| `TransportRuntimeState` | Trạng thái dùng chung giữa app, transport và handler (draining, giới hạn, stage, metric) |
| `RequestCtx` | Trạng thái một request: phản hồi uWS gốc (`res`), trạng thái gửi, abort, deadline, trace, IP, cookie |
| `RouteRequest`, `RouteScope` (giá trị) | Lớp do pipeline tạo cho handler; tầng trên chỉ đọc, không tự khởi tạo |
| `RequestState`, `STATE_OPEN` (0), `STATE_ABORTED` (1), `STATE_SENT` (2) | Trạng thái gửi của `RequestCtx` |
| `EMPTY_HEADER_MAP`, `EMPTY_STRING_MAP` | Đối tượng rỗng đã đóng băng dùng chung để tránh cấp phát |
| `ResponseDecor` | Header bảo mật và CORS đã biên dịch, ghi lên mọi phản hồi |
| `ClientIpTrust` | `{ trustedProxies, trustUnixSocket }` gắn vào `RequestCtx` |
| `compileCors(options)`, `CompiledCors` | Biên dịch `CorsOptions` thành kiểm tra origin, hậu tố header và bộ ghi preflight |
| `DeadlineWheel`, `DeadlineLane` | Bánh xe deadline dạng danh sách liên kết theo từng timeout, quét bằng `setInterval` (mặc định 25 ms, tối thiểu 5 ms, `unref`) |
| `startBodyCollector(res, ctx, maxBodyBytes)`, `BodyCollector`, `ParsedBody` | Bộ đọc body có giới hạn, phải khởi động đồng bộ trong callback uWS; parse `json`/`text`/`urlencoded` |
| `readJsonBody(res, ctx, contentType, contentLength, maxBodyBytes, computeHash)` | Đọc body JSON và tự trả `413` khi vượt giới hạn |
| `startMultipartReader(res, ctx, maxBodyBytes, limits)`, `MultipartReader`, `MultipartReaderLimits` | Bộ đọc multipart dạng stream có backpressure, cung cấp `req.parts()`; giới hạn route mặc định `maxParts: 100`, `maxFieldBytes: 65_536`, `maxHeaderBytes: 8_192` |
| `sendReply`, `sendJson`, `sendJsonWithEtag`, `sendText`, `sendTextWithEtag`, `sendEmpty`, `sendStream` | Ghi phản hồi lên `HttpResponse` của uWS, chỉ khi request còn mở; kiểm tra header, ghi correlation id, header bảo mật và CORS |

---

## `@ank-ingress/security`

Gói bảo mật không phụ thuộc database: ký và kiểm tra JWT EdDSA (Ed25519), stage xác thực `bearerAuth`, bộ nhớ đệm thu hồi token, chính sách phân quyền theo role, và băm mật khẩu bcrypt trong worker thread. Nằm ở tầng lõi (không I/O trực tiếp, trừ việc gửi tác vụ bcrypt sang `WorkerPool`). Tầng trên dùng khi cấu hình `auth`/`authorize`/`scope` cho app, khi viết luồng đăng nhập, và khi viết `AccessPolicy` cho `createRequestScope`.

### Khóa JWT

#### `parsePrivateKey(base64Pkcs8: string): KeyObject`

Đọc khóa riêng dạng PKCS#8 DER mã hóa base64 (không phải PEM). Ném `TypeError('JWT private key must be Ed25519')` nếu không phải Ed25519; chuỗi không đọc được thì lỗi của `node:crypto` lan ra.

#### `parsePublicKey(rawPublicKey: string): KeyObject`

Nhận PEM `-----BEGIN PUBLIC KEY-----` hoặc SPKI DER mã hóa base64. Ném `TypeError` khi chuỗi rỗng, khi là PEM nhưng không phải `PUBLIC KEY` (ví dụ dán nhầm khóa riêng), hoặc khi khóa không phải Ed25519.

#### `parsePublicKeyMap(raw: string): ReadonlyMap<string, KeyObject>`

Đọc tập khóa công khai theo `kid`, hai dạng:

- JSON: `{"k1":"<PEM hoặc base64 SPKI>","k2":"..."}`.
- Danh sách: `k1:<base64 SPKI>,k2:<base64 SPKI>`.

Ném `TypeError` khi chuỗi rỗng, JSON sai, không phải object, `kid` rỗng hoặc trùng, mục sai dạng `kid:base64Spki`, hoặc không có khóa nào.

#### `publicKeyBase64(privateKey: KeyObject): string`

Suy ra khóa công khai từ khóa riêng và xuất SPKI DER dạng base64, dùng để điền biến môi trường khóa công khai cho dịch vụ kiểm tra token.

### Ký và kiểm tra JWT

#### `new JwtSigner(kid: string, privateKey: KeyObject, settings: JwtSettings)`

#### `signer.sign(claims: Omit<TokenClaims, 'iat' | 'exp' | 'jti'> & { jti?: string }, nowSeconds?: number): string`

Tạo JWT với header `{ alg: 'EdDSA', typ: 'JWT', kid }`. Payload gồm các claim truyền vào cộng `iss = settings.issuer`, `aud = settings.audience`, `iat = nowSeconds` (mặc định giờ hiện tại, giây), `exp = iat + settings.accessTtlSeconds`, `jti` (mặc định `crypto.randomUUID()`). Constructor **không** kiểm tra loại khóa; hãy tạo khóa bằng `parsePrivateKey` để chắc là Ed25519.

Để `JwtVerifier` chấp nhận token, claim phải đúng dạng: `sub` là chuỗi số nguyên dương tối đa 19 chữ số (id bigint), `tid` là `null` hoặc số nguyên dương không quá 2 147 483 647, `sid` là `null` hoặc UUID, `jti` là UUID, `roles` (nếu có) là mảng chuỗi.

```js
import { generateKeyPairSync } from 'node:crypto';
import { JwtSigner, JwtVerifier, parsePrivateKey, parsePublicKeyMap, publicKeyBase64 } from '@ank-ingress/security';

const jwt = { issuer: 'my-auth', audience: 'my-api', accessTtlSeconds: 900 };
const pkcs8 = generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const privateKey = parsePrivateKey(pkcs8);

const signer = new JwtSigner('k1', privateKey, jwt);
const token = signer.sign({ sub: '42', tid: 7, sid: null, roles: ['MEMBER'] });

const verifier = new JwtVerifier(parsePublicKeyMap(`k1:${publicKeyBase64(privateKey)}`), jwt);
const claims = verifier.verify(token); // { sub: '42', tid: 7, sid: null, jti, iat, exp, roles: ['MEMBER'] }
```

#### `new JwtVerifier(publicKeys: ReadonlyMap<string, KeyObject>, settings: JwtSettings)`

Ném `TypeError` nếu `maxTokenBytes` không phải số nguyên dương an toàn; `CompositionError` nếu `issuer` hoặc `audience` rỗng, nếu map khóa rỗng, hoặc một khóa không phải khóa công khai Ed25519 / `kid` rỗng.

#### `verifier.verify(token: string, nowSeconds?: number): TokenClaims`

Kiểm tra theo thứ tự: độ dài chuỗi `> maxTokenBytes` (đếm ký tự); bộ nhớ đệm; ba đoạn base64url; header và payload là JSON object; `alg === 'EdDSA'` và `kid` là chuỗi; `kid` có trong tập khóa; chữ ký; `iss`/`aud` khớp; `exp + skew > now`; `iat - skew <= now` và `exp > iat`; `sub` là chuỗi; `tid` là số hoặc `null`; `roles` là mảng chuỗi; rồi chuẩn hóa `sub`, `tid`, `sid`, `jti`. Không kiểm tra `nbf`. Trả về `TokenClaims` đã `Object.freeze`.

Mọi thất bại ném `AppError('AUTH-401-SESSION_EXPIRED')` với message `Invalid JWT: <lý do>` (`token budget`, `format`, `JSON`, `alg/kid`, `unknown kid`, `signature`, `issuer/audience`, `expired`, `iat/exp`, `sub`, `tid`, `roles`, `identity claims`…).

Bộ nhớ đệm: khóa là nguyên chuỗi token, tối đa `maxCacheEntries` (mặc định 50 000, đặt `0` để tắt), bỏ mục cũ nhất khi đầy. Token có trong đệm và chưa quá `exp + skew` được trả ngay mà không kiểm tra lại chữ ký. Bộ đệm này **không** biết gì về thu hồi; thu hồi do `RevocationCache` lo.

#### `verifier.updateKeys(publicKeys: ReadonlyMap<string, KeyObject>): void`

Thay toàn bộ tập khóa (xoay khóa) và xóa sạch bộ nhớ đệm. Cùng điều kiện lỗi `CompositionError` như constructor; khi lỗi, tập khóa cũ được giữ nguyên.

#### `verifier.getStats(): { hits; misses; hitRate; size; maxCacheEntries }` / `verifier.resetStats(): void`

Số liệu bộ nhớ đệm để xuất metric hoặc benchmark.

### Xác thực Bearer

#### `bearerAuth(options: BearerAuthOptions): (input: BearerAuthInput) => Promise<Identity>`

Tạo stage `auth` cho `createApp({ auth })` hoặc `mountSocket(..., { auth })`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `verifier` | `JwtVerifier` | (bắt buộc) | Kiểm tra token. |
| `revocation` | `Pick<RevocationCache, 'check'> & Partial<Pick<RevocationCache, 'checkCached'>>` | (bắt buộc) | Thường là kết quả của `createRevocationCache`. |

Hành vi:

1. Header `authorization` phải bắt đầu bằng đúng `Bearer ` (phân biệt hoa thường); thiếu hoặc sai → `AppError('COMMON-401-UNAUTHENTICATED')`. Token rỗng sau khi cắt khoảng trắng → cùng mã.
2. `verifier.verify(token)` (lỗi `AUTH-401-SESSION_EXPIRED`).
3. Thu hồi: nếu `input.deferRevocationToTx` là `true` và `revocation.checkCached` có, chỉ tra bộ nhớ đệm; trượt đệm thì đánh dấu `revocationDeferred: true` để `createRequestScope` kiểm tra trong transaction. Ngược lại gọi `revocation.check(claims, input.signal)` và chờ. Tầng HTTP đặt `deferRevocationToTx` là `true` khi route có transaction, không cần body, và app có stage `scope`.
4. Tenant: mặc định `tenantId = claims.tid`. Nếu có header `x-tenant-id` khác rỗng: đọc thành số nguyên dương (sai → `COMMON-422-VALIDATION`, chi tiết `COMMON-422-INVALID_ID`, field `X-Tenant-Id`); nếu token có `tid` khác `null` mà không khớp → `AppError('COMMON-403-FORBIDDEN')`; nếu token có `tid: null` thì **lấy luôn giá trị header**. Việc xác minh người dùng có thuộc tenant đó hay không là của ứng dụng (trong `ContextInitializer.open`, stage `authorize`, hoặc `authorizeTenant` của WebSocket).
5. Trả về `Identity { accountId: claims.sub, tenantId, sessionId: claims.sid, tokenId: claims.jti, correlationId, ip, userAgent, claims, revocationDeferred? }`.

### Thu hồi token

#### `createRevocationCache<Tx>(options: RevocationCacheOptions<Tx>): RevocationCache<Tx>`

Bộ nhớ đệm trong tiến trình cho trạng thái thu hồi, theo `jti`, có đánh chỉ mục theo `sub` và `sid` để thu hồi hàng loạt.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `source` | `RevocationSource<Tx>` | (bắt buộc) | Ứng dụng viết: `load(claims, signal, tx?) => Promise<RevocationState>`. |
| `ttlMs` | `number` | `5_000` | Thời gian một trạng thái được tin trong đệm. |
| `max` | `number` | `100_000` | Số mục tối đa; đầy thì bỏ mục ít dùng gần đây nhất. |
| `loadTimeoutMs` | `number` | `2_000` | Thời gian tối đa cho một lần `source.load`. |
| `bus` | `RevocationPubSubBus` | không có | Kênh nhận lệnh vô hiệu hóa từ instance khác (ví dụ `createPubSubBus` của `@ank-ingress/cache`). |
| `channel` | `string` | `'ank:auth:revoke'` | Tên kênh trên `bus`. |

`RevocationState` (ứng dụng trả từ `source.load`): `{ tokenRevoked, sessionRevoked, accountDisabled, tokensValidAfterSec: number | null }`. Kết quả được đánh giá như sau: `accountDisabled` → `AppError('AUTH-403-ACCOUNT_DISABLED')`; `tokenRevoked` hoặc `sessionRevoked` → `AppError('AUTH-401-SESSION_EXPIRED')`; `claims.iat < tokensValidAfterSec` → `AUTH-401-SESSION_EXPIRED`.

Các phương thức của `RevocationCache`:

- `check(claims, signal, tx?)`: tín hiệu đã hủy → ném `signal.reason` (nếu là `Error`) hoặc 503. Có trong đệm và chưa hết `ttlMs` → đánh giá ngay. Có `tx` → gọi `source.load(claims, signal, tx)` trực tiếp (không gộp với lời gọi khác), giới hạn `loadTimeoutMs` bằng `AbortSignal.timeout`; hết giờ thì lỗi là `reason` của tín hiệu đó (một `DOMException` `TimeoutError`, không phải `AppError`). Không có `tx` → mọi lời gọi cùng `jti` dùng chung một lần tải; hết `loadTimeoutMs` thì reject `COMMON-503-UNAVAILABLE` ("Revocation source load timed out"); người gọi hủy thì chỉ người đó nhận lỗi, và khi mọi người chờ đều hủy thì lần tải bị hủy. Lần tải bắt đầu trước một lệnh `invalidate` sẽ không ghi kết quả vào đệm.
- `checkCached(claims): boolean`: chỉ tra đệm; trả `false` khi trượt hoặc hết hạn, ném lỗi thu hồi khi trúng một trạng thái bị thu hồi.
- `invalidate(jtiOrSub: string)`: xóa mục theo `jti`, và mọi mục có `sub` hoặc `sid` bằng chuỗi đó, **chỉ trong tiến trình hiện tại**.
- `resource`: `Resource` tên `'revocation-cache-bus'`, `required: false`. `check` báo lỗi khi `bus.isConnected()` (hoặc `isHealthy()`) trả `false`; `close` hủy đăng ký kênh, hủy các lần tải đang chạy và xóa đệm.

Định dạng tin trên `channel`: JSON `{ "jti"?: string, "sid"?: string, "sub"?: string }` (mỗi trường có mặt gây một `invalidate`), hoặc một chuỗi thô (coi là khóa cần vô hiệu hóa). Gói này không tự phát tin; ứng dụng phát khi thu hồi:

```js
// bus là PubSubBus của @ank-ingress/cache; chạy sau khi đã ghi trạng thái thu hồi vào database.
await bus.publish('ank:auth:revoke', JSON.stringify({ sub: '42' }));
```

### Phân quyền

#### `createRbacPolicy<Access>(adapter: RbacAccessAdapter<Access>): AccessPolicy<Access>`

Tạo `AccessPolicy` cho `createRequestScope({ policy })`. `authorize(access, permission, scope)`:

1. `permission === null` → cho qua (route chỉ cần đăng nhập).
2. `permission` không phải object có mảng `roles` (kể cả `undefined`) → `AppError('COMMON-403-FORBIDDEN')` ("Unknown or invalid permission specification").
3. Có `permission.attrs` **và** adapter có `checkAttrs` → gọi `checkAttrs(access, attrs, kind)`; nó tự ném lỗi nếu không đạt. Adapter không có `checkAttrs` thì `attrs` bị bỏ qua.
4. Không role nào trong `adapter.roles(access, scope)` nằm trong `permission.roles` → 403 ("Insufficient role for required permission").
5. `permission.kind === 'write'` mà `adapter.writable(access, scope)` là `false` → 403 ("Target scope is read-only").

**`RbacAccessAdapter<Access>`** (ứng dụng viết):

| Thành viên | Ý nghĩa |
| --- | --- |
| `roles(access, scope): readonly string[]` | Role mà `access` có trong phạm vi `scope.param` (giá trị `scopeParam` của route, nếu có). |
| `writable(access, scope): boolean` | `false` nếu phạm vi chỉ cho đọc (ví dụ tenant bị khóa, gói hết hạn). |
| `checkAttrs?(access, attrs, kind): void` | Tùy chọn. Kiểm tra thuộc tính bổ sung khai báo trong `PermissionSpec.attrs`; ném `AppError` để từ chối. |

Ví dụ dưới vừa xác minh người dùng thuộc tenant (việc của ứng dụng) vừa lấy role từ database. Tham số callback viết dạng phân rã (`({ roles }) => roles`) để TypeScript suy ra kiểu `Access`.

```js
import { AppError } from '@ank-ingress/kernel';
import { createRequestScope } from '@ank-ingress/postgres';
import { createRbacPolicy } from '@ank-ingress/security';

const scope = createRequestScope({
  db,
  initializer: {
    async open(tx, identity, statementTimeoutMs) {
      await tx.query("SELECT set_config('statement_timeout', $1, true)", [String(statementTimeoutMs)]);
      // Bảng memberships thuộc ứng dụng. Không có dòng nào = người dùng không thuộc tenant này.
      const { rows } = await tx.query(
        'SELECT role, read_only FROM memberships WHERE account_id = $1::bigint AND tenant_id = $2',
        [identity.accountId, identity.tenantId],
      );
      if (rows.length === 0) throw new AppError('COMMON-403-FORBIDDEN');
      return { identity, roles: rows.map((r) => String(r.role)), readOnly: rows.every((r) => r.read_only === true) };
    },
  },
  policy: createRbacPolicy({
    roles: ({ roles }) => roles,
    writable: ({ readOnly }) => !readOnly,
  }),
});
```

#### `createClaimsPolicy(): AccessPolicy<Identity>`

`createRbacPolicy` với `roles = identity.claims?.roles ?? []` và `writable` luôn `true`. Không truy vấn database; dựa hoàn toàn vào claim `roles` của token.

#### `createClaimsAuthorizer(policy?: AccessPolicy<Identity>): (input: ClaimsAuthorizeInput) => Promise<Identity>`

Stage `authorize` cho route `tx: 'none'` có mã quyền: gọi `policy.authorize(identity, permission, scope)` (mặc định `createClaimsPolicy()`) rồi trả `identity` làm `access`. Không kiểm tra tenant: với token `tid: null`, tenant lấy từ `X-Tenant-Id` đi thẳng vào `identity.tenantId`.

### Mật khẩu

#### `MIN_BCRYPT_COST = 10`, `MAX_PASSWORD_BYTES = 72`

Cost bcrypt tối thiểu được chấp nhận, và số byte UTF-8 tối đa của mật khẩu (giới hạn của bcrypt).

#### `bcryptWorkerTasks: readonly WorkerTaskSpec[]`

Hai tác vụ worker `security.bcrypt.hash` và `security.bcrypt.compare` (dùng `bcryptjs`). Phải đưa vào `tasks` của `WorkerPool` (`@ank-ingress/workers`) mà `PasswordHasher` dùng; thiếu thì lời gọi của hasher thất bại ở worker pool.

#### `new PasswordHasher(pool: WorkerPool, cost?: number)`

`cost` mặc định `10`, phải là số nguyên trong `10..15`, sai thì ném `TypeError`. Mọi phép băm/so sánh chạy trong worker thread, không chặn event loop.

- `hash(password, signal?): Promise<string>`: mật khẩu dài hơn 72 byte UTF-8 → `COMMON-422-VALIDATION` với chi tiết `{ field: 'password', code: 'COMMON-422-MAX_LENGTH', params: { max_length: 72 } }`. Lỗi của worker pool lan ra: `COMMON-503-UNAVAILABLE` khi hàng chờ đầy ("Worker pool queue full"), khi pool đang dừng, khi `signal` hủy, hoặc khi quá timeout mặc định của pool (30 000 ms nếu không cấu hình `defaultTimeoutMs`).
- `verify(password, hash: string | null, signal?): Promise<boolean>`: `hash === null` (không có tài khoản) hoặc mật khẩu quá 72 byte → vẫn so sánh với một hash giả cost 10 để thời gian phản hồi tương đương, rồi trả `false`.
- `needsRehash(hash): boolean`: `true` khi số vòng của `hash` nhỏ hơn `cost` hiện tại; chạy trên luồng chính (chỉ đọc tiền tố hash).

```js
import { WorkerPool } from '@ank-ingress/workers';
import { PasswordHasher, bcryptWorkerTasks } from '@ank-ingress/security';

const workers = new WorkerPool({ size: 4, maxQueue: 128, tasks: bcryptWorkerTasks });
const hasher = new PasswordHasher(workers, 12);

const stored = await hasher.hash('mật khẩu của tôi');
const ok = await hasher.verify('mật khẩu của tôi', stored); // true
```

### Kiểu dữ liệu

**`JwtSettings`** (ứng dụng tạo):

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `issuer` | `string` | (bắt buộc, khác rỗng) | Giá trị `iss` được ký và bắt buộc khớp khi kiểm tra. |
| `audience` | `string` | (bắt buộc, khác rỗng) | Giá trị `aud` được ký và bắt buộc khớp khi kiểm tra. |
| `accessTtlSeconds` | `number` | (bắt buộc) | Thời hạn token do `JwtSigner` ký (`exp = iat + accessTtlSeconds`). `JwtVerifier` không đọc trường này. |
| `clockSkewSeconds` | `number` | `30` | Độ lệch đồng hồ cho phép khi so `exp` và `iat`. |
| `maxTokenBytes` | `number` | `8192` | Độ dài token tối đa (đếm theo ký tự chuỗi). |
| `maxCacheEntries` | `number` | `50_000` | Kích thước bộ đệm kết quả kiểm tra; `0` để tắt. |

**`BearerAuthOptions`** (ứng dụng tạo): `verifier`, `revocation`, xem `bearerAuth`.

**`BearerAuthInput`** (tầng HTTP/WebSocket tạo):

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `headers` | `Readonly<Record<string, string \| undefined>>` | Đọc `authorization` và `x-tenant-id`. |
| `correlationId` | `string` | Chép vào `Identity`. |
| `ip` | `string \| null` | Chép vào `Identity`. |
| `userAgent` | `string \| null` | Chép vào `Identity`. |
| `signal` | `AbortSignal` | Truyền cho `revocation.check`. |
| `deferRevocationToTx?` | `boolean` | Cho phép hoãn kiểm tra thu hồi vào transaction. |

**`RevocationCacheOptions<Tx>`** (ứng dụng tạo): `source`, `ttlMs?`, `max?`, `loadTimeoutMs?`, `bus?`, `channel?`, xem `createRevocationCache`.

**`RevocationPubSubBus`** (ứng dụng cung cấp, thường là `PubSubBus` của `@ank-ingress/cache`):

| Thành viên | Ý nghĩa |
| --- | --- |
| `subscribe(channel, handler)` | Đăng ký nhận tin; trả hàm hủy đăng ký, hoặc promise của hàm đó. |
| `isConnected?(): boolean` | Ưu tiên dùng cho `resource.check`. |
| `isHealthy?(): boolean` | Dùng khi không có `isConnected`. Không có cả hai thì `check` luôn đạt. |

**`RbacAccessAdapter<Access>`** (ứng dụng viết): xem `createRbacPolicy`.

| Kiểu | Mô tả |
| --- | --- |
| `RevocationCache<Tx>` | `{ check; checkCached?; invalidate; resource }`, xem `createRevocationCache`. |
| `ClaimsAuthorizeInput` | `{ identity; permission: PermissionSpec; scopeParam?; deadlineAt; signal }`, đầu vào của `createClaimsAuthorizer`. |
| `JwtSigner`, `JwtVerifier`, `PasswordHasher` | Vừa là class vừa là kiểu của instance. |

### Nội bộ

Gói không có export nào chỉ dành cho ống nước; mọi export ở trên đều để tầng trên dùng. Tầng trên không nên gọi trực tiếp các tác vụ trong `bcryptWorkerTasks` qua `WorkerPool.run`; dùng `PasswordHasher` để có kiểm tra độ dài và so sánh thời gian đều.

---

## `@ank-ingress/cache`

Gói hạ tầng Redis (driver `redis` 6.2.1; là gói duy nhất được import `redis`) cộng một bộ nhớ đệm LRU có TTL thuần TypeScript. Cung cấp kết nối, script Lua, khóa phân tán "best effort", Pub/Sub, và bộ đếm rate limit dùng chung giữa nhiều instance. Tầng trên dùng khi chạy nhiều instance cần chia sẻ trạng thái ngắn hạn: rate limit, vô hiệu hóa đệm thu hồi, fan-out realtime.

### Kết nối Redis

#### `createRedis(config: RedisConfig): Promise<RedisBundle>`

Tạo ba client từ cùng một URL: `cmd` (lệnh thường), `sub` (chỉ dùng cho subscribe), `blocking` (dành cho lệnh chặn; các gói của khung không dùng nó). Cấu hình mỗi client: `disableOfflineQueue: true` (lệnh gửi khi chưa kết nối bị reject ngay, không xếp hàng), `connectTimeout = connectTimeoutMs`, tự kết nối lại sau `min(reconnectBaseMs · max(1, retries), 1000)` ms. Mỗi client có một listener `error` rỗng để lỗi kết nối lại không làm sập tiến trình; vì vậy lỗi Redis **không được ghi log** ở đây.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `url` | `string \| SecretHolder` | (bắt buộc) | URL Redis. `SecretHolder` chỉ được đọc **một lần** khi tạo; xoay vòng sau đó không được áp dụng. |
| `name` | `string` | `'redis'` | Tên `resource`. |
| `required` | `boolean` | `false` | `true`: chờ cả ba client kết nối trong `connectTimeoutMs`; quá hạn thì đóng hết rồi ném lỗi kết nối đầu tiên hoặc `Error('Redis initial connection timed out after <n>ms')`. `false`: trả về ngay khi kết nối xong, có lỗi đầu tiên, hoặc hết `connectTimeoutMs`; client tiếp tục tự kết nối lại phía sau. |
| `reconnectBaseMs` | `number` | `50` | Bước tăng thời gian chờ kết nối lại (trần 1000 ms). |
| `connectTimeoutMs` | `number` | `2_000` | Timeout mở socket và thời gian chờ kết nối ban đầu. |

`resource`: `required` theo cấu hình; `check()` ném lỗi khi `cmd` chưa sẵn sàng hoặc `PING` không trả `PONG`; `close()` gửi `QUIT` cho từng client (hoặc `destroy` nếu không gửi được).

```js
import { createRedis, createPubSubBus } from '@ank-ingress/cache';

const redis = await createRedis({ url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', required: true });
const bus = createPubSubBus(redis);
// Dưới runApp: ctx.use(redis.resource) trong setupInfra.
```

### Script Lua

#### `defineScript<TResult>(name: string, lua: string, numKeys: number): RedisScript<TResult>`

Tính SHA-1 của mã Lua một lần. `exec(client, keys, args)` gọi `EVALSHA`; nếu Redis báo `NOSCRIPT` thì `SCRIPT LOAD` rồi gọi lại. Ném `TypeError` khi `keys.length !== numKeys`. Đối số phải là chuỗi. Kết quả được ép kiểu thành `TResult` mà không kiểm tra.

```js
import { defineScript } from '@ank-ingress/cache';

const incrCapped = defineScript('app_incr_capped', `
  local v = redis.call("INCR", KEYS[1])
  if v > tonumber(ARGV[1]) then redis.call("DECR", KEYS[1]) return -1 end
  return v`, 1);
// const v = await incrCapped.exec(redis.cmd, ['quota:42'], ['100']);
```

### Khóa phân tán

#### `new RedisLock(client: RedisClient)`

Khóa "best effort" trên một Redis: `SET key token NX PX ttlMs` với token là UUID ngẫu nhiên, mở khóa bằng script Lua chỉ xóa khi token còn khớp. Chú thích trong mã nói rõ: không dùng khóa này để bảo đảm tính đúng nghiệp vụ hay toàn vẹn dữ liệu; lệch đồng hồ, GC dừng lâu hoặc failover có thể phá vỡ loại trừ lẫn nhau, nên bất biến nghiệp vụ phải được giữ trong PostgreSQL (ràng buộc, khóa dòng, fencing token).

- `acquire(key, ttlMs): Promise<LockLease | null>`: trả `null` nếu khóa đang bị giữ. Không có gia hạn: sau `ttlMs` khóa tự hết dù công việc chưa xong.
- `releaseWithToken(key, token): Promise<boolean>`: `true` nếu đã xóa; `false` nếu khóa đã hết hạn hoặc thuộc người khác.

```js
import { RedisLock } from '@ank-ingress/cache';

const lock = new RedisLock(redis.cmd);
const lease = await lock.acquire('lock:report:daily', 30_000);
if (lease) {
  try {
    // việc ngắn hơn hẳn 30 giây, có thể lặp lại an toàn
  } finally {
    await lease.release();
  }
}
```

### Rate limit

#### `createRedisRateLimitStore(options: { redis: RedisClient; prefix: string }): RateLimitStore`

Store dùng chung cho tùy chọn `rateLimit` của route: truyền vào `createApp({ rateLimit })`. Cửa sổ cố định: khóa `${prefix}:${bucket}:${windowMs}:${subject}`, script `INCR`, đặt `PEXPIRE windowMs` ở lần đếm đầu (và sửa lại nếu khóa mất TTL). Trả `{ allowed, remaining, retryAfterMs }`; khi bị chặn, `retryAfterMs = max(1, PTTL)`, và tầng HTTP ném `COMMON-429-RATE_LIMITED`. Lỗi Redis (kể cả khi đang mất kết nối) được ném tiếp, không có chế độ "cho qua khi lỗi".

```js
import { createApp } from '@ank-ingress/app';
import { createRedisRateLimitStore } from '@ank-ingress/cache';

const app = createApp({ rateLimit: createRedisRateLimitStore({ redis: redis.cmd, prefix: 'rl' }) });
app.post('/login', { access: 'public', tx: 'none', rateLimit: { limit: 5, windowMs: 60_000, bucket: 'login' } }, handler);
```

#### `createRateLimiter(options: RateLimiterOptions): RateLimiter`

Cùng thuật toán, dùng trực tiếp trong code (ngoài tùy chọn route). `consume(subject)` đếm trên khóa `${prefix}:${subject}` và trả `RateLimitResult`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `redis` | `RedisClient` | (bắt buộc) | Thường là `bundle.cmd`. |
| `windowMs` | `number` | (bắt buộc) | Độ dài cửa sổ. |
| `limit` | `number` | (bắt buộc) | Số lần cho phép trong một cửa sổ. |
| `prefix` | `string` | (bắt buộc) | Tiền tố khóa. |

### Pub/Sub

#### `createPubSubBus(bundle: Pick<RedisBundle, 'cmd' | 'sub'>): PubSubBus`

- `publish(channel, payload): Promise<void>`: `PUBLISH` qua `cmd`; reject khi `cmd` đang mất kết nối.
- `subscribe(channel, handler): Promise<() => Promise<void>>`: nhiều handler trên một kênh chỉ tạo một lần `SUBSCRIBE`. Nếu `sub` đang sẵn sàng mà `SUBSCRIBE` lỗi, handler bị gỡ và lỗi được ném ra. Nếu `sub` chưa sẵn sàng, handler được ghi nhận và việc đăng ký được làm khi `sub` phát `ready`. Hàm trả về gỡ handler; gỡ handler cuối cùng thì `UNSUBSCRIBE`.
- `isHealthy(): boolean`: `false` khi `sub` mất kết nối.
- Exception do handler ném bị nuốt để không làm hỏng vòng nhận tin. Redis Pub/Sub không lưu tin: tin phát trong lúc `sub` mất kết nối sẽ mất.

`PubSubBus` thỏa cả `PubSub` của `@ank-ingress/contracts` (dùng cho `createRealtimeHub`) lẫn `RevocationPubSubBus` (dùng cho `createRevocationCache`).

### Bộ nhớ đệm trong tiến trình

#### `new LruTtl<K, V>(options: LruTtlOptions)`

LRU với TTL từng mục, O(1) cho `get`/`set`. Ném `TypeError` khi `maxEntries` không phải số nguyên dương an toàn hoặc `defaultTtlMs < 1`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `maxEntries` | `number` | (bắt buộc) | Đầy thì bỏ mục ít dùng gần đây nhất. |
| `defaultTtlMs` | `number` | (bắt buộc) | TTL khi `set` không truyền `ttlMs`. |
| `now` | `() => number` | `Date.now` | Đồng hồ (để test). |

Phương thức: `get(key)` (hết hạn thì xóa và trả `undefined`; trúng thì làm mới thứ tự LRU), `set(key, value, ttlMs?)`, `delete(key)`, `clear()`, `size` (dọn mọi mục hết hạn trước khi đếm, nên tốn O(n)).

### Kiểu dữ liệu

**`RedisConfig`** (ứng dụng tạo): `url`, `name?`, `required?`, `reconnectBaseMs?`, `connectTimeoutMs?`, xem `createRedis`.

**`RateLimiterOptions`** (ứng dụng tạo): `redis`, `windowMs`, `limit`, `prefix`, xem `createRateLimiter`.

**`LruTtlOptions`** (ứng dụng tạo): `maxEntries`, `defaultTtlMs`, `now?`, xem `LruTtl`.

| Kiểu | Mô tả |
| --- | --- |
| `RedisClient` | Kiểu client `redis` với các tùy chọn ở trên (`ReturnType` của `createClient`). |
| `RedisBundle` | `{ cmd; sub; blocking; resource }`. |
| `RedisScript<TResult>` | `{ name; sha1; numKeys; exec(client, keys, args) }`. |
| `LockLease` | `{ key; token; release(): Promise<boolean> }`. |
| `RateLimiter` | `{ consume(subject): Promise<RateLimitResult> }`. |
| `RateLimitResult` | `{ allowed: boolean; remaining: number; retryAfterMs: number }`. |
| `PubSubBus` | Bí danh của `PubSub`: `{ publish; subscribe; isHealthy }`. |
| `LruTtl<K, V>` | Vừa là class vừa là kiểu của instance. |

### Nội bộ

Gói không có export chỉ dành cho ống nước. Hai script Lua nội bộ (`ank_rate_limit_fixed`, `ank_release_lock`) không được export; tầng trên không nên đặt tên script của mình trùng hai tên này để dễ đọc khi giám sát.

---

## `@ank-ingress/messaging`

Gói tích hợp Kafka của khung (driver `@confluentinc/kafka-javascript`, tức librdkafka). Gói gồm adapter Kafka (`createKafka`), bộ phát outbox (`createOutboxPublisher`), bộ chạy consumer có inbox/receipt/DLQ (`createConsumerRunner`), công cụ vận hành (`createConsumerOperations`, `replayDlq`) và codec cho envelope sự kiện. Tầng trên dùng gói này khi muốn phát sự kiện miền ra Kafka theo mô hình outbox, hoặc xử lý sự kiện từ Kafka trong transaction của chính ứng dụng.

Khung **không** sở hữu bảng nào. Outbox, inbox, consumer receipt đều là **port** (interface) trong `@ank-ingress/contracts`; ứng dụng tự hiện thực bằng schema và SQL của mình (xem [Port ứng dụng phải hiện thực](#port-ứng-dụng-phải-hiện-thực-từ-ank-ingresscontracts)).

### Kết nối Kafka

#### `createKafka(config: KafkaConfig): Promise<KafkaBundle>`

Tạo **một** producer librdkafka, kết nối ngay (chờ tối đa `connectTimeoutMs`), rồi trả về bộ `{ producer, admin, createConsumer, ensureTopics, resource }`. Admin dùng chung handle với producer. Mỗi consumer tạo qua `createConsumer` được bundle theo dõi để đóng cùng lúc.

Cấu hình producer cố định (không đổi được): `enable.idempotence: true`, `acks: -1` (chờ mọi replica), `allow.auto.create.topics: false`, partitioner `murmur2_random`, poll nền bật sau khi kết nối. Cùng một key luôn vào cùng một partition, nên thứ tự theo key được giữ.

Thời gian chờ được tính từ cấu hình:

- `requestTimeoutMs` thực tế = `max(100, min(requestTimeoutMs ?? 5000, max(100, deliveryTimeoutMs - lingerMs)))`.
- `socketTimeoutMs` thực tế = `max(requestTimeoutMs thực tế, socketTimeoutMs ?? 5000)`.
- `delivery.timeout.ms` = `max(requestTimeoutMs thực tế + lingerMs, deliveryTimeoutMs)`.

Bảng tùy chọn đầy đủ ở [`KafkaConfig`](#kafkaconfig).

**Lỗi:** Promise bị từ chối với `Error` (thông điệp lấy từ librdkafka, hoặc `Failed to connect Kafka producer`) khi không kết nối được broker trong `connectTimeoutMs`. Lỗi này cũng được ghi log `Kafka producer initial connect failed` nếu có `logger`.

`resource` là một `Resource` của `@ank-ingress/runtime`:

| Thuộc tính | Hành vi |
| --- | --- |
| `name` | `config.name ?? 'kafka'` |
| `required` | `config.required ?? true` |
| `check()` | Gọi `admin.listTopics(3000)`; lỗi nếu không lấy được metadata trong 3 giây |
| `close()` | `disconnect()` mọi consumer đã tạo, producer và admin (`Promise.allSettled`, không ném lỗi) |

```js
import { createKafka } from '@ank-ingress/messaging';

// Trong setupInfra(ctx, config) của runApp
const kafka = await createKafka({
  clientId: 'notes-api',
  brokers: config.kafkaBrokers,   // ví dụ ['10.0.0.5:9092', '10.0.0.6:9092']
  logger: ctx.logger,
});
ctx.use(kafka.resource); // runApp kiểm tra readiness và tự đóng khi tắt
```

#### `kafka.createConsumer(groupId: string, options?: KafkaConsumerOptions): Promise<KafkaConsumer>`

Tạo và kết nối một consumer librdkafka cho consumer group `groupId`. `client.id` là `${clientId}-${groupId}`. Auto-commit và auto offset store luôn **tắt**: offset chỉ được commit khi gọi `commitOffsets` (consumer runner tự làm việc này). `allow.auto.create.topics: false`, `fetch.wait.max.ms: 100`, `fetch.min.bytes: 1`.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `fromBeginning` | `boolean` | `true` | `auto.offset.reset`: `true` thì `earliest`, `false` thì `latest`. Chỉ áp dụng khi group chưa có offset đã commit |
| `sessionTimeoutMs` | `number` | `10000` | `session.timeout.ms` |
| `heartbeatIntervalMs` | `number` | `1000` | `heartbeat.interval.ms` |
| `maxPollIntervalMs` | `number` | `300000` | `max.poll.interval.ms`: quá thời gian này không poll, broker coi consumer đã chết và rebalance |
| `consumeTimeoutMs` | `number` | `100` | Thời gian chờ của mỗi lần `consume()` |
| `onPartitionsAssigned` | `(partitions) => void \| Promise<void>` | — | Gọi khi được gán partition. Lỗi chỉ được ghi log |
| `onPartitionsRevoked` | `(partitions) => void \| Promise<void>` | — | Gọi khi bị thu hồi partition; `unassign` chạy sau khi callback xong. Lỗi chỉ được ghi log |

**Lỗi:** `Error` (thông điệp librdkafka, hoặc `Failed to connect Kafka consumer (<groupId>)`) khi kết nối thất bại trong `connectTimeoutMs` của bundle.

#### `kafka.ensureTopics(topics: readonly string[], numPartitions = 1): Promise<void>`

Liệt kê topic hiện có rồi tạo những topic còn thiếu với `numPartitions` partition và **replication factor 1**, chờ có leader. Topic đã có thì giữ nguyên (không đổi số partition). Hợp với môi trường dev/test; ở production nên tạo topic bằng công cụ hạ tầng với replication factor phù hợp.

### Phát sự kiện qua outbox

Mô hình outbox: trong cùng transaction ghi dữ liệu nghiệp vụ, ứng dụng chèn một dòng vào bảng outbox của mình. Bộ phát outbox chạy nền, đọc các dòng chưa phát, gửi lên Kafka, rồi đánh dấu đã phát. Nhờ vậy không bao giờ có chuyện “đã commit DB nhưng mất sự kiện” hay “đã gửi sự kiện nhưng DB rollback”.

#### `createOutboxPublisher(options: OutboxPublisherOptions): Inbound`

Trả về một `Inbound` (vòng đời do `runApp` điều khiển). Bộ phát chia bảng outbox thành các **shard**; mỗi tiến trình thuê (lease) một số shard, nên nhiều instance chạy song song không phát trùng shard của nhau.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `store` | `OutboxStore` | bắt buộc | Port lưu trữ outbox do ứng dụng hiện thực |
| `producer` | `KafkaProducer` | bắt buộc | Thường là `kafka.producer` |
| `owner` | `string` | bắt buộc | Định danh instance khi thuê shard (ví dụ `ctx.instanceId`). Mỗi tiến trình phải khác nhau |
| `maxShards` | `number` | `64` | Số shard tối đa thuê mỗi vòng |
| `leaseTtlMs` | `number` | `15000` | Thời hạn lease |
| `batchSize` | `number` | `1000` | Số bản ghi tối đa lấy mỗi vòng |
| `pollIntervalMs` | `number` | `100` | Nghỉ giữa các vòng khi không có việc |
| `maxBackoffMs` | `number` | `5000` | Trần thời gian lùi khi lỗi liên tiếp |
| `deliveryTimeoutMs` | `number` | `10000` | Thời gian chờ broker xác nhận cho cả lô |
| `maxAttempts` | `number` | `10` | Đến lần thất bại thứ `maxAttempts` thì `markFailed(..., dead = true)` |
| `logger` | `Logger` | — | Ghi lỗi phát, lỗi gia hạn lease, lỗi vòng lặp |
| `beforeMarkPublished` | `(records) => void \| Promise<void>` | — | Hook chẩn đoán/test, gọi sau khi broker xác nhận và trước `markPublished`. Có hook này thì không giữ lease sang vòng sau |

Mỗi vòng (tick) làm tuần tự:

1. **Thuê shard:** `store.lease(owner, maxShards, leaseTtlMs)`. Khi `maxShards >= 64`, đang giữ đủ `maxShards` lease và lease nào cũng còn hơn nửa TTL thì dùng lại, không gọi `lease`.
2. **Lấy bản ghi:** `store.fetchBatch(leases, batchSize)` nếu có, nếu không thì gọi `store.fetch(lease, còn lại)` lần lượt từng lease đến khi đủ `batchSize`. Lease của shard không có bản ghi được trả lại ngay (`releaseBatch`/`release`).
3. **Gia hạn:** trong lúc gửi, cứ `max(25, floor(leaseTtlMs / 3))` ms gọi `renewBatch` (ưu tiên) hoặc `renew` từng lease. Lỗi gia hạn chỉ ghi log mức warn.
4. **Mã hóa:** mỗi bản ghi thành envelope (`createEnvelope` với `id = eventId`), key Kafka `formatOutboxBrokerKey(rec)` = `${tenantId ?? 'global'}:${aggregateType}:${aggregateId}`, header theo [`encodeEnvelope`](#encodeenvelopeenvelope-eventenvelope-options-encodeoptions-encodedkafkamessage). Bộ phát **không** kiểm tra `payload` theo schema trong catalog.
5. **Gửi:** `producer.publishBatch(messages, { timeoutMs: deliveryTimeoutMs })`. Nếu lời gọi ném lỗi, mọi bản ghi của lô coi như thất bại.
6. **Đánh dấu:** bản ghi thành công: `markPublishedBatch` (nếu có) hoặc `markPublished(lease, recordIds)` theo shard; `markPublished` trả `false` (fencing token cũ) thì chỉ ghi log warn. Bản ghi thất bại: `markFailed(lease, recordId, error.message, dead)` với `dead = attempts + 1 >= maxAttempts`.
7. **Trả lease** (trừ khi lô đầy, không lỗi, thì giữ cho vòng sau) và hẹn vòng kế: `0` ms nếu vừa phát được mà không lỗi; `pollIntervalMs` nếu rảnh; nếu lỗi hoặc toàn bộ thất bại thì lùi `min(maxBackoffMs, pollIntervalMs × 2^min(lỗiLiênTiếp, 6))` cộng jitter tối đa `min(50, pollIntervalMs)` ms.

Lỗi trong một vòng (kể cả lỗi từ store) không làm sập tiến trình: được ghi log `Outbox publisher tick error`, lease được trả, vòng sau lùi thời gian. Timer của vòng lặp được `unref()`.

Bảo đảm giao nhận là **ít nhất một lần**: nếu tiến trình chết sau khi broker xác nhận nhưng trước `markPublished`, bản ghi sẽ được phát lại. Consumer phải chống trùng theo `eventId` (inbox làm việc này).

| Phương thức `Inbound` | Hành vi |
| --- | --- |
| `start()` | Bắt đầu vòng lặp (không chờ vòng đầu xong) |
| `stop()` | Không hẹn vòng mới; vòng đang chạy vẫn chạy hết |
| `drain(signal)` | Chờ vòng đang chạy kết thúc, hoặc đến khi `signal` hủy |
| `release()` | Trả các lease còn giữ |

```js
import { createOutboxPublisher } from '@ank-ingress/messaging';

// Trong boot(ctx, config, modules, services)
const outbox = createOutboxPublisher({
  store: services.outboxStore,   // ứng dụng tự hiện thực OutboxStore
  producer: services.kafka.producer,
  owner: ctx.instanceId,
  logger: ctx.logger,
});
// Ghép với các inbound khác bằng compositeInbound([...]) của @ank-ingress/runtime
```

### Tiêu thụ sự kiện

#### `createConsumerRunner<Tx>(options: ConsumerRunnerOptions<Tx>): Inbound`

Bộ chạy consumer: giải mã message, kiểm tra schema theo catalog, chạy các `ConsumerSpec` khớp `topic` + `eventType` **trong một transaction** do ứng dụng mở (`openTx`), chống trùng bằng inbox, ghi receipt, rồi commit offset. Mỗi partition xử lý tuần tự đúng thứ tự offset; nhiều partition chạy song song.

Bảng tùy chọn đầy đủ ở [`ConsumerRunnerOptions`](#consumerrunneroptionstx). Các giá trị mặc định chính: `maxAttempts` `3`, `retryBaseMs` `50`, `maxRetryBackoffMs` `5000`, `overloadPauseMs` `200`, `partitionConcurrency` `16`, `maxQueueRecords` `512`, `maxQueueBytes` `4 MiB`.

**Luồng xử lý một message:**

1. Nếu `isOverloaded()` trả `true`: tạm dừng partition, chờ từng `overloadPauseMs` cho đến khi hết quá tải.
2. Giải mã bằng [`classifyAndDecodeMessage`](#classifyanddecodemessageraw-rawkafkamessage-catalogs-catalogs-decodeclassification).
   - `quarantine` (JSON hỏng, thiếu trường định danh, `id` không phải UUID, loại sự kiện lạ, phiên bản không hỗ trợ): ghi `receiptStore.recordQuarantined(...)` nếu có `receiptStore`, nếu không thì gửi sang `dlqTopic`. Commit offset.
   - `permanent_error` (payload sai schema): `receiptStore.recordPermanentFailure(...)` (khóa aggregate) hoặc gửi DLQ. Commit offset.
   - Hợp lệ nhưng không có handler nào khớp: `receiptStore.recordIgnored(...)` nếu có. Commit offset.
   - Thiếu cả `receiptStore` lẫn cặp `dlqTopic` + `producer` thì message quarantine/permanent **bị bỏ**: offset vẫn được commit, chỉ còn dòng log.
3. Mở `openTx(fn)`. Trong transaction: nếu có `receiptStore` thì `prepareInTx` quyết định `process` / `parked` / `already_resolved`. Với `process`, lần lượt mỗi handler khớp: `inbox.record(tx, handler.name, eventId)`; trả `true` thì gọi `handler.handle(envelope, tx, signal)`. Cuối cùng `markProcessedInTx`.
4. Lỗi trong transaction được phân loại (xem bảng dưới):
   - `TRANSIENT`: thử lại **không giới hạn số lần** (khi chưa dừng và partition chưa bị thu hồi), lùi `min(maxRetryBackoffMs, retryBaseMs × 2^min(lần-1, 8))` cộng jitter. Mỗi lần ghi `recordTransientAttempt` (lỗi của lời gọi này bị bỏ qua).
   - `UNKNOWN`: thử lại đến `maxAttempts`, nghỉ `retryBaseMs × lần` cộng jitter; hết lượt thì xử lý như `PERMANENT`.
   - `PERMANENT`: `recordPermanentFailure` (khóa aggregate; các message sau của cùng aggregate sẽ bị `parked`) hoặc gửi DLQ. Commit offset.
5. Commit offset kế tiếp (`offset + 1`), thử lại tối đa `maxAttempts` lần (nghỉ `min(maxRetryBackoffMs, retryBaseMs × lần)`). Nếu vẫn lỗi, message đầu partition được giữ lại và xử lý lại sau `retryBaseMs` ms.

Tín hiệu `signal` truyền vào handler là `executionController.signal`, **dùng chung cho cả runner**; nó chỉ bị hủy khi `drain(signal)` của runner bị hủy (hết thời gian drain lúc tắt máy). Không có timeout riêng cho từng message: thời hạn transaction phải do `openTx` đặt.

**Xử lý theo lô:** khi một partition có từ 8 message chờ trở lên, `receiptStore` có `prepareBatchInTx` và `markProcessedBatchInTx`, `inbox` có `recordBatch`, không đặt hook chẩn đoán nào và không quá tải, runner gom tối đa 128 message liên tiếp (dừng ở message đầu tiên không hợp lệ, không có handler, hoặc trùng `eventId`) vào **một** transaction. Lô lỗi thì rollback và partition đó chuyển sang xử lý từng message.

**Áp lực ngược (backpressure):** khi hàng đợi một partition hoặc tổng hàng đợi đạt `maxQueueRecords`, hoặc tổng byte đạt `maxQueueBytes`, partition bị `pause` cho đến khi hàng đợi giảm.

**Rebalance:** khi bị thu hồi partition, message còn trong hàng đợi bị bỏ (chưa commit, sẽ được giao lại cho consumer khác) và runner chờ message đang xử lý xong.

**Phân loại lỗi** (`TRANSIENT` / `PERMANENT` / `UNKNOWN`), xét theo thứ tự:

| Điều kiện trên lỗi ném ra | Kết quả |
| --- | --- |
| `err.transient === true` hoặc `err.retryable === true` | `TRANSIENT` |
| `err.permanent === true` hoặc `err.retryable === false` | `PERMANENT` |
| `AppError` mã `COMMON-503-UNAVAILABLE`, `COMMON-429-RATE_LIMITED` (bộ phân loại cũng liệt kê `COMMON-504-TIMEOUT`, nhưng `AppError` không nhận status 504) | `TRANSIENT` |
| `AppError` mã `COMMON-4xx-*` khác | `PERMANENT` |
| `err.code` là `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `ENOTFOUND`, `EAI_AGAIN` | `TRANSIENT` |
| `isTransientErrorCode(err.code)` trả `true` (mặc định [`isPostgresTransientSqlState`](#ispostgrestransientsqlstatecode-string-boolean)) | `TRANSIENT` |
| Luật `dbErrorRules` trong catalog khớp `code`/`constraint` và `retryable: true` | `TRANSIENT` |
| `err.code` bắt đầu bằng `22`, `23`, `42`, `ZG4` hoặc bằng `P0002` | `PERMANENT` (mã lỗi lấy từ luật catalog nếu có) |
| Còn lại (gồm `AppError` 5xx khác) | `UNKNOWN` |

| Phương thức `Inbound` | Hành vi |
| --- | --- |
| `start()` | `subscribe` từng topic trong `topics`, rồi chạy vòng consume nền |
| `stop()` | Ngừng nhận việc mới, bỏ các message còn trong hàng đợi (chưa commit), bắt đầu dừng consumer |
| `drain(signal)` | Chờ các message đang xử lý xong. `signal` hủy thì hủy `executionController` (handler nhận được) |
| `release()` | `consumer.disconnect()` (lỗi bị bỏ qua) |

```js
import { createConsumerRunner } from '@ank-ingress/messaging';
import { withTx } from '@ank-ingress/postgres';

// Trong boot(ctx, config, modules, services)
const groupId = 'notes-projector';
const consumer = await services.kafka.createConsumer(groupId);
const runner = createConsumerRunner({
  consumer,
  consumerGroup: groupId,              // nên trùng groupId của Kafka
  topics: ['notes.events'],
  catalogs: modules.catalogs,
  handlers: [
    ...modules.consumers,              // handler do module đóng góp qua vai trò 'consumers'
    {
      name: 'notes-search-projection', // khóa chống trùng trong inbox; không đổi sau khi đã chạy
      topic: 'notes.events',
      eventType: 'notes.note.created',
      handle: async (event, tx) => {
        await searchRepository.upsertFromEvent(tx, event); // chỉ thao tác DB qua tx
      },
    },
  ],
  inbox: services.inbox,               // ứng dụng hiện thực InboxStore
  receiptStore: services.receipts,     // ứng dụng hiện thực ConsumerReceiptStore
  logger: ctx.logger,
  metrics: ctx.metrics,
  openTx: (fn) => withTx(services.db, {
    deadlineAt: Date.now() + 10_000,
    signal: AbortSignal.timeout(10_000),
  }, (tx) => fn(tx)),
});
```

#### `isPostgresTransientSqlState(code: string): boolean`

Bộ phân loại mặc định của consumer runner. Trả `true` khi SQLSTATE bắt đầu bằng `08` (kết nối), `53` (thiếu tài nguyên), `57P` (server tắt), hoặc bằng `40001` (serialization), `40P01` (deadlock), `55P03` (lock không lấy được), `57014` (query bị hủy, ví dụ `statement_timeout`). Dùng khi viết `isTransientErrorCode` riêng mà vẫn muốn giữ danh sách PostgreSQL:

```js
import { isPostgresTransientSqlState } from '@ank-ingress/messaging';

const isTransientErrorCode = (code) => code === 'MY_DRIVER_BUSY' || isPostgresTransientSqlState(code);
```

### Vận hành consumer

#### `createConsumerOperations<Tx>(options: ConsumerOperationsOptions<Tx>): ConsumerOperations`

Các lệnh vận hành trên receipt của một consumer group: xem, chạy lại, bỏ qua có lý do, mở khóa aggregate. Thường được gói sau một route quản trị.

Cửa sổ thời gian:

- `inboxRetentionMs` = `options.inboxRetentionMs ?? options.dedupeWindowMs ?? 14 ngày`.
- `replayWindowMs` = `options.replayWindowMs ?? min(7 ngày, floor(inboxRetentionMs / 2))`.
- `dedupeWindowMs` = `options.dedupeWindowMs ?? inboxRetentionMs`.

**Lỗi khi tạo:** `CompositionError` `Consumer inbox retention (...) must be strictly greater than replay window (...)` khi `inboxRetentionMs <= replayWindowMs`.

| Phương thức | Hành vi | Lỗi |
| --- | --- | --- |
| `inspect(filter?)` | Gọi `receiptStore.inspect({ consumerGroup, ...filter })`. Lưu ý: `filter.consumerGroup` (nếu có) **ghi đè** group của operations | Lỗi từ store |
| `retry({ receiptId, actor, reason?, allowExpiredDedupeWindow? })` | Chỉ cho receipt `BLOCKED` hoặc `QUARANTINED`. Giải mã lại `rawValue` theo catalog **hiện tại**, chạy handler khớp trong `openTx` (qua inbox), `markRetriedInTx`, gọi `onAudit` (`CONSUMER_RECEIPT_RETRIED`) trong cùng transaction, rồi `clearAggregateBlockIfResolved` | `COMMON-404-NOT_FOUND` khi không có receipt; `COMMON-409-CONFLICT` khi sai trạng thái hoặc quá `dedupeWindowMs` (tính theo `createdAt` của receipt và `occurredAt` của sự kiện) mà không đặt `allowExpiredDedupeWindow`; `COMMON-422-VALIDATION` khi message vẫn không giải mã được |
| `skipWithReason({ receiptId, actor, reason })` | `markSkippedInTx` và `onAudit` (`CONSUMER_RECEIPT_SKIPPED`) trong cùng transaction. `reason` được trim. Không kiểm tra trạng thái hiện tại | `COMMON-422-VALIDATION` khi `reason` rỗng; `COMMON-404-NOT_FOUND` |
| `resume({ tenantId, aggregateType, aggregateId, actor, reason?, allowExpiredDedupeWindow? })` | Phát lại lần lượt từng receipt `PARKED` của aggregate (mỗi cái một transaction, `markRetriedInTx` với lý do mặc định `'Aggregate resumed'`), rồi `clearAggregateBlockIfResolved`, rồi `onAudit` (`CONSUMER_AGGREGATE_RESUMED`, **ngoài** transaction). Trả `{ replayedCount, unblocked }` | `COMMON-409-CONFLICT` khi aggregate còn receipt `BLOCKED`, hoặc khi một receipt quá cửa sổ chống trùng; `COMMON-422-VALIDATION` khi không giải mã được. Lỗi giữa chừng thì các receipt đã phát lại trước đó vẫn đã commit |

Handler chạy qua `retry`/`resume` nhận một `AbortSignal` mới, không bao giờ bị hủy. `onAudit` ném lỗi thì transaction rollback.

#### `replayDlq(options: ReplayDlqOptions): Promise<ReplayDlqResult>`

Đọc DLQ topic và gửi lại từng message sang `targetTopic` (giữ nguyên key và value, bỏ header `x-error` và `x-attempts`, giữ các header khác kể cả `x-original-topic`), rồi commit offset. Dừng khi đủ `maxMessages` hoặc hết `timeoutMs` (tính từ lúc bắt đầu), tùy điều nào đến trước. Consumer tạm được đóng trong mọi trường hợp.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `kafka` | `KafkaBundle` | bắt buộc | Bundle từ `createKafka` |
| `dlqTopic` | `string` | bắt buộc | Topic DLQ cần đọc |
| `targetTopic` | `string` | bắt buộc | Topic nhận message phát lại. Hàm không đối chiếu với `x-original-topic` |
| `maxMessages` | `number` | bắt buộc | Số message tối đa |
| `dryRun` | `boolean` | `false` | `true`: chỉ đọc, không gửi, không commit |
| `timeoutMs` | `number` | `5000` | Tổng thời gian tối đa |

Mỗi lần gọi dùng một consumer group **mới** (`ank-dlq-replay-<8 ký tự ngẫu nhiên>`), đọc từ đầu topic (mặc định `fromBeginning` của bundle). Vì offset được commit trên group tạm, lần gọi sau lại đọc từ đầu DLQ và phát lại cả những message đã phát. Consumer phía đích chống trùng nhờ inbox, nhưng nên dọn DLQ hoặc ghi lại lần phát lại.

Lỗi khi gửi một message không làm hàm ném: message đó được thử lại mỗi 50 ms cho đến khi hết `timeoutMs`; kết quả chỉ đếm những message đã gửi thành công. `messages[i].headers` là header gốc trên DLQ (gồm cả `x-error`).

```js
import { replayDlq } from '@ank-ingress/messaging';

const preview = await replayDlq({ kafka, dlqTopic: 'notes.events.dlq', targetTopic: 'notes.events', maxMessages: 50, dryRun: true });
console.log(preview.count, preview.messages.map((m) => m.headers['x-original-topic']));
```

### Codec envelope

Định dạng trên dây: value là JSON của `EventEnvelope` (`id`, `type`, `version`, `occurredAt`, `aggregateType`, `aggregateId`, `sequence?`, `tenantId`, `correlationId`, `traceparent?`, `payload`), mã hóa UTF-8.

#### `encodeEnvelope(envelope: EventEnvelope, options: EncodeOptions): EncodedKafkaMessage`

Trả `{ key: options.key, value, headers }`. Header luôn có `event-id`, `correlation-id`, `event-type`, `event-version`; thêm `aggregate-sequence` khi envelope có `sequence`; thêm `traceparent` khi `options.traceparent ?? envelope.traceparent` có giá trị. Kết quả gửi thẳng được bằng `producer.send`.

```js
import { createEnvelope } from '@ank-ingress/contracts';
import { encodeEnvelope, formatOutboxBrokerKey } from '@ank-ingress/messaging';

const env = createEnvelope({
  type: 'notes.note.created', version: 1,
  aggregateType: 'note', aggregateId: 'n-1', tenantId: 7,
  correlationId: 'c-1', payload: { title: 'Mua sữa' },
});
const msg = encodeEnvelope(env, { key: formatOutboxBrokerKey(env) });
await kafka.producer.send({ topic: 'notes.events', messages: [msg] });
```

#### `formatOutboxBrokerKey(rec: { tenantId: number | null; aggregateType: string; aggregateId: string }): string`

Trả `${tenantId ?? 'global'}:${aggregateType}:${aggregateId}`. Đây là key mà bộ phát outbox dùng, nên mọi sự kiện của cùng một aggregate rơi vào cùng partition và giữ thứ tự.

#### `classifyAndDecodeMessage(raw: RawKafkaMessage, catalogs: Catalogs): DecodeClassification`

Giải mã và phân loại một message thô, không ném lỗi với dữ liệu xấu. Thứ tự kiểm tra:

| Kiểm tra | Kết quả khi sai |
| --- | --- |
| `value` rỗng/`null`; JSON hỏng; JSON không phải object | `quarantine` / `MALFORMED_MESSAGE` |
| Không có `type` (cũng tìm trong header `event-type`) | `quarantine` / `MALFORMED_MESSAGE` |
| `type` không có trong `catalogs.events` | `quarantine` / `UNKNOWN_EVENT_TYPE` |
| `version` không phải số nguyên dương, lớn hơn version trong catalog, hoặc nhỏ hơn mà spec không có `upcast` | `quarantine` / `UNSUPPORTED_EVENT_VERSION` |
| Thiếu `id`, `aggregateType` hoặc `aggregateId` | `quarantine` / `MALFORMED_MESSAGE` |
| `id` không phải UUID dạng chuẩn `8-4-4-4-12` | `quarantine` / `MALFORMED_MESSAGE` |
| `upcast` ném lỗi | `quarantine` / `UNSUPPORTED_EVENT_VERSION` |
| `payload` (sau upcast) sai schema TypeBox của spec | `permanent_error` / `INVALID_EVENT_PAYLOAD` |

Hợp lệ thì trả `kind: 'ok'` với envelope đã upcast lên version của catalog và được `Object.freeze`. `sequence` lấy từ envelope, nếu không có thì từ header `aggregate-sequence`; `traceparent` ưu tiên header. Mọi nhánh đều kèm `meta` (các trường đọc được, phần còn lại `null`), `rawKey`, `rawValue`, `headers` đã chuẩn hóa. Validator TypeBox được biên dịch một lần cho mỗi `EventSpec` và lưu cache.

#### `decodeMessage(raw: RawKafkaMessage, catalogs: Catalogs): DecodedKafkaMessage`

Như trên nhưng chỉ trả phần `decoded`. **Lỗi:** `AppError('COMMON-422-VALIDATION')` (thông điệp là `errorMessage` của phân loại) khi kết quả không phải `ok`.

### Client Kafka cấp thấp

Phần lớn ứng dụng chỉ cần `createOutboxPublisher` và `createConsumerRunner`. Các interface dưới đây dùng khi viết công cụ riêng, test, hoặc gửi message không qua outbox.

#### `KafkaProducer`

| Phương thức | Hành vi |
| --- | --- |
| `publishBatch(messages, { timeoutMs? })` | Gửi một lô (mỗi phần tử có `topic`). Mảng rỗng trả `[]`. **Không** reject vì lỗi giao nhận: mỗi phần tử kết quả có `error` (`null` nếu thành công). Message chưa được xác nhận sau `timeoutMs + 200` ms nhận lỗi `Kafka delivery timed out after <timeoutMs>ms`. `timeoutMs` mặc định là `deliveryTimeoutMs` của bundle. Hàng đợi nội bộ đầy (`maxQueueMessages`/`maxQueueKbytes`) thì phần tử đó nhận lỗi ngay |
| `send({ topic, messages, acks? })` | Gọi `publishBatch` rồi **ném** lỗi của phần tử thất bại đầu tiên. Không nguyên tử: các message khác trong lô có thể đã được giao. `acks` bị bỏ qua (luôn `-1`) |
| `sendBatch({ topicMessages, acks? }, { timeoutMs? })` | Như `send` nhưng nhiều topic |
| `flush(timeoutMs?)` | Chờ hàng đợi trống. Không làm gì nếu đã ngắt kết nối. Reject `Error` khi flush lỗi |
| `getStats()` | Bộ đếm: số lời gọi, số message, số request/message đã truyền (từ thống kê librdkafka) |
| `disconnect()` | Ngắt kết nối (chờ tối đa 5 giây). Gọi nhiều lần không sao |

**Lỗi ném ra từ `publishBatch`:** `Error('Kafka producer is not connected')` khi producer đã ngắt; `Error('Kafka header names cannot contain NUL')` khi tên header chứa ký tự NUL (kiểm tra cả lô trước khi gửi bất kỳ message nào).

#### `KafkaConsumer`

| Phương thức | Hành vi |
| --- | --- |
| `subscribe({ topic?, topics? })` | Cộng dồn topic và subscribe. Trường `fromBeginning` ở đây **không có tác dụng**; dùng `fromBeginning` của `createConsumer` |
| `run(options)` | Khởi động vòng consume nền rồi trả về ngay; gọi lần hai không có tác dụng. Có `eachBatch` thì dùng `eachBatch` (lô tối đa `maxBatchSize`, mặc định 1024, gom theo partition, chạy `partitionsConsumedConcurrently` partition một lúc, mặc định 1), nếu không thì `eachMessage`. Handler ném lỗi thì ghi log và **gọi lại chính message/lô đó** mỗi 50 ms cho đến khi thành công hoặc consumer dừng. `autoCommit` bị bỏ qua; `heartbeat` truyền vào handler không làm gì (librdkafka tự gửi heartbeat) |
| `commitOffsets([{ topic, partition, offset }])` | Commit đồng bộ; `offset` là offset **kế tiếp** cần đọc. Không làm gì khi đã ngắt. Reject `Error` khi commit lỗi |
| `pause(tps)` / `resume(tps)` | Thiếu `partitions` thì áp dụng cho mọi partition đang được gán của topic đó. Lỗi bị bỏ qua |
| `seek({ topic, partition, offset })` | Timeout 2 giây; reject `Error` khi lỗi |
| `assignment()` | Bản sao danh sách partition đang được gán |
| `stop()` | Dừng vòng consume, chờ handler đang chạy xong |
| `disconnect()` | `stop()` rồi ngắt kết nối; gọi nhiều lần không sao |

#### `KafkaAdmin`

| Phương thức | Hành vi |
| --- | --- |
| `listTopics(timeoutMs = 5000)` | Tên các topic từ metadata |
| `createTopics({ topics, waitForLeaders? })` | Tạo lần lượt từng topic (timeout 10 giây mỗi topic; mặc định `numPartitions` 1, `replicationFactor` 1); topic đã tồn tại không coi là lỗi. `waitForLeaders` khác `false` thì chờ tối đa 5 giây cho tất cả partition có leader (hết giờ không ném lỗi) |
| `disconnect()` | Không làm gì (admin dùng chung handle với producer) |

### Kiểu dữ liệu

#### Port ứng dụng phải hiện thực (từ `@ank-ingress/contracts`)

Các interface này **không** export từ `@ank-ingress/messaging`, nhưng outbox và consumer chỉ chạy được khi ứng dụng hiện thực chúng. `@ank-ingress/testing` có bản in-memory (`InMemoryOutboxStore`, `InMemoryInboxStore`, `InMemoryConsumerReceiptStore`) làm mẫu tham chiếu hành vi, và bộ test hợp đồng `runOutboxInboxContractSuite` để chạy trên bản hiện thực thật.

**`OutboxRecord`** (một dòng outbox mà `fetch` trả về)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `recordId` | `string` | Khóa của dòng trong store; dùng cho `markPublished`/`markFailed` |
| `eventId` | `string` | `id` của envelope. Phải là UUID dạng chuẩn, nếu không consumer sẽ quarantine |
| `id` | `string?` | Bí danh cũ cho fixture in-memory; chỉ dùng khi thiếu `recordId`/`eventId` |
| `shardId` | `number` | Shard chứa dòng; phải thuộc lease đã cấp |
| `topic` | `string` | Topic Kafka đích |
| `aggregateType`, `aggregateId` | `string` | Aggregate; quyết định key Kafka và thứ tự |
| `sequence` | `number?` | Số thứ tự trong aggregate; được đưa vào envelope và header `aggregate-sequence` |
| `tenantId` | `number \| null` | Tenant; `null` thì key dùng `global` |
| `eventType`, `eventVersion` | `string`, `number` | Phải có trong catalog sự kiện của consumer |
| `correlationId` | `string` | Mã truy vết |
| `traceparent` | `string \| null` | W3C traceparent |
| `payload` | `unknown` | Dữ liệu sự kiện; phải khớp schema trong catalog (bộ phát không kiểm tra) |
| `occurredAt` | `string` | Thời điểm ISO; được giữ nguyên trong envelope |
| `attempts` | `number` | Số lần phát đã thất bại; bộ phát dùng để tính `dead` |

**`ShardLease`**: `{ shardId: number; owner: string; fencingToken: bigint; expiresAt: Date }`. Bộ phát coi lease là giá trị mờ: chỉ đọc `shardId` và `expiresAt`, rồi truyền nguyên lease lại cho store.

**`OutboxStore`** (mỗi phương thức nên là một transaction ngắn, độc lập; bộ phát không mở transaction nào)

| Phương thức | Bắt buộc | Hợp đồng |
| --- | --- | --- |
| `lease(owner, maxShards, ttlMs)` | có | Cấp tối đa `maxShards` shard chưa bị ai giữ, đã hết hạn, hoặc đang do chính `owner` giữ. Lấy lại shard của người khác thì phải tăng `fencingToken`. Nên ưu tiên shard có việc |
| `fetch(lease, limit)` | có | Trả tối đa `limit` bản ghi chưa phát của shard, **chỉ bản ghi đầu chưa xử lý của mỗi aggregate**, để giữ thứ tự. Lease hết hạn hoặc sai fencing thì trả `[]` |
| `fetchBatch?(leases, limit)` | không | Như `fetch` cho nhiều lease trong một lần; có thì được ưu tiên |
| `markPublished(lease, recordIds)` | có | Đánh dấu đã phát **chỉ khi** lease còn hạn và đúng `fencingToken`; sai thì trả `false` và không đổi gì |
| `markPublishedBatch?(entries)` | không | Như trên cho nhiều shard; trả số bản ghi đã đánh dấu |
| `markFailed(lease, recordId, error, dead)` | có | Tăng `attempts`, lưu `error`. `dead = true` thì chuyển dòng sang trạng thái chết; bản ghi chết vẫn chặn các bản ghi sau của cùng aggregate (theo hành vi bản in-memory). Kiểm tra fencing như `markPublished` |
| `renew?(lease, ttlMs)` / `renewBatch?(leases, ttlMs)` | không | Gia hạn lease còn hợp lệ. Thiếu cả hai thì lô gửi lâu hơn `leaseTtlMs` có thể bị instance khác lấy shard |
| `release?(lease)` / `releaseBatch?(leases)` | không | Trả lease (ví dụ đặt hết hạn). Lỗi của `releaseBatch` bị bỏ qua |

**`InboxStore<Tx>`** (chống xử lý trùng)

| Phương thức | Hợp đồng |
| --- | --- |
| `record(tx, consumer, eventId)` | Ghi cặp `(consumer, eventId)` **trong `tx`**. Trả `true` nếu mới, `false` nếu đã có (handler sẽ không chạy). Phải là ràng buộc duy nhất trong DB để hai consumer song song không cùng thấy `true`. Rollback thì bản ghi inbox cũng mất |
| `recordBatch?(tx, entries)` | Như trên cho nhiều cặp; trả mảng `boolean` cùng thứ tự. Cần cho chế độ xử lý theo lô |

**`ConsumerReceiptStore<Tx>`** (tùy chọn nhưng nên có: lưu vết từng message, khóa aggregate khi lỗi vĩnh viễn, phục vụ `createConsumerOperations`). Không có store này thì message quarantine/permanent chỉ được gửi DLQ (nếu cấu hình) rồi commit offset.

| Phương thức | Hợp đồng |
| --- | --- |
| `prepareInTx(tx, input)` | Trong `tx`: trả `already_resolved` nếu message (theo tọa độ topic/partition/offset, hoặc theo `eventId` trong group) đã có kết quả cuối; trả `parked` (và lưu receipt `PARKED`) nếu aggregate đang bị khóa hoặc còn receipt `BLOCKED`/`PARKED` trước đó; còn lại upsert `PENDING`, tăng `attempts`, trả `process` |
| `prepareBatchInTx?(tx, inputs)` | Như trên cho cả lô; trả `null` hoặc mảng sai độ dài để runner quay về xử lý từng message |
| `markProcessedInTx(tx, receiptId)` / `markProcessedBatchInTx?(tx, ids)` | Chuyển sang `PROCESSED` trong `tx` |
| `recordIgnored(input)` | Ghi `IGNORED` (không có handler) |
| `recordQuarantined(input, { errorCode, errorMessage })` | Ghi `QUARANTINED` |
| `recordTransientAttempt(input, { attempts, errorCode, errorMessage })` | Ghi lần thử tạm thời; lỗi bị bỏ qua |
| `recordPermanentFailure(input, { attempts, errorCode, errorMessage })` | Ghi `BLOCKED` và **khóa aggregate** để các message sau bị `PARKED` |
| `inspect(filter?)` | Trả `{ receipts, blockedAggregates }` theo bộ lọc `consumerGroup`, `status`, `tenantId`, `aggregateType`, `aggregateId`, `limit` |
| `getReceiptById(receiptId)` | Receipt hoặc `null` |
| `markRetriedInTx(tx, id, actor, reason?)` | Đánh dấu đã chạy lại thành công |
| `markSkippedInTx(tx, id, actor, reason)` / `markSkipped(id, actor, reason)` | Ghi `SKIPPED` |
| `listParkedForAggregate({ consumerGroup, tenantId, aggregateType, aggregateId })` | Receipt `PARKED` của aggregate, **theo thứ tự cần phát lại** |
| `clearAggregateBlockIfResolved(filter)` | Gỡ khóa aggregate khi không còn receipt `BLOCKED`/`PARKED`; trả `true` nếu đã gỡ |

Các phương thức `record*`/`recordPermanentFailure` không nhận `tx`: chúng chạy ngoài transaction của handler (transaction đó đã rollback). Nếu chúng ném lỗi, runner thử lại (lỗi `TRANSIENT` không giới hạn, lỗi khác đến `maxAttempts`).

`ConsumerReceiptInput` (đối số `input`) gồm `consumerGroup`, `topic`, `partition`, `offset`, `rawKey`, `rawValue`, `rawHeaders`, và các trường `eventId`, `eventType`, `eventVersion`, `tenantId`, `aggregateType`, `aggregateId`, `sequence`, `correlationId`, `traceparent` (có thể `null`). Store lưu `rawValue`/`rawHeaders` để `retry`/`resume` giải mã lại.

**`ConsumerSpec<Tx>`** (handler do module đóng góp)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `name` | `string` | Tên handler; là khóa `consumer` trong inbox. Đổi tên thì mọi sự kiện cũ được coi là mới |
| `topic` | `string` | Chỉ nhận message từ topic này |
| `eventType` | `string` | Chỉ nhận loại sự kiện này |
| `handle(event, tx, signal)` | `Promise<void>` | Chạy trong transaction của `openTx`. Ném lỗi thì rollback và được phân loại như bảng ở trên |

#### `KafkaConfig`

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `clientId` | `string` | bắt buộc | `client.id` của producer; tiền tố của `client.id` consumer |
| `brokers` | `readonly string[]` | bắt buộc | Danh sách `host:port` |
| `name` | `string` | `'kafka'` | Tên `Resource` |
| `required` | `boolean` | `true` | `Resource` bắt buộc cho readiness |
| `logger` | `Logger` | — | Nhận log lỗi/cảnh báo của librdkafka (mức ≤ 4) và lỗi giao nhận |
| `connectTimeoutMs` | `number` | `5000` | Timeout kết nối producer/consumer; `socket.connection.setup.timeout.ms` = `max(1000, connectTimeoutMs)` |
| `socketTimeoutMs` | `number` | `5000` | Xem công thức ở `createKafka` |
| `requestTimeoutMs` | `number` | `5000` | Bị kẹp bởi `deliveryTimeoutMs - lingerMs` |
| `deliveryTimeoutMs` | `number` | `10000` | Thời gian chờ giao nhận mặc định của `publishBatch`/`flush` |
| `lingerMs` | `number` | `2` | `linger.ms` |
| `batchNumMessages` | `number` | `1000` | `batch.num.messages` |
| `batchSizeBytes` | `number` | `65536` | `batch.size` |
| `compression` | `'none' \| 'gzip' \| 'snappy' \| 'lz4' \| 'zstd'` | `'lz4'` | `compression.type` |
| `maxQueueMessages` | `number` | `10000` | `queue.buffering.max.messages`: trần số message chờ trong RAM |
| `maxQueueKbytes` | `number` | `32768` | `queue.buffering.max.kbytes` (32 MiB) |
| `maxInFlightRequests` | `number` | `5` | `max.in.flight.requests.per.connection` |
| `retries` | `number` | `5` | `retries` |
| `retryBackoffMs` | `number` | `100` | `retry.backoff.ms` và `reconnect.backoff.ms` |
| `retryBackoffMaxMs` | `number` | `2000` | `retry.backoff.max.ms` và `reconnect.backoff.max.ms` |
| `statisticsIntervalMs` | `number` | `200` | Chu kỳ thống kê dùng cho `getStats()` |

#### `KafkaConsumerOptions`

Xem bảng ở [`kafka.createConsumer`](#kafkacreateconsumergroupid-string-options-kafkaconsumeroptions-promisekafkaconsumer).

#### `KafkaProducerMessage`

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `key` | `string \| Buffer \| null` | Chuỗi được đổi sang Buffer UTF-8 (giữ ký tự NUL) |
| `value` | `Buffer \| string \| null` | Chuỗi được đổi sang Buffer UTF-8 |
| `partition` | `number?` | Bỏ trống thì partitioner chọn theo key |
| `headers` | `Record<string, string \| Buffer \| undefined>` | Giá trị `undefined` bị bỏ; tên không được chứa NUL |
| `timestamp` | `string \| number` | Bỏ trống thì `0` (librdkafka tự đặt thời gian) |
| `opaque` | `unknown` | Trả lại nguyên vẹn trong `KafkaDeliveryResult.opaque` |

#### `OutboxPublisherOptions`

Xem bảng ở [`createOutboxPublisher`](#createoutboxpublisheroptions-outboxpublisheroptions-inbound).

#### `ConsumerRunnerOptions<Tx>`

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `consumer` | `KafkaConsumer` | bắt buộc | Từ `kafka.createConsumer(groupId)`. Runner sở hữu nó (`release()` sẽ ngắt kết nối) |
| `consumerGroup` | `string` | `'default-consumer-group'` | Tên group ghi vào receipt và nhãn metrics. **Không** đổi group Kafka (đã cố định lúc `createConsumer`) |
| `topics` | `readonly string[]` | bắt buộc | Topic cần subscribe |
| `catalogs` | `Catalogs` | bắt buộc | Catalog sự kiện để giải mã, kiểm tra schema, upcast; cũng dùng `dbErrorRules` để phân loại lỗi |
| `handlers` | `readonly ConsumerSpec<Tx>[]` | bắt buộc | Thường là `modules.consumers` |
| `openTx` | `<T>(fn: (tx: Tx) => Promise<T>) => Promise<T>` | bắt buộc | Mở transaction, chạy `fn`, commit nếu `fn` thành công, rollback nếu ném lỗi. Nên đặt deadline |
| `inbox` | `InboxStore<Tx>` | bắt buộc | Chống trùng theo `(handler.name, eventId)` |
| `receiptStore` | `ConsumerReceiptStore<Tx>` | — | Lưu vết và khóa aggregate. Thiếu thì message lỗi chỉ đi DLQ |
| `dlqTopic` | `string` | — | Topic DLQ, chỉ dùng khi **không** có `receiptStore` |
| `producer` | `KafkaProducer` | — | Bắt buộc đi kèm `dlqTopic` để gửi DLQ |
| `logger` | `Logger` | — | Log `consumer.*` |
| `metrics` | `MetricsRegistry` | — | Bật các counter `ank_consumer_quarantined_total`, `ank_consumer_ignored_total`, `ank_consumer_processed_total`, `ank_consumer_parked_total`, `ank_consumer_blocked_total`, `ank_consumer_transient_retries_total` |
| `executionController` | `AbortController` | `new AbortController()` | Nguồn của `signal` truyền vào handler |
| `isTransientErrorCode` | `(code: string) => boolean` | `isPostgresTransientSqlState` | Mã lỗi driver nào là tạm thời |
| `maxAttempts` | `number` | `3` | Số lần thử cho lỗi `UNKNOWN`, cho lời gọi store không tạm thời, và cho commit offset |
| `retryBaseMs` | `number` | `50` | Đơn vị lùi thời gian |
| `maxRetryBackoffMs` | `number` | `5000` | Trần lùi thời gian |
| `overloadPauseMs` | `number` | `200` | Chu kỳ kiểm tra lại `isOverloaded` |
| `isOverloaded` | `() => boolean` | — | Trả `true` để tạm dừng partition (ví dụ khi pool DB cạn) |
| `partitionConcurrency` | `number` | `16` | Số partition xử lý đồng thời (tối thiểu 1) |
| `maxQueueRecords` | `number` | `512` | Ngưỡng số message chờ trước khi `pause` (tối thiểu 1) |
| `maxQueueBytes` | `number` | `4194304` | Ngưỡng tổng byte (key + value) chờ trước khi `pause` (tối thiểu 256) |
| `beforeDbCommit`, `afterDbCommit`, `beforeParkingCommit`, `beforeOffsetCommit`, `afterMessageProcessed` | hàm | — | Hook chẩn đoán/test. Đặt bất kỳ hook nào thì tắt chế độ xử lý theo lô. Hook `before*` ném lỗi thì message được xử lý lại |

#### `ConsumerOperationsOptions<Tx>`

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `consumerGroup` | `string` | bắt buộc | Group mặc định cho `inspect`/`resume` |
| `receiptStore` | `ConsumerReceiptStore<Tx>` | bắt buộc | |
| `catalogs` | `Catalogs` | bắt buộc | Dùng để giải mã lại `rawValue` |
| `handlers` | `readonly ConsumerSpec<Tx>[]` | bắt buộc | Handler để chạy lại |
| `inbox` | `InboxStore<Tx>` | bắt buộc | Chống trùng khi chạy lại |
| `openTx` | `<T>(fn: (tx: Tx) => Promise<T>) => Promise<T>` | bắt buộc | Như ở runner |
| `onAudit` | `(entry: ConsumerAuditEntry, tx?: Tx) => void \| Promise<void>` | — | Ghi audit; `tx` có mặt với `retry` và `skipWithReason` |
| `dedupeWindowMs` | `number` | `inboxRetentionMs` | Receipt/sự kiện cũ hơn thì từ chối chạy lại trừ khi `allowExpiredDedupeWindow` |
| `inboxRetentionMs` | `number` | `dedupeWindowMs ?? 14 ngày` | Thời gian ứng dụng giữ bản ghi inbox |
| `replayWindowMs` | `number` | `min(7 ngày, inboxRetentionMs / 2)` | Chỉ dùng để kiểm tra `inboxRetentionMs > replayWindowMs` |

#### `ReplayDlqOptions`

Xem bảng ở [`replayDlq`](#replaydlqoptions-replaydlqoptions-promisereplaydlqresult).

#### `EncodeOptions` và `RawKafkaMessage`

| Kiểu | Trường |
| --- | --- |
| `EncodeOptions` | `key: string` (key Kafka); `traceparent?: string \| null` (ưu tiên hơn `envelope.traceparent`) |
| `RawKafkaMessage` | `key?: Buffer \| string \| null`; `value: Buffer \| string \| null`; `headers?: RawKafkaHeaderInput` |

#### Các kiểu khác

| Kiểu | Mô tả |
| --- | --- |
| `KafkaBundle` | `{ producer, admin, createConsumer(groupId, options?), ensureTopics(topics, numPartitions?), resource }` trả về từ `createKafka` |
| `KafkaProducer`, `KafkaConsumer`, `KafkaAdmin` | Interface client, mô tả ở [Client Kafka cấp thấp](#client-kafka-cấp-thấp) |
| `Producer`, `Consumer`, `Admin` | Bí danh của `KafkaProducer`, `KafkaConsumer`, `KafkaAdmin` (khung không export lớp của driver) |
| `KafkaTopicMessages` | `{ topic, messages: KafkaProducerMessage[], acks? }` cho `send`/`sendBatch`; `acks` bị bỏ qua |
| `KafkaDeliveryResult` | `{ index, topic, partition, offset: number \| null, opaque?, error: Error \| null }`; `partition` là `-1` khi lỗi |
| `KafkaProducerStats` | `produceCalls`, `batchCount`, `batchCalls`, `batchMessagesSent`, `txRequests`, `txMessages`, `tx`, `txmsgs` |
| `KafkaConsumedMessage` | `{ key: Buffer \| null, value: Buffer \| null, headers, offset: string, timestamp: string, size }` |
| `KafkaEachMessagePayload` | `{ topic, partition, message, heartbeat }` cho `eachMessage` |
| `KafkaEachBatchPayload` | `{ topic, partition, messages, heartbeat }` cho `eachBatch`; mỗi lô thuộc một partition |
| `KafkaTopicPartition` | `{ topic, partition }` |
| `KafkaTopicPartitionOffset` | `{ topic, partition, offset: string }` |
| `KafkaConsumerRunOptions` | Đối số của `consumer.run`: `autoCommit?`, `maxBatchSize?`, `partitionsConsumedConcurrently?`, `onPartitionsAssigned?`, `onPartitionsRevoked?`, `eachMessage?`, `eachBatch?` |
| `EncodedKafkaMessage` | `{ key: string, value: Buffer, headers: Record<string, string> }` từ `encodeEnvelope` |
| `RawKafkaHeaderInput` | Header thô: object (giá trị `Buffer`, chuỗi, hoặc mảng, lấy phần tử đầu) hoặc mảng object kiểu librdkafka |
| `DecodedKafkaMessage` | `{ key: string \| null, envelope: EventEnvelope, traceparent: string \| null, headers }` |
| `PartialEnvelopeMetadata` | Các trường định danh đọc được từ message (`eventId`, `eventType`, `eventVersion`, `tenantId`, `aggregateType`, `aggregateId`, `sequence`, `correlationId`, `traceparent`), `null` nếu thiếu |
| `DecodeClassification` | Kết quả `classifyAndDecodeMessage`: `kind` là `'ok'` (có `decoded`), `'quarantine'` (`errorCode` `MALFORMED_MESSAGE` / `UNKNOWN_EVENT_TYPE` / `UNSUPPORTED_EVENT_VERSION`) hoặc `'permanent_error'` (`INVALID_EVENT_PAYLOAD`); luôn có `meta`, `rawKey`, `rawValue`, `headers` |
| `ConsumerAuditEntry` | `{ action: 'CONSUMER_RECEIPT_RETRIED' \| 'CONSUMER_RECEIPT_SKIPPED' \| 'CONSUMER_AGGREGATE_RESUMED', objectId, actor, tenantId, extra? }` truyền cho `onAudit` |
| `ConsumerOperations` | `{ inspect, retry, skipWithReason, resume }` trả về từ `createConsumerOperations` |
| `ReplayedDlqItem` | `{ key: string \| null, headers: Record<string, string> }` |
| `ReplayDlqResult` | `{ count, messages: ReplayedDlqItem[] }` |

### Nội bộ

Tầng trên không nên gọi trực tiếp các export dưới đây; chúng là phần ruột mà runner và codec dùng.

| Export | Mô tả |
| --- | --- |
| `normalizeKafkaHeaders(raw?: RawKafkaHeaderInput): Record<string, string>` | Chuẩn hóa header thô thành object chuỗi: tên viết thường, `Buffer` đổi sang UTF-8, mảng lấy phần tử đầu, bỏ giá trị `undefined`. `classifyAndDecodeMessage` đã gọi sẵn |

---

## `@ank-ingress/storage`

Gói lưu trữ object qua giao thức S3 (driver `minio`, dùng được với MinIO và dịch vụ tương thích S3). Một `ObjectStore` gắn với **một bucket**. Tầng trên dùng gói này để nhận upload dạng stream, trả file về cho client (`objectReply`), hoặc cấp URL ký sẵn để client tải lên/tải xuống thẳng với kho lưu trữ.

### Tạo kho lưu trữ

#### `createObjectStore(config: ObjectStoreConfig): Promise<ObjectStore>`

Phân tích `endpoint` bằng `new URL(...)`: `https:` thì bật TLS; thiếu cổng thì dùng `443`/`80`. `accessKey`/`secretKey` kiểu `SecretHolder` được đọc **một lần** (`current()`) lúc tạo; xoay vòng khóa cần tạo lại store. Khi `ensureBucketOnBoot` khác `false`, kiểm tra bucket và tạo nếu chưa có (cần quyền tạo bucket).

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `endpoint` | `string` | bắt buộc | URL đầy đủ, ví dụ `http://minio:9000` |
| `accessKey` | `string \| SecretHolder` | bắt buộc | Khóa truy cập |
| `secretKey` | `string \| SecretHolder` | bắt buộc | Khóa bí mật |
| `bucket` | `string` | bắt buộc | Bucket mà mọi thao tác dùng |
| `region` | `string` | `'us-east-1'` | Region khi ký và khi tạo bucket |
| `name` | `string` | `'minio'` | Tên `Resource` |
| `required` | `boolean` | `true` | `Resource` bắt buộc cho readiness |
| `ensureBucketOnBoot` | `boolean` | `true` | Tạo bucket lúc khởi động nếu chưa có |
| `partSize` | `number` | `DEFAULT_MULTIPART_PART_SIZE_BYTES` (8 MiB) | Kích thước mỗi phần khi upload multipart; cũng là lượng RAM đệm cho mỗi upload (xem `putStream`) |

**Lỗi:** `TypeError` từ `new URL` khi `endpoint` sai; lỗi `InvalidArgumentError` của SDK khi `partSize` nhỏ hơn 5 MiB hoặc lớn hơn 5 GiB; lỗi mạng/quyền từ SDK khi `ensureBucketOnBoot` không kiểm tra hoặc tạo được bucket.

`resource`: `check()` ném `Error('Bucket <bucket> does not exist')` khi bucket không còn; `close()` không làm gì (SDK dùng HTTP không giữ trạng thái).

```js
import { secret } from '@ank-ingress/config';
import { createObjectStore } from '@ank-ingress/storage';

// Trong setupInfra(ctx, config) của runApp
const files = await createObjectStore({
  endpoint: config.s3Endpoint,
  accessKey: config.s3AccessKey,
  secretKey: config.s3SecretKey,   // khai báo bằng secret('S3_SECRET_KEY') trong schema
  bucket: 'notes-attachments',
  ensureBucketOnBoot: false,       // production: bucket do hạ tầng tạo
});
ctx.use(files.resource);
```

### Đọc ghi object

#### `store.putStream(key: string, body: Readable, size?: number, meta?: Record<string, string>, options?: ObjectStreamOptions): Promise<{ etag: string }>`

Ghi stream `body` vào `key`. Dữ liệu đi qua một `PassThrough` (highWaterMark 64 KiB) rồi tới SDK. `meta`: khóa chuẩn như `content-type` được gửi thành header tương ứng; khóa khác thành `x-amz-meta-<khóa>`.

Cách SDK đệm dữ liệu:

- Có `size` và `size <= partSize`: SDK đọc **toàn bộ** stream vào RAM rồi gửi một lần.
- Không có `size` hoặc `size > partSize`: upload multipart, đệm từng phần `partSize` byte trong RAM.

Hủy và lỗi:

- `options.signal` đã hủy từ trước: `body` bị `destroy`, hàm ném `signal.reason` (hoặc `Error('Object upload aborted')`).
- `signal` hủy giữa chừng, `body` lỗi, hoặc SDK lỗi: cả `body` và stream trung gian bị `destroy`, hàm ném lỗi đó. Trước khi ném, khung thử hủy multipart upload dang dở bằng một client riêng, tối đa **250 ms**; lỗi dọn dẹp bị bỏ qua (phần dang dở có thể còn lại trên server).

```js
import { Reply } from '@ank-ingress/contracts';
import { AppError } from '@ank-ingress/kernel';

// Route multipart (tx: 'none') ghi file thẳng vào kho lưu trữ, không nạp vào RAM
app.post('/attachments', { access: 'notes:write', tx: 'none', bodyFormat: 'multipart', maxBodyBytes: 20 * 1024 * 1024 }, async (req) => {
  for await (const part of req.parts()) {
    if (part.filename === null) { await part.text(); continue; }
    const key = `tenants/${req.identity.tenantId}/attachments/${crypto.randomUUID()}`;
    const { etag } = await files.putStream(key, part.stream, undefined, { 'content-type': 'application/octet-stream' }, { signal: req.signal });
    return Reply.json({ key, etag }, { status: 201 });
  }
  throw new AppError('COMMON-422-VALIDATION');
});
```

#### `store.getStream(key: string, options?: ObjectStreamOptions): Promise<{ stat: ObjectStat; body: Readable }>`

Gọi `statObject` rồi `getObject`, trả `stat` và một stream (`PassThrough`, highWaterMark 64 KiB). `options.signal` chỉ gắn vào đoạn pipeline truyền dữ liệu; hai lời gọi `statObject`/`getObject` không nhận signal. `contentType` lấy từ metadata của object, mặc định `application/octet-stream`.

**Lỗi:** ném `signal.reason` (hoặc `Error('Object download aborted')`) nếu signal đã hủy trước khi gọi; `AppError('COMMON-404-NOT_FOUND')` khi SDK báo `NotFound`/`NoSuchKey`; lỗi khác của SDK được ném nguyên.

#### `objectReply(store: ObjectStore, key: string, headers?: Record<string, string>, options?: ObjectStreamOptions): Promise<StreamReply>`

Đọc object bằng `getStream` và trả `Reply.stream(body, { contentType, size, headers })` với header `etag: "<etag>"`. `headers` truyền vào được trộn **sau** nên ghi đè được `etag`. Không hỗ trợ `Range`. Lỗi giống `getStream` (object không tồn tại thì client nhận `404`).

```js
import { objectReply } from '@ank-ingress/storage';

app.get('/attachments/:id', { access: 'notes:read', tx: 'none' }, (req) =>
  objectReply(files, `tenants/${req.identity.tenantId}/attachments/${req.params.id}`,
    { 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff' },
    { signal: req.signal }));
```

#### `store.remove(key: string): Promise<void>`

Xóa object (`removeObject` của SDK). Lỗi của SDK được ném nguyên.

### URL ký sẵn

#### `store.presignPut(key: string, ttlSec: number, contentType?: string): Promise<string>`

URL cho phép `PUT` thẳng vào `key` trong `ttlSec` giây. Tham số `contentType` hiện **bị bỏ qua**: URL không ràng buộc kiểu nội dung, cũng không giới hạn kích thước. **Lỗi (từ SDK):** `ttlSec` âm hoặc lớn hơn 604800 (7 ngày) ném `ExpiresParamError`; `ttlSec = 0` được SDK hiểu là **7 ngày**; key không hợp lệ ném `InvalidObjectNameError`.

#### `store.presignGet(key: string, ttlSec: number): Promise<string>`

URL cho phép `GET` `key` trong `ttlSec` giây. Giới hạn `ttlSec` như `presignPut`. Không kiểm tra object có tồn tại.

### Checksum khi stream

#### `sha256Transform(): Sha256Stream`

Một `Transform` cho dữ liệu đi qua nguyên vẹn và cộng dồn SHA-256. `digest()` trả chuỗi hex; gọi sau khi stream kết thúc (`flush`). Gọi `digest()` trước khi stream kết thúc sẽ chốt hash sớm: kết quả chỉ tính phần đã qua và các chunk sau làm stream lỗi.

```js
import { sha256Transform } from '@ank-ingress/storage';

// Trong vòng for await (const part of req.parts()) của route multipart
const hash = sha256Transform();
part.stream.on('error', (err) => hash.destroy(err)); // pipe() không tự chuyển lỗi của nguồn
const { etag } = await files.putStream(key, part.stream.pipe(hash), undefined, undefined, { signal: req.signal });
const sha256 = hash.digest();                        // gọi sau khi upload xong
```

### Kiểu dữ liệu

#### `ObjectStoreConfig`

Xem bảng ở [`createObjectStore`](#createobjectstoreconfig-objectstoreconfig-promiseobjectstore).

#### `ObjectStreamOptions`

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `signal` | `AbortSignal?` | Hủy truyền dữ liệu; thường là `req.signal` |

#### `ObjectStore`

Ứng dụng thường nhận từ `createObjectStore`, nhưng có thể tự hiện thực (ví dụ bản giả trong test) vì `objectReply` chỉ cần interface này.

| Thành viên | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `bucket` | `string` | Bucket đang dùng |
| `partSize` | `number?` | Kích thước phần multipart |
| `presignPut(key, ttlSec, contentType?)` | `Promise<string>` | Xem trên |
| `presignGet(key, ttlSec)` | `Promise<string>` | Xem trên |
| `putStream(key, body, size?, meta?, options?)` | `Promise<{ etag }>` | Xem trên |
| `getStream(key, options?)` | `Promise<{ stat, body }>` | Xem trên; nên ném `AppError('COMMON-404-NOT_FOUND')` khi không có object |
| `remove(key)` | `Promise<void>` | Xem trên |
| `resource` | `Resource` | Để `ctx.use(...)` |

#### Các kiểu khác

| Kiểu | Mô tả |
| --- | --- |
| `ObjectStat` | `{ size, etag, lastModified: Date, contentType, metaData }` của một object |
| `Sha256Stream` | `Transform` có thêm `digest(): string` |
| `DEFAULT_MULTIPART_PART_SIZE_BYTES` | Hằng số `8 * 1024 * 1024` (8 MiB), mặc định của `partSize` |

### Nội bộ

Không có. Mọi export của `@ank-ingress/storage` đều dành cho tầng ứng dụng.

---

## `@ank-ingress/realtime`

Gói realtime trên uWebSockets.js: gắn endpoint WebSocket vào `HttpApp` (`mountSocket`), phát tin theo topic có phân vùng tenant (`tenantTopic`, `createRealtimeHub` với fan-out qua Pub/Sub giữa các instance), và kênh Server-Sent Events có lịch sử phát lại và giới hạn bộ đệm (`createSseChannel`). Tầng trên dùng khi khai báo `SocketSpec` của module và khi viết route trả SSE.

### WebSocket

#### `mountSocket(httpApp: HttpApp, spec: SocketSpec, deps: MountSocketDeps): void`

Đăng ký route WebSocket `spec.path` trên transport uWS của `httpApp` (tạo bằng `createHttpApp` của `@ank-ingress/http`; `createApp` của `@ank-ingress/app` không đưa `HttpApp` ra ngoài). Test của gói gọi `mountSocket` lúc dựng app, trước `inbound.start()`.

**`SocketSpec`** (từ `@ank-ingress/contracts`, ứng dụng/module tạo):

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `path` | `string` | (bắt buộc) | Đường dẫn WebSocket. |
| `maxPayloadLength` | `number` | `65_536` | Kích thước tin nhận tối đa (byte), áp bởi uWS. |
| `idleTimeoutSec` | `number` | `60` | uWS đóng socket im lặng quá thời gian này. |
| `maxBackpressureBytes` | `number` | `262_144` | Ngưỡng bộ đệm gửi của mỗi socket (xem `send`). `closeOnBackpressureLimit` của uWS đặt `false`; việc đóng do khung quyết định. |
| `maxPendingMessages` | `number` | `32` | Số tin nhận đang xử lý + đang chờ của một socket; vượt thì đóng `1008`. |
| `onOpen?(client)` | hàm | | Sau khi upgrade thành công. |
| `onMessage?(client, message: Uint8Array, isBinary)` | hàm | | Xử lý **tuần tự** từng tin của một socket: tin sau chỉ bắt đầu khi promise của tin trước xong. `message` là bản sao, giữ lại sau `await` được. |
| `onDrain?(client)` | hàm | | Khi bộ đệm gửi của socket vơi đi. |
| `onClose?(client, code)` | hàm | | Khi socket đóng. |

**`MountSocketDeps`**:

| Trường | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `auth` | `AuthStage` | (bắt buộc) | Stage xác thực, ví dụ `bearerAuth(...)`. Được gọi **không** có `deferRevocationToTx`, nên `bearerAuth` kiểm tra thu hồi đầy đủ trước khi upgrade. |
| `logger` | `Logger` | `httpApp.logger` | Ghi `ws.handler_error`, `ws.pending_messages_exceeded`. |
| `authorizeTenant` | `(identity, signal) => Promise<void>` | không có | Bắt buộc về mặt hành vi khi token có `tid: null` nhưng `identity.tenantId` khác `null` (tenant chọn qua `X-Tenant-Id`): thiếu thì upgrade bị từ chối 403; có thì phải ném lỗi khi người dùng không thuộc tenant. |

**Upgrade.** Nếu server đang drain hoặc vượt `maxInFlight` → `503`. Khung chụp ngay các header `authorization`, `x-tenant-id`, `x-correlation-id` (dùng nếu dài tối đa 64 ký tự, không thì sinh UUID), `x-forwarded-for`, `user-agent`; token chỉ được đọc từ header `authorization`. IP client được tính theo `trustedProxies` của `httpApp`. Lỗi trong `auth`/`authorizeTenant` → phản hồi JSON `{ code, message: 'WebSocket upgrade rejected', correlationId }`, dòng trạng thái `403 Forbidden` nếu `AppError.httpStatus` là 403, còn lại `401 Unauthorized` (lỗi không phải `AppError` mang mã `COMMON-401-UNAUTHENTICATED`).

**`SocketClient`** (đối tượng khung đưa vào hook):

| Thành viên | Hành vi |
| --- | --- |
| `identity` | `Identity` từ lúc upgrade. |
| `closed` | `true` khi socket đã/đang đóng. |
| `send(topic, data, { lossy? })` | Gửi **trực tiếp cho socket này**; tham số `topic` bị bỏ qua. Trả `false` nếu tin bị bỏ. |
| `sendWithStatus(topic, data, { lossy? })` | Như `send` nhưng trả `'sent'`, `'backpressure'` (đã nhận vào bộ đệm, nên chờ `onDrain`) hoặc `'dropped'`. Nếu bộ đệm gửi đã `>= maxBackpressureBytes`, hoặc uWS báo bỏ tin: với `lossy: true` chỉ bỏ tin; không `lossy` thì đóng socket với `1013 'Backpressure limit exceeded'`. |
| `subscribe(topic)` / `unsubscribe(topic)` | Đăng ký topic uWS `tenantTopic(identity.tenantId, topic)`; socket chỉ nhận tin của tenant mình. |
| `close(code = 1000, reason = 'Normal closure')` | Đóng, xóa hàng chờ tin nhận. |
| `getBufferedAmount()` | Số byte đang chờ gửi; `0` khi đã đóng. |

**Lỗi và quá tải.** Hook ném lỗi hoặc reject → log `ws.handler_error` và đóng `1011 'Internal error'`. Vượt `maxPendingMessages` → log cảnh báo và đóng `1008 'Too many pending messages'`. Không vào được bộ đếm việc của server (đang drain/quá tải) → đóng `1013 'Server overloaded'`. Tin đến khi đang drain bị bỏ qua.

**Tắt server.** Khi `httpApp` dừng: các upgrade đang chờ nhận `503`; socket nào không còn hook đang chạy và không còn tin chờ thì đóng `1001 'Server shutting down'`, các socket khác đóng khi xử lý xong. Hết thời gian drain thì mọi socket bị đóng cứng.

```js
import { buildCatalogs } from '@ank-ingress/contracts';
import { createHttpApp } from '@ank-ingress/http';
import { createLogger } from '@ank-ingress/observability';
import { mountSocket } from '@ank-ingress/realtime';
import { JwtVerifier, bearerAuth, createRevocationCache, parsePublicKeyMap } from '@ank-ingress/security';

const jwt = { issuer: 'my-auth', audience: 'my-api', accessTtlSeconds: 900 };
const auth = bearerAuth({
  verifier: new JwtVerifier(parsePublicKeyMap(process.env.JWT_PUBLIC_KEYS ?? ''), jwt),
  revocation: createRevocationCache({ source: { async load() {
    return { tokenRevoked: false, sessionRevoked: false, accountDisabled: false, tokensValidAfterSec: null };
  } } }),
});
const httpApp = createHttpApp({ routes: [], catalogs: buildCatalogs([]), logger: createLogger({ service: 'chat' }) });

mountSocket(httpApp, {
  path: '/ws/chat',
  onOpen(client) {
    client.subscribe('chat'); // thực chất là topic `t:<tenantId>:chat`
  },
  async onMessage(client, message) {
    const sent = client.send('', `echo: ${Buffer.from(message).toString('utf8')}`, { lossy: true });
    if (!sent) return; // client đọc chậm: tin lossy bị bỏ, socket vẫn mở
  },
}, { auth });
```

### Phát tin theo topic

#### `tenantTopic(tenantId: number | null, topic: string): string`

Trả `t:<tenantId>:<topic>`, hoặc `t:global:<topic>` khi `tenantId` là `null`. Là tên topic uWS thật mà `SocketClient.subscribe` và `RealtimeHub.publish` dùng. Muốn phát thẳng qua `httpApp.publish` thì phải dùng hàm này để tên khớp.

#### `createRealtimeHub(options: RealtimeHubOptions): RealtimeHub`

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `httpApp` | `Pick<HttpApp, 'publish'>` | (bắt buộc) | Nơi phát tin uWS cục bộ. |
| `bus` | `PubSub` | không có | Có thì tin được phát sang instance khác (ví dụ `createPubSubBus`). |
| `instanceId` | `string` | `randomUUID()` | Đánh dấu nguồn để bỏ qua tin do chính mình phát. |
| `channel` | `string` | `'ank:realtime:fanout'` | Kênh Pub/Sub dùng cho fan-out. |

- `publish(tenantId, topic, message: string)`: phát ngay cho subscriber cục bộ của `tenantTopic(tenantId, topic)`, rồi (nếu có `bus`) phát phong bì JSON `{ origin, tenantId, topic, message }` lên `channel`. Nếu `bus.publish` lỗi (ví dụ Redis mất kết nối), promise reject **sau khi** đã phát cục bộ. Khi server chưa lắng nghe, `httpApp.publish` không gửi gì.
- `start()`: đăng ký `channel` trên `bus` (không có `bus` hoặc đã chạy thì không làm gì). Tin nhận được, nếu `origin` khác `instanceId`, được phát cục bộ tới `tenantTopic(tenantId, topic)`; tin không đọc được bị bỏ qua.
- `stop()`: hủy đăng ký.

```js
import { createRealtimeHub } from '@ank-ingress/realtime';

const hub = createRealtimeHub({ httpApp, bus }); // bus = createPubSubBus(redis)
await hub.start();
await hub.publish(7, 'chat', JSON.stringify({ text: 'xin chào' })); // tới mọi socket của tenant 7 đã subscribe 'chat'
```

### Server-Sent Events

#### `createSseChannel<T>(options?: SseChannelOptions): SseChannel<T>`

Một kênh SSE trong tiến trình: mọi subscriber của kênh nhận mọi sự kiện được `publish`. Kênh không phân vùng theo tenant hay người dùng, và không tự đồng bộ giữa các instance.

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `maxHistory` | `number` | `256` | Số sự kiện giữ lại để phát lại theo `Last-Event-ID`; `0` để tắt. |
| `maxHistoryBytes` | `number` | `1_048_576` | Tổng byte lịch sử. Một sự kiện lớn hơn mức này làm xóa toàn bộ lịch sử. |
| `maxClientBufferBytes` | `number` | `262_144` | Bộ đệm tối đa cho mỗi client (phần stream chưa đọc + hàng chờ). Vượt thì stream của client đó bị hủy với `Error('SSE client buffer limit exceeded')`. |
| `heartbeatIntervalMs` | `number` | `15_000` | Gửi `: heartbeat` khi client đang rảnh. Timer được `unref`. |

- `publish(id, event, data: T)`: định dạng `id: …`, `event: …`, rồi `data: …` (chuỗi giữ nguyên, giá trị khác qua `JSON.stringify`; nhiều dòng thành nhiều dòng `data:`). Ném `TypeError` nếu `id` hoặc `event` chứa CR, LF hoặc NUL. Đồng bộ, gửi cho mọi subscriber hiện có.
- `subscribe({ lastEventId?, signal }): StreamReply`: trả `Reply.stream` với `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform`, `x-accel-buffering: no`. Gửi ngay `: connected`. Có `lastEventId`: nếu tìm thấy trong lịch sử và phần phát lại vừa bộ đệm client thì phát lại các sự kiện sau nó; nếu không thì gửi sự kiện `resync` với `data: {"reason":"history_gap","lastEventId":…}` và thêm header `x-sse-resync-required: true`. `signal` hủy thì kết thúc stream và gỡ subscriber.

```js
import { createApp } from '@ank-ingress/app';
import { Reply } from '@ank-ingress/contracts';
import { createSseChannel } from '@ank-ingress/realtime';

const app = createApp();
const announcements = createSseChannel({ maxHistory: 100 });

app.get('/announcements/stream', { access: 'public', tx: 'none', headers: ['last-event-id'] }, (req) =>
  announcements.subscribe({ signal: req.signal, lastEventId: req.headers['last-event-id'] }));

app.post('/announcements', { access: 'public', tx: 'none', body: { text: 'string' } }, (req) => {
  announcements.publish(String(Date.now()), 'announcement', { text: req.body.text });
  return Reply.empty();
});
```

### Kiểu dữ liệu

**`MountSocketDeps`** (ứng dụng tạo): `auth`, `logger?`, `authorizeTenant?`, xem `mountSocket`.

**`RealtimeHubOptions`** (ứng dụng tạo): `httpApp`, `bus?`, `instanceId?`, `channel?`, xem `createRealtimeHub`.

**`SseChannelOptions`** (ứng dụng tạo): `maxHistory?`, `maxHistoryBytes?`, `maxClientBufferBytes?`, `heartbeatIntervalMs?`, xem `createSseChannel`.

**`SseSubscribeOptions`** (ứng dụng tạo khi gọi `subscribe`):

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `lastEventId?` | `string` | Giá trị header `Last-Event-ID` của client (route phải khai báo `headers: ['last-event-id']`). Chuỗi rỗng coi như không có. |
| `signal` | `AbortSignal` | Thường là `req.signal`; hủy thì đóng stream. |

| Kiểu | Mô tả |
| --- | --- |
| `RealtimeHub` | `{ start(); stop(); publish(tenantId, topic, message) }`. |
| `SseChannel<T>` | `{ publish(id, event, data); subscribe(options): StreamReply }`. |

### Nội bộ

Tầng trên không nên đọc hoặc ghi trực tiếp các trường dưới đây; dùng `SocketClient`.

| Export | Mô tả |
| --- | --- |
| `SocketUserData` | Dữ liệu khung gắn vào mỗi socket uWS: `identity`, `client`, `closed`, `backpressured`, `inFlightMessages`, `pendingHooks`, `messageQueue`. |

---

## `@ank-ingress/app`

Lớp 7. Vỏ khai báo route ở mức cao: `createApp`, `createRouter`, `createTestClient`. App dùng gói này để khai báo HTTP API. Bên dưới, gói gọi `createHttpApp` của `@ank-ingress/http` và `defineRoute` của `@ank-ingress/contracts`. Hướng dẫn từng bước nằm ở [usage.md](usage.md#4-route-và-router); phần này liệt kê đầy đủ chữ ký.

### Tạo app

#### `createApp<Tx, Access>(options?: CreateAppOptions<Tx, Access>): App<Tx, Access>`

Tạo một app chưa lắng nghe. Route được gom lại trong `app.routes` và chỉ được biên dịch khi gọi `listen()` hoặc `inbound()`. Từ lúc đó app bị **niêm phong**: đăng ký thêm route sẽ ném `CompositionError`.

`CreateAppOptions` gồm mọi tùy chọn của `CreateHttpAppOptions` (xem `@ank-ingress/http`), trừ `routes`. Ngoài ra `catalogs` và `logger` không bắt buộc, và có thêm:

| Tùy chọn | Kiểu | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `prefix` | `string` | `'/api/v1'` | Thêm vào trước path của mọi route khai báo qua `get/post/put/patch/delete/route/use`. Phải khớp `/api/v{n}`, vì `validateRoutePath` kiểm tra lúc đăng ký |
| `catalogs` | `Catalogs` | `buildCatalogs([])` | Quyền và mã lỗi; dưới `runApp` thì truyền `modules.catalogs` |
| `logger` | `Logger` | `createLogger({ service: 'app' })` | Truyền `ctx.logger` khi chạy dưới `runApp` |
| `handleSignals` | `boolean \| { timeoutMs?: number }` | `false` | Chỉ áp cho `listen()`. Nhận `SIGTERM`/`SIGINT` thì ngừng nhận request, drain tối đa `timeoutMs` (mặc định 25 000 ms), flush logger rồi `process.exit(0)`, hoặc `1` nếu hết giờ hay drain lỗi. Handler tín hiệu được gỡ ngay khi bắt đầu đóng, nên tín hiệu thứ hai rơi về hành vi mặc định của Node (thoát ngay) |

`Tx` là kiểu transaction mà stage `scope` đưa vào handler (ví dụ `Tx` của `@ank-ingress/postgres`). `Access` là kiểu ngữ cảnh phân quyền mà `scope`/`authorize` trả về.

#### `App<Tx, Access>`

| Thành viên | Chữ ký | Ý nghĩa |
| --- | --- | --- |
| `get/post/put/patch/delete` | `(path, options, handler) => App` | Đăng ký route, path được nối với `prefix` |
| `route` | `(path) => RouteChain` | Đăng ký nhiều method trên một path |
| `use` | `(router) => App` / `(path, router) => App` | Gắn một `Router`, kể cả các route router nhận về sau đó |
| `add` | `(...routes: RouteFor<Tx, Access>[]) => App` | Đăng ký route đã tạo bằng `defineRoute`, giữ nguyên path (**không** thêm `prefix`) |
| `prefix` | `string` | Tiền tố đang dùng |
| `routes` | `readonly RouteFor<Tx, Access>[]` | Danh sách route đã đăng ký (sau khi nối prefix) |
| `listen` | `(port?, cb?)` / `(port, host, cb?)` → `Promise<ListeningApp>` | Niêm phong, biên dịch route, mở cổng TCP. `port` mặc định `0` (cổng ngẫu nhiên), `host` mặc định `'0.0.0.0'` |
| `inbound` | `(listen: ListenConfig) => Inbound & { port?: number }` | Niêm phong và trả về `Inbound` để `runApp` tự `start`/`stop`/`drain`/`release`. Không mở cổng ngay |

`listen()` và `inbound()` chỉ được gọi **một lần** cho mỗi app, gọi lần hai ném `CompositionError('App is already listening')`. Mọi lỗi cấu hình route (quyền không có trong catalog, thiếu `auth`/`scope`/`rateLimit` store…) được ném ra lúc này.

#### `ListeningApp`

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `port` | `number` | Cổng thật đang lắng nghe |
| `close()` | `() => Promise<void>` | Ngừng nhận request, chờ request đang chạy, flush logger. Gọi nhiều lần an toàn (cùng một Promise) |

`ListenCallback = (server: ListeningApp) => void` được gọi sau khi cổng đã mở. `ListenConfig` được re-export từ `@ank-ingress/http`: `{ kind: 'tcp', host, port }` hoặc `{ kind: 'unix', path, mode?, trustedIngress? }`.

### Router

#### `createRouter<Tx, Access, DA>(defaults?: RouterDefaults<DA>): Router<Tx, Access, DA>`

Tạo nhóm route có thể gắn vào app hoặc router khác. Mỗi route nhận `{ ...defaults, ...options }`, nên tùy chọn của route thắng. Router gắn vào chỗ khác vẫn nhận route mới cho tới khi app niêm phong.

| Tùy chọn | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `access` | `DA` (chuỗi) | Quyền mặc định; có nó thì `access` trên route trở thành tùy chọn |
| `scopeParam` | `string` | Tham số path dùng khi phân quyền |
| `timeoutMs` | `number` | Timeout mặc định |
| `maxBodyBytes` | `number` | Giới hạn body mặc định |

Lỗi: `use()` với đối tượng không phải router tạo bởi `createRouter` → `CompositionError('use() expects a router created by createRouter()')`. Gắn router vào chính nó → `CompositionError`. Route không có `access` và router không có mặc định → `CompositionError` khi route tới được app. Path sai quy tắc → `CompositionError` khi route tới được app.

Với TypeScript, khi truyền tham số kiểu tường minh thì truyền cả kiểu `access` mặc định: `createRouter<Tx, Ctx, 'notes:read'>({ access: 'notes:read' })`.

#### `joinPath(base: string, path: string): string`

Nối hai đoạn path như app và router làm: `path === '/'` trả về `base`; `base === '/'` trả về `path`; còn lại trả về `base + path`. Không chuẩn hóa thêm gì.

### Tùy chọn route

`RouteOptions` = mọi trường của `RouteSpec` (xem `@ank-ingress/contracts`) trừ `method`, `path`, `handle`, cộng với các điểm sau:

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `access` | `'public' \| 'authenticated' \| string` | Chuỗi khác hai giá trị đầu là mã quyền và được chuyển thành `{ kind: 'permission', code }` |
| `scopeParam` | `string` | Gắn vào `access` dạng permission |
| `params` / `query` / `body` | `SchemaInput` | Schema TypeBox, hoặc object viết tắt `{ field: 'string' \| 'number' \| 'integer' \| 'boolean' \| TSchema }`, được chuyển thành `Type.Object(...)` với mọi trường bắt buộc. Viết tắt không hợp lệ → `CompositionError('Unknown field type …')` |
| `tx` | `'none' \| 'read' \| 'write'` | Mặc định: `public` → `none`; `GET` → `read`; còn lại → `write` |

Handler: `(req: RequestOf<...>, scope: ScopeOf<...>) => Reply | Promise<Reply>`. Kiểu của `req.params/query/body`, `req.identity` (`null` khi `public`), `scope.tx` (`null` khi `tx` hiệu lực là `none`) và `scope.access` được suy ra từ options.

### Kiểm thử

#### `createTestClient(app: App): Promise<TestClient>`

Gọi `app.listen(0, '127.0.0.1')` (nên app bị niêm phong) và trả về client gửi request HTTP thật qua uWS.

| Thành viên | Ý nghĩa |
| --- | --- |
| `baseUrl` | `http://127.0.0.1:<port><prefix>` |
| `request(method, path, init?)` | Gửi request; `path` tính từ `prefix` (`'/'` là chính `prefix`) |
| `get/post/put/patch/delete/head/options(path, init?)` | Viết tắt của `request` |
| `close()` | Đóng server |

`TestRequestInit`: `headers`, `json` (tự `JSON.stringify` và đặt `content-type: application/json` nếu chưa có), `body` (chuỗi thô), `query` (object được thêm vào URL). Redirect không được tự đi theo (`redirect: 'manual'`). Kết quả là `Response` chuẩn của `fetch`.

### Kiểu dữ liệu

| Kiểu | Mô tả |
| --- | --- |
| `App`, `CreateAppOptions`, `ListeningApp`, `ListenCallback`, `ListenConfig` | Mô tả ở trên |
| `Router`, `RouterDefaults`, `RouteChain`, `RouteTarget` | Bề mặt `get/post/.../route/use` chung cho app và router |
| `RouteOptions`, `RouteOptionsBase`, `RouteHandler` | Kiểu tham số thứ hai và thứ ba khi đăng ký route |
| `MethodRegistrar`, `PathRegistrar` | Kiểu hàm `app.get(...)` và `app.route(p).get(...)` |
| `SchemaInput`, `ShapeInput`, `FieldShorthand`, `SchemaOf` | Schema viết tắt và kiểu TypeBox suy ra từ nó |
| `AccessOf` | Chuyển chuỗi `access` thành kiểu `Access` của contracts |
| `TxModeInput` | `'none' \| 'read' \| 'write' \| undefined` |
| `TestClient`, `TestRequestInit` | Client kiểm thử |

### Nội bộ

Tầng trên không nên gọi trực tiếp các export sau:

| Export | Mô tả |
| --- | --- |
| `createRouteTarget` | Dựng bề mặt `get/post/.../route/use` trên một `RouteSink`; dùng chung giữa `createApp` và `createRouter` |
| `RouteSink`, `AnyRouteOptions`, `AnyRouteHandler` | Kiểu không gắn generic, dùng cho `createRouteTarget` |

---

## `@ank-ingress/testing`

Gói layer 8, chứa bản giả trong bộ nhớ cho các port lưu trữ (idempotency, outbox, inbox, consumer receipt) và bộ contract test chạy bằng `node:test`. Tầng ứng dụng dùng bản giả trong unit test của use case/adapter, và chạy contract suite trên store thật của mình (ví dụ PostgreSQL) để chứng minh store đó đúng hợp đồng mà framework dựa vào. Bản giả lưu mọi thứ trong `Map`/`Set` không giới hạn, chỉ dùng trong test.

### Quy ước transaction giả

Các bản giả nhận `tx` bất kỳ. Nếu `tx` là object có mảng `onRollback` (và `onFinally` cho receipt store), bản giả đăng ký hàm hoàn tác vào đó, nên rollback của test hoàn tác đúng thay đổi. `InMemoryInboxStore.withTx` tạo sẵn một `tx` như vậy. Truyền `{}` thì thay đổi có hiệu lực ngay, không hoàn tác được.

### Bản giả trong bộ nhớ

#### `new InMemoryIdempotencyStore()`

Cài `IdempotencyStore<unknown>`. Khóa gộp `tenantId:accountId:operation:key`; TTL lấy từ `key.ttlSeconds`, mặc định `86 400` giây.

| Phương thức | Hành vi |
| --- | --- |
| `claim(tx, key)` | Chưa có hoặc đã hết hạn → lưu `PENDING`, trả `{ kind: 'fresh' }`. Có rồi mà `requestHash` khác → `{ kind: 'mismatch' }`. Cùng hash, chưa lưu kết quả → `{ kind: 'pending' }`. Đã lưu → `{ kind: 'replay', result }`. |
| `save(tx, key, result)` | Lưu kết quả `COMPLETED`, giữ nguyên thời điểm hết hạn của lần `claim`. |
| `advanceTimeMs(ms)` | Tua đồng hồ nội bộ để test hết hạn. |

#### `new InMemoryInboxStore<Tx = unknown>()`

Cài `InboxStore<Tx>`.

| Phương thức | Hành vi |
| --- | --- |
| `record(tx, consumer, eventId)` | `true` lần đầu thấy cặp `(consumer, eventId)`, `false` các lần sau. Hoàn tác khi `tx.onRollback` chạy. |
| `withTx(fn)` | Tạo `tx = { onRollback: [], onCommit: [], onFinally: [] }`, chạy `fn(tx)`; thành công thì chạy `onCommit`; lỗi thì chạy `onRollback` theo thứ tự ngược rồi ném lại; cuối cùng chạy `onFinally`. |

#### `new InMemoryOutboxStore(totalShards = 64, options?: { retryBackoffMs?: number })`

Cài `OutboxStore` với lease theo shard và fencing token tăng dần. Không cài các phương thức batch tùy chọn (`markPublishedBatch`, `renewBatch`, `releaseBatch`).

| Phương thức | Hành vi |
| --- | --- |
| `enqueue(record)` | (Đồng bộ) thêm bản ghi `PENDING`; tự điền `recordId`/`eventId`/`id` từ nhau và tự đánh `sequence` theo aggregate nếu thiếu. |
| `getStatus(id)` | `'PENDING' \| 'PUBLISHED' \| 'DEAD' \| undefined`. |
| `lease(owner, maxShards, ttlMs)` | Cấp lease cho shard trống, hết hạn hoặc đã thuộc `owner`; ưu tiên shard có việc. Giữ fencing token khi chính chủ gia hạn, cấp token mới khi đổi chủ. |
| `renew(lease, ttlMs)` | Gia hạn nếu lease còn hiệu lực và đúng chủ, đúng token. |
| `fetch(lease, limit)` / `fetchBatch(leases, limit)` | Trả bản ghi đầu tiên chưa xong của mỗi aggregate (theo `sequence`) trên các shard có lease hợp lệ, đã tới `availableAt`. |
| `markPublished(lease, ids)` | `false` nếu lease sai token hoặc hết hạn; ngược lại đánh dấu `PUBLISHED`. |
| `markFailed(lease, id, error, dead)` | Tăng `attempts`; `dead` thì `DEAD`, không thì hoãn `retryBackoffMs` (mặc định `0`). `false` khi lease không hợp lệ. |
| `release(lease)` | Cho lease hết hạn ngay. |

#### `new InMemoryConsumerReceiptStore<Tx = unknown>()`

Cài đầy đủ các phương thức bắt buộc của `ConsumerReceiptStore<Tx>` (không cài các phương thức batch tùy chọn): `prepareInTx`, `markProcessedInTx`, `recordIgnored`, `recordQuarantined`, `recordTransientAttempt`, `recordPermanentFailure`, `inspect`, `getReceiptById`, `markRetriedInTx`, `markSkippedInTx`, `markSkipped`, `listParkedForAggregate`, `clearAggregateBlockIfResolved`.

- Receipt được định danh theo `(consumerGroup, topic, partition, offset)`.
- `prepareInTx` khóa theo tọa độ và theo aggregate; nếu `tx.onFinally` là mảng thì khóa được giữ tới khi `onFinally` chạy (giống khóa dòng trong transaction thật), nếu không thì nhả ngay.
- Receipt đã ở trạng thái kết thúc (`PROCESSED`, `IGNORED`, `PARKED`, `BLOCKED`, `QUARANTINED`, `SKIPPED`), hoặc cùng `eventId` đã kết thúc trong cùng group → `already_resolved`. Aggregate đang bị chặn hoặc có receipt `BLOCKED`/`PARKED` trước đó → `parked`. Còn lại → `process` với `attempts` tăng 1.
- `recordPermanentFailure` đặt `BLOCKED` và chặn aggregate; `markSkippedInTx` đặt `SKIPPED` và gỡ chặn nếu aggregate không còn receipt `BLOCKED`/`PARKED`.

### Contract suite cho store của ứng dụng

#### `runIdempotencyStoreContractSuite<Tx>(t: TestContext, createFixture: () => Promise<IdempotencyStoreFixture<Tx>>): Promise<void>`

Chạy subtest `claims fresh key, replays saved result, and detects payload mismatch` bên trong test `t`. Kịch bản: `claim` → `fresh`; `claim` lại → `pending`; `save({ status: 201, body: { id: 'note-1' } })`; `claim` → `replay` đúng kết quả đó (so sánh `deepEqual`, nên store không được thêm trường như `kind`/`headers` khi không có); `claim` với hash khác → `mismatch`; nếu fixture có `advanceTimeMs`, tua 61 giây rồi `claim` với hash mới → `fresh` (key dùng `ttlSeconds: 60`).

Khóa cố định (`tenantId: 1`, `accountId: '1001'`, `operation: 'notes.create'`, `key: 'idem-001'`), nên với DB thật, `createFixture` phải dọn dữ liệu cũ trước mỗi lần chạy.

```js
import { test } from 'node:test';
import { runIdempotencyStoreContractSuite } from '@ank-ingress/testing';
import { createPgIdempotencyStore } from '../src/adapters/postgres/idempotency-store.js';
import { openTestDb } from './helpers/test-db.js'; // ứng dụng tự viết

test('PgIdempotencyStore đáp ứng contract', async (t) => {
  await runIdempotencyStoreContractSuite(t, async () => {
    const db = await openTestDb(); // tạo schema sạch cho lần chạy này
    return {
      store: createPgIdempotencyStore(),
      withTx: (fn) => db.withTx(fn),
    };
  });
});
```

#### `runOutboxInboxContractSuite<Tx>(options): void`

Đăng ký **hai test cấp cao nhất** bằng `test()` của `node:test`, nên phải gọi ở cấp module của file test (không gọi bên trong một test khác):

1. `<name> › InboxStore deduplicates (consumer, eventId)`: `record` lần đầu `true`, lần hai `false`, consumer khác `true`.
2. `<name> › OutboxStore enforces fencing token on markPublished`: seed một bản ghi ở shard `0`; `worker-a` lease 1 shard với TTL **10 ms**; chờ 25 ms; `worker-b` lease 1 shard với TTL 5 000 ms và phải nhận fencing token lớn hơn; `markPublished` bằng lease cũ phải trả `false`, bằng lease mới phải trả `true`.

| Tùy chọn | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `name` | `string` | Tiền tố tên test. |
| `withTx` | `<T>(fn: (tx: Tx) => Promise<T>) => Promise<T>` | Chạy `fn` trong một transaction của store thật. |
| `createInbox` | `() => InboxStore<Tx>` | Tạo inbox store cần kiểm tra. |
| `createOutbox` | `() => { store: OutboxStore; seed: (record: OutboxRecord) => Promise<void> }` | Tạo outbox store và hàm chèn một bản ghi (ứng dụng tự viết `seed`, ví dụ INSERT trực tiếp). |

Store thật phải tôn trọng TTL tính bằng mili giây (lease 10 ms phải hết hạn sau 25 ms) và cấp fencing token tăng dần. `eventId` và `recordId` cố định, nên cần dữ liệu sạch cho mỗi lần chạy.

```js
import { runOutboxInboxContractSuite } from '@ank-ingress/testing';
import { createPgInboxStore, createPgOutboxStore, insertOutboxRow } from '../src/adapters/postgres/outbox.js';
import { db } from './helpers/test-db.js'; // ứng dụng tự viết

runOutboxInboxContractSuite({
  name: 'Pg outbox/inbox',
  withTx: (fn) => db.withTx(fn),
  createInbox: () => createPgInboxStore(),
  createOutbox: () => ({
    store: createPgOutboxStore(db),
    seed: (record) => insertOutboxRow(db, record),
  }),
});
```

### Kiểu dữ liệu

#### `IdempotencyStoreFixture<Tx>` (ứng dụng tạo)

| Trường | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `store` | `IdempotencyStore<Tx>` | Store cần kiểm tra. |
| `withTx` | `<R>(fn: (tx: Tx) => Promise<R>) => Promise<R>` | Chạy `fn` trong một transaction đã commit khi xong (mỗi bước của kịch bản là một transaction riêng). |
| `advanceTimeMs?` | `(ms: number) => void \| Promise<void>` | Tua thời gian của store. Không cung cấp thì phần kiểm tra hết hạn bị bỏ qua. |

#### Kiểu khác

| Kiểu | Mô tả |
| --- | --- |
| `InMemoryIdempotencyStore` | Lớp bản giả idempotency (giá trị và kiểu). |
| `InMemoryInboxStore` | Lớp bản giả inbox (giá trị và kiểu). |
| `InMemoryOutboxStore` | Lớp bản giả outbox (giá trị và kiểu). |
| `InMemoryConsumerReceiptStore` | Lớp bản giả consumer receipt (giá trị và kiểu). |

### Nội bộ

Gói này không có export nội bộ; mọi export ở trên đều dành cho tầng trên.
