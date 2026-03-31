# ETF Shortline Platform

A 股 ETF 超短线分析系统 MVP。

## 已完成功能

- 后端骨架（FastAPI + PostgreSQL + Parquet）
- AKShare 数据源适配（历史 K 线 + 实时行情）
- ETF 数据 API
- 策略配置模块（策略 CRUD + 前端规则构建器）
- 回测模块（自研 bar-by-bar 引擎，含止损/止盈/最大持仓 bars，100 股手数合规）
- 技术指标：MA、EMA、RSI、MACD、布林带、KDJ、突破位
- 基准收益对比（买入持有 Alpha、Calmar 比率）
- 参数优化（MA 网格搜索 + 热力图可视化）
- 买卖点分析页（ECharts K 线图 + 买卖点标记 + 交易明细联动）
- 异步回测（APScheduler 后台线程 + 轮询状态）
- **实时信号提醒**（开盘期间每 5 分钟扫描策略信号，SSE 推送到前端铃铛通知）
- Alembic 数据库迁移系统

## 本地启动

### 方式一：Docker Compose

```bash
docker compose up --build
```

- 前端：http://localhost:5173
- 后端：http://localhost:8000
- 健康检查：http://localhost:8000/health

### 方式二：手动启动

#### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 前端

```bash
cd frontend
npm install
npm run dev
```

## 已实现接口

### 数据源
- `GET  /api/v1/data-sources`
- `GET  /api/v1/etfs`
- `POST /api/v1/etfs/import-history`
- `GET  /api/v1/etfs/{symbol}/bars`
- `GET  /api/v1/etfs/{symbol}/quote`

### 策略
- `GET    /api/v1/strategies`
- `POST   /api/v1/strategies`
- `GET    /api/v1/strategies/{id}`
- `PUT    /api/v1/strategies/{id}`
- `DELETE /api/v1/strategies/{id}`

### 回测
- `POST /api/v1/backtests/run`
- `GET  /api/v1/backtests/{job_id}/status`
- `GET  /api/v1/backtests/{job_id}`
- `GET  /api/v1/backtests/{job_id}/trades`
- `GET  /api/v1/backtests/{job_id}/chart`

### 参数优化
- `POST /api/v1/optimizations/run`

### 实时信号提醒
- `GET  /alerts/stream` — SSE 长连接，开盘期间推送买卖信号
- `GET  /alerts/recent` — 获取最近 N 条历史信号
- `POST /alerts/scan`  — 手动触发一次扫描（用于非交易时段测试）

### 其他
- `GET /health`

## 实时信号说明

后端在 09:25–15:05（CST，工作日）每 5 分钟自动扫描所有策略：
1. 通过 AKShare 拉取最新分钟线/日线
2. 计算技术指标（MA、MACD、布林带、KDJ 等）
3. 用策略规则引擎判断买入/卖出信号
4. 触发信号时通过 SSE 实时推送到前端
5. 前端顶部铃铛显示未读数，点击查看信号详情

**非交易时段测试：**
```bash
curl -X POST http://localhost:8000/alerts/scan
```

## 数据库迁移（Alembic）

```bash
cd backend
alembic upgrade head                          # 建表
alembic revision --autogenerate -m "描述"     # 生成新迁移
```
