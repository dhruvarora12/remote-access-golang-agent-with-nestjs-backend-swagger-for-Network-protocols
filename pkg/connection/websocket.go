package connection

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	initialBackoff    = 2 * time.Second
	maxBackoff        = 5 * time.Minute
	backoffMultiplier = 2.0
)

type Client struct {
	conn              *websocket.Conn
	serverURL         string
	onMessage         func(messageType string, data map[string]interface{})
	isRunning         bool
	reconnectDelay    time.Duration
	reconnectCount    int
	stopChan          chan struct{}
	registrationData  interface{}  // ✅ ADD: Store registration data
	onConnect         func()       // ✅ ADD: Callback after connection
}

type Message struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:      serverURL,
		isRunning:      false,
		reconnectDelay: initialBackoff,
		reconnectCount: 0,
		stopChan:       make(chan struct{}),
	}
}

// ✅ ADD: Set registration data
func (c *Client) SetRegistrationData(data interface{}) {
	c.registrationData = data
}

// ✅ ADD: Set callback for post-connection actions
func (c *Client) SetOnConnect(callback func()) {
	c.onConnect = callback
}

func (c *Client) Connect() error {
	// Socket.io uses /socket.io/ endpoint
	url := c.serverURL + "/socket.io/?EIO=4&transport=websocket"
	
	log.Printf("🔌 Connecting to %s", url)
	
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return fmt.Errorf("failed to connect: %v", err)
	}
	
	c.conn = conn
	c.isRunning = true
	log.Println("✅ Connected to server!")
	
	// Reset reconnection state on successful connection
	c.reconnectCount = 0
	c.reconnectDelay = initialBackoff
	
	// Start listening for messages
	go c.listen()
	
	// ✅ ADD: Trigger onConnect callback (for registration)
	if c.onConnect != nil {
		// Wait for Socket.io handshake to complete
		time.Sleep(500 * time.Millisecond)
		c.onConnect()
	}
	
	return nil
}

func (c *Client) Reconnect() {
	for c.isRunning {
		c.reconnectCount++
		
		log.Printf("🔄 Reconnection attempt #%d (waiting %v)...", c.reconnectCount, c.reconnectDelay)
		time.Sleep(c.reconnectDelay)
		
		// Try to reconnect
		err := c.Connect()
		if err != nil {
			log.Printf("❌ Reconnection failed: %v", err)
			
			// Exponential backoff
			c.reconnectDelay = time.Duration(float64(c.reconnectDelay) * backoffMultiplier)
			if c.reconnectDelay > maxBackoff {
				c.reconnectDelay = maxBackoff
			}
			continue
		}
		
		// Successfully reconnected - Connect() already triggers onConnect callback
		log.Println("✅ Reconnected successfully!")
		return
	}
}

func (c *Client) listen() {
	for c.isRunning {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("⚠️  Read error: %v", err)
			
			// Close the broken connection
			if c.conn != nil {
				c.conn.Close()
			}
			
			// Trigger reconnection
			if c.isRunning {
				go c.Reconnect()
			}
			return
		}
		
		log.Printf("Received: %s", string(message))
		
		// Handle Socket.io protocol messages
		if len(message) == 0 {
			continue
		}
		
		msgType := message[0]
		
		switch msgType {
		case '0': // Connection message
			// Send connection acknowledgement
			c.conn.WriteMessage(websocket.TextMessage, []byte("40"))
			
		case '2': // Ping
			// Send pong
			c.conn.WriteMessage(websocket.TextMessage, []byte("3"))
			
		case '4': // Event message
			if len(message) > 1 && message[1] == '2' {
				// Parse the message (skip '42' prefix)
				var parsed []interface{}
				jsonStr := string(message[2:])
				
				err := json.Unmarshal([]byte(jsonStr), &parsed)
				if err == nil && len(parsed) >= 2 {
					eventName := parsed[0].(string)
					
					var eventData map[string]interface{}
					if dataMap, ok := parsed[1].(map[string]interface{}); ok {
						eventData = dataMap
					}
					
					if c.onMessage != nil {
						c.onMessage(eventName, eventData)
					}
				}
			}
		}
	}
}

func (c *Client) Emit(event string, data interface{}) error {
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}
	
	msg := []interface{}{event, data}
	jsonData, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	
	// Socket.io message format: 42["event",{data}]
	socketIOMsg := "42" + string(jsonData)
	
	log.Printf("Sending: %s", socketIOMsg)
	
	err = c.conn.WriteMessage(websocket.TextMessage, []byte(socketIOMsg))
	if err != nil {
		return fmt.Errorf("failed to send message: %v", err)
	}
	
	return nil
}

func (c *Client) SetMessageHandler(handler func(messageType string, data map[string]interface{})) {
	c.onMessage = handler
}

func (c *Client) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}

func (c *Client) Disconnect() {
	log.Println("🛑 Gracefully disconnecting...")
	c.isRunning = false
	
	if c.conn != nil {
		c.conn.Close()
	}
	
	close(c.stopChan)
}

func (c *Client) KeepAlive() {
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			if c.conn == nil || !c.isRunning {
				continue
			}
			
			// Send ping to keep connection alive
			err := c.conn.WriteMessage(websocket.PingMessage, []byte{})
			if err != nil {
				log.Printf("⚠️  Ping error: %v", err)
				
				// Close broken connection
				if c.conn != nil {
					c.conn.Close()
				}
				
				// Trigger reconnection
				if c.isRunning {
					go c.Reconnect()
				}
				continue
			}
			
		case <-c.stopChan:
			return
		}
	}
}