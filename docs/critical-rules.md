# RULE `@ank-ingress`

Tài liệu này dành cho lập trình viên viết tầng ứng dụng: route, module, repository, store, consumer, job. Vi phạm một quy tắc dưới đây có thể dẫn tới một trong ba hậu quả:

- **Sập hoặc treo cả tiến trình**: mọi request trên instance đó cùng chết hoặc đứng.
- **Hỏng hoặc cạn kết nối database**: mọi route có database trả `503`, hoặc dữ liệu bị ghi lẫn.
- **Lộ dữ liệu**: người dùng thấy dữ liệu của người dùng hoặc tenant khác, hoặc bí mật ra log.

Mỗi quy tắc gồm: việc phải làm, chuyện gì xảy ra nếu vi phạm, phần framework đã lo và phần ứng dụng phải tự lo, cùng vị trí trong mã nguồn (`đường-dẫn:dòng`) để đối chiếu. **[CRITICAL]** là lỗi gây hậu quả trên toàn hệ thống hoặc lộ dữ liệu; còn lại là **[HIGH]**. Cuối tài liệu có [danh sách kiểm tra](#danh-sách-kiểm-tra-trước-khi-merge) dùng khi review code, và [các giới hạn hiện tại của framework](#giới-hạn-hiện-tại-của-framework) cần biết.

Tài liệu liên quan: [usage.md](usage.md) (hướng dẫn), [api-reference.md](api-reference.md) (tham chiếu API).

## Bốn sự thật nền

Hầu hết quy tắc bên dưới đều xuất phát từ bốn điểm này.

1. **Dưới `runApp`, một lỗi không ai bắt sẽ tắt cả tiến trình.** Mọi `unhandledRejection` và `uncaughtException` đều bị coi là lỗi fatal. Tiến trình tắt với hạn 5 giây rồi thoát mã `1`. (`packages/runtime/src/adapters/node-process/node-host.ts:13-16`, `packages/runtime/src/core/lifecycle/start-process.ts:230-234`)
2. **Hết `timeoutMs`, framework không dừng được handler.** Nó chỉ gửi `503` và hủy `req.signal`. Handler vẫn chạy và vẫn giữ một suất trong `maxInFlight` (mặc định 1024) cùng connection database của nó, tới khi tự kết thúc. (`packages/http/src/adapters/uws/handler/route-env.ts:161-204`)
3. **Một tiến trình có một event loop.** Mã đồng bộ chạy lâu làm đứng mọi request, WebSocket, timer, kể cả timer deadline và tín hiệu tắt máy.
4. **Route không `public` mặc định giữ một connection database suốt thời gian handler chạy** (`GET` mở transaction đọc, method khác mở transaction ghi). Pool mặc định có 20 connection, hàng chờ 64; vượt nữa thì `503` ngay. (`packages/http/src/core/compile/compile-route.ts:53-55`, `packages/postgres/src/adapters/pg/pool.ts:83-85`)

---

## A. Không làm sập hoặc treo tiến trình

### A1. Không để promise nào bị reject mà không ai bắt [CRITICAL]

- **Làm:** `await` mọi lời gọi bất đồng bộ. Việc cố ý chạy nền thì phải có `.catch(...)` ghi log. Việc nền quan trọng thì đưa vào outbox hoặc job, không chạy "bắn rồi quên" trong handler.
- **Vi phạm thì:** framework chỉ bắt lỗi của promise mà handler trả về. Một `producer.send(...)`, `hub.publish(...)`, `redis.set(...)`, `holder.reload()` hay `tx.query(...)` không được `await` mà bị reject sẽ làm tắt cả tiến trình (sự thật nền 1). Redis được tạo với `disableOfflineQueue: true`, nên khi mất kết nối mọi lệnh reject ngay lập tức.
- **Không được:** gắn handler `uncaughtException` riêng để "giữ server sống", hoặc gọi `process.exit()`. Cả hai đều bỏ qua drain và việc đóng tài nguyên. Muốn tắt chủ động thì gọi `handle.shutdown(reason)`.
- **Framework lo:** lỗi trong handler, stage, hook WebSocket và vòng lặp outbox được bắt và chuyển thành phản hồi lỗi hoặc log. `createPubSubBus` bọc từng handler.
- **Ứng dụng lo:** mọi promise tự tạo. `PubSub` tự cài phải bọc từng `handler(payload)` trong `try/catch`.
- **Nguồn:** `packages/http/src/adapters/uws/handler/execute.ts:38-46`, `packages/cache/src/adapters/redis/redis-client.ts:5-16`, `packages/config/src/adapters/node-fs/secret-file.ts:16-23`, `packages/cache/src/adapters/redis/pubsub-bus.ts:12-21`.

```js
// SAI: reject ở đây làm tắt cả tiến trình
void producer.send(messages);
// ĐÚNG
producer.send(messages).catch((err) => logger.error('notify.failed', { code: err.code }));
```

### A2. `AccessPolicy.authorize` phải là hàm đồng bộ và từ chối bằng `throw` [CRITICAL]

- **Làm:** viết `authorize(access, permission, scope)` không có `async` và không trả Promise. Muốn từ chối thì `throw new AppError('COMMON-403-FORBIDDEN')`. Cần tra database thì làm trong `ContextInitializer.open` và đặt kết quả vào `Access`.
- **Vi phạm thì:** `createRequestScope` gọi `policy.authorize(...)` mà **không `await`**. Một policy `async` từ chối bằng Promise bị reject sẽ (1) **không chặn request**, tức là cho vượt quyền, và (2) sinh `unhandledRejection` làm tắt tiến trình. TypeScript không báo lỗi vì kiểu trả về khai báo là `void`.
- **Framework lo:** `createRbacPolicy` và `createClaimsPolicy` đều đồng bộ.
- **Nguồn:** `packages/contracts/src/types/ports/request-context.types.ts:14`, `packages/postgres/src/adapters/pg/create-request-scope.ts:44`, `:99`.

Lưu ý: stage `authorize` của `createApp` (dùng cho route `tx: 'none'`) **có** được `await`, nên được phép `async`. Quy tắc này chỉ áp cho `AccessPolicy` truyền vào `createRequestScope`.

### A3. Hàm `status()` của health server và collector metric không được ném lỗi [CRITICAL]

- **Làm:** hàm `status` truyền cho `startHealthServer` và mọi hàm đăng ký qua `metrics.onCollect(fn)` phải tự `try/catch` và luôn trả về bình thường. Collector phải truyền đủ nhãn đã khai báo.
- **Vi phạm thì:** các hàm này được gọi đồng bộ trong listener của `node:http` mà không có `try/catch`. Một lỗi thành `uncaughtException`, nên **mỗi lần probe `/readyz` hoặc scrape `/metrics`** có thể làm sập tiến trình. Thiếu nhãn làm `formatLabels` ném `TypeError`.
- **Framework lo:** `status()` nội bộ của `runApp` và collector của `registerProcessMetrics`.
- **Nguồn:** `packages/observability/src/adapters/node-http/health-server.ts:47`, `:61`, `:67`; `packages/observability/src/core/metrics/labels.ts:15-17`.

### A4. Không chạy việc nặng CPU trên event loop chính [CRITICAL]

- **Làm:** băm mật khẩu chỉ qua `PasswordHasher` (chạy trên `WorkerPool` đã nạp `bcryptWorkerTasks`). Nén, mã hóa, xử lý ảnh, sinh PDF, parse file lớn thì viết thành task của `WorkerPool`. Đặt `maxQueue` hữu hạn để quá tải trả `503` thay vì dồn hàng.
- **Vi phạm thì:** một lần bcrypt cost 10–15 chiếm luồng chính hàng chục tới hàng trăm mili giây. Vài chục lần đăng nhập đồng thời đủ làm server ngừng phản hồi. Deadline của request chạy bằng timer nên không cắt được mã đồng bộ. Kiểm tra readiness (hạn 2 000 ms) cũng không chạy được.
- **Cũng cần:**
  - Truyền `signal` cho `WorkerPool.run`: task còn trong hàng đợi không tự hết hạn.
  - Đặt `maxOldGenerationSizeMb` cho pool xử lý dữ liệu lớn, để một task phình bộ nhớ chỉ giết worker đó.
  - Chạy thử một task lúc khởi động. Nếu task module nạp lỗi, worker chết và được tạo lại liên tục mà health check vẫn báo khỏe.
- **Framework lo:** worker có timeout mỗi task (mặc định 30 000 ms, quá hạn thì `terminate` và tạo lại), hàng đợi có trần, worker chết được tạo lại với backoff.
- **Nguồn:** `packages/security/src/core/passwords/password-hasher.ts:14-17`, `:32-45`; `packages/workers/src/adapters/node-worker/worker-pool.ts:66`, `:138-143`, `:245-253`, `:356-360`; `packages/http/src/adapters/uws/handler/public-fast-path.ts:78-92`.

### A5. Mọi việc chờ phải có điểm kết thúc theo `signal` hoặc deadline [CRITICAL]

- **Làm:** truyền `req.signal` (hoặc `scope.signal`, `tx.signal`, `signal` của job, `ctx.signal` lúc khởi động) vào mọi I/O: `fetch`, SDK, truy vấn. Thư viện không nhận `signal` thì tự bọc timeout. Không `await` thứ có thể không bao giờ resolve.
- **Vi phạm thì:** handler treo giữ suất `maxInFlight` mãi mãi (sự thật nền 2). Đủ 1024 suất treo thì mọi request mới nhận `503`, và khi tắt máy, drain phải chờ hết hạn.
- **Áp dụng cho các stage và hook do ứng dụng viết:**
  - `auth`, `authorize`, `onAudit`, `RateLimitStore.consume` đều được `await` mà không đua với timeout nào. `consume` thậm chí không nhận `signal`, nên store tự cài phải có timeout lệnh riêng.
  - `Resource.check(signal)` treo thì tài nguyên đó bị bỏ qua mãi ở các lần kiểm tra sau; tài nguyên `required` sẽ kẹt `NOT_READY`.
  - `Inbound.drain(signal)` phải trả về ngay khi `signal` bị hủy, nếu không, tài nguyên phía sau không được đóng.
  - Job handler (`handle(job, signal)`) phải dừng khi `signal` bị hủy. Runner không giết được handler, và lease có thể hết hạn khiến job chạy trùng ở worker khác.
  - Handler consumer: vòng consume chỉ fetch tiếp khi **mọi** message của lần fetch trước xong. Một message treo làm đứng cả consumer, và quá `maxPollIntervalMs` (300 s) thì broker đẩy consumer khỏi group.
  - Hook WebSocket (`onOpen`/`onMessage`/`onDrain`/`onClose`) chạy tuần tự theo socket; quá `maxPendingMessages` (32) thì socket bị đóng `1008`.
  - Lúc khởi động, chờ DB hoặc broker bằng `ctx.waitFor(...)`, không viết vòng lặp tự chế.
- **Nguồn:** `packages/http/src/adapters/uws/handler/route-env.ts:98-111`, `:161-182`; `packages/http/src/adapters/uws/handler/execute.ts:79-89`, `:234-284`; `packages/runtime/src/core/lifecycle/start-process.ts:109-127`; `packages/runtime/src/core/lifecycle/shutdown.ts:34-37`, `:81-89`; `packages/workers/src/core/jobs/job-runner.ts:135-146`; `packages/messaging/src/adapters/kafka/consumer.ts:119-201`; `packages/realtime/src/adapters/uws/ws/mount-socket.ts:20-57`.

### A6. Giữ mọi bộ đệm trong bộ nhớ có giới hạn [HIGH]

- **Body:** body `json`/`text`/`urlencoded` được đệm toàn bộ trong RAM, nên bộ nhớ đỉnh xấp xỉ `maxInFlight × maxBodyBytes` (mặc định 1024 × 1 MiB). Không nâng `defaultMaxBodyBytes` toàn cục; route nào cần thì đặt `maxBodyBytes` riêng.
- **Upload:** dùng `bodyFormat: 'multipart'` và stream `part.stream` thẳng tới đích. Không gom file vào một `Buffer`.
- **Object storage:** mỗi upload lên MinIO tốn tới `partSize` RAM (mặc định 8 MiB). Hãy giới hạn số upload chạy song song.
- **Kafka:** giữ message nhỏ; nội dung lớn để ở object storage và chỉ gửi key. Mỗi message được `JSON.parse` đồng bộ, rồi bị nhân bản vào receipt store và DLQ.
- **Metric:** nhãn chỉ nhận một tập giá trị cố định và nhỏ. Không dùng `accountId`, id bản ghi, URL thô hay `err.message` làm nhãn. Mỗi tổ hợp nhãn tạo một series **không bao giờ bị xóa**.
- **WebSocket:** đọc kết quả của `client.sendWithStatus(...)`. Gặp `'backpressure'` thì ngừng gửi tới `onDrain`; tin có thể bỏ thì gửi `{ lossy: true }`. Không nâng mạnh `maxBackpressureBytes` (256 KiB).
- **SSE:** chỉ dùng `createSseChannel` (mỗi client có trần 256 KiB) và luôn truyền `signal: req.signal` khi `subscribe`.
- **Bản giả:** không dùng bản giả của `@ank-ingress/testing` ngoài test. Chúng giữ dữ liệu trong `Map` không giới hạn và không bao giờ xóa.
- **Nguồn:** `packages/http/src/adapters/uws/body-collector.ts:88-105`; `packages/storage/src/adapters/minio/object-store.ts:30`, `:114-120`; `packages/messaging/src/core/codec/decode.ts:50`; `packages/observability/src/core/metrics/registry.ts:21-45`; `packages/realtime/src/adapters/uws/ws/mount-socket.ts:109-152`; `packages/realtime/src/core/sse/sse-channel.ts:45-66`; `packages/testing/src/core/idempotency/in-memory-idempotency-store.ts:11`.

### A7. Dùng stream đúng cách [HIGH]

- **Reply.stream:** tạo stream ở bước cuối của handler, ngay trước `return`. Listener `'error'` chỉ được gắn khi framework bắt đầu gửi, nên stream lỗi trong lúc handler còn `await` việc khác là lỗi không có listener. Sau khi trả về, deadline không còn áp dụng, nên stream dài (tail log, SSE tự viết) phải tự có thời lượng tối đa.
- **Multipart:** đọc hết hoặc bỏ hẳn từng `part.stream` rồi mới sang phần sau. Dùng `pipeline(part.stream, đích, { signal: req.signal })`.
- **Storage:** truyền `{ signal: req.signal }` cho `putStream`/`getStream`. Stream `body` tải về phải được đọc hết, trả qua `objectReply`, hoặc `destroy()` ở mọi nhánh lỗi; nếu không, socket tới MinIO bị giữ mở.
- **Checksum:** gọi `digest()` của `sha256Transform` chỉ sau khi stream đã kết thúc. Nối stream bằng `pipeline` thay vì `pipe()`, vì `pipe()` không chuyển lỗi của nguồn và upload sẽ treo.
- **Nguồn:** `packages/http/src/adapters/uws/handler/execute.ts:314-328`; `packages/http/src/adapters/uws/multipart-reader.ts:75-88`; `packages/storage/src/adapters/minio/object-store.ts:169-197`; `packages/storage/src/core/checksum/sha256-transform.ts:12-28`.

### A8. Giao toàn bộ vòng đời cho `runApp` [HIGH]

- **Đăng ký tài nguyên:** đăng ký mọi tài nguyên dài hạn bằng `ctx.use(...)` (`db.resource`, `redis.resource`, `kafka.resource`, `store.resource`, `workerPoolResource(pool)`). Tài nguyên không đăng ký sẽ không được đóng khi tắt và không có mặt trong readiness.
- **Thứ tự đăng ký:** đăng ký pool database **trước** mọi thứ dùng nó, vì tài nguyên được đóng theo thứ tự ngược.
- **Inbound:** HTTP, job runner, consumer runner và outbox publisher phải nằm trong inbound mà `boot` trả về. Runtime chỉ `stop`/`drain`/`release` đúng inbound đó. Runner tự `start()` ở chỗ khác sẽ tiếp tục chạy khi pool đã đóng.
- **Thời gian tắt:** đặt `SHUTDOWN_DELAY_MS + SHUTDOWN_TIMEOUT_MS` (mặc định `0` + `25 000` ms) nhỏ hơn thời gian ân hạn của bộ điều phối (Kubernetes…). Không bọc tiến trình bằng script gửi tín hiệu hai lần: tín hiệu thứ hai làm thoát ngay.
- **Không chạm uWS:** không đụng tới `req._ctx`, `req.res` hay đối tượng phản hồi gốc của uWS; chỉ trả `Reply`.

```js
boot(ctx, config, modules, services) {
  const app = createApp({ logger: ctx.logger, catalogs: modules.catalogs, auth, scope: scope.run });
  app.add(...modules.routes);
  return compositeInbound([
    app.inbound({ kind: 'tcp', host: '0.0.0.0', port: config.port }),
    createJobRunner({ /* … */ }),
  ]);
}
```

- **Nguồn:** `packages/runtime/src/core/lifecycle/shutdown.ts:76-106`; `packages/runtime/src/core/lifecycle/start-process.ts:174-185`, `:220-226`; `packages/runtime/src/core/inbound/composite-inbound.ts:3`; `packages/http/src/adapters/uws/send/send-basic.ts:15-17`.

### A9. Consumer: phân loại lỗi đúng và luôn có nơi nhận message hỏng [CRITICAL]

- **Lỗi nghiệp vụ:** ném `AppError` mã `4xx` hoặc đặt `permanent: true`. Chỉ gắn `transient`/`retryable` cho lỗi thật sự tự hết. Lỗi `TRANSIENT` được thử lại **không giới hạn số lần**. Chú ý các SQLSTATE mặc định được coi là tạm thời: `57014` (hết `statement_timeout`), `55P03`, `53xxx`. Một câu SQL luôn vượt timeout biến message thành poison message, làm kẹt partition và kéo đứng cả consumer (A5).
- **Nơi nhận message hỏng:** cấu hình `receiptStore`, hoặc cả `dlqTopic` lẫn `producer` (và tạo topic DLQ trước). Thiếu cả hai thì message hỏng **bị bỏ im lặng**. Gửi DLQ lỗi thì partition kẹt.
- **Không tự viết vòng consume:** không dùng `consumer.run({ eachMessage })` thô cho nghiệp vụ. Handler thô ném lỗi sẽ được gọi lại mỗi 50 ms mãi mãi. Dùng `createConsumerRunner`.
- **Nguồn:** `packages/messaging/src/core/consumer/single-message.ts:158`, `:264-302`; `packages/messaging/src/core/consumer/execution-errors.ts:14-24`; `packages/messaging/src/core/consumer/retry-and-dlq.ts:46`; `packages/messaging/src/adapters/kafka/consumer.ts:164-198`.

### A10. Coi Redis là thứ có thể mất bất cứ lúc nào [HIGH]

- **Làm:** quyết định rõ `required` khi `createRedis`. Mọi lời gọi Redis đều phải `await` trong `try/catch` (A1).
- **Pub/Sub:** chấp nhận rằng Pub/Sub mất tin khi đứt kết nối, nên không dùng nó cho tin bắt buộc phải tới.
- **Rate limit:** route có `rateLimit` dùng store Redis sẽ lỗi khi Redis mất.
- **`RedisLock`:** không bảo đảm độc quyền. Lease không tự gia hạn, nên đặt `ttlMs` dài hơn hẳn thời gian việc cần làm và kiểm tra kết quả `release()` (`false` nghĩa là lease đã hết hạn). Bất biến nghiệp vụ phải được giữ bằng PostgreSQL (ràng buộc, khóa dòng).
- **Nguồn:** `packages/cache/src/adapters/redis/redis-client.ts:53-64`; `packages/cache/src/adapters/redis/redis-lock.ts:5-13`, `:51-54`.

---

## B. Không làm hỏng hoặc cạn kết nối database

### B1. Transaction chỉ chứa câu lệnh SQL [CRITICAL]

- **Làm:** trong handler có `tx`, không `await` HTTP ra ngoài, Kafka, S3, Redis, worker bcrypt hay bất kỳ I/O chậm nào. Thay vào đó:
  - Route chủ yếu gọi ra ngoài thì đặt `tx: 'none'`.
  - Muốn phát sự kiện thì chèn dòng outbox trong cùng `tx`; outbox publisher gửi Kafka sau khi commit.
  - Upload file trên route `tx: 'none'`, rồi ghi metadata bằng một transaction ngắn.
  - Đăng nhập: băm/so mật khẩu ngoài transaction.
- **Vi phạm thì:** connection bị giữ suốt thời gian chờ, ở trạng thái idle in transaction và giữ khóa dòng. 20 request chờ một API chậm là hết pool, và mọi route có database trả `503`. Với consumer theo lô, tới 128 message chạy trong **một** transaction.
- **Framework lo:** deadline tuyệt đối cho mỗi transaction; hết hạn thì hủy connection. Route multipart bắt buộc `tx: 'none'`.
- **Nguồn:** `packages/http/src/adapters/uws/handler/execute.ts:187-215`; `packages/postgres/src/adapters/pg/with-tx.ts:31-60`; `packages/postgres/src/adapters/pg/pool-gate.ts:144-155`; `packages/messaging/src/core/consumer/partition-batch.ts:29`.

### B2. `ContextInitializer.open` phải đặt `statement_timeout` làm câu lệnh đầu tiên [CRITICAL]

- **Làm:** câu lệnh đầu tiên mà `open` gửi lên `tx`, trước mọi `await` khác, là `set_config('statement_timeout', $1, true)` với `String(statementTimeoutMs)`. Có thể gộp việc đóng dấu tenant vào cùng câu `SELECT`.
- **Vi phạm thì:** `createRequestScope` mở transaction với `hasCustomInitTimeout: true`, nên **không tự đặt** `statement_timeout`. Hết deadline, framework chỉ cắt socket phía Node; câu lệnh trên server vẫn chạy, giữ khóa và CPU, trong khi pool mở connection mới. Kết quả là số backend thật trên server vượt `maxConnections`.
- **Phía server:** đặt thêm `idle_in_transaction_session_timeout` (và nếu cần `lock_timeout`) cho role của ứng dụng bằng migration. Framework chỉ đặt `statement_timeout`.

```js
const initializer = {
  async open(tx, identity, statementTimeoutMs) {
    await tx.query(
      "SELECT set_config('statement_timeout', $1, true), set_config('app.tenant_id', $2, true)",
      [String(statementTimeoutMs), identity.tenantId === null ? '' : String(identity.tenantId)],
    );
    // Xác minh tenant: xem C1
    return identity;
  },
};
```

- **Nguồn:** `packages/postgres/src/adapters/pg/create-request-scope.ts:21`, `:76`, `:96`; `packages/postgres/src/adapters/pg/with-tx.ts:14-18`, `:108-116`.

### B3. Chỉ dùng đúng `tx` được đưa vào [CRITICAL]

- **Không tự quản transaction:** trong handler hoặc initializer, không chạy `BEGIN`/`COMMIT`/`ROLLBACK`. Không gọi `withTx(db, …)` hay `db.gate.acquire()` lồng bên trong một request đang giữ `tx`.
- **Không vượt gate:** không dùng `db.pool.connect()` hay `db.pool.query()` trong đường request.
- **Port nhận `tx` phải chạy trên đúng `tx` đó:** `IdempotencyStore.claim/save`, `InboxStore.record/recordBatch`, các method `*InTx` của `ConsumerReceiptStore`, `RevocationSource.load` khi có `tx`, `ConsumerSpec.handle`.
- **Vi phạm thì:**
  - `COMMIT` tự gọi làm phần sau chạy ngoài transaction, mất tính nguyên tử.
  - Transaction lồng mượn connection thứ hai trong khi vẫn giữ connection thứ nhất. Khi tải cao, mọi slot bị giữ bởi request đang chờ slot thứ hai, nên tất cả cùng chờ tới deadline (tự khóa chết ở mức pool).
  - Connection mượn ngoài gate làm gate đếm sai, và hàng chờ `maxWaiting` không còn chặn được tải.
  - Dấu inbox commit riêng trong khi handler rollback làm sự kiện bị bỏ qua vĩnh viễn.
- **Nguồn:** `packages/postgres/src/adapters/pg/create-request-scope.ts:69-111`; `packages/postgres/src/adapters/pg/pool-gate.ts:38-49`, `:144-178`; `packages/messaging/src/core/consumer/single-message.ts:172-194`.

### B4. Không dùng `tx` sau khi handler đã trả về [CRITICAL]

- **Làm:** `await` mọi `tx.query(...)` trước khi trả về. Muốn chạy song song mà không chờ thì đăng ký qua `tx.queueBeforeCommit?.(promise)`. Không lưu `tx` vào biến sống lâu hơn request, không dùng trong `setTimeout`, không gọi `tx.client.release()` hay `tx.client.query()`.
- **Không trả `Reply.stream` đọc từ `tx`** (cursor, large object): stream được gửi **sau khi** transaction đã commit và connection đã trả về pool.
- **Vi phạm thì:** connection có thể đã được cho request khác mượn. `tx.query` chỉ kiểm tra hủy và hạn, không kiểm tra connection còn thuộc mình, nên câu lệnh trễ chạy **trong transaction của request khác**: ghi lẫn dữ liệu, đọc chéo tenant.
- **Framework lo:** `COMMIT` chờ mọi promise đăng ký qua `queueBeforeCommit`. Framework **không** phát hiện việc dùng `tx` sau khi trả connection.
- **Nguồn:** `packages/postgres/src/adapters/pg/with-tx.ts:65-87`, `:192-195`; `packages/http/src/adapters/uws/handler/execute.ts:314-328`.

### B5. Không để lại trạng thái phiên trên connection [CRITICAL]

- **Làm:** đặt biến phiên chỉ bằng `set_config(name, value, true)` hoặc `SET LOCAL`. Cần khóa tư vấn thì dùng `pg_advisory_xact_lock`. Cần `LISTEN` thì mở client riêng ngoài pool request. `afterReadCommit` chạy **sau** `COMMIT`, nên `set_config(…, true)` ở đó không có tác dụng.
- **Không được:** `SET` thường, `set_config(…, false)`, `pg_advisory_lock` mức phiên, `LISTEN` hay bảng `TEMP` tồn tại qua commit trên connection của request.
- **Vi phạm thì:** connection được trả về pool mà không reset. Request kế tiếp, có thể của tenant khác, thừa hưởng `app.tenant_id` cũ, nên RLS lọc theo **tenant của người khác**. Khóa mức phiên bị giữ mãi bởi một connection trong pool.
- **Nguồn:** `packages/postgres/src/adapters/pg/with-tx.ts:49-54`, `:192-195`; `packages/postgres/src/adapters/pg/pool-gate.ts:59-67`.

### B6. Handler phải chịu được việc chạy lại [HIGH]

- **Vì sao:** khi gặp lỗi có thể thử lại (`40001`, `40P01`, `55P03`, `53300`, `08006`, `08003`, hoặc `DbErrorRule.retryable`) trước `COMMIT`, `withTx` chạy lại **toàn bộ**: kiểm tra thu hồi, `initializer.open`, `policy.authorize` và handler, tối đa 3 lần.
- **Tác dụng ngoài database:** nếu buộc phải gây tác dụng không lặp lại được trong transaction, gọi `tx.markSideEffect?.()` **trước** tác dụng đó để chặn việc chạy lại.
- **`retryable`:** chỉ đánh dấu `retryable: true` cho lỗi thật sự tạm thời. Đánh dấu nhầm (ví dụ vi phạm unique) nhân ba tải database.
- **Callback sau commit:** việc đăng ký qua `tx.afterCommit?.(…)` hay `afterReadCommit` phải ngắn và tự bắt lỗi. Chúng chạy **trong khi vẫn giữ connection**. Callback lỗi làm client nhận `500` **dù dữ liệu đã commit**, nên client gửi lại và tạo bản ghi trùng.
- **Nguồn:** `packages/postgres/src/adapters/pg/with-tx.ts:36`, `:76-78`, `:143-160`, `:176-190`; `packages/postgres/src/core/errors/classify-db-error.ts:11-16`.

### B7. Tính cỡ pool cho mọi thứ dùng chung nó [CRITICAL]

- **Giới hạn server:** `maxConnections × số instance × số pool` phải nhỏ hơn `max_connections` của PostgreSQL, trừ phần dự phòng cho migration và quản trị. Vượt thì server từ chối (`53300`), và framework còn thử lại tới 3 lần, dồn thêm tải.
- **Trong một tiến trình:** pool phải đủ cho HTTP, consumer (`partitionConcurrency`, mặc định 16 transaction song song mỗi runner), outbox store, receipt store, job runner (`concurrency`, mặc định 4, cộng các lời gọi `heartbeat`/`claim`/`complete`) cùng lúc.
- **Khi pool nhỏ:** truyền `isOverloaded` cho consumer runner để nó tự `pause` khi pool căng. Hoặc tách consumer và job ra tiến trình riêng (role `consumers`, `jobs`).
- **Theo dõi:** các metric `ank_db_pool_total`, `ank_db_pool_idle`, `ank_db_pool_waiting`. Readiness cũng mượn connection, nên pool bão hòa làm readiness chậm theo.
- **Nguồn:** `packages/postgres/src/adapters/pg/pool.ts:83-85`, `:96-140`; `packages/messaging/src/core/consumer/consumer-runner.ts:13`; `packages/workers/src/core/jobs/job-runner-defaults.ts:1`.

### B8. Store tự cài phải đúng hợp đồng, và được kiểm bằng contract suite [HIGH]

- **`OutboxStore`:** mỗi method (`lease`, `fetch`, `markPublished`, `markFailed`, `renew`, `release`) là một transaction ngắn, độc lập. Không giữ transaction từ `lease` tới `markPublished`, vì giữa hai bước là một lần gửi Kafka (tới 10 s). Cài fencing: `markPublished`/`markFailed` trả `false` khi lease hết hạn.
- **`InboxStore`:** `record` chạy trên `tx` được truyền vào và dựa vào unique `(consumer, event_id)`. Các `record*` của `ConsumerReceiptStore` là upsert idempotent, vì chúng được thử lại khi lỗi.
- **`JobStore`:**
  - Cài fencing theo `leaseGeneration`, và tăng `attempts` khi `claim` (runner không tự tăng).
  - Cài `heartbeat`/`release`, hoặc đặt `leaseMs` của runner lớn hơn thời gian job dài nhất. Mặc định lease 30 s trong khi timeout job là 300 s; `JobSpec.leaseMs` hiện bị bỏ qua.
  - Trong handler, mở transaction ngắn, không giữ suốt job.
- **Housekeeping:** `purgeExpiredEvents` và `reapExpiredLeases` xóa theo lô `batchSize`/`limit`, mỗi lô một transaction ngắn.
- **Kiểm tra:** chạy `runOutboxInboxContractSuite` và `runIdempotencyStoreContractSuite` của `@ank-ingress/testing` trên bản cài đặt thật.
- **Nguồn:** `packages/messaging/src/core/outbox/shard-loop.ts:65-88`; `packages/messaging/src/core/consumer/single-message.ts:187-194`; `packages/workers/src/core/jobs/job-runner.ts:113-121`, `:234-253`; `packages/workers/src/core/jobs/housekeeping-loop.ts:63-79`.

### B9. Stage `scope` tự viết phải trả connection trong mọi trường hợp [CRITICAL]

- **Làm:** nên dùng `createRequestScope`. Nếu tự viết stage `scope`, nó phải:
  - Trả connection trong `finally`.
  - Rollback khi `input.signal` bị hủy.
  - Gọi `handler` nhiều nhất một lần.
  - Dùng `deadlineAt` để đặt `statement_timeout`.
- **Vi phạm thì:** quên trả connection khi handler ném lỗi sẽ rò connection tới khi cạn pool. Không nghe `signal` có thể **commit sau khi client đã nhận `503`**.
- **Route `tx: 'none'` có mã quyền:** cấu hình `authorize` (ví dụ `createClaimsAuthorizer()`). Thiếu `authorize`, framework mượn `scope` để phân quyền, tức là mỗi request mượn một connection chỉ để kiểm tra quyền.
- **Nguồn:** `packages/http/src/types/stages.types.ts:24-42`; `packages/http/src/adapters/uws/handler/execute.ts:175-199`, `:261-276`.

### B10. Không ghép dữ liệu từ request vào chuỗi SQL [CRITICAL]

- **Làm:** giá trị luôn đi qua tham số `$1, $2…`. Tên bảng, tên cột, chiều sắp xếp chỉ lấy từ danh sách cho phép cố định trong mã, không bao giờ lấy từ request.
- **Vi phạm thì:** SQL injection với toàn quyền của role database, kể cả đọc chéo tenant.
- **Framework lo:** không gì cả. `tx.query` chuyển nguyên chuỗi SQL cho driver.
- **Nguồn:** `packages/postgres/src/adapters/pg/with-tx.ts:70-75`.

```js
const SORT = { newest: 'created_at DESC', name: 'name ASC' };
const orderBy = SORT[req.query.sort] ?? SORT.newest;            // whitelist
await tx.query(`SELECT id, name FROM items WHERE tenant_id = $1 ORDER BY ${orderBy}`, [tenantId]);
```

---

## C. Không làm lộ dữ liệu

### C1. Xác minh tenant, và lọc theo tenant ở mọi nơi [CRITICAL]

- **Nguồn gốc vấn đề:** khi token **không** mang `tid`, `bearerAuth` lấy `identity.tenantId` từ header `X-Tenant-Id` do client gửi. Framework chỉ chặn trường hợp này với route `authenticated` có `tx: 'none'`. Route có transaction và route `tx: 'none'` có mã quyền **không được kiểm tra**: `createClaimsPolicy` và `createClaimsAuthorizer` chỉ xét role.
- **Xác minh ở đâu:** kiểm tra người dùng thuộc tenant đó ở `ContextInitializer.open` (route có transaction), ở `authorize` (route `tx: 'none'`), và ở `authorizeTenant` của `mountSocket`. Đóng dấu tenant cho RLS chỉ **sau khi** đã xác minh.
- **Lọc mọi truy vấn:** mọi truy vấn lọc theo tenant đã xác minh (`WHERE tenant_id = $1`) hoặc dùng RLS. Chính sách RLS phải coi chuỗi rỗng (tenant `null`) là **không có quyền**, không phải "không lọc".
- **Consumer và job:** `openTx` không có initializer nào. Hãy tự đặt tenant từ `event.tenantId` (hoặc `currentScope()?.tenantId`) và lọc theo nó.
- **Vi phạm thì:** người dùng hợp lệ của tenant A gửi `X-Tenant-Id: <B>` và đọc, ghi dữ liệu của tenant B.
- **Nguồn:** `packages/security/src/core/http/bearer-auth.ts:46-56`; `packages/http/src/adapters/uws/handler/execute.ts:216-260`; `packages/security/src/core/rbac/claims-policy.ts:13-27`; `packages/messaging/src/core/consumer/single-message.ts:161-170`.

```js
async open(tx, identity, statementTimeoutMs) {
  await tx.query("SELECT set_config('statement_timeout', $1, true)", [String(statementTimeoutMs)]);
  if (identity.tenantId !== null && identity.claims?.tid == null) {
    const { rowCount } = await tx.query(
      'SELECT 1 FROM tenant_members WHERE tenant_id = $1 AND account_id = $2', // bảng của ứng dụng
      [identity.tenantId, identity.accountId],
    );
    if (rowCount === 0) throw new AppError('COMMON-403-FORBIDDEN');
  }
  await tx.query("SELECT set_config('app.tenant_id', $1, true)", [identity.tenantId === null ? '' : String(identity.tenantId)]);
  return identity;
}
```

### C2. Truyền `revocation` cho `createRequestScope` [CRITICAL]

- **Làm:** khi dùng `bearerAuth({ verifier, revocation })` cùng `scope`, truyền **cùng** đối tượng `revocation` vào `createRequestScope({ revocation, … })`.
- **Vi phạm thì:** với route có transaction mà không có body (mọi `GET` có database), framework hoãn kiểm tra thu hồi vào trong transaction. `createRequestScope` chỉ kiểm tra khi có `revocation`, nên thiếu nó thì việc kiểm tra **bị bỏ qua hoàn toàn**. Token đã thu hồi, phiên đã đăng xuất, tài khoản đã khóa vẫn đọc được dữ liệu cho tới khi token hết hạn. Framework không cảnh báo.
- **Đồng bộ giữa các instance:** ghi trạng thái thu hồi vào database, rồi phát lên kênh `ank:auth:revoke` qua `PubSubBus` và truyền `bus` cho `createRevocationCache` ở mọi instance. Không có `bus`, instance khác vẫn tin trạng thái cũ tới hết `ttlMs` (mặc định 5 000 ms).
- **Nguồn:** `packages/http/src/adapters/uws/handler/execute.ts:87`; `packages/postgres/src/adapters/pg/create-request-scope.ts:38-40`, `:93-95`; `packages/security/src/core/revocation/revocation-cache.ts:20-81`.

### C3. Mọi giá trị do client gửi đều chưa tin cậy [CRITICAL]

- **`scopeParam`:** giá trị được lấy theo thứ tự `params` → `body` → `query`. Policy phải kiểm tra người dùng có quyền trên giá trị đó, và handler phải đọc **đúng nguồn** đã được phân quyền. Nếu phân quyền theo `projectId` trong path mà handler đọc `projectId` trong body, client được duyệt với dự án A nhưng ghi vào dự án B.
- **Object key:** không nhận key thô từ client. Ghép key ở server dạng `tenants/<tenantId>/<loại>/<uuid>`, và kiểm tra quyền qua bản ghi metadata trong database trước mọi `getStream`, `objectReply`, `presignGet`, `presignPut`, `remove`. Tầng storage không có khái niệm tenant hay quyền.
- **`filename` của multipart:** không dùng làm đường dẫn hay key (có thể chứa `../`); chỉ giữ làm metadata đã làm sạch.
- **`Reply.file` với `root`:** chặn được `../` nhưng không chặn symlink. Thư mục `root` không được chứa symlink trỏ ra ngoài và người dùng không được ghi vào đó.
- **`correlationId`:** client tự đặt được, nên không dùng làm khóa chống trùng hay khóa tra cứu.
- **Nguồn:** `packages/http/src/adapters/uws/handler/execute.ts:137-143`; `packages/storage/src/adapters/minio/object-store.ts:64-72`; `packages/http/src/core/multipart/part-headers.ts:67-76`; `packages/contracts/src/adapters/node-fs/file-reply.ts:32-47`; `packages/http/src/adapters/uws/correlation-id.ts:39-48`.

### C4. Chỉ trả về đúng những gì client được xem [HIGH]

- **Khai báo `response`** cho route trả dữ liệu từ database. Có schema thì serializer chỉ ghi các trường đã khai báo. Không có schema thì `Reply.json(rows)` gửi mọi cột, kể cả `password_hash`.
- **`AppError`:** `params` và `details` được gửi **nguyên văn** cho client, nên không đặt bí mật, dữ liệu cá nhân hay chi tiết nội bộ vào đó. `message` không gửi cho client nhưng được ghi log ở lỗi ≥ 500.
- **Nguồn:** `packages/http/src/core/compile/schema-validators.ts:138-141`; `packages/http/src/core/errors/error-boundary.ts:11-60`.

### C5. Bí mật không được vào log, database phụ hay message lỗi [CRITICAL]

- **Cấu hình:** khai báo mọi mật khẩu, khóa, token, chuỗi kết nối bằng `secret(env)`, `secretFile(env)` hoặc `optionalSecretFile(env)`, không dùng `required`/`optional`. Lúc khởi động, `runApp` log `boot.config` với **mọi** trường; chỉ trường `secret` thành `[REDACTED]`. Truyền `SecretHolder` (không phải chuỗi) cho `createPgDatabase({ config: { password } })` để xoay mật khẩu. Parser tự viết không được đưa giá trị thô vào thông điệp lỗi, vì thông điệp đó vào log `boot.config_invalid`.
- **Logger chỉ che theo tên khóa** (`password`, `token`, `authorization`, `cookie`, `api_key`…), và chỉ khi khớp nguyên tên:
  - Không che khóa ngắn hơn 4 ký tự (`pin`, `otp`).
  - Không che tên ghép (`dbPassword`, `x-api-key`).
  - Không che giá trị nằm trong chuỗi, trong `Error`, hoặc sâu hơn 6 cấp.
  - Hãy thêm khóa riêng vào `redactPaths`, và không nội suy bí mật vào chuỗi log hay `message` của lỗi.
- **Audit:** `onAudit` nhận nguyên body đã kiểm tra. Hãy chọn trường trước khi lưu, và không log `headers` của stage `auth`.
- **Job:** kết quả handler được lưu nguyên vào `JobStore.complete`. Lỗi không phải `AppError` thì `err.message` thành **`code`** và `errorDetail` được lưu vào database. Hãy ném `AppError` với mã cố định, và chỉ để định danh trong payload và kết quả.
- **Kafka:** DLQ sao chép nguyên key, value, header gốc và thêm `x-error` chứa `error.message`. Receipt store lưu `rawValue`/`rawHeaders`. Hãy giới hạn quyền đọc topic DLQ và bảng receipt, và đặt thời hạn lưu.
- **Nguồn:** `packages/runtime/src/core/lifecycle/start-process.ts:249`; `packages/config/src/adapters/node-fs/load-config.ts:34-45`; `packages/observability/src/core/logging/redaction.ts:1-47`; `packages/http/src/adapters/uws/handler/execute.ts:203-211`; `packages/workers/src/core/jobs/job-runner.ts:238-253`; `packages/messaging/src/core/consumer/retry-and-dlq.ts:46-62`.

### C6. Store idempotency khóa theo đủ danh tính [CRITICAL]

- **Làm:** khóa unique gồm `(tenantId, accountId, operation, key)`. `replay` chỉ trả cho đúng bộ đó; `requestHash` khác thì trả `mismatch`. Đặt TTL, purge, và giới hạn quyền đọc bảng như dữ liệu phiên.
- **Vi phạm thì:** `Idempotency-Key` do client chọn. Store chỉ khóa theo `key` thì tài khoản B phát lại được **phản hồi đã lưu của tài khoản A**. Phản hồi được lưu là `reply.data` **chưa qua** lọc của schema `response`, kèm header của reply (có thể có `set-cookie` chứa phiên đăng nhập).
- **Nguồn:** `packages/http/src/adapters/uws/handler/execute.ts:159-173`; `packages/postgres/src/adapters/pg/idempotent-run.ts:133-158`.

### C7. Cấu hình biên mạng và header đúng [HIGH]

- **`trustedProxies`:** chỉ liệt kê đúng IP proxy của bạn. Peer được tin thì `X-Forwarded-*` được tin, nên khai sai cho phép giả `req.ip` (lách rate limit) và `req.secure`/`req.hostname`. Mục sai định dạng bị bỏ qua im lặng. Kiểm tra `req.ip` sau khi triển khai.
- **CORS:** dùng danh sách origin cụ thể. Không dùng hàm `origin` luôn trả `true` cùng `credentials: true`. CORS không phải là phân quyền.
- **Header bảo mật:** bật `securityHeaders: true` ở production.
- **Cookie:** cookie phiên phải có `secure: true`. `serializeCookie` mặc định **không** bật `Secure`.
- **Health server:** giữ `HEALTH_BIND_ADDRESS` ở `127.0.0.1` hoặc mạng nội bộ. `/readyz` và `/metrics` không có xác thực.
- **Kafka:** `KafkaConfig` không có tùy chọn TLS hay SASL, nên broker phải nằm trong mạng riêng có ACL. Endpoint object storage đi qua mạng không tin cậy phải là `https://`.
- **Rate limit:** chạy nhiều instance thì dùng `createRedisRateLimitStore` cho rate limit đăng nhập. Store bộ nhớ đếm riêng từng instance, và có thể bị đẩy khóa khi đầy 10 000 khóa.
- **Nguồn:** `packages/http/src/adapters/uws/client-ip.ts:36-74`; `packages/http/src/core/cors/cors-policy.ts:29-53`; `packages/contracts/src/core/http/cookie.ts:31-42`; `packages/runtime/src/core/lifecycle/runtime-config.ts:23`; `packages/messaging/src/types/kafka.types.ts:136-157`; `packages/http/src/core/rate-limit/memory-rate-limit-store.ts:9-37`.

### C8. Realtime phải phân vùng theo tenant [HIGH]

- **WebSocket:** phát bằng `hub.publish(tenantId, topic, msg)` hoặc `tenantTopic(...)`, với `tenantId` lấy từ bản ghi đã xác minh, không lấy từ đầu vào client. Không phát dữ liệu riêng với `tenantId: null`, vì `t:global:` là không gian chung.
- **SSE:** `SseChannel` **không** tự phân vùng. Mọi sự kiện và lịch sử phát lại (`Last-Event-ID`) đi tới **mọi** subscriber của kênh. Hãy tạo kênh riêng theo tenant hoặc nhóm người nhận, và kiểm tra quyền trước `subscribe`.
- **Log context:** dùng `runInScope`. Nếu buộc dùng `enterSyncScope`, luôn gọi `exitSyncScope(prev)` trong `finally`, nếu không, log của request khác mang `tenantId` sai.
- **Nguồn:** `packages/realtime/src/core/hub/tenant-topic.ts:1-3`; `packages/realtime/src/core/sse/sse-channel.ts:42-65`; `packages/observability/src/core/logging/scope.ts:14-47`.

### C9. File người dùng và URL ký sẵn [HIGH]

- **`ttlSec`:** luôn truyền `ttlSec` dương và ngắn (vài chục giây tới vài phút). `ttlSec = 0` được SDK hiểu là **7 ngày**.
- **`presignPut`:** hiện bỏ qua `contentType`, nên URL không giới hạn kiểu hay kích thước. Sau khi client báo đã upload, đọc `stat` để kiểm tra trước khi chấp nhận.
- **Lưu và log URL:** không ghi URL ký sẵn vào log hay database; ai có URL là đọc hoặc ghi được.
- **Phục vụ file:** khi trả file người dùng tải lên qua `objectReply`, thêm `content-disposition: attachment` và `x-content-type-options: nosniff`. `Content-Type` lấy từ metadata do người upload quyết định, nên một file HTML/SVG trả inline thành XSS trên domain của API.
- **Nguồn:** `packages/storage/src/adapters/minio/object-store.ts:11-24`, `:67-72`; `packages/storage/src/core/http/object-reply.ts:11-18`.

### C10. Endpoint vận hành phải tự kiểm soát phạm vi [HIGH]

- **`inspect`:** không truyền thẳng query của client vào `ConsumerOperations.inspect(filter)`. `filter` được trộn **sau** `consumerGroup`, nên client ghi đè được group. Thiếu `tenantId` thì trả biên nhận (gồm payload thô) của mọi tenant.
- **`retry` và `skipWithReason`:** đọc receipt và kiểm tra `consumerGroup`, `tenantId` trước khi gọi. Đặt `actor` từ danh tính đã xác thực.
- **`replayDlq`:**
  - Chạy với `dryRun: true` trước.
  - Đặt `targetTopic` đúng bằng `x-original-topic`; hàm không tự đối chiếu.
  - Dùng một topic DLQ riêng cho mỗi luồng. Mỗi lần gọi đọc lại DLQ từ đầu, nên message đã phát lại sẽ bị phát lại lần nữa (consumer đích chống trùng nhờ inbox).
- **Nguồn:** `packages/messaging/src/core/consumer/consumer-operations.ts:25-46`; `packages/messaging/src/core/dlq/replay-dlq.ts:24-70`.

### C11. Xác thực và mật khẩu [HIGH]

- **Khóa ký:** khóa riêng chỉ nằm ở dịch vụ phát token, đọc từ kho bí mật và không commit vào repo. Dịch vụ kiểm tra chỉ nhận khóa công khai (`parsePublicKeyMap`).
- **Xoay khóa:** thêm `kid` mới vào tập khóa công khai trước, ký bằng khóa mới sau, gỡ khóa cũ bằng `updateKeys` khi token cũ hết hạn.
- **Phạm vi token:** mỗi API dùng `issuer`/`audience` riêng.
- **Đăng nhập:** khi không tìm thấy tài khoản, vẫn gọi `hasher.verify(password, null)` thay vì trả lỗi ngay, nếu không, thời gian phản hồi để lộ tài khoản nào tồn tại. Không tự cắt hay băm trước mật khẩu; `PasswordHasher` từ chối mật khẩu quá 72 byte.
- **Nguồn:** `packages/security/src/core/jwt/keys.ts:5-36`; `packages/security/src/core/jwt/jwt-verifier.ts:28-100`; `packages/security/src/core/passwords/password-hasher.ts:6-57`.

---

## Danh sách kiểm tra trước khi merge

**Tiến trình**
- [ ] Không có promise nào chạy mà không `await` hoặc `.catch` (A1).
- [ ] `AccessPolicy.authorize` tự viết là hàm đồng bộ (A2).
- [ ] Collector metric và `status()` tự viết có `try/catch`; nhãn metric có tập giá trị nhỏ (A3, A6).
- [ ] Không có bcrypt, nén, mã hóa hay parse lớn trên luồng chính (A4).
- [ ] Mọi I/O nhận `signal`; stage, store và hook tự viết có timeout (A5).
- [ ] Không nâng `defaultMaxBodyBytes`; upload dùng multipart dạng stream (A6, A7).
- [ ] Tài nguyên được `ctx.use`, pool đăng ký trước; runner và consumer nằm trong inbound (A8).
- [ ] Consumer có `receiptStore` hoặc DLQ; lỗi nghiệp vụ không bị đánh dấu tạm thời (A9).

**Database**
- [ ] Không có HTTP, Kafka, S3, Redis hay bcrypt bên trong route có `tx` (B1).
- [ ] `ContextInitializer.open` đặt `statement_timeout` đầu tiên (B2).
- [ ] Không có `BEGIN`/`COMMIT` tự gọi, không có `withTx` lồng, không dùng `db.pool` trong request; port chạy trên `tx` được truyền vào (B3).
- [ ] Mọi `tx.query` được `await`; không stream từ `tx` (B4).
- [ ] Chỉ dùng `set_config(…, true)`, `SET LOCAL`, `pg_advisory_xact_lock` (B5).
- [ ] Handler chạy lại an toàn, hoặc gọi `markSideEffect` (B6).
- [ ] Cỡ pool đã tính cho mọi thành phần dùng chung (B7).
- [ ] Store tự cài đã qua contract suite (B8).
- [ ] SQL chỉ dùng tham số; định danh lấy từ whitelist (B10).

**Dữ liệu**
- [ ] Tenant từ `X-Tenant-Id` được xác minh; mọi truy vấn lọc theo tenant; consumer tự đặt tenant (C1).
- [ ] `revocation` được truyền cho cả `bearerAuth` và `createRequestScope` (C2).
- [ ] `scopeParam`, object key, `filename` không được tin trực tiếp (C3).
- [ ] Route trả dữ liệu từ database có `response`; `params`/`details` của `AppError` không chứa dữ liệu nhạy cảm (C4).
- [ ] Mọi bí mật khai báo bằng `secret`/`secretFile`; không có bí mật trong message lỗi, log, payload job hay audit (C5).
- [ ] Store idempotency khóa theo 4 trường (C6).
- [ ] `trustedProxies`, CORS, `securityHeaders`, cookie `secure`, health server nội bộ (C7).
- [ ] Realtime và SSE phân vùng theo tenant (C8); URL ký sẵn ngắn hạn, file người dùng trả dạng tải xuống (C9).

## Giới hạn hiện tại của framework

Đây là các hành vi hiện có trong mã nguồn mà các quy tắc trên phải bù lại. Mỗi điểm nên được xem xét sửa ngay trong framework:

| Điểm | Ảnh hưởng | Quy tắc bù |
| --- | --- | --- |
| `createRequestScope` bỏ qua kiểm tra thu hồi khi không có `revocation`, và không cảnh báo | Token đã thu hồi vẫn đọc được dữ liệu qua `GET` | C2 |
| Tenant từ `X-Tenant-Id` (token không có `tid`) không được kiểm tra trên route có transaction và route `tx: 'none'` có mã quyền | Đọc, ghi chéo tenant | C1 |
| `AccessPolicy.authorize` không được `await` | Policy `async` cho vượt quyền và làm tắt tiến trình | A2 |
| Health server gọi `status()` và collector không có `try/catch` | Một probe có thể làm sập tiến trình | A3 |
| `createRequestScope` không tự đặt `statement_timeout` | Truy vấn chạy tiếp trên server sau deadline | B2 |
| `tx.query` không phát hiện việc dùng sau khi connection đã trả về pool | Câu lệnh trễ chạy trong transaction của request khác | B4 |
| Job runner bỏ qua `JobSpec.leaseMs`; `@ank-ingress/testing` chưa có bản giả hay contract suite cho `JobStore` | Job dài bị chạy trùng; store job không có cách kiểm tra chuẩn | B8 |
| `workerPoolResource` vẫn báo khỏe khi worker chết liên tục lúc nạp module | Readiness sai, task dồn tới khi đầy hàng đợi | A4 |
| `presignPut` bỏ qua `contentType` | URL upload không giới hạn kiểu | C9 |
| `ConsumerOperations.inspect` cho `filter` ghi đè `consumerGroup` | Xem receipt của group khác | C10 |
| `replayDlq` đọc lại DLQ từ đầu mỗi lần gọi | Phát lại trùng | C10 |
| `KafkaConfig` không có TLS hay SASL | Kafka phải nằm trong mạng riêng | C7 |
| `serializeCookie` mặc định không bật `Secure` | Cookie phiên có thể đi qua HTTP | C7 |
