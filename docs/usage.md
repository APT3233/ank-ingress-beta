# Hướng dẫn sử dụng `@ank-ingress`

Tài liệu này hướng dẫn viết API bằng `@ank-ingress`. Cách viết ngắn gọn: `createApp()`, `app.get(...)`, `createRouter()`, `app.use('/path', router)`, `app.listen(3000)`. Handler nhận request và **trả về** một `Reply`. Mỗi route khai báo quyền truy cập (`access`) cùng schema dữ liệu vào; nhờ vậy khung tự kiểm tra dữ liệu, sinh kiểu TypeScript và báo lỗi cấu hình ngay khi khởi động.

Mọi ví dụ bên dưới là JavaScript hợp lệ, nên chạy được trong file `.js` lẫn `.ts`. Viết bằng TypeScript thì `req.params`, `req.query`, `req.body` tự có kiểu mà không cần khai báo thêm.

Tài liệu liên quan:
- [api-reference.md](api-reference.md): tham chiếu đầy đủ API của 15 package.
- [critical-rules.md](critical-rules.md): quy tắc bắt buộc để không sập hay treo server, không hỏng kết nối database, không lộ dữ liệu. Đọc trước khi đưa code lên production.

## Mục lục

1. [Cài đặt](#1-cài-đặt)
2. [Hello world](#2-hello-world)
3. [Những điều cần biết trước](#3-những-điều-cần-biết-trước)
4. [Route và Router](#4-route-và-router)
5. [Đọc request](#5-đọc-request)
6. [Trả response](#6-trả-response)
7. [Xử lý lỗi](#7-xử-lý-lỗi)
8. [Tính năng dùng chung](#8-tính-năng-dùng-chung)
9. [Xác thực và phân quyền](#9-xác-thực-và-phân-quyền)
10. [Dùng PostgreSQL](#10-dùng-postgresql)
11. [Viết test](#11-viết-test)
12. [Chạy production](#12-chạy-production)
13. [Lỗi thường gặp](#13-lỗi-thường-gặp)
14. [Tra cứu tùy chọn](#14-tra-cứu-tùy-chọn)

## 1. Cài đặt

Yêu cầu Node.js `^24.22.1`. Dự án dùng ESM, nên `package.json` của bạn cần có `"type": "module"`.

**Dự án bên ngoài repo này.** Đóng gói framework rồi cài từ file `.tgz`:

```bash
# Trong repo ank-ingress
npm run release:pack

# Trong dự án của bạn
npm install /duong-dan/toi/ank-ingress/release/tarballs/*.tgz
npm install @sinclair/typebox@0.34.52
```

Muốn mang sang máy khác, chép `release/tarballs/*.tgz` vào dự án (ví dụ `vendor/ank-ingress/`) rồi chạy `npm install ./vendor/ank-ingress/*.tgz`.

**Trong workspace này** (thêm app vào `examples/`), các gói đã có sẵn sau `npm ci`.

**TypeScript.** Node 24 chạy thẳng file `.ts` (`node src/main.ts`), không cần bước build. Khi import file cục bộ, ghi rõ đuôi: `import { buildApp } from './app.ts'`. Để kiểm tra kiểu, bật `"strict": true` và `"module": "nodenext"` trong `tsconfig.json`.

## 2. Hello world

```js
// src/main.js (hoặc src/main.ts)
import { createApp } from '@ank-ingress/app';
import { Reply } from '@ank-ingress/contracts';

const app = createApp();

app.get('/hello', { access: 'public' }, (req) => {
  return Reply.json({ message: 'Xin chào' });
});

app.listen(3000, (server) => {
  console.log(`Đang chạy: http://localhost:${server.port}/api/v1/hello`);
});
```

```bash
node src/main.js
curl http://localhost:3000/api/v1/hello
# {"message":"Xin chào"}
```

Hai điều cần nhớ ngay từ đầu:

- Mọi đường dẫn được tự động thêm tiền tố `/api/v1`. Đổi bằng `createApp({ prefix: '/api/v2' })`; tiền tố phải có dạng `/api/v{n}`.
- Route nào cũng phải có `access`. Route ai cũng gọi được thì dùng `'public'`.

## 3. Những điều cần biết trước

| Việc cần làm | Cách viết |
| --- | --- |
| Tạo app | `const app = createApp()` |
| Khai báo route | `app.get('/x', { access: 'public' }, (req) => Reply.json(data))` |
| Trả status khác 200 | `return Reply.json(data, { status: 201 })` |
| Trả text / HTML | `Reply.text('chuỗi')` / `Reply.html('<p>…</p>')` |
| Chuyển hướng | `Reply.redirect('/api/v1/moi')` |
| Không có nội dung | `Reply.empty()` (204) |
| Gửi file | `Reply.file(name, { root: './public' })` |
| Đặt cookie | header `set-cookie` với `serializeCookie('a', '1')` |
| Tách route ra file khác | `createRouter()` rồi `app.use('/notes', router)` |
| Nhiều method trên một path | `app.route('/x').get(opts, fn).put(opts, fn)` |
| Nhận JSON | Có sẵn; khai báo `body` để kiểm tra dữ liệu |
| Nhận form HTML | `bodyFormat: 'urlencoded'` |
| Nhận upload file | `bodyFormat: 'multipart'` + `req.parts()` |
| Đọc cookie | `cookies: true` trên route |
| Đọc header tự đặt | `headers: ['x-api-key']` trên route, rồi `req.headers['x-api-key']` |
| CORS | `createApp({ cors: { origin: '…' } })` |
| Header bảo mật | `createApp({ securityHeaders: true })` |
| Giới hạn tần suất | `rateLimit` trên route + store trên app |
| Trả lỗi | `throw new AppError('…')` |
| Lắng nghe | `app.listen(3000, cb)` (trả về Promise) |
| Viết test HTTP | `createTestClient(app)` |

Nguyên tắc chung:

- **Tính năng dùng chung là tùy chọn khai báo.** CORS, header bảo mật, rate limit, xác thực, giới hạn body, timeout đều bật qua tùy chọn của app hoặc route (mục [8](#8-tính-năng-dùng-chung)), không phải viết hàm chen vào giữa request. Nhờ vậy route không dùng tính năng nào thì không tốn chi phí cho tính năng đó.
- **Handler trả về `Reply`.** `async` hay không đều được.
- **Dữ liệu vào được kiểm tra trước khi tới handler.** Sai schema thì client nhận `422`, handler không chạy.
- **Đăng ký route sau `listen()` sẽ ném lỗi.** Khai báo hết route trước khi lắng nghe.
- **Đường dẫn có quy tắc:** đoạn tĩnh viết thường (`a-z`, `0-9`, `-`, `_`), không có `/` ở cuối, tham số dạng `:id`. `'/Users'` hay `'/users/'` báo lỗi ngay lúc đăng ký.

## 4. Route và Router

### 4.1. Đăng ký route

Có `get`, `post`, `put`, `patch`, `delete`. Tham số là `(path, options, handler)`, và các lời gọi nối chuỗi được:

```js
app
  .get('/notes', { access: 'public' }, () => Reply.json([]))
  .post('/notes', { access: 'public', body: { title: 'string' } }, (req) =>
    Reply.json({ title: req.body.title }, { status: 201 }))
  .delete('/notes/:id', { access: 'public' }, () => Reply.empty());
```

Route `GET` tự trả lời `HEAD`. Gọi sai method trên một path đã có thì nhận `405` kèm header `Allow`; path không tồn tại thì nhận `404`.

### 4.2. Nhiều method trên một path

```js
app.route('/notes/:id')
  .get({ access: 'public' }, (req) => Reply.json({ id: req.params.id }))
  .put({ access: 'public', body: { title: 'string' } }, (req) =>
    Reply.json({ id: req.params.id, title: req.body.title }))
  .delete({ access: 'public' }, () => Reply.empty());
```

### 4.3. Tách route ra nhiều file với Router

```js
// src/routes/notes.routes.js
import { createRouter } from '@ank-ingress/app';
import { Reply } from '@ank-ingress/contracts';

export const notesRouter = createRouter({ access: 'public' }); // mặc định cho mọi route trong router

notesRouter.get('/', {}, () => Reply.json({ notes: [] }));
notesRouter.get('/:id', {}, (req) => Reply.json({ id: req.params.id }));
```

```js
// src/main.js
import { createApp } from '@ank-ingress/app';
import { notesRouter } from './routes/notes.routes.js';

const app = createApp();
app.use('/notes', notesRouter); // GET /api/v1/notes, GET /api/v1/notes/:id
app.listen(3000);
```

- `createRouter(defaults)` nhận các giá trị mặc định `access`, `scopeParam`, `timeoutMs`, `maxBodyBytes`. Route tự khai báo giá trị riêng thì giá trị của route được dùng.
- Router lồng nhau được (`notesRouter.use('/:id/comments', commentsRouter)`). Router trong cùng có mặc định riêng thì dùng của nó, thiếu mục nào mới lấy của router ngoài.
- Route thêm vào router **sau khi** đã `app.use(...)` vẫn được đăng ký, miễn là trước `listen()`.
- Router không có mặc định `access` thì mỗi route phải tự khai báo `access`. TypeScript báo lỗi lúc viết code; JavaScript báo `CompositionError` lúc `app.use(...)`.
- Trong TypeScript, khi truyền tham số kiểu tường minh cho router thì truyền luôn kiểu của `access` mặc định: `createRouter<Tx, Ctx, 'notes:read'>({ access: 'notes:read' })`.

### 4.4. Route viết sẵn bằng `defineRoute`

Module và code cũ thường khai báo route dạng đối tượng. Dùng `app.add(...)` để đăng ký. Cách này **không** thêm tiền tố, nên `path` phải đầy đủ:

```js
import { Reply, defineRoute } from '@ank-ingress/contracts';

const health = defineRoute({
  method: 'GET',
  path: '/api/v1/health',
  access: { kind: 'public' },
  handle: async () => Reply.json({ up: true }),
});

app.add(health);
```

## 5. Đọc request

### 5.1. `params`, `query`, `body` có kiểm tra dữ liệu

Khai báo schema ngay trong options. Cách viết tắt dùng `'string' | 'number' | 'integer' | 'boolean'`:

```js
app.get('/search', {
  access: 'public',
  query: { q: 'string', page: 'integer' },
}, (req) => {
  // GET /api/v1/search?q=sach&page=2 → req.query = { q: 'sach', page: 2 }
  return Reply.json({ q: req.query.q, page: req.query.page });
});

app.post('/notes', {
  access: 'public',
  body: { title: 'string', pinned: 'boolean' },
}, (req) => Reply.json(req.body, { status: 201 }));
```

- `query` và `params` được chuyển từ chuỗi sang số hoặc boolean theo schema.
- Mọi trường viết tắt đều **bắt buộc**. Trường tùy chọn, độ dài, regex… thì dùng [TypeBox](https://github.com/sinclairzx81/typebox):

```js
import { Type } from '@sinclair/typebox';

app.post('/users', {
  access: 'public',
  body: {
    email: Type.String({ pattern: '^[^@\\s]+@[^@\\s]+$' }),
    name: Type.String({ minLength: 1, maxLength: 100 }),
    age: Type.Optional(Type.Integer({ minimum: 0 })),
  },
}, (req) => Reply.json({ email: req.body.email }, { status: 201 }));

// Hoặc truyền cả một schema TypeBox
const itemParams = Type.Object({ itemId: Type.String({ pattern: '^[0-9]{1,18}$' }) });
app.get('/items/:itemId', { access: 'public', params: itemParams }, (req) =>
  Reply.json({ id: req.params.itemId }));
```

Dùng `pattern` thay cho `format` (như `format: 'email'`): các format chưa được đăng ký với TypeBox nên giá trị nào cũng bị từ chối.

Dữ liệu sai schema nhận `422`, handler không được gọi:

```json
{
  "code": "COMMON-422-VALIDATION",
  "message": "Validation failed",
  "correlationId": "…",
  "details": [{ "field": "email", "code": "COMMON-422-INVALID_FIELD" }]
}
```

Không khai báo `params` thì `req.params` vẫn có các tham số trong path dưới dạng chuỗi.

### 5.2. Định dạng body

| `bodyFormat` | Content-Type | `req.body` |
| --- | --- | --- |
| `'json'` (mặc định) | `application/json` | Đối tượng đã kiểm tra theo `body` |
| `'urlencoded'` | `application/x-www-form-urlencoded` | Đối tượng, các trường được chuyển kiểu như `query` |
| `'text'` | `text/plain` | Chuỗi; cần khai báo `body: Type.String()` |
| `'multipart'` | `multipart/form-data` | Không dùng; đọc qua `req.parts()` |

`Content-Type` không khớp định dạng thì nhận `415`. Khai báo `bodyFormat` khác `'multipart'` thì phải kèm schema `body`.

Nhận form HTML:

```js
app.post('/signup', {
  access: 'public',
  bodyFormat: 'urlencoded',
  body: { email: 'string', age: 'integer' },
}, (req) => Reply.json({ email: req.body.email, age: req.body.age }));
```

Upload file: đọc lần lượt từng phần theo dạng stream, không nạp cả file vào RAM.

```js
app.post('/avatars', {
  access: 'public',
  bodyFormat: 'multipart',
  maxBodyBytes: 5 * 1024 * 1024, // 5 MiB, mặc định 1 MiB
}, async (req) => {
  const files = [];
  for await (const part of req.parts()) {
    if (part.filename === null) {
      console.log('field', part.name, await part.text());
      continue;
    }
    let size = 0;
    for await (const chunk of part.stream) size += chunk.length; // hoặc pipe vào storage
    files.push({ field: part.name, filename: part.filename, size });
  }
  return Reply.json(files, { status: 201 });
});
```

Phải đọc hết `part.stream` (hoặc gọi `part.text()`) rồi mới sang phần tiếp theo. Giới hạn số phần, kích thước trường text… đặt qua `multipart: { maxParts, maxFieldBytes, maxHeaderBytes }`. Route multipart chỉ nhận `POST`/`PUT`/`PATCH`, và nếu không phải `public` thì phải đặt `tx: 'none'` để không giữ transaction trong lúc upload.

### 5.3. Header, cookie, IP, host

Để đạt tốc độ tối đa, khung chỉ đọc những header mà route cần. Header tự đặt phải được khai báo:

```js
app.get('/webhook', { access: 'public', headers: ['x-signature'] }, (req) =>
  Reply.json({ signature: req.headers['x-signature'] ?? null }));
```

| Thuộc tính | Cần bật trên route | Ghi chú |
| --- | --- | --- |
| `req.headers[...]` | `headers: ['ten-header']` | Tên viết thường. Các header khung tự dùng (`authorization`, `content-type`…) đã có sẵn khi route cần |
| `req.cookies` | `cookies: true` | Đối tượng `{ ten: giaTri }` |
| `req.ip` | không | IP client; chỉ tin `X-Forwarded-For` từ `trustedProxies` |
| `req.hostname`, `req.protocol`, `req.secure` | `hostInfo: true` | `https` chỉ được nhận qua `X-Forwarded-Proto` từ proxy tin cậy |
| `req.identity` | không | `null` với route `public`; thông tin người dùng với route cần đăng nhập |
| `req.correlationId` | không | Mã truy vết, cũng có trong log và body lỗi |
| `req.signal`, `req.deadlineAt` | không | Hủy khi client ngắt kết nối hoặc hết `timeoutMs` (mặc định 15 giây) |

Truyền `req.signal` vào các lời gọi chậm (`fetch(url, { signal: req.signal })`) để dừng việc khi client đã bỏ đi.

## 6. Trả response

Handler trả về một trong các `Reply` sau (có thể bọc trong `Promise`):

```js
import { Reply, serializeCookie, clearCookie } from '@ank-ingress/contracts';

Reply.json({ ok: true });                                  // 200 application/json
Reply.json({ id: 1 }, { status: 201, headers: { 'x-total': '10' } });
Reply.text('xin chào');                                    // text/plain; charset=utf-8
Reply.text('a,b\n1,2', { contentType: 'text/csv; charset=utf-8' });
Reply.html('<h1>Xin chào</h1>');
Reply.empty();                                             // 204
Reply.empty(202);                                          // 202 Accepted
Reply.redirect('/api/v1/new');                             // 302
Reply.redirect('/api/v1/new', 301);                        // 301 | 302 | 303 | 307 | 308
Reply.stream(readable, { contentType: 'application/octet-stream' });
await Reply.file('report.pdf', { root: '/srv/files', download: true });
```

**Gửi file.** `Reply.file(name, { root })` không cho thoát khỏi thư mục `root` (`../` bị chặn với `403`). Bỏ `root` thì phải truyền đường dẫn tuyệt đối. `download: true` thêm `Content-Disposition: attachment`.

```js
app.get('/files/:name', { access: 'public' }, (req) =>
  Reply.file(req.params.name, { root: new URL('../public', import.meta.url).pathname }));
```

**Cookie.** Đặt nhiều cookie bằng mảng giá trị `set-cookie`:

```js
app.post('/login', { access: 'public', body: { user: 'string' } }, () =>
  Reply.json({ ok: true }, {
    headers: {
      'set-cookie': [
        serializeCookie('sid', 'abc123', { maxAgeSeconds: 3600, secure: true }),
        serializeCookie('theme', 'dark', { httpOnly: false }),
      ],
    },
  }));

app.post('/logout', { access: 'public' }, () =>
  Reply.empty(204, { 'set-cookie': clearCookie('sid') }));
```

Mặc định cookie có `Path=/`, `HttpOnly`, `SameSite=Lax`. `sameSite: 'none'` bắt buộc đi kèm `secure: true`.

## 7. Xử lý lỗi

Muốn trả lỗi thì `throw` một `AppError` ở bất kỳ đâu: trong handler, use case hay repository.

```js
import { AppError } from '@ank-ingress/kernel';

app.get('/notes/:id', { access: 'public' }, async (req) => {
  const note = await findNote(req.params.id);
  if (!note) {
    throw new AppError('NOTES-404-NOT_FOUND', { message: `Note ${req.params.id} not found` });
  }
  return Reply.json(note);
});
```

Mã lỗi có dạng `NHÓM-HTTP-LÝ_DO`. Số ở giữa chính là HTTP status trả về. Status hợp lệ: `400, 401, 403, 404, 405, 409, 413, 415, 422, 423, 429, 500, 503`.

Client nhận:

```json
{ "code": "NOTES-404-NOT_FOUND", "message": "Not found", "correlationId": "…" }
```

- `message` trong constructor chỉ được ghi vào log, **không** gửi cho client, để tránh lộ chi tiết nội bộ. Client nhận thông điệp chung theo status, hoặc thông điệp bạn đăng ký cho mã đó trong catalog:

  ```js
  import { buildCatalogs } from '@ank-ingress/contracts';

  const catalogs = buildCatalogs([
    { owner: 'notes', c: { errorCodes: { 'NOTES-404-NOT_FOUND': { message: 'Không tìm thấy ghi chú' } } } },
  ]);
  const app = createApp({ catalogs });
  ```

- Thêm `details` (ví dụ lỗi theo từng trường) và `params` để client hiển thị:

  ```js
  throw new AppError('USERS-409-EMAIL_TAKEN', {
    details: [{ field: 'email', code: 'TAKEN' }],
    params: { email: req.body.email },
  });
  ```

- Lỗi bất kỳ khác `AppError` (bug, lỗi thư viện) thành `500 COMMON-500-INTERNAL` và được ghi log. Chi tiết không lộ ra ngoài.
- Lỗi `429` và `503` tự có header `Retry-After` (đặt qua `params: { retryAfterSeconds: 30 }`).
- Mã dùng chung có sẵn: `COMMON-401-UNAUTHENTICATED`, `COMMON-403-FORBIDDEN`, `COMMON-404-NOT_FOUND`, `COMMON-500-INTERNAL`.

**Lỗi cấu hình (`CompositionError`)** là lỗi của lập trình viên: sai đường dẫn, quyền chưa khai báo, thiếu stage xác thực… Lỗi này ném ra ngay lúc đăng ký route hoặc lúc `listen()`, không bao giờ xảy ra giữa chừng khi đang phục vụ. Xem [mục 13](#13-lỗi-thường-gặp).

## 8. Tính năng dùng chung

CORS, header bảo mật, rate limit, timeout… là tùy chọn của `createApp` (áp cho cả app) hoặc của route (áp cho một route):

```js
import { createApp } from '@ank-ingress/app';
import { createMemoryRateLimitStore } from '@ank-ingress/http';

const app = createApp({
  cors: { origin: ['https://app.example.vn'], credentials: true },  // CORS
  securityHeaders: true,                                            // CSP, HSTS, X-Frame-Options…
  rateLimit: createMemoryRateLimitStore(),                          // bộ đếm cho rateLimit
  trustedProxies: ['10.0.0.1'],                                     // proxy được tin X-Forwarded-*
  limits: { defaultTimeoutMs: 10_000, defaultMaxBodyBytes: 2 * 1024 * 1024 },
});

app.post('/login', {
  access: 'public',
  body: { user: 'string', password: 'string' },
  rateLimit: { limit: 5, windowMs: 60_000 },  // 5 lần/phút mỗi IP, quá thì 429
  timeoutMs: 3_000,
}, handleLogin);

app.get('/config', {
  access: 'public',
  etag: true,  // trả 304 khi If-None-Match khớp
}, () => Reply.json({ version: 3 }));
```

- `cors.origin` nhận `'*'`, một origin, một mảng origin hoặc hàm `(origin) => boolean`. Preflight `OPTIONS` được trả lời tự động.
- `securityHeaders: true` thêm CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`… Ghi đè hoặc bỏ từng header: `securityHeaders: { 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': false }`. Header cùng tên trong `Reply` sẽ thắng.
- `rateLimit.key: 'identity'` đếm theo tài khoản thay vì IP (chỉ dùng cho route cần đăng nhập). `bucket: 'login'` cho nhiều route dùng chung một bộ đếm. Chạy nhiều instance thì thay `createMemoryRateLimitStore()` bằng store dùng chung (Redis).
- Logic dùng chung của riêng bạn (ví dụ kiểm tra chữ ký webhook): viết thành hàm thường và gọi ở đầu handler. Hàm đó `throw new AppError(...)` khi không hợp lệ.

```js
function verifySignature(req) {
  if (req.headers['x-signature'] !== process.env.WEBHOOK_SECRET) {
    throw new AppError('WEBHOOK-401-BAD_SIGNATURE');
  }
}

app.post('/webhook', { access: 'public', headers: ['x-signature'] }, (req) => {
  verifySignature(req);
  return Reply.empty(202);
});
```

## 9. Xác thực và phân quyền

### 9.1. Ba mức `access`

| `access` | Ý nghĩa | `req.identity` |
| --- | --- | --- |
| `'public'` | Ai cũng gọi được | `null` |
| `'authenticated'` | Phải đăng nhập (token hợp lệ) | Thông tin người dùng |
| `'notes:write'` (mã quyền) | Phải đăng nhập **và** có quyền trong catalog | Thông tin người dùng |

Route không phải `public` cần stage `auth` trên app. Mã quyền phải được khai báo trong `catalogs`, kèm các role được phép.

### 9.2. Xác thực bằng JWT (không dùng database)

```js
import { createApp } from '@ank-ingress/app';
import { Reply, buildCatalogs } from '@ank-ingress/contracts';
import {
  JwtVerifier, bearerAuth, createClaimsAuthorizer, createRevocationCache, parsePublicKeyMap,
} from '@ank-ingress/security';

const verifier = new JwtVerifier(parsePublicKeyMap(process.env.JWT_PUBLIC_KEYS ?? ''), {
  issuer: 'my-auth',
  audience: 'my-api',
  accessTtlSeconds: 3600,
});

// Nguồn thu hồi token. Ví dụ này không thu hồi gì; hệ thống thật tra bảng session/blacklist.
const revocation = createRevocationCache({
  source: {
    async load() {
      return { tokenRevoked: false, sessionRevoked: false, accountDisabled: false, tokensValidAfterSec: null };
    },
  },
  ttlMs: 60_000,
  max: 10_000,
});

const app = createApp({
  catalogs: buildCatalogs([
    { owner: 'notes', c: { permissions: { 'notes:write': { kind: 'write', roles: ['EDITOR', 'ADMIN'] } } } },
  ]),
  auth: bearerAuth({ verifier, revocation }), // đọc "Authorization: Bearer <token>"
  authorize: createClaimsAuthorizer(),        // so role trong claim "roles" của token với catalog
});

app.get('/me', { access: 'authenticated', tx: 'none' }, (req) =>
  Reply.json({ accountId: req.identity.accountId, tenantId: req.identity.tenantId }));

app.post('/notes', { access: 'notes:write', tx: 'none', body: { title: 'string' } }, (req) =>
  Reply.json({ by: req.identity.accountId, title: req.body.title }, { status: 201 }));
```

> **Quan trọng:** route không phải `public` mặc định mở transaction (`GET` → `read`, các method khác → `write`), nên cần stage `scope` (mục [10](#10-dùng-postgresql)). App **không có database** thì đặt `tx: 'none'` trên các route này. Nếu không, `listen()` báo `has tx: "read", but no scope stage is configured`.

Kết quả: thiếu token thì `401`, token không có role phù hợp thì `403`. Header `X-Tenant-Id` (nếu gửi) phải khớp claim `tid` của token. `JWT_PUBLIC_KEYS` có dạng `kid:base64,kid2:base64`. Ký token để thử nghiệm thì xem `JwtSigner` trong `examples/public-http/src/main.ts`.

### 9.3. Tự viết `auth` và `authorize`

`auth` là một hàm async nhận header và trả về `Identity`, hoặc ném `AppError` 401. `authorize` nhận `identity` cùng quyền mà route yêu cầu (`permission.roles` lấy từ catalog), rồi ném `AppError` 403 nếu không đủ quyền. Ví dụ xác thực bằng API key:

```js
import { AppError } from '@ank-ingress/kernel';

const app = createApp({
  catalogs,
  auth: async ({ headers, correlationId, ip, userAgent }) => {
    const key = headers.authorization?.replace(/^ApiKey /, '');
    const account = key ? await findAccountByApiKey(key) : null;
    if (!account) throw new AppError('COMMON-401-UNAUTHENTICATED');
    return {
      accountId: String(account.id),
      tenantId: account.tenantId, // số hoặc null
      sessionId: null,
      tokenId: `apikey:${account.id}`,
      correlationId,
      ip,
      userAgent,
    };
  },
  authorize: async ({ identity, permission }) => {
    const roles = await findRoles(identity.accountId);
    if (!permission.roles.some((role) => roles.includes(role))) {
      throw new AppError('COMMON-403-FORBIDDEN');
    }
    return identity;
  },
});
```

Stage `auth` luôn đọc được header `authorization`, `x-tenant-id`, `user-agent`, `x-forwarded-for`. Header khác thì khai báo qua `headers` trên route.

### 9.4. Quyền theo tham số đường dẫn

`scopeParam` đưa giá trị một tham số trong path cho bước phân quyền, ví dụ để kiểm tra người dùng có thuộc dự án đó không:

```js
app.get('/projects/:projectId/tasks', { access: 'tasks:read', scopeParam: 'projectId', tx: 'none' }, handler);
```

## 10. Dùng PostgreSQL

Khung không sở hữu schema hay câu SQL nào. Nó mượn một connection cho mỗi request, chạy `BEGIN`/`COMMIT`/`ROLLBACK` có deadline, rồi đưa `tx` vào handler. Bảng, migration và câu SQL là việc của ứng dụng.

```js
import { createApp } from '@ank-ingress/app';
import { Reply, buildCatalogs } from '@ank-ingress/contracts';
import { createPgDatabase, createRequestScope } from '@ank-ingress/postgres';
import { bearerAuth, createClaimsPolicy } from '@ank-ingress/security';

const db = createPgDatabase({
  name: 'main',
  applicationName: 'notes-api',
  logger, // ví dụ ctx.logger khi chạy dưới runApp
  config: { host: '127.0.0.1', port: 5432, database: 'notes', user: 'notes', password: process.env.POSTGRES_PASSWORD ?? '' },
});

const scope = createRequestScope({
  db,
  revocation, // cùng đối tượng truyền cho bearerAuth; thiếu thì route GET có DB bỏ qua kiểm tra thu hồi token
  policy: createClaimsPolicy(),
  initializer: {
    // Chạy ở đầu mỗi transaction: đặt timeout, tenant cho RLS…
    async open(tx, identity, statementTimeoutMs) {
      await tx.query("SELECT set_config('statement_timeout', $1, true)", [String(statementTimeoutMs)]);
      return identity;
    },
  },
});

const app = createApp({
  catalogs: buildCatalogs([{ owner: 'notes', c: { permissions: {
    'notes:read': { kind: 'read', roles: ['MEMBER'] },
    'notes:write': { kind: 'write', roles: ['MEMBER'] },
  } } }]),
  auth: bearerAuth({ verifier, revocation }),
  scope: scope.run,
});

// GET → transaction chỉ đọc
app.get('/notes', { access: 'notes:read' }, async (req, { tx }) => {
  const { rows } = await tx.query('SELECT id::text, title FROM notes WHERE tenant_id = $1', [req.identity.tenantId]);
  return Reply.json(rows);
});

// POST → transaction ghi; handler ném lỗi thì ROLLBACK, trả về bình thường thì COMMIT
app.post('/notes', { access: 'notes:write', body: { title: 'string' } }, async (req, { tx }) => {
  const { rows } = await tx.query(
    'INSERT INTO notes (tenant_id, title) VALUES ($1, $2) RETURNING id::text',
    [req.identity.tenantId, req.body.title],
  );
  return Reply.json({ id: rows[0].id }, { status: 201 });
});
```

- Tham số thứ hai của handler là `{ tx, access, signal, deadlineAt }`.
- Ghi đè chế độ bằng `tx: 'none' | 'read' | 'write'` trên route.
- Luôn dùng tham số `$1, $2…`, không ghép chuỗi SQL.
- Ví dụ chạy được: `examples/tx-postgres` và `examples/module-items`.

## 11. Viết test

`createTestClient(app)` mở cổng ngẫu nhiên trên `127.0.0.1` và gửi request HTTP thật, nên test đi qua đúng pipeline như production. Đường dẫn tính từ tiền tố, giống lúc khai báo route.

```js
// tests/notes.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestClient } from '@ank-ingress/app';
import { buildApp } from '../src/app.js';

test('tạo ghi chú', async () => {
  const client = await createTestClient(buildApp());
  try {
    const res = await client.post('/notes', { json: { title: 'Mua sữa' } });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { title: 'Mua sữa' });

    const bad = await client.post('/notes', { json: { title: 42 } });
    assert.equal(bad.status, 422);

    const search = await client.get('/search', { query: { q: 'sữa', page: 1 } });
    assert.equal(search.status, 200);
  } finally {
    await client.close();
  }
});
```

```bash
node --test tests/
```

`client` có `get/post/put/patch/delete/head/options(path, { json, body, headers, query })`, trả về `Response` của `fetch`. Redirect không được tự đi theo. Mẹo: tách việc tạo app vào hàm `buildApp()` trong `src/app.js`, còn `src/main.js` chỉ gọi `listen`. Như vậy test tạo được app mới cho từng ca.

## 12. Chạy production

### 12.1. Đơn giản: `app.listen`

```js
const server = await app.listen(Number(process.env.PORT ?? 3000)); // host mặc định 0.0.0.0
// hoặc app.listen(3000, '127.0.0.1', (server) => { … })
console.log('port', server.port);
// await server.close(); // ngừng nhận request mới, chờ request đang chạy xong
```

Bật tắt máy êm khi deploy (Docker/Kubernetes gửi `SIGTERM`):

```js
const app = createApp({ handleSignals: { timeoutMs: 25_000 } });
```

Khi nhận `SIGTERM`/`SIGINT`, app ngừng nhận request mới, chờ request đang chạy tối đa `timeoutMs`, rồi thoát với mã `0` (hoặc `1` nếu hết thời gian chờ). Nhận tín hiệu lần hai thì thoát ngay.

### 12.2. Đầy đủ: `runApp`

Khi có database, cấu hình từ biến môi trường, readiness và module, hãy để `runApp` quản lý vòng đời. Thay `listen` bằng `inbound`:

```js
import { createApp } from '@ank-ingress/app';
import { optional, integer } from '@ank-ingress/config';
import { Reply } from '@ank-ingress/contracts';
import { runApp } from '@ank-ingress/runtime';

runApp({
  name: 'notes-api',
  roles: ['http'],
  schema: { port: optional('PORT', integer(1, 65535), 3000) },  // đọc và kiểm tra env khi khởi động
  setupInfra(ctx) {
    // Tạo pool DB, Redis… ở đây; ctx.use(resource) để runApp tự đóng khi tắt
    return {};
  },
  boot(ctx, config) {
    const app = createApp({ logger: ctx.logger });
    app.get('/ping', { access: 'public' }, () => Reply.json({ ok: true }));
    return app.inbound({ kind: 'tcp', host: '0.0.0.0', port: config.port });
  },
});
```

- `runApp` tự xử lý tín hiệu tắt máy, drain request, đóng tài nguyên đã `ctx.use(...)` và ghi log có cấu trúc. Không cần `handleSignals`.
- Biến môi trường sai hoặc thiếu thì tiến trình dừng ngay với thông báo rõ ràng (mã thoát `78`).
- Hàm đọc cấu hình: `required(env, parser)`, `optional(env, parser, mặcĐịnh)`, `secret(env)`; parser: `text`, `integer(min, max)`, `oneOf([...])`, `list(parser)`.
- Đứng sau Nginx/load balancer thì khai báo `trustedProxies` để `req.ip` lấy đúng IP client.

### 12.3. Tổ chức theo module

Khi dự án lớn dần, gom route, quyền và mã lỗi của mỗi nghiệp vụ vào một module (`defineModule`) rồi đăng ký bằng `app.add(...modules.routes)`. Sinh khung module mẫu:

```bash
npm run scaffold -- module orders --dir examples/orders
```

Ví dụ hoàn chỉnh: `examples/module-items`.

## 13. Lỗi thường gặp

Tất cả lỗi dưới đây là `CompositionError`, ném ra lúc khởi động chứ không phải lúc đang phục vụ.

| Thông báo | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| `Invalid route path segment "Users"` | Đoạn tĩnh có chữ hoa, dấu cách… | Dùng chữ thường, `-`, `_`: `/user-profiles` |
| `Route path must not have trailing slash` | Path kết thúc bằng `/` | `/notes` thay vì `/notes/` (dùng `'/'` cho gốc của router) |
| `has no access and its router sets no default` | Thiếu `access` | Thêm `access: 'public'` hoặc đặt mặc định cho router |
| `references unknown permission "x:y"` | Mã quyền chưa có trong catalog | Khai báo trong `buildCatalogs([...])` và truyền `catalogs` cho `createApp` |
| `requires authentication, but no auth stage is configured` | Route không public nhưng app thiếu `auth` | Truyền `auth` cho `createApp` |
| `has tx: "read", but no scope stage is configured` | Route cần đăng nhập mặc định mở transaction | Thêm `tx: 'none'` hoặc cấu hình `scope` (PostgreSQL) |
| `... with tx: "none", but no authorize or scope stage is configured` | Route theo mã quyền không có gì để kiểm tra quyền | Thêm `authorize: createClaimsAuthorizer()` |
| `declares rateLimit, but no rateLimit store is configured` | Thiếu store | `createApp({ rateLimit: createMemoryRateLimitStore() })` |
| `declares bodyFormat: "text" without a body schema` | `bodyFormat` thiếu `body` | Thêm `body`, ví dụ `body: Type.String()` |
| `Cannot register ... after listen()` | Đăng ký route sau khi đã `listen()` | Khai báo hết route trước khi `listen()` |
| `App is already listening` | Gọi `listen()`/`inbound()` hai lần | Mỗi app chỉ lắng nghe một lần |
| `Route path must start with /api/v{n}/` | `app.add(...)` với path thiếu tiền tố, hoặc `prefix` sai | `defineRoute` dùng path đầy đủ `/api/v1/...` |

Các tình huống khác khi chạy:

- **`req.headers['x-...']` luôn `undefined`:** header chưa được khai báo qua `headers: ['x-...']`.
- **`req.cookies` rỗng:** thiếu `cookies: true`. **`req.hostname` là `null`:** thiếu `hostInfo: true`.
- **Nhận `415`:** `Content-Type` không khớp `bodyFormat` (ví dụ gửi form vào route JSON).
- **Nhận `413`:** body lớn hơn `maxBodyBytes` (mặc định 1 MiB).
- **Nhận `503`:** server đang quá tải (`limits.maxInFlight`, mặc định 1024) hoặc đang tắt.

## 14. Tra cứu tùy chọn

### `createApp(options)`

| Tùy chọn | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `prefix` | `'/api/v1'` | Tiền tố cho mọi route khai báo qua `get/post/...` |
| `catalogs` | rỗng | Quyền và mã lỗi (`buildCatalogs`) |
| `auth` | — | Hàm xác thực, trả về `Identity` |
| `authorize` | — | Kiểm tra quyền cho route `tx: 'none'` |
| `scope` | — | Mở transaction cho mỗi request (`createRequestScope(...).run`) |
| `onAudit` | — | Hook ghi audit cho route có `audit` |
| `cors` | tắt | `{ origin, credentials, allowHeaders, exposeHeaders, maxAgeSeconds }` |
| `securityHeaders` | tắt | `true` hoặc đối tượng ghi đè từng header |
| `rateLimit` | — | Store cho các route có `rateLimit` |
| `limits` | — | `{ maxInFlight: 1024, defaultTimeoutMs: 15000, defaultMaxBodyBytes: 1048576, authzTimeoutMs: 2000 }` |
| `trustedProxies` | `[]` | IP proxy được tin `X-Forwarded-*` |
| `logger` | logger mặc định | Truyền `ctx.logger` khi chạy dưới `runApp` |
| `metrics` | — | Registry metrics |
| `handleSignals` | `false` | `true` hoặc `{ timeoutMs }`: tắt máy êm khi dùng `app.listen` |
| `correlationHeader` | `true` | `false`: không đọc/trả header `X-Correlation-Id` |
| `traceparent` | `true` | `false`: không đọc header W3C `traceparent` |

### Tùy chọn của route

| Tùy chọn | Ý nghĩa |
| --- | --- |
| `access` | `'public'`, `'authenticated'` hoặc mã quyền |
| `params`, `query`, `body` | Schema viết tắt `{ ten: 'string' }` hoặc TypeBox |
| `bodyFormat` | `'json'`, `'urlencoded'`, `'text'`, `'multipart'` |
| `multipart` | `{ maxParts, maxFieldBytes, maxHeaderBytes }` |
| `headers` | Danh sách header handler cần đọc |
| `cookies` | `true` để có `req.cookies` |
| `hostInfo` | `true` để có `req.hostname`, `req.protocol`, `req.secure` |
| `etag` | `GET`: ETag yếu và `304` |
| `rateLimit` | `{ limit, windowMs, key?: 'ip' \| 'identity', bucket? }` |
| `tx` | `'none'`, `'read'`, `'write'` |
| `scopeParam` | Tên tham số path dùng khi phân quyền |
| `timeoutMs` | Thời gian tối đa của request |
| `maxBodyBytes` | Kích thước body tối đa |
| `idempotent` | `'required'` / `'optional'`: chống gửi trùng qua header `Idempotency-Key` (cần `tx: 'write'`) |
| `audit` | `{ action, resourceType, objectIdParam? }`, cần `onAudit` |

### Các gói thường import

| Gói | Dùng cho |
| --- | --- |
| `@ank-ingress/app` | `createApp`, `createRouter`, `createTestClient` |
| `@ank-ingress/contracts` | `Reply`, `buildCatalogs`, `defineRoute`, `serializeCookie`, `clearCookie` |
| `@ank-ingress/kernel` | `AppError`, `CompositionError` |
| `@ank-ingress/http` | `createMemoryRateLimitStore` |
| `@ank-ingress/security` | `bearerAuth`, `JwtVerifier`, `JwtSigner`, `createClaimsAuthorizer`, `createClaimsPolicy`, `PasswordHasher` |
| `@ank-ingress/postgres` | `createPgDatabase`, `createRequestScope` |
| `@ank-ingress/runtime` | `runApp`, `defineModule`, `contribution` |
| `@ank-ingress/config` | `required`, `optional`, `secret`, `text`, `integer`, `oneOf`, `list` |
| `@sinclair/typebox` | `Type` cho schema chi tiết |
