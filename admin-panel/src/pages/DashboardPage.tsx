import React, { useEffect, useState } from 'react';
import { Card, Statistic, Row, Col, Spin } from 'antd';
import { getDashboardStats, getDevToken, getCurrentUser } from '../api';

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState({ totalGoods: 0, ongoingCount: 0, totalOrders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDevToken().then(() => {
      const user = getCurrentUser();
      getDashboardStats(user?.userId).then(res => {
        if (res.success) {
          setStats(res.data);
        }
      }).finally(() => setLoading(false));
    });
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', marginTop: 200 }} />;

  return (
    <div>
      <h2>实时竞拍控制台</h2>
      <Row gutter={16} style={{ marginTop: '24px' }}>
        <Col span={8}>
          <Card>
            <Statistic title="总商品数" value={stats.totalGoods} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="进行中的竞拍" value={stats.ongoingCount} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="总订单数" value={stats.totalOrders} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
