package users

import (
	"certification-system/utils"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type UserHandler struct {
	service UserService
}

func NewUserHandler(service UserService) *UserHandler {
	return &UserHandler{service: service}
}

func (h *UserHandler) TestIndex(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "API is working",
	})
}

func (h *UserHandler) GetAll(c *gin.Context) {
	param := utils.GetPaginationParams(c)

	users, pagination, err := h.service.GetAllUsers(param)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "gagal memuat data",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": users,
		"meta": pagination,
	})
}

func (h *UserHandler) GetById(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "ID tidak valid",
		})
		return
	}

	user, err := h.service.GetUserById(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "User tidak ditemukan",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": user,
	})
}

func (h *UserHandler) Create(c *gin.Context) {
	var user User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	user.UUID = uuid.New().String()

	if err := h.service.CreateUser(&user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Gagal membuat user",
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": user,
	})
}

func (h *UserHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "ID Tidak valid",
		})
		return
	}

	existingUser, err := h.service.GetUserById(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "User tidak ditemukan",
		})
		return
	}

	var req UpdateUserDTO
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	if req.Username != nil {
		existingUser.Username = *req.Username
	}
	if req.Name != nil {
		existingUser.Name = *req.Name
	}
	if req.Email != nil {
		existingUser.Email = *req.Email
	}
	if req.Section != nil {
		existingUser.Section = *req.Section
	}
	if req.Role != nil {
		existingUser.Role = *req.Role
	}

	if req.Password != nil && *req.Password != "" {
		existingUser.Password = *req.Password
	}

	if err := h.service.UpdateUser(&existingUser); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Gagal update user",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": existingUser,
	})
}

func (h *UserHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "ID tidak valid",
		})
		return
	}

	if err := h.service.DeleteUser(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Gagal menghapus user",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "User berhasil dihapus",
	})
}
