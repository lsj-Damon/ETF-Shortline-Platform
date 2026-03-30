# ETF Shortline Platform

A 股 ETF 超短线分析系统 MVP。

## 当前已完成
- 后端骨架（FastAPI + PostgreSQL + Parquet）
- AKShare 数据源适配
- ETF 数据 API
- 前端 ETF 数据中心页面
- Docker Compose 本地编排
- 策略配置模块（策略 CRUD API + 前端规则构建器）
- 回测模块（自研 bar-by-bar 引擎，含止损/止盈/最大持仓 bars）
- 买卖点分析页（ECharts K 线图 + 买卖点标记 + 交易明细联动）
- 参数优化基础版（MA 网格搜索 + 结果排序展示）
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
- GET /health
- GET /api/v1/data-sources
- GET /api/v1/etfs
- POST /api/v1/etfs/import-history
- GET /api/v1/etfs/{symbol}/bars
- GET /api/v1/etfs/{symbol}/quote

## 已实现接口（完整）
- GET /health
- GET /api/v1/data-sources
- GET /api/v1/etfs
- POST /api/v1/etfs/import-history
- GET /api/v1/etfs/{symbol}/bars
- GET /api/v1/etfs/{symbol}/quote
- GET /api/v1/strategies
- POST /api/v1/strategies
- GET /api/v1/strategies/{id}
- PUT /api/v1/strategies/{id}
- DELETE /api/v1/strategies/{id}
- POST /api/v1/backtests/run
- GET /api/v1/backtests/{job_id}/status
- GET /api/v1/backtests/{job_id}
- GET /api/v1/backtests/{job_id}/trades
- GET /api/v1/backtests/{job_id}/chart
- POST /api/v1/optimizations/run

## 数据库迁移（Alembic）
```bash
cd backend
alembic upgrade head        # 建表
alembic revision --autogenerate -m "描述"  # 生成新迁移
```

## 前端依赖安装
```bash
cd frontend
npm install   # 会自动安装 dayjs（DatePicker 依赖）
```
