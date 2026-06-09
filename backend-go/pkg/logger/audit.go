package logger

import "go.uber.org/zap"

// Audit logs security-relevant events with consistent format.
// These go to both console and app.log for traceability.

func AuditLoginSuccess(userId int64, username, role, ip string) {
	GlobalLogger.Info("AUDIT 登录成功",
		zap.Int64("userId", userId),
		zap.String("username", username),
		zap.String("role", role),
		zap.String("ip", ip),
		zap.String("event", "login_success"),
	)
}

func AuditLoginFailed(username, reason, ip string) {
	GlobalLogger.Warn("AUDIT 登录失败",
		zap.String("username", username),
		zap.String("reason", reason),
		zap.String("ip", ip),
		zap.String("event", "login_failed"),
	)
}

func AuditLoginLocked(username, ip string) {
	GlobalLogger.Warn("AUDIT 账号锁定",
		zap.String("username", username),
		zap.String("ip", ip),
		zap.String("event", "account_locked"),
	)
}

func AuditPermissionDenied(userId int64, role, path, detail string) {
	GlobalLogger.Warn("AUDIT 权限拒绝",
		zap.Int64("userId", userId),
		zap.String("role", role),
		zap.String("path", path),
		zap.String("detail", detail),
		zap.String("event", "permission_denied"),
	)
}

func AuditAuctionStart(goodsId, userId int64, goodsName string) {
	GlobalLogger.Info("AUDIT 竞拍开始",
		zap.Int64("goodsId", goodsId),
		zap.Int64("userId", userId),
		zap.String("goodsName", goodsName),
		zap.String("event", "auction_start"),
	)
}

func AuditAuctionCancelled(goodsId, userId int64, goodsName string) {
	GlobalLogger.Info("AUDIT 竞拍取消",
		zap.Int64("goodsId", goodsId),
		zap.Int64("userId", userId),
		zap.String("goodsName", goodsName),
		zap.String("event", "auction_cancelled"),
	)
}

func AuditAuctionEnd(goodsId int64, winnerUserId *int64, finalPrice float64) {
	fields := []zap.Field{
		zap.Int64("goodsId", goodsId),
		zap.Float64("finalPrice", finalPrice),
		zap.String("event", "auction_end"),
	}
	if winnerUserId != nil {
		fields = append(fields, zap.Int64("winnerUserId", *winnerUserId))
	}
	GlobalLogger.Info("AUDIT 竞拍结束", fields...)
}

func AuditOrderCreated(orderNo string, userId int64, goodsId int64, amount float64) {
	GlobalLogger.Info("AUDIT 订单生成",
		zap.String("orderNo", orderNo),
		zap.Int64("userId", userId),
		zap.Int64("goodsId", goodsId),
		zap.Float64("amount", amount),
		zap.String("event", "order_created"),
	)
}

func AuditTokenRefresh(userId int64, ip string) {
	GlobalLogger.Debug("AUDIT Token刷新",
		zap.Int64("userId", userId),
		zap.String("ip", ip),
		zap.String("event", "token_refresh"),
	)
}

func AuditLogout(userId int64, ip string) {
	GlobalLogger.Info("AUDIT 登出",
		zap.Int64("userId", userId),
		zap.String("ip", ip),
		zap.String("event", "logout"),
	)
}
