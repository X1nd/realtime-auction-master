package websocket

import (
	"encoding/json"
	"net/http"
	"realtime-auction-backend/config"
	"realtime-auction-backend/internal/model"
	"realtime-auction-backend/pkg/database"
	"realtime-auction-backend/pkg/logger"
	"strconv"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	ID     string
	UserID int64
	Conn   *websocket.Conn
	Send   chan []byte
	Rooms  map[string]bool
	server *SocketServer
	mu     sync.Mutex
}

type BidHandlerFunc func(goodsId int64, userId int64) (stateData map[string]interface{}, err error)
type StateHandlerFunc func(goodsId int64) map[string]interface{}

type SocketServer struct {
	upgrader      websocket.Upgrader
	clients       map[string]*Client
	userSockets   map[int64]map[string]bool
	rooms         map[string]map[string]*Client
	broadcast     chan []byte
	register      chan *Client
	unregister    chan *Client
	mu            sync.RWMutex
	OnBid         BidHandlerFunc
	OnGetState    StateHandlerFunc
}

var GlobalServer *SocketServer

func NewSocketServer() *SocketServer {
	ss := &SocketServer{}
	ss.upgrader = upgrader
	ss.clients = make(map[string]*Client)
	ss.userSockets = make(map[int64]map[string]bool)
	ss.rooms = make(map[string]map[string]*Client)
	ss.broadcast = make(chan []byte, 1024)
	ss.register = make(chan *Client)
	ss.unregister = make(chan *Client)
	go ss.run()
	GlobalServer = ss
	return ss
}

func (ss *SocketServer) run() {
	for {
		select {
		case client := <-ss.register:
			ss.mu.Lock()
			ss.clients[client.ID] = client
			if _, ok := ss.userSockets[client.UserID]; !ok {
				ss.userSockets[client.UserID] = make(map[string]bool)
			}
			ss.userSockets[client.UserID][client.ID] = true
			logger.SugarLogger.Infof("新客户端注册: userId=%d, socketId=%s", client.UserID, client.ID)
			ss.mu.Unlock()
		case client := <-ss.unregister:
			ss.mu.Lock()
			if _, ok := ss.clients[client.ID]; ok {
				delete(ss.clients, client.ID)
				delete(ss.userSockets[client.UserID], client.ID)
				if len(ss.userSockets[client.UserID]) == 0 {
					delete(ss.userSockets, client.UserID)
				}
				// 复制房间列表，leaveRoom 会获取 Lock，必须先释放锁防止死锁
				rooms := make([]string, 0, len(client.Rooms))
				for roomName := range client.Rooms {
					rooms = append(rooms, roomName)
				}
				ss.mu.Unlock()
				for _, roomName := range rooms {
					ss.leaveRoom(client, roomName)
				}
				close(client.Send)
				logger.SugarLogger.Infof("客户端注销: userId=%d, socketId=%s", client.UserID, client.ID)
			} else {
				ss.mu.Unlock()
			}
		case message := <-ss.broadcast:
			ss.mu.Lock()
			var deadClients []string
			for id, client := range ss.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					deadClients = append(deadClients, id)
				}
			}
			for _, id := range deadClients {
				delete(ss.clients, id)
			}
			ss.mu.Unlock()
		}
	}
}

func (ss *SocketServer) joinRoom(client *Client, roomName string) {
	ss.mu.Lock()
	defer ss.mu.Unlock()

	if _, ok := ss.rooms[roomName]; !ok {
		ss.rooms[roomName] = make(map[string]*Client)
	}
	ss.rooms[roomName][client.ID] = client
	client.Rooms[roomName] = true
	logger.SugarLogger.Infof("用户 %d 加入房间: %s", client.UserID, roomName)
}

func (ss *SocketServer) leaveRoom(client *Client, roomName string) {
	ss.mu.Lock()
	defer ss.mu.Unlock()

	if _, ok := ss.rooms[roomName]; ok {
		delete(ss.rooms[roomName], client.ID)
		if len(ss.rooms[roomName]) == 0 {
			delete(ss.rooms, roomName)
		}
	}
	delete(client.Rooms, roomName)
	logger.SugarLogger.Debugf("用户 %d 离开房间: %s", client.UserID, roomName)
}

func (ss *SocketServer) BroadcastToAuctionRoom(goodsId int64, event string, data interface{}) {
	// Resolve goods -> merchant room
	var goods model.AuctionGoods
	if err := database.DB.First(&goods, goodsId).Error; err != nil {
		return
	}
	roomName := "room:" + strconv.FormatInt(goods.UserID, 10)
	payload, _ := json.Marshal(map[string]interface{}{
		"event": event,
		"data":  data,
	})

	ss.mu.RLock()
	defer ss.mu.RUnlock()

	if clients, ok := ss.rooms[roomName]; ok {
		for _, client := range clients {
			select {
			case client.Send <- payload:
			default:
			}
		}
	}
	logger.SugarLogger.Debugf("向竞拍房间广播消息: room=%s, event=%s", roomName, event)
}

func (ss *SocketServer) BroadcastGlobal(event string, data interface{}) {
	payload, _ := json.Marshal(map[string]interface{}{
		"event": event,
		"data":  data,
	})
	ss.broadcast <- payload
}

func (ss *SocketServer) SendToUser(userId int64, event string, data interface{}) {
	payload, _ := json.Marshal(map[string]interface{}{
		"event": event,
		"data":  data,
	})
	ss.mu.RLock()
	defer ss.mu.RUnlock()

	if socketIds, ok := ss.userSockets[userId]; ok {
		for sid := range socketIds {
			if client, exists := ss.clients[sid]; exists {
				select {
				case client.Send <- payload:
				default:
				}
			}
		}
	}
}

func (ss *SocketServer) authenticate(r *http.Request) (int64, error) {
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		logger.SugarLogger.Warn("WebSocket连接缺少token")
		return 0, jwt.ErrSignatureInvalid
	}

	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		return []byte(config.GlobalConfig.JWT.Secret), nil
	})

	if err != nil || !token.Valid {
		logger.SugarLogger.Warn("WebSocket token验证失败")
		return 0, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, jwt.ErrSignatureInvalid
	}

	tokenType, _ := claims["type"].(string)
	if tokenType != "access" {
		logger.SugarLogger.Warn("WebSocket token类型错误")
		return 0, jwt.ErrSignatureInvalid
	}

	jti, _ := claims["jti"].(string)
	if jti != "" {
		ctx := database.GetRedisContext()
		key := "token:blacklist:" + jti
		exists, _ := database.RedisClient.Exists(ctx, key).Result()
		if exists > 0 {
			logger.SugarLogger.Warn("WebSocket token已失效(黑名单)")
			return 0, jwt.ErrSignatureInvalid
		}
	}

	userIdVal := claims["userId"]
	userId := int64(userIdVal.(float64))
	return userId, nil
}

func (ss *SocketServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	userId, err := ss.authenticate(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	conn, err := ss.upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.SugarLogger.Errorf("WebSocket升级失败: %v", err)
		return
	}

	client := &Client{}
	client.ID = conn.RemoteAddr().String()
	client.UserID = userId
	client.Conn = conn
	client.Send = make(chan []byte, 1024)
	client.Rooms = make(map[string]bool)
	client.server = ss

	ss.register <- client

	go client.readPump()
	go client.writePump()
}

func (c *Client) readPump() {
	defer func() {
		c.server.unregister <- c
		_ = c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.SugarLogger.Errorf("WebSocket读取错误: %v", err)
			}
			break
		}

		var eventMsg map[string]interface{}
		if err := json.Unmarshal(message, &eventMsg); err != nil {
			logger.SugarLogger.Warnf("WebSocket消息解析失败: %v, raw=%s", err, string(message))
			continue
		}
		eventName, ok := eventMsg["event"].(string)
		if !ok {
			logger.SugarLogger.Warnf("WebSocket消息缺少event字段: raw=%s", string(message))
			continue
		}

		logger.SugarLogger.Debugf("收到WebSocket消息: event=%s, userId=%d", eventName, c.UserID)

		switch eventName {
		case "join-auction-room":
			if goodsIdVal, ok := eventMsg["data"].(float64); ok {
				goodsId := int64(goodsIdVal)
				// Resolve goods to its merchant room
				var goods model.AuctionGoods
				if err := database.DB.First(&goods, goodsId).Error; err == nil {
					roomName := "room:" + strconv.FormatInt(goods.UserID, 10)
					c.server.joinRoom(c, roomName)
					resp, _ := json.Marshal(map[string]interface{}{
						"event": "joined-room",
						"data":  map[string]interface{}{"goodsId": goodsId, "userId": goods.UserID, "success": true},
					})
					c.Send <- resp

					if c.server.OnGetState != nil {
						if state := c.server.OnGetState(goodsId); state != nil {
							syncResp, _ := json.Marshal(map[string]interface{}{
								"event": "auction-state",
								"data":  state,
							})
							c.Send <- syncResp
						}
					}
				}
			}
		case "join-merchant-room":
			if userIdVal, ok := eventMsg["data"].(float64); ok {
				userId := int64(userIdVal)
				roomName := "room:" + strconv.FormatInt(userId, 10)
				c.server.joinRoom(c, roomName)

				// Find currently ongoing auction for this merchant
				var ongoing model.AuctionGoods
				database.DB.Where("user_id = ? AND status = ?", userId, 1).First(&ongoing)

				resp, _ := json.Marshal(map[string]interface{}{
					"event": "joined-room",
					"data": map[string]interface{}{
						"userId":  userId,
						"success": true,
						"currentGoodsId": ongoing.ID,
					},
				})
				c.Send <- resp

				// Send current auction state if ongoing
				if ongoing.ID > 0 && c.server.OnGetState != nil {
					if state := c.server.OnGetState(ongoing.ID); state != nil {
						syncResp, _ := json.Marshal(map[string]interface{}{
							"event": "auction-state",
							"data":  state,
						})
						c.Send <- syncResp
					}
				}
			}
		case "leave-auction-room":
			if goodsIdVal, ok := eventMsg["data"].(float64); ok {
				goodsId := int64(goodsIdVal)
				var goods model.AuctionGoods
				if err := database.DB.First(&goods, goodsId).Error; err == nil {
					roomName := "room:" + strconv.FormatInt(goods.UserID, 10)
					c.server.leaveRoom(c, roomName)
				}
			}
		case "leave-merchant-room":
			if userIdVal, ok := eventMsg["data"].(float64); ok {
				userId := int64(userIdVal)
				roomName := "room:" + strconv.FormatInt(userId, 10)
				c.server.leaveRoom(c, roomName)
			}
		case "bid":
			if goodsIdVal, ok := eventMsg["data"].(float64); ok {
				goodsId := int64(goodsIdVal)
				if c.server.OnBid != nil {
					stateData, err := c.server.OnBid(goodsId, c.UserID)
					if err != nil {
						resp, _ := json.Marshal(map[string]interface{}{
							"event": "bid-error",
							"data":  map[string]interface{}{"message": err.Error()},
						})
						c.Send <- resp
					} else {
						// Send confirmation to bidder only; others sync via timer
						resp, _ := json.Marshal(map[string]interface{}{
							"event": "price-updated",
							"data":  stateData,
						})
						c.Send <- resp
					}
				}
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		_ = c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
