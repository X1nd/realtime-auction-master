#!/bin/bash
# =============================================
# 实时竞拍大师 - 生产环境一键部署脚本
# =============================================
# 使用方法:
#   1. cp .env.production.example .env.production
#   2. 编辑 .env.production 修改密码和密钥
#   3. chmod +x deploy.sh && ./deploy.sh
#
# 前置条件:
#   - 一台 Linux 云服务器（推荐 2C4G 以上）
#   - 安装 Docker + Docker Compose
#   - 安全组开放 80 端口
#   - 无需安装 Node.js（前端在 Docker 内编译）
# =============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVER_IP=${1:-$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")}

echo "======================================"
echo " 🚀 实时竞拍大师 - 生产环境部署"
echo "======================================"
echo ""

# ---------- 1. 检查环境 ----------
echo -e "${YELLOW}[1/4] 检查环境...${NC}"
command -v docker >/dev/null 2>&1 || { echo -e "${RED}请先安装 Docker${NC}"; exit 1; }

if [ ! -f .env.production ]; then
    echo -e "${YELLOW}⚠ 未找到 .env.production，使用默认配置${NC}"
    echo -e "${YELLOW}  建议: cp .env.production.example .env.production 并修改${NC}"
    export DB_PASSWORD="${DB_PASSWORD:-Auction@2026!Secure}"
    export JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
else
    set -a
    source .env.production
    set +a
fi

echo -e "${GREEN}✓ 环境检查通过${NC}"

# ---------- 2. 构建镜像 ----------
echo ""
echo -e "${YELLOW}[2/4] 构建 Docker 镜像（前端 + 后端 + Nginx）...${NC}"
echo -e "  前端 H5 和后台管理将在 Docker 内编译，无需本地 Node.js"
docker compose -f docker-compose.prod.yml build --parallel
echo -e "${GREEN}✓ 镜像构建完成${NC}"

# ---------- 3. 启动服务 ----------
echo ""
echo -e "${YELLOW}[3/4] 启动服务...${NC}"
docker compose -f docker-compose.prod.yml up -d
echo -e "${GREEN}✓ 服务启动完成${NC}"

# ---------- 4. 等待就绪 ----------
echo ""
echo -e "${YELLOW}[4/4] 等待服务就绪...${NC}"
for i in $(seq 1 12); do
    if curl -s http://localhost/health >/dev/null 2>&1; then
        echo -e "${GREEN}✓ 后端服务就绪${NC}"
        break
    fi
    echo "  等待中... ($i/12)"
    sleep 5
done

echo ""
echo "======================================"
echo -e "${GREEN} 🎉 部署完成！${NC}"
echo "======================================"
echo ""
echo -e "  用户端 H5:    ${GREEN}http://${SERVER_IP}${NC}"
echo -e "  管理后台:      ${GREEN}http://${SERVER_IP}/admin${NC}"
echo -e "  健康检查:      ${GREEN}http://${SERVER_IP}/health${NC}"
echo ""
echo -e "  查看日志:      docker compose -f docker-compose.prod.yml logs -f"
echo -e "  停止服务:      docker compose -f docker-compose.prod.yml down"
echo -e "  重启服务:      docker compose -f docker-compose.prod.yml restart"
echo ""
echo -e "  ${YELLOW}⚠ 确保云服务器安全组已开放 80 端口${NC}"
echo ""
