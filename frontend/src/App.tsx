import { Layout, Menu } from 'antd'
import { useState } from 'react'
import AlertBell from './components/AlertBell'
import EtfDataPage from './pages/EtfDataPage'
import StrategyPage from './pages/StrategyPage'
import BacktestPage from './pages/BacktestPage'
import DecisionCenterPage from './pages/DecisionCenterPage'
import OptimizationPage from './pages/OptimizationPage'
import SignalAnalysisPage from './pages/SignalAnalysisPage'

const { Header, Sider, Content } = Layout

export default function App() {
  const [activeKey, setActiveKey] = useState('etf')

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light">
        <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 16px', fontWeight: 700 }}>
          ETF 平台
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          onClick={(e) => setActiveKey(e.key)}
          items={[
            { key: 'etf', label: 'ETF 数据中心' },
            { key: 'decision', label: '交易决策中心' },
            { key: 'strategy', label: '策略配置' },
            { key: 'backtest', label: '回测中心' },
            { key: 'signal', label: '买卖点分析' },
            { key: 'optimization', label: '参数优化' },
          ]}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 16px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>A股 ETF 超短线分析系统 MVP</span>
          <AlertBell />
        </Header>
        <Content style={{ padding: 16 }}>
          {activeKey === 'etf' && <EtfDataPage />}
          {activeKey === 'decision' && <DecisionCenterPage />}
          {activeKey === 'strategy' && <StrategyPage />}
          {activeKey === 'backtest' && <BacktestPage />}
          {activeKey === 'signal' && <SignalAnalysisPage />}
          {activeKey === 'optimization' && <OptimizationPage />}
        </Content>
      </Layout>
    </Layout>
  )
}
