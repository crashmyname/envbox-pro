package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	service AuthService
}

func NewAuthHandler(service AuthService) *AuthHandler {
	return &AuthHandler{service: service}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Validasi gagal",
			"message": err.Error(),
		})
		return
	}

	response, err := h.service.Login(req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Login berhasil",
		"data":    response,
	})
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Validasi gagal",
			"message": err.Error(),
		})
		return
	}

	response, err := h.service.Register(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Registrasi berhasil",
		"data":    response,
	})
}

func (h *AuthHandler) Profile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	username, _ := c.Get("username")
	role, _ := c.Get("role")

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"user_id":  userID,
			"username": username,
			"role":     role,
		},
	})
}
func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	// username, _ := c.Get("username")
	// role, _ := c.Get("role")

	// Ambil data lengkap user dari database
	user, err := h.service.GetUserByID(userID.(uint))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "User tidak ditemukan",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Data user berhasil dimuat",
		"data": gin.H{
			"id":         user.ID,
			"uuid":       user.UUID,
			"username":   user.Username,
			"name":       user.Name,
			"email":      user.Email,
			"section":    user.Section,
			"role":       user.Role,
			"created_at": user.CreatedAt,
			"updated_at": user.UpdatedAt,
		},
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {

	c.JSON(http.StatusOK, gin.H{
		"message": "Logout berhasil, silahkan hapus token di client",
	})
}
